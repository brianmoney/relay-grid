import { rm } from "node:fs/promises";
import { dirname } from "node:path";

import type { RuntimeConfig } from "../config";
import {
  createDispatchTranscriptHandler,
  createOpenDispatchHttpAdapter,
  createSlackDispatchAdapter,
  type TranscriptDispatchAdapter,
} from "../adapters/dispatch";
import {
  createSlackSourceService,
  type SlackSourceRuntime,
} from "../adapters/source/slack";
import { createSTTAdapter } from "../adapters/stt";
import { createTranscriptEnvelope, type STTAdapter } from "../adapters/stt/base";
import { createFfmpegAudioNormalizer, type AudioNormalizer } from "../pipeline/audio-normalization";
import { createFileProcessingStateStore, type ProcessingStateStore } from "../store";
import { AudioNormalizationError, type NormalizedAudio } from "../types/audio";
import type { NormalizedFetchedAudio, NormalizedSourceEvent } from "../types/events";
import {
  TERMINAL_PROCESSING_STATUSES,
  type ProcessingFailure,
  type ProcessingStateReference,
} from "../types/processing";
import { STTError } from "../types/stt";
import type { LifecycleService, SourceEventHandler, TranscriptHandler } from "../types/service";
import { buildConversationKey, buildDedupeKey } from "../utils/ids";
import { withLogContext, type AppLogger } from "../utils/logger";

interface ServiceDependencies {
  config: RuntimeConfig;
  logger: AppLogger;
  audioNormalizer?: AudioNormalizer;
  sttAdapter?: STTAdapter;
  transcriptHandler?: TranscriptHandler;
  transcriptDispatchAdapter?: TranscriptDispatchAdapter;
  processingStateStore?: ProcessingStateStore;
  slackSourceServiceFactory?: typeof createSlackSourceService;
  slackDispatchAdapterFactory?: typeof createSlackDispatchAdapter;
  openDispatchAdapterFactory?: typeof createOpenDispatchHttpAdapter;
}

interface ClassifiedFailure {
  failure: ProcessingFailure;
  errorName: string;
}

const sleep = async (durationMs: number): Promise<void> => {
  if (durationMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, durationMs));
};

const createLoggingTranscriptHandler = (logger: AppLogger): TranscriptHandler => {
  return {
    async handle(transcript) {
      const conversationKey = buildConversationKey(transcript.source, transcript.conversation);
      const dedupeKey = buildDedupeKey(transcript.source, transcript.dedupe);
      const transcriptLogger = withLogContext(logger, {
        stage: "transcript_ready",
        source: transcript.source,
        conversationKey,
        dedupeKey,
      });

      transcriptLogger.info(
        {
          event: "transcript_ready_for_downstream_processing",
          sourceIdentity: transcript.sourceIdentity,
          language: transcript.language,
          segmentCount: transcript.segments?.length ?? 0,
          textLength: transcript.text.length,
          metadata: transcript.metadata,
        },
        "Transcript ready for downstream processing"
      );
    },
  };
};

const createCompositeTranscriptHandler = (...handlers: TranscriptHandler[]): TranscriptHandler => {
  return {
    async handle(transcript) {
      for (const handler of handlers) {
        await handler.handle(transcript);
      }
    },
  };
};

const cleanupNormalizedAudio = async (
  logger: AppLogger,
  audioNormalizer: AudioNormalizer,
  audio: NormalizedAudio
): Promise<void> => {
  try {
    await audioNormalizer.cleanup(audio);
    logger.debug(
      {
        event: "audio_normalization_cleanup_completed",
        artifactPath: audio.artifactPath,
        cleanup: audio.cleanup,
      },
      "Cleaned up normalized audio artifact"
    );
  } catch (error) {
    logger.warn(
      {
        event: "audio_normalization_cleanup_failed",
        artifactPath: audio.artifactPath,
        cleanup: audio.cleanup,
        error,
      },
      "Failed to clean up normalized audio artifact"
    );
  }
};

const cleanupFetchedAudio = async (logger: AppLogger, audio: NormalizedFetchedAudio): Promise<void> => {
  try {
    await rm(dirname(audio.localPath), { force: true, recursive: true });
    logger.debug(
      {
        event: "source_audio_cleanup_completed",
        localPath: audio.localPath,
      },
      "Cleaned up fetched audio artifact"
    );
  } catch (error) {
    logger.warn(
      {
        event: "source_audio_cleanup_failed",
        localPath: audio.localPath,
        error,
      },
      "Failed to clean up fetched audio artifact"
    );
  }
};

const classifyProcessingError = (error: unknown): ClassifiedFailure => {
  if (error instanceof AudioNormalizationError || error instanceof STTError) {
    return {
      errorName: error.name,
      failure: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      },
    };
  }

  if (error instanceof Error) {
    const retryable =
      typeof (error as { retryable?: unknown }).retryable === "boolean"
        ? Boolean((error as { retryable?: boolean }).retryable)
        : true;

    return {
      errorName: error.name,
      failure: {
        code: error.name,
        message: error.message,
        retryable,
      },
    };
  }

  return {
    errorName: "UnknownError",
    failure: {
      code: "unknown_error",
      message: "Unknown processing error",
      retryable: true,
    },
  };
};

const createProcessingReference = (event: NormalizedSourceEvent): ProcessingStateReference => {
  return {
    source: event.source,
    conversationKey: buildConversationKey(event.source, event.conversation),
    dedupeKey: buildDedupeKey(event.source, event.dedupe),
  };
};

const createBaseProcessingMetadata = (event: NormalizedSourceEvent): Record<string, unknown> => {
  return {
    sourceIdentity: event.sourceIdentity,
    conversation: event.conversation,
    dedupe: event.dedupe,
  };
};

const createSourceEventHandler = ({
  config,
  logger,
  sourceRuntime,
  audioNormalizer,
  sttAdapter,
  transcriptHandler,
  transcriptDispatchAdapter,
  processingStateStore,
}: {
  config: RuntimeConfig;
  logger: AppLogger;
  sourceRuntime: () => SlackSourceRuntime | null;
  audioNormalizer: AudioNormalizer;
  sttAdapter: STTAdapter;
  transcriptHandler: TranscriptHandler;
  transcriptDispatchAdapter: TranscriptDispatchAdapter | undefined;
  processingStateStore: ProcessingStateStore;
}): SourceEventHandler => {
  const inFlightDedupeKeys = new Set<string>();

  return {
    async handle(event) {
      const reference = createProcessingReference(event);
      const processingLogger = withLogContext(logger, {
        stage: "processing",
        source: event.source,
        conversationKey: reference.conversationKey,
        dedupeKey: reference.dedupeKey,
      });
      const existingState = await processingStateStore.get(reference);

      if (existingState && TERMINAL_PROCESSING_STATUSES.has(existingState.status)) {
        processingLogger.info(
          {
            event: "processing_duplicate_skipped",
            status: existingState.status,
            attempt: existingState.attempt,
            failedAt: existingState.status === "failed" ? existingState.failedAt : undefined,
          },
          "Skipping duplicate processing unit with terminal persisted state"
        );
        return;
      }

      if (inFlightDedupeKeys.has(reference.dedupeKey)) {
        processingLogger.info(
          {
            event: "processing_duplicate_inflight_skipped",
          },
          "Skipping duplicate processing unit already in flight"
        );
        return;
      }

      inFlightDedupeKeys.add(reference.dedupeKey);

      try {
        while (true) {
          const attemptState = await processingStateStore.beginAttempt({
            ...reference,
            occurredAt: event.occurredAt,
            maxAttempts: config.processing.maxRetryAttempts,
            metadata: createBaseProcessingMetadata(event),
          });
          let fetchedAudio: NormalizedFetchedAudio | undefined;
          let normalizedAudio: NormalizedAudio | undefined;

          processingLogger.info(
            {
              event: "processing_attempt_started",
              attempt: attemptState.attempt,
              maxAttempts: attemptState.maxAttempts,
            },
            "Starting processing attempt"
          );

          try {
            const runtime = sourceRuntime();

            if (!runtime) {
              throw new Error("Slack source runtime is not available");
            }

            fetchedAudio = await runtime.adapter.fetchAudio(event);
            await processingStateStore.markStage(reference, "audio_fetched", {
              metadata: {
                fetchLocalPath: fetchedAudio.localPath,
                sourceAudio: fetchedAudio.audio,
              },
            });

            processingLogger.info(
              {
                event: "audio_fetch_succeeded",
                attempt: attemptState.attempt,
                localPath: fetchedAudio.localPath,
                audio: fetchedAudio.audio,
              },
              "Fetched source audio"
            );

            processingLogger.info(
              {
                event: "audio_normalization_started",
                attempt: attemptState.attempt,
                localPath: fetchedAudio.localPath,
              },
              "Starting audio normalization"
            );
            normalizedAudio = await audioNormalizer.normalize(fetchedAudio);
            await processingStateStore.markStage(reference, "audio_normalized", {
              metadata: {
                normalizedAudio: normalizedAudio.audio,
                normalizedArtifactPath: normalizedAudio.artifactPath,
              },
            });

            processingLogger.info(
              {
                event: "audio_normalization_succeeded",
                attempt: attemptState.attempt,
                normalizedAudio: normalizedAudio.audio,
                artifactPath: normalizedAudio.artifactPath,
              },
              "Audio normalization succeeded"
            );

            processingLogger.info(
              {
                event: "stt_transcription_started",
                attempt: attemptState.attempt,
                backend: sttAdapter.backend,
                artifactPath: normalizedAudio.artifactPath,
              },
              "Starting audio transcription"
            );
            const transcription = await sttAdapter.transcribe(normalizedAudio);
            await processingStateStore.markStage(reference, "transcribed", {
              metadata: {
                transcriptLanguage: transcription.language,
                transcriptSegmentCount: transcription.segments?.length ?? 0,
                transcriptTextLength: transcription.text.length,
                sttMetadata: transcription.metadata,
              },
            });

            processingLogger.info(
              {
                event: "stt_transcription_succeeded",
                attempt: attemptState.attempt,
                backend: sttAdapter.backend,
                language: transcription.language,
                segmentCount: transcription.segments?.length ?? 0,
                textLength: transcription.text.length,
              },
              "Audio transcription succeeded"
            );

            const transcript = createTranscriptEnvelope(normalizedAudio, transcription);
            await transcriptHandler.handle(transcript);
            await processingStateStore.markStage(reference, "dispatched", {
              metadata: {
                dispatchCompleted: true,
              },
            });
            await processingStateStore.markStage(reference, "completed");

            processingLogger.info(
              {
                event: "processing_completed",
                attempt: attemptState.attempt,
              },
              "Completed processing unit"
            );
            return;
          } catch (error) {
            const classified = classifyProcessingError(error);
            const retryExhausted = !classified.failure.retryable || attemptState.attempt >= attemptState.maxAttempts;

            if (retryExhausted) {
              await processingStateStore.markFailed(reference, classified.failure, {
                metadata: {
                  terminal: true,
                  errorName: classified.errorName,
                },
              });

              processingLogger.error(
                {
                  event: "processing_terminal_failure",
                  attempt: attemptState.attempt,
                  maxAttempts: attemptState.maxAttempts,
                  errorName: classified.errorName,
                  errorCode: classified.failure.code,
                  retryable: classified.failure.retryable,
                  errorMessage: classified.failure.message,
                },
                "Processing unit failed permanently"
              );

              if (transcriptDispatchAdapter?.notifyFailure) {
                try {
                  await transcriptDispatchAdapter.notifyFailure(reference, {
                    ...classified.failure,
                    attempt: attemptState.attempt,
                    maxAttempts: attemptState.maxAttempts,
                  });
                } catch (notificationError) {
                  processingLogger.warn(
                    {
                      event: "processing_failure_notice_failed",
                      error: notificationError,
                    },
                    "Failed to emit terminal failure notice"
                  );
                }
              }

              throw error;
            }

            processingLogger.warn(
              {
                event: "processing_retry_scheduled",
                attempt: attemptState.attempt,
                maxAttempts: attemptState.maxAttempts,
                retryBackoffMs: config.processing.retryBackoffMs,
                errorName: classified.errorName,
                errorCode: classified.failure.code,
                errorMessage: classified.failure.message,
              },
              "Retrying processing unit after retryable failure"
            );
          } finally {
            if (normalizedAudio) {
              await cleanupNormalizedAudio(processingLogger, audioNormalizer, normalizedAudio);
            }

            if (fetchedAudio) {
              await cleanupFetchedAudio(processingLogger, fetchedAudio);
            }
          }

          await sleep(config.processing.retryBackoffMs);
        }
      } finally {
        inFlightDedupeKeys.delete(reference.dedupeKey);
      }
    },
  };
};

export const createService = ({
  config,
  logger,
  audioNormalizer: injectedAudioNormalizer,
  sttAdapter: injectedSttAdapter,
  transcriptHandler: injectedTranscriptHandler,
  transcriptDispatchAdapter: injectedTranscriptDispatchAdapter,
  processingStateStore: injectedProcessingStateStore,
  slackSourceServiceFactory,
  slackDispatchAdapterFactory,
  openDispatchAdapterFactory,
}: ServiceDependencies): LifecycleService => {
  const audioNormalizer = injectedAudioNormalizer ?? createFfmpegAudioNormalizer(config.normalization);
  const sttAdapter = injectedSttAdapter ?? createSTTAdapter(config.stt);
  const processingStateStore =
    injectedProcessingStateStore ?? createFileProcessingStateStore(config.processing.stateFilePath);
  const buildSlackDispatchAdapter = slackDispatchAdapterFactory ?? createSlackDispatchAdapter;
  const buildOpenDispatchAdapter = openDispatchAdapterFactory ?? createOpenDispatchHttpAdapter;
  const transcriptDispatchAdapter =
    injectedTranscriptDispatchAdapter ??
    (injectedTranscriptHandler
      ? undefined
      : config.dispatch.mode === "slack-repost"
        ? buildSlackDispatchAdapter({
            config: config.slack,
            serviceName: config.serviceName,
            logger,
          })
        : buildOpenDispatchAdapter({
            config: config.dispatch.openDispatchHttp,
            logger,
          }));
  const transcriptHandler =
    injectedTranscriptHandler ??
    createCompositeTranscriptHandler(
      createLoggingTranscriptHandler(logger),
      createDispatchTranscriptHandler(transcriptDispatchAdapter as TranscriptDispatchAdapter)
    );
  const serviceLogger = withLogContext(logger, { stage: "service" });
  let started = false;
  let slackSourceRuntime: SlackSourceRuntime | null = null;
  const buildSlackSourceService = slackSourceServiceFactory ?? createSlackSourceService;
  const sourceEventHandler = createSourceEventHandler({
    config,
    logger,
    sourceRuntime: () => slackSourceRuntime,
    audioNormalizer,
    sttAdapter,
    transcriptHandler,
    transcriptDispatchAdapter,
    processingStateStore,
  });

  return {
    async start() {
      if (started) {
        return;
      }

      await audioNormalizer.assertReady();
      serviceLogger.info(
        {
          event: "audio_normalizer_ready",
          ffmpegPath: config.normalization.ffmpegPath,
          ffprobePath: config.normalization.ffprobePath,
          normalizationTempDirectory: config.normalization.tempDirectory,
          normalizationMaxInputBytes: config.normalization.maxInputBytes,
          normalizationMaxDurationMs: config.normalization.maxDurationMs,
        },
        "Audio normalization dependencies are ready"
      );
      await sttAdapter.assertReady();
      serviceLogger.info(
        {
          event: "stt_backend_ready",
          sttBackend: config.stt.backend,
          sttDefaultLanguage: config.stt.fasterWhisper.language,
          sttModel: config.stt.fasterWhisper.model,
          sttDevice: config.stt.fasterWhisper.device,
          sttComputeType: config.stt.fasterWhisper.computeType,
          sttBeamSize: config.stt.fasterWhisper.beamSize,
        },
        "STT backend is ready"
      );

      slackSourceRuntime = await buildSlackSourceService({
        config: config.slack,
        logger,
        sourceEventHandler,
      });
      await slackSourceRuntime.lifecycle.start();
      started = true;
      serviceLogger.info(
        {
          event: "service_initialized",
          serviceName: config.serviceName,
          dispatchMode: config.dispatch.mode,
          processingStateFilePath: config.processing.stateFilePath,
          processingMaxRetryAttempts: config.processing.maxRetryAttempts,
          processingRetryBackoffMs: config.processing.retryBackoffMs,
        },
        "Sidecar service initialized"
      );
    },

    async stop() {
      if (!started) {
        return;
      }

      started = false;

      if (slackSourceRuntime) {
        await slackSourceRuntime.lifecycle.stop();
      }

      slackSourceRuntime = null;
      serviceLogger.info({ event: "service_stopped" }, "Sidecar service stopped");
    },
  };
};

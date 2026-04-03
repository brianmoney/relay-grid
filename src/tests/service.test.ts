import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import pino from "pino";

import type { TranscriptDispatchAdapter } from "../adapters/dispatch";
import type { RuntimeConfig } from "../config";
import type { STTAdapter } from "../adapters/stt/base";
import type { AudioNormalizer } from "../pipeline/audio-normalization";
import { createService } from "../services/service";
import type { NormalizedAudio } from "../types/audio";
import type { NormalizedFetchedAudio, NormalizedSourceEvent } from "../types/events";
import type { ProcessingStateStore } from "../store";
import { STTError } from "../types/stt";
import type { LifecycleService, SourceEventHandler, TranscriptHandler } from "../types/service";
import type { SlackSourceRuntime } from "../adapters/source/slack";

const TEST_CONFIG: RuntimeConfig = {
  serviceName: "relay-grid-sidecar",
  nodeEnv: "test",
  logLevel: "silent",
  slack: {
    botToken: "xoxb-test-token",
    appToken: "xapp-test-token",
    allowlistedChannels: ["C_ALLOWED"],
    failureNoticesEnabled: false,
  },
  normalization: {
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    tempDirectory: "/tmp/relay-grid-tests",
    maxInputBytes: 1024,
    maxDurationMs: 30_000,
  },
  stt: {
    backend: "faster-whisper",
    fasterWhisper: {
      pythonPath: "python3",
      model: "base",
      device: "cpu",
      computeType: "int8",
      beamSize: 5,
      language: "en",
    },
  },
  processing: {
    stateFilePath: "/tmp/relay-grid-tests/processing-state.json",
    maxRetryAttempts: 3,
    retryBackoffMs: 0,
  },
};

const createSourceEvent = (): NormalizedSourceEvent => ({
  source: "slack",
  occurredAt: "2026-04-03T10:00:00.000Z",
  sourceIdentity: {
    scopeId: "T_WORKSPACE",
    eventId: "EvAudio",
    messageId: "1712345678.000100",
    fileId: "F_AUDIO",
  },
  conversation: {
    scopeId: "T_WORKSPACE",
    conversationId: "C_ALLOWED",
    threadId: "1712345678.000100",
  },
  dedupe: {
    scopeId: "T_WORKSPACE",
    unitId: "C_ALLOWED:1712345678.000100",
    variantId: "F_AUDIO",
  },
  audio: {
    mediaId: "F_AUDIO",
    mimeType: "audio/mpeg",
    fileName: "voice-note.mp3",
    byteLength: 128,
  },
});

const createFetchedAudio = (localPath = "/tmp/source/voice-note.mp3"): NormalizedFetchedAudio => ({
  ...createSourceEvent(),
  localPath,
});

const createNormalizedAudio = (): NormalizedAudio => ({
  source: "slack",
  sourceIdentity: {
    scopeId: "T_WORKSPACE",
    eventId: "EvAudio",
    messageId: "1712345678.000100",
    fileId: "F_AUDIO",
  },
  conversation: {
    scopeId: "T_WORKSPACE",
    conversationId: "C_ALLOWED",
    threadId: "1712345678.000100",
  },
  dedupe: {
    scopeId: "T_WORKSPACE",
    unitId: "C_ALLOWED:1712345678.000100",
    variantId: "F_AUDIO",
  },
  sourceAudio: {
    mediaId: "F_AUDIO",
    mimeType: "audio/mpeg",
    fileName: "voice-note.mp3",
    byteLength: 128,
  },
  audio: {
    mediaId: "F_AUDIO:normalized",
    mimeType: "audio/wav",
    fileName: "voice-note.wav",
    byteLength: 256,
    durationMs: 2_000,
    container: "wav",
    codec: "pcm_s16le",
    channelCount: 1,
    sampleRateHz: 16_000,
  },
  artifactPath: "/tmp/normalized/normalized.wav",
  artifactDirectory: "/tmp/normalized",
  cleanup: {
    owner: "pipeline",
    artifactPath: "/tmp/normalized/normalized.wav",
    directoryPath: "/tmp/normalized",
  },
});

const createTranscription = () => ({
  text: "hello from local stt",
  language: "en",
  segments: [{ startMs: 0, endMs: 1_250, text: "hello from local stt" }],
  metadata: {
    backend: "faster-whisper",
    model: "base",
    device: "cpu",
    computeType: "int8",
  },
});

const createTempSourceAudio = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "relay-grid-source-test-"));
  const filePath = join(dir, "voice-note.mp3");
  await writeFile(filePath, new Uint8Array([1, 2, 3]));
  return filePath;
};

const createMemoryProcessingStateStore = (): ProcessingStateStore => {
  const records = new Map<string, Awaited<ReturnType<ProcessingStateStore["beginAttempt"]>>>();

  return {
    async get(reference) {
      return records.get(reference.dedupeKey) ?? null;
    },
    async list() {
      return [...records.values()];
    },
    async beginAttempt(input) {
      const current = records.get(input.dedupeKey);
      const now = new Date().toISOString();
      const next = {
        source: input.source,
        conversationKey: input.conversationKey,
        dedupeKey: input.dedupeKey,
        status: "received" as const,
        attempt: (current?.attempt ?? 0) + 1,
        maxAttempts: input.maxAttempts,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        lastAttemptStartedAt: now,
        stageTimestamps: {
          ...(current?.stageTimestamps ?? {}),
          received: now,
        },
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : current?.occurredAt ? { occurredAt: current.occurredAt } : {}),
        ...(input.metadata ?? current?.metadata
          ? { metadata: { ...(current?.metadata ?? {}), ...(input.metadata ?? {}) } }
          : {}),
      };

      records.set(input.dedupeKey, next);
      return next;
    },
    async markStage(reference, status, options) {
      const current = records.get(reference.dedupeKey);

      if (!current) {
        throw new Error("missing state");
      }

      const now = new Date().toISOString();
      const next = {
        ...current,
        status,
        updatedAt: now,
        stageTimestamps: {
          ...current.stageTimestamps,
          [status]: now,
        },
        ...(status === "completed" ? { completedAt: now } : {}),
        ...(options?.metadata ? { metadata: { ...(current.metadata ?? {}), ...options.metadata } } : {}),
      };

      records.set(reference.dedupeKey, next);
      return next;
    },
    async markFailed(reference, failure, options) {
      const current = records.get(reference.dedupeKey);

      if (!current) {
        throw new Error("missing state");
      }

      const now = new Date().toISOString();
      const next = {
        ...current,
        status: "failed" as const,
        updatedAt: now,
        failedAt: now,
        error: failure,
        stageTimestamps: {
          ...current.stageTimestamps,
          failed: now,
        },
        ...(options?.metadata ? { metadata: { ...(current.metadata ?? {}), ...options.metadata } } : {}),
      };

      records.set(reference.dedupeKey, next);
      return next;
    },
  };
};

const createSlackSourceServiceFactory = (
  calls: string[],
  fetchedAudioFactory: () => Promise<NormalizedFetchedAudio> | NormalizedFetchedAudio,
  captureHandler: (handler: SourceEventHandler) => void
) => {
  return async ({ sourceEventHandler }: { sourceEventHandler: SourceEventHandler }): Promise<SlackSourceRuntime> => {
    captureHandler(sourceEventHandler);

    return {
      installation: {
        scopeId: "T_WORKSPACE",
      },
      adapter: {
        source: "slack",
        async normalizeEvent() {
          return null;
        },
        async fetchAudio() {
          calls.push("source:fetch");
          return fetchedAudioFactory();
        },
      },
      lifecycle: {
        async start() {
          calls.push("source:start");
        },
        async stop() {
          calls.push("source:stop");
        },
      },
    } as SlackSourceRuntime;
  };
};

test("service normalizes and transcribes fetched audio through provider-agnostic seams", async () => {
  const logger = pino({ level: "silent" });
  const calls: string[] = [];
  const normalizedAudio = createNormalizedAudio();
  let capturedSourceEventHandler: SourceEventHandler | null = null;
  const localPath = await createTempSourceAudio();

  const audioNormalizer: AudioNormalizer = {
    async assertReady() {
      calls.push("normalizer:ready");
    },
    async normalize() {
      calls.push("normalizer:normalize");
      return normalizedAudio;
    },
    async cleanup(audio) {
      calls.push(`normalizer:cleanup:${audio.cleanup.owner}`);
    },
  };

  const sttAdapter: STTAdapter = {
    backend: "faster-whisper",
    async assertReady() {
      calls.push("stt:ready");
    },
    async transcribe(audio) {
      calls.push(`stt:transcribe:${audio.audio.mimeType}`);
      assert.equal(audio.artifactPath, normalizedAudio.artifactPath);
      return createTranscription();
    },
  };

  const transcriptHandler: TranscriptHandler = {
    async handle(transcript) {
      calls.push(`handler:handle:${transcript.language}`);
      assert.equal(transcript.text, "hello from local stt");
      assert.equal(transcript.metadata?.stt && typeof transcript.metadata.stt === "object", true);
    },
  };

  const service = createService({
    config: TEST_CONFIG,
    logger,
    audioNormalizer,
    sttAdapter,
    transcriptHandler,
    processingStateStore: createMemoryProcessingStateStore(),
    slackSourceServiceFactory: createSlackSourceServiceFactory(
      calls,
      () => createFetchedAudio(localPath),
      (handler) => {
        capturedSourceEventHandler = handler;
      }
    ),
  });
  const getCapturedSourceEventHandler = (): SourceEventHandler => {
    if (!capturedSourceEventHandler) {
      throw new Error("expected source event handler");
    }

    return capturedSourceEventHandler;
  };

  await service.start();
  assert.deepEqual(calls, ["normalizer:ready", "stt:ready", "source:start"]);
  await getCapturedSourceEventHandler().handle(createSourceEvent());
  assert.deepEqual(calls, [
    "normalizer:ready",
    "stt:ready",
    "source:start",
    "source:fetch",
    "normalizer:normalize",
    "stt:transcribe:audio/wav",
    "handler:handle:en",
    "normalizer:cleanup:pipeline",
  ]);

  await service.stop();
  assert.deepEqual(calls, [
    "normalizer:ready",
    "stt:ready",
    "source:start",
    "source:fetch",
    "normalizer:normalize",
    "stt:transcribe:audio/wav",
    "handler:handle:en",
    "normalizer:cleanup:pipeline",
    "source:stop",
  ]);
  await rm(dirname(localPath), { recursive: true, force: true });
});

test("service retries retryable STT failures within the configured attempt budget", async () => {
  const logger = pino({ level: "silent" });
  const calls: string[] = [];
  const normalizedAudio = createNormalizedAudio();
  let capturedSourceEventHandler: SourceEventHandler | null = null;
  const localPath = await createTempSourceAudio();
  let attempts = 0;

  const service = createService({
    config: TEST_CONFIG,
    logger,
    audioNormalizer: {
      async assertReady() {
        calls.push("normalizer:ready");
      },
      async normalize() {
        calls.push("normalizer:normalize");
        return normalizedAudio;
      },
      async cleanup() {
        calls.push("normalizer:cleanup");
      },
    },
    sttAdapter: {
      backend: "faster-whisper",
      async assertReady() {
        calls.push("stt:ready");
      },
      async transcribe() {
        attempts += 1;
        calls.push(`stt:attempt:${String(attempts)}`);

        if (attempts === 1) {
          throw new STTError("transcription_failed", "boom", { retryable: true });
        }

        return createTranscription();
      },
    },
    transcriptHandler: {
      async handle() {
        calls.push("handler:handle");
      },
    },
    processingStateStore: createMemoryProcessingStateStore(),
    slackSourceServiceFactory: createSlackSourceServiceFactory(
      calls,
      () => createFetchedAudio(localPath),
      (handler) => {
        capturedSourceEventHandler = handler;
      }
    ),
  });
  const getCapturedSourceEventHandler = (): SourceEventHandler => {
    if (!capturedSourceEventHandler) {
      throw new Error("expected source event handler");
    }

    return capturedSourceEventHandler;
  };

  await service.start();
  await getCapturedSourceEventHandler().handle(createSourceEvent());

  assert.deepEqual(calls, [
    "normalizer:ready",
    "stt:ready",
    "source:start",
    "source:fetch",
    "normalizer:normalize",
    "stt:attempt:1",
    "normalizer:cleanup",
    "source:fetch",
    "normalizer:normalize",
    "stt:attempt:2",
    "handler:handle",
    "normalizer:cleanup",
  ]);

  await rm(dirname(localPath), { recursive: true, force: true });
});

test("service records terminal failure after retry exhaustion and suppresses duplicate replay", async () => {
  const logger = pino({ level: "silent" });
  const calls: string[] = [];
  let capturedSourceEventHandler: SourceEventHandler | null = null;
  const localPath = await createTempSourceAudio();
  const processingStateStore = createMemoryProcessingStateStore();
  const transcriptDispatchAdapter: TranscriptDispatchAdapter = {
    async dispatch() {
      calls.push("dispatch");
    },
    async notifyFailure() {
      calls.push("failure-notice");
    },
  };

  const service = createService({
    config: {
      ...TEST_CONFIG,
      processing: {
        ...TEST_CONFIG.processing,
        maxRetryAttempts: 2,
      },
    },
    logger,
    audioNormalizer: {
      async assertReady() {
        calls.push("normalizer:ready");
      },
      async normalize() {
        calls.push("normalizer:normalize");
        return createNormalizedAudio();
      },
      async cleanup() {
        calls.push("normalizer:cleanup");
      },
    },
    sttAdapter: {
      backend: "faster-whisper",
      async assertReady() {
        calls.push("stt:ready");
      },
      async transcribe() {
        calls.push("stt:transcribe");
        throw new STTError("transcription_failed", "boom", { retryable: true });
      },
    },
    transcriptDispatchAdapter,
    processingStateStore,
    slackSourceServiceFactory: createSlackSourceServiceFactory(
      calls,
      () => createFetchedAudio(localPath),
      (handler) => {
        capturedSourceEventHandler = handler;
      }
    ),
  });
  const getCapturedSourceEventHandler = (): SourceEventHandler => {
    if (!capturedSourceEventHandler) {
      throw new Error("expected source event handler");
    }

    return capturedSourceEventHandler;
  };

  await service.start();
  await assert.rejects(() => getCapturedSourceEventHandler().handle(createSourceEvent()), (error: unknown) => {
    assert.ok(error instanceof STTError);
    return true;
  });
  await getCapturedSourceEventHandler().handle(createSourceEvent());

  const states = await processingStateStore.list();
  assert.equal(states.length, 1);
  assert.equal(states[0]?.status, "failed");
  assert.equal(states[0]?.attempt, 2);
  assert.equal(states[0]?.error?.code, "transcription_failed");
  assert.deepEqual(calls, [
    "normalizer:ready",
    "stt:ready",
    "source:start",
    "source:fetch",
    "normalizer:normalize",
    "stt:transcribe",
    "normalizer:cleanup",
    "source:fetch",
    "normalizer:normalize",
    "stt:transcribe",
    "failure-notice",
    "normalizer:cleanup",
  ]);

  await rm(dirname(localPath), { recursive: true, force: true });
});

test("file-backed processing state survives restart and suppresses duplicate replay", async () => {
  const logger = pino({ level: "silent" });
  const calls: string[] = [];
  const tempDir = await mkdtemp(join(tmpdir(), "relay-grid-processing-state-"));
  const stateFilePath = join(tempDir, "processing-state.json");
  const localPath = await createTempSourceAudio();

  const buildService = (captureHandler: (handler: SourceEventHandler) => void) => {
    return createService({
      config: {
        ...TEST_CONFIG,
        processing: {
          ...TEST_CONFIG.processing,
          stateFilePath,
        },
      },
      logger,
      audioNormalizer: {
        async assertReady() {},
        async normalize() {
          calls.push("normalizer:normalize");
          return createNormalizedAudio();
        },
        async cleanup() {},
      },
      sttAdapter: {
        backend: "faster-whisper",
        async assertReady() {},
        async transcribe() {
          calls.push("stt:transcribe");
          return createTranscription();
        },
      },
      transcriptDispatchAdapter: {
        async dispatch() {
          calls.push("dispatch");
        },
      },
      slackSourceServiceFactory: createSlackSourceServiceFactory(
        calls,
        () => createFetchedAudio(localPath),
        captureHandler
      ),
    });
  };

  let firstHandler: SourceEventHandler | null = null;
  const firstService = buildService((handler) => {
    firstHandler = handler;
  });
  const getFirstHandler = (): SourceEventHandler => {
    if (!firstHandler) {
      throw new Error("expected first source event handler");
    }

    return firstHandler;
  };
  await firstService.start();
  await getFirstHandler().handle(createSourceEvent());
  await firstService.stop();

  let secondHandler: SourceEventHandler | null = null;
  const secondService = buildService((handler) => {
    secondHandler = handler;
  });
  const getSecondHandler = (): SourceEventHandler => {
    if (!secondHandler) {
      throw new Error("expected second source event handler");
    }

    return secondHandler;
  };
  await secondService.start();
  await getSecondHandler().handle(createSourceEvent());
  await secondService.stop();

  const persisted = JSON.parse(await readFile(stateFilePath, "utf8")) as {
    records: Record<string, { status: string; metadata?: Record<string, unknown> }>;
  };
  const persistedRecord = Object.values(persisted.records)[0];

  assert.equal(persistedRecord?.status, "completed");
  assert.equal(persistedRecord?.metadata?.dispatchCompleted, true);
  assert.deepEqual(calls, ["source:start", "source:fetch", "normalizer:normalize", "stt:transcribe", "dispatch", "source:stop", "source:start", "source:stop"]);

  await rm(dirname(localPath), { recursive: true, force: true });
  await rm(tempDir, { recursive: true, force: true });
});

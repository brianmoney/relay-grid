import type { OpenDispatchHttpConfig } from "../../../config";
import type { TranscriptEnvelope } from "../../../types/transcript";
import { buildConversationKey, buildDedupeKey } from "../../../utils/ids";
import { withLogContext, type AppLogger } from "../../../utils/logger";
import type { TranscriptDispatchAdapter } from "../base";
import {
  createOpenDispatchIngressApiClient,
  type OpenDispatchIngressApiClient,
  type OpenDispatchTranscriptIngressRequest,
} from "./api";

interface OpenDispatchAdapterDependencies {
  config: OpenDispatchHttpConfig;
  logger: AppLogger;
  apiClient?: OpenDispatchIngressApiClient;
}

export const createOpenDispatchIngressRequest = (
  transcript: TranscriptEnvelope
): OpenDispatchTranscriptIngressRequest => {
  return {
    source: transcript.source,
    conversationKey: buildConversationKey(transcript.source, transcript.conversation),
    dedupeKey: buildDedupeKey(transcript.source, transcript.dedupe),
    text: transcript.text,
    identity: {
      sourceScopeId: transcript.sourceIdentity.scopeId,
      eventId: transcript.sourceIdentity.eventId,
      conversationScopeId: transcript.conversation.scopeId,
      conversationId: transcript.conversation.conversationId,
      ...(transcript.conversation.threadId ? { threadId: transcript.conversation.threadId } : {}),
      dedupeScopeId: transcript.dedupe.scopeId,
      dedupeUnitId: transcript.dedupe.unitId,
      ...(transcript.dedupe.variantId ? { dedupeVariantId: transcript.dedupe.variantId } : {}),
      ...(transcript.sourceIdentity.messageId ? { messageId: transcript.sourceIdentity.messageId } : {}),
      ...(transcript.sourceIdentity.fileId ? { fileId: transcript.sourceIdentity.fileId } : {}),
    },
    routing: {
      mode: "canonical-transcript",
      ...(transcript.language ? { language: transcript.language } : {}),
    },
  };
};

export const createOpenDispatchHttpAdapter = ({
  config,
  logger,
  apiClient,
}: OpenDispatchAdapterDependencies): TranscriptDispatchAdapter => {
  const dispatchLogger = withLogContext(logger, {
    stage: "opendispatch_dispatch",
  });
  const ingressApiClient = apiClient ?? createOpenDispatchIngressApiClient(config);

  return {
    async dispatch(transcript) {
      const request = createOpenDispatchIngressRequest(transcript);
      const requestLogger = withLogContext(dispatchLogger, {
        source: transcript.source,
        conversationKey: request.conversationKey,
        dedupeKey: request.dedupeKey,
      });

      requestLogger.info(
        {
          event: "opendispatch_http_dispatch_started",
          dispatchMode: "opendispatch-http",
        },
        "Posting transcript to Open Dispatch ingress"
      );

      try {
        await ingressApiClient.postTranscript(request);
        requestLogger.info(
          {
            event: "opendispatch_http_dispatch_succeeded",
            dispatchMode: "opendispatch-http",
          },
          "Posted transcript to Open Dispatch ingress"
        );
      } catch (error) {
        requestLogger.error(
          {
            event: "opendispatch_http_dispatch_failed",
            dispatchMode: "opendispatch-http",
            error,
          },
          "Failed to post transcript to Open Dispatch ingress"
        );
        throw error;
      }
    },
  };
};

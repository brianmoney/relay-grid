import type { SlackConfig } from "../../../config";
import type { ProcessingFailure, ProcessingStateReference } from "../../../types/processing";
import type { TranscriptEnvelope } from "../../../types/transcript";
import { buildConversationKey, buildDedupeKey } from "../../../utils/ids";
import { withLogContext, type AppLogger } from "../../../utils/logger";
import {
  SIDECAR_REPOST_EVENT_TYPE,
  SIDECAR_REPOST_MARKER,
  SLACK_SOURCE_NAME,
} from "../../source/slack";
import type { TranscriptDispatchAdapter } from "../base";
import {
  createSlackPostingApiClient,
  type SlackPostingApiClient,
  type SlackThreadMessageMetadata,
  type SlackThreadMessageRequest,
} from "./api";

interface SlackDispatchAdapterDependencies {
  config: SlackConfig;
  serviceName: string;
  logger: AppLogger;
  apiClient?: SlackPostingApiClient;
}

interface SlackDispatchTarget {
  channelId: string;
  threadTs: string;
}

const normalizeRequiredValue = (label: string, value: string | undefined): string => {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`Slack transcript repost requires ${label}`);
  }

  return normalized;
};

const getSlackDispatchTarget = (transcript: TranscriptEnvelope): SlackDispatchTarget => {
  if (transcript.source !== SLACK_SOURCE_NAME) {
    throw new Error(
      `Slack transcript repost only supports source \"${SLACK_SOURCE_NAME}\", received \"${transcript.source}\"`
    );
  }

  return {
    channelId: normalizeRequiredValue(
      "conversation.conversationId",
      transcript.conversation.conversationId
    ),
    threadTs: normalizeRequiredValue("conversation.threadId", transcript.conversation.threadId),
  };
};

const buildRepostMetadata = ({
  transcript,
  serviceName,
  conversationKey,
  dedupeKey,
}: {
  transcript: TranscriptEnvelope;
  serviceName: string;
  conversationKey: string;
  dedupeKey: string;
}): SlackThreadMessageMetadata => {
  return {
    eventType: SIDECAR_REPOST_EVENT_TYPE,
    eventPayload: {
      relayGrid: {
        kind: SIDECAR_REPOST_MARKER,
        service: serviceName,
        source: transcript.source,
        conversationKey,
        dedupeKey,
      },
    },
  };
};

export const formatSlackTranscriptRepost = (transcript: TranscriptEnvelope): string => {
  const body = transcript.text.trim();

  return body.length > 0
    ? `*Transcript*\n${body}`
    : "*Transcript*\n[no transcript text returned]";
};

const formatSlackFailureNotice = (
  reference: ProcessingStateReference,
  failure: ProcessingFailure & { attempt: number; maxAttempts: number }
): string => {
  return [
    "*Relay-grid processing failed*",
    `Attempt ${failure.attempt}/${failure.maxAttempts}`,
    `Dedupe key: ${reference.dedupeKey}`,
    `Error: ${failure.message}`,
  ].join("\n");
};

const parseSlackConversationKey = (
  conversationKey: string
): { channelId: string; threadTs: string } | null => {
  const parts = conversationKey.split(":");

  if (parts.length < 6 || parts[0] !== "conversation" || parts[2] !== SLACK_SOURCE_NAME) {
    return null;
  }

  const channelId = parts[4];
  const threadTs = parts[5];

  if (!channelId || !threadTs) {
    return null;
  }

  return {
    channelId: decodeURIComponent(channelId),
    threadTs: decodeURIComponent(threadTs),
  };
};

export const createSlackDispatchAdapter = ({
  config,
  serviceName,
  logger,
  apiClient,
}: SlackDispatchAdapterDependencies): TranscriptDispatchAdapter => {
  const dispatchLogger = withLogContext(logger, {
    stage: "slack_dispatch",
    source: SLACK_SOURCE_NAME,
  });
  const postingApiClient = apiClient ?? createSlackPostingApiClient({ botToken: config.botToken });

  return {
    async dispatch(transcript) {
      const target = getSlackDispatchTarget(transcript);
      const conversationKey = buildConversationKey(transcript.source, transcript.conversation);
      const dedupeKey = buildDedupeKey(transcript.source, transcript.dedupe);
      const repostLogger = withLogContext(dispatchLogger, {
        conversationKey,
        dedupeKey,
      });

      const text = formatSlackTranscriptRepost(transcript);

      repostLogger.info(
        {
          event: "slack_transcript_repost_started",
          channelId: target.channelId,
          threadTs: target.threadTs,
        },
        "Posting Slack transcript repost"
      );

      try {
        const response = await postingApiClient.postThreadMessage({
          channelId: target.channelId,
          threadTs: target.threadTs,
          text,
          metadata: buildRepostMetadata({
            transcript,
            serviceName,
            conversationKey,
            dedupeKey,
          }),
        });

        repostLogger.info(
          {
            event: "slack_transcript_repost_succeeded",
            channelId: response.channelId,
            threadTs: target.threadTs,
            repostMessageTs: response.messageTs,
          },
          "Posted Slack transcript repost"
        );
      } catch (error) {
        repostLogger.error(
          {
            event: "slack_transcript_repost_failed",
            channelId: target.channelId,
            threadTs: target.threadTs,
            error,
          },
          "Failed to post Slack transcript repost"
        );
        throw error;
      }
    },

    async notifyFailure(reference, failure) {
      if (!config.failureNoticesEnabled || reference.source !== SLACK_SOURCE_NAME) {
        return;
      }

      const target = parseSlackConversationKey(reference.conversationKey);

      if (!target) {
        dispatchLogger.warn(
          {
            event: "slack_failure_notice_skipped",
            conversationKey: reference.conversationKey,
            dedupeKey: reference.dedupeKey,
          },
          "Skipping Slack failure notice due to invalid conversation key"
        );
        return;
      }

      await postingApiClient.postThreadMessage({
        channelId: target.channelId,
        threadTs: target.threadTs,
        text: formatSlackFailureNotice(reference, failure),
      });

      dispatchLogger.info(
        {
          event: "slack_failure_notice_sent",
          conversationKey: reference.conversationKey,
          dedupeKey: reference.dedupeKey,
        },
        "Posted Slack terminal failure notice"
      );
    },
  };
};

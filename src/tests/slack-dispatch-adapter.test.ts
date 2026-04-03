import assert from "node:assert/strict";
import test from "node:test";

import pino from "pino";

import type {
  SlackPostingApiClient,
  SlackThreadMessageRequest,
} from "../adapters/dispatch";
import {
  createSlackDispatchAdapter,
  formatSlackTranscriptRepost,
} from "../adapters/dispatch";
import { SIDECAR_REPOST_EVENT_TYPE, SIDECAR_REPOST_MARKER } from "../adapters/source/slack";
import type { SlackConfig } from "../config";
import type { TranscriptEnvelope } from "../types/transcript";
import { buildConversationKey, buildDedupeKey } from "../utils/ids";

const TEST_CONFIG: SlackConfig = {
  botToken: "xoxb-test-token",
  appToken: "xapp-test-token",
  allowlistedChannels: ["C_ALLOWED"],
  failureNoticesEnabled: false,
};

const createLogger = () => pino({ level: "silent" });

const createTranscript = (
  overrides: Partial<TranscriptEnvelope> = {}
): TranscriptEnvelope => ({
  source: overrides.source ?? "slack",
  sourceIdentity: overrides.sourceIdentity ?? {
    scopeId: "T_WORKSPACE",
    eventId: "EvTranscript",
    messageId: "1712345678.000100",
    fileId: "F_AUDIO",
  },
  conversation: overrides.conversation ?? {
    scopeId: "T_WORKSPACE",
    conversationId: "C_ALLOWED",
    threadId: "1712345678.000100",
  },
  dedupe: overrides.dedupe ?? {
    scopeId: "T_WORKSPACE",
    unitId: "C_ALLOWED:1712345678.000100",
    variantId: "F_AUDIO",
  },
  text: overrides.text ?? "hello from Slack transcript repost",
  ...(overrides.language ? { language: overrides.language } : {}),
  ...(overrides.segments ? { segments: overrides.segments } : {}),
  ...(overrides.metadata ? { metadata: overrides.metadata } : {}),
});

test("Slack dispatch reposts a transcript into the normalized top-level thread target", async () => {
  const requests: SlackThreadMessageRequest[] = [];
  const transcript = createTranscript();
  const apiClient: SlackPostingApiClient = {
    async postThreadMessage(request) {
      requests.push(request);
      return {
        channelId: request.channelId,
        messageTs: "1712345680.000200",
      };
    },
  };
  const adapter = createSlackDispatchAdapter({
    config: TEST_CONFIG,
    serviceName: "relay-grid-sidecar",
    logger: createLogger(),
    apiClient,
  });

  await adapter.dispatch(transcript);

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.channelId, "C_ALLOWED");
  assert.equal(requests[0]?.threadTs, "1712345678.000100");
  assert.equal(requests[0]?.text, formatSlackTranscriptRepost(transcript));
  assert.equal(requests[0]?.metadata?.eventType, SIDECAR_REPOST_EVENT_TYPE);
  assert.deepEqual(requests[0]?.metadata?.eventPayload, {
    relayGrid: {
      kind: SIDECAR_REPOST_MARKER,
      service: "relay-grid-sidecar",
      source: "slack",
      conversationKey: buildConversationKey(transcript.source, transcript.conversation),
      dedupeKey: buildDedupeKey(transcript.source, transcript.dedupe),
    },
  });
});

test("Slack dispatch reposts a threaded reply into the existing normalized thread target", async () => {
  const requests: SlackThreadMessageRequest[] = [];
  const transcript = createTranscript({
    conversation: {
      scopeId: "T_WORKSPACE",
      conversationId: "C_ALLOWED",
      threadId: "1712345600.000001",
    },
    dedupe: {
      scopeId: "T_WORKSPACE",
      unitId: "C_ALLOWED:1712345678.000100",
      variantId: "F_THREAD_REPLY",
    },
  });
  const apiClient: SlackPostingApiClient = {
    async postThreadMessage(request) {
      requests.push(request);
      return { channelId: request.channelId };
    },
  };
  const adapter = createSlackDispatchAdapter({
    config: TEST_CONFIG,
    serviceName: "relay-grid-sidecar",
    logger: createLogger(),
    apiClient,
  });

  await adapter.dispatch(transcript);

  assert.equal(requests[0]?.threadTs, "1712345600.000001");
});

test("Slack dispatch fails clearly when normalized thread targeting fields are missing", async () => {
  const adapter = createSlackDispatchAdapter({
    config: TEST_CONFIG,
    serviceName: "relay-grid-sidecar",
    logger: createLogger(),
    apiClient: {
      async postThreadMessage() {
        throw new Error("postThreadMessage should not be called");
      },
    },
  });

  await assert.rejects(
    () =>
      adapter.dispatch(
        createTranscript({
          conversation: {
            scopeId: "T_WORKSPACE",
            conversationId: "C_ALLOWED",
          },
        })
      ),
    /conversation\.threadId/
  );
});

test("Slack dispatch repost adapter leaves duplicate suppression to persisted orchestration state", async () => {
  const requests: SlackThreadMessageRequest[] = [];
  const transcript = createTranscript();
  const adapter = createSlackDispatchAdapter({
    config: TEST_CONFIG,
    serviceName: "relay-grid-sidecar",
    logger: createLogger(),
    apiClient: {
      async postThreadMessage(request) {
        requests.push(request);
        return { channelId: request.channelId };
      },
    },
  });

  await adapter.dispatch(transcript);
  await adapter.dispatch(transcript);

  assert.equal(requests.length, 2);
});

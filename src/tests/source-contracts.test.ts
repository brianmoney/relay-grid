import test from "node:test";
import assert from "node:assert/strict";

import type { SourceAdapter } from "../adapters/source/base";
import type { NormalizedFetchedAudio, NormalizedSourceEvent } from "../types/events";
import type { ProcessingState } from "../types/processing";
import type { TranscriptEnvelope } from "../types/transcript";
import { buildConversationKey, buildDedupeKey } from "../utils/ids";

const createNormalizedEvent = (): NormalizedSourceEvent => ({
  source: "slack",
  occurredAt: "2026-04-02T10:00:00.000Z",
  sourceIdentity: {
    scopeId: "workspace-1",
    eventId: "event-1",
    messageId: "message-1",
    fileId: "file-1",
  },
  conversation: {
    scopeId: "workspace-1",
    conversationId: "channel-1",
    threadId: "thread-1",
  },
  dedupe: {
    scopeId: "workspace-1",
    unitId: "event-1",
    variantId: "file-1",
  },
  audio: {
    mediaId: "file-1",
    mimeType: "audio/mpeg",
  },
});

test("source adapter contract exposes only normalized shapes downstream", async () => {
  class StubSourceAdapter implements SourceAdapter {
    readonly source = "slack";

    async normalizeEvent(rawEvent: unknown): Promise<NormalizedSourceEvent | null> {
      assert.equal(typeof rawEvent, "object");
      return createNormalizedEvent();
    }

    async fetchAudio(event: NormalizedSourceEvent): Promise<NormalizedFetchedAudio> {
      return {
        ...event,
        localPath: "/tmp/audio.wav",
      };
    }
  }

  const adapter: SourceAdapter = new StubSourceAdapter();
  const event = await adapter.normalizeEvent({ provider: "native-payload" });

  assert.ok(event);
  assert.equal(event.sourceIdentity.eventId, "event-1");

  const audio = await adapter.fetchAudio(event);
  assert.equal(audio.localPath, "/tmp/audio.wav");
  assert.equal(audio.dedupe.unitId, event.dedupe.unitId);
});

test("transcript and processing state relate through shared keys", () => {
  const event = createNormalizedEvent();
  const conversationKey = buildConversationKey(event.source, event.conversation);
  const dedupeKey = buildDedupeKey(event.source, event.dedupe);

  const transcript: TranscriptEnvelope = {
    source: event.source,
    sourceIdentity: event.sourceIdentity,
    conversation: event.conversation,
    dedupe: event.dedupe,
    text: "hello world",
  };

  const state: ProcessingState = {
    source: transcript.source,
    conversationKey,
    dedupeKey,
    status: "transcribed",
    attempt: 1,
    maxAttempts: 3,
    createdAt: "2026-04-02T10:00:00.000Z",
    updatedAt: "2026-04-02T10:01:00.000Z",
    stageTimestamps: {
      received: "2026-04-02T10:00:00.000Z",
      transcribed: "2026-04-02T10:01:00.000Z",
    },
  };

  assert.equal(state.conversationKey, conversationKey);
  assert.equal(state.dedupeKey, dedupeKey);
  assert.equal(transcript.conversation.threadId, "thread-1");
});

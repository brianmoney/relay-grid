import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";

import pino from "pino";

import type { SlackConfig } from "../config";
import type { NormalizedSourceEvent } from "../types/events";
import { buildConversationKey, buildDedupeKey } from "../utils/ids";
import {
  createSlackSourceAdapter,
  SIDECAR_REPOST_EVENT_TYPE,
  SIDECAR_REPOST_MARKER,
  type SlackApiClient,
  type SlackFileRecord,
  type SlackInstallationContext,
} from "../adapters/source/slack";

const TEST_CONFIG: SlackConfig = {
  botToken: "xoxb-test-token",
  appToken: "xapp-test-token",
  allowlistedChannels: ["C_ALLOWED"],
  failureNoticesEnabled: false,
};

const TEST_INSTALLATION: SlackInstallationContext = {
  scopeId: "T_WORKSPACE",
  botUserId: "U_BOT",
  botId: "B_BOT",
};

const createLogger = () => pino({ level: "silent" });

const createSlackFile = (overrides: Partial<SlackFileRecord> = {}): SlackFileRecord => ({
  id: overrides.id ?? "F_AUDIO",
  ...(overrides.name ?? "voice.mp3" ? { name: overrides.name ?? "voice.mp3" } : {}),
  ...(overrides.mimetype ?? "audio/mpeg" ? { mimetype: overrides.mimetype ?? "audio/mpeg" } : {}),
  ...(overrides.filetype ?? "mp3" ? { filetype: overrides.filetype ?? "mp3" } : {}),
  ...(overrides.size ?? 128 ? { size: overrides.size ?? 128 } : {}),
  ...(overrides.urlPrivate ?? "https://slack.example/private" 
    ? { urlPrivate: overrides.urlPrivate ?? "https://slack.example/private" }
    : {}),
  ...(overrides.urlPrivateDownload ?? "https://slack.example/private-download"
    ? { urlPrivateDownload: overrides.urlPrivateDownload ?? "https://slack.example/private-download" }
    : {}),
});

const createRawSlackFilePayload = (overrides: Partial<SlackFileRecord> = {}): Record<string, unknown> => ({
  id: overrides.id ?? "F_AUDIO",
  ...(overrides.name ?? "voice.mp3" ? { name: overrides.name ?? "voice.mp3" } : {}),
  ...(overrides.mimetype ?? "audio/mpeg" ? { mimetype: overrides.mimetype ?? "audio/mpeg" } : {}),
  ...(overrides.filetype ?? "mp3" ? { filetype: overrides.filetype ?? "mp3" } : {}),
  ...(overrides.size ?? 128 ? { size: overrides.size ?? 128 } : {}),
  ...(overrides.urlPrivate ?? "https://slack.example/private"
    ? { url_private: overrides.urlPrivate ?? "https://slack.example/private" }
    : {}),
  ...(overrides.urlPrivateDownload ?? "https://slack.example/private-download"
    ? { url_private_download: overrides.urlPrivateDownload ?? "https://slack.example/private-download" }
    : {}),
});

const createRawSlackEvent = (options?: {
  channelId?: string;
  userId?: string;
  botId?: string;
  threadTs?: string;
  files?: unknown[];
  metadataEventType?: string;
  metadataEventPayload?: Record<string, unknown>;
  messageTs?: string;
  eventId?: string;
}): Record<string, unknown> => {
  const messageTs = options?.messageTs ?? "1712345678.000100";

  return {
    type: "event_callback",
    team_id: "T_WORKSPACE",
    event_id: options?.eventId ?? "Ev01",
    authorizations: [{ team_id: "T_WORKSPACE" }],
    event: {
      type: "message",
      channel: options?.channelId ?? "C_ALLOWED",
      ts: messageTs,
      ...(options?.threadTs ? { thread_ts: options.threadTs } : {}),
      ...(options?.userId ? { user: options.userId } : {}),
      ...(options?.botId ? { bot_id: options.botId } : {}),
      ...(options?.metadataEventType || options?.metadataEventPayload
        ? {
            metadata: {
              ...(options?.metadataEventType ? { event_type: options.metadataEventType } : {}),
              ...(options?.metadataEventPayload
                ? { event_payload: options.metadataEventPayload }
                : {}),
            },
          }
        : {}),
      files: options?.files ?? [createRawSlackFilePayload()],
    },
  };
};

const createStubSlackClient = (options?: {
  resolvedFiles?: Record<string, SlackFileRecord | null>;
  downloadedBytes?: Uint8Array;
}): {
  client: SlackApiClient;
  calls: { getFile: string[]; downloadFile: string[] };
} => {
  const calls = { getFile: [] as string[], downloadFile: [] as string[] };

  return {
    client: {
      async authTest() {
        return TEST_INSTALLATION;
      },
      async getFile(fileId) {
        calls.getFile.push(fileId);
        return options?.resolvedFiles?.[fileId] ?? null;
      },
      async downloadFile(file) {
        calls.downloadFile.push(file.id);
        return options?.downloadedBytes ?? new Uint8Array([1, 2, 3, 4]);
      },
    },
    calls,
  };
};

const createAdapter = (client: SlackApiClient) => {
  return createSlackSourceAdapter({
    config: TEST_CONFIG,
    client,
    installation: TEST_INSTALLATION,
    logger: createLogger(),
  });
};

test("Slack adapter ignores messages outside the allowlist", async () => {
  const { client, calls } = createStubSlackClient();
  const adapter = createAdapter(client);

  const event = await adapter.normalizeEvent(createRawSlackEvent({ channelId: "C_BLOCKED", userId: "U_USER" }));

  assert.equal(event, null);
  assert.deepEqual(calls.getFile, []);
});

test("Slack adapter ignores non-audio messages", async () => {
  const { client } = createStubSlackClient();
  const adapter = createAdapter(client);

  const event = await adapter.normalizeEvent(
    createRawSlackEvent({
      userId: "U_USER",
      files: [
        createRawSlackFilePayload({
          id: "F_TEXT",
          name: "notes.txt",
          mimetype: "text/plain",
          filetype: "txt",
          urlPrivate: "https://slack.example/text",
          urlPrivateDownload: "https://slack.example/text-download",
        }),
      ],
    })
  );

  assert.equal(event, null);
});

test("Slack adapter resolves incomplete file metadata before normalization", async () => {
  const resolvedFile = createSlackFile({ id: "F_RESOLVED", name: "voice-note.m4a", mimetype: "audio/mp4", filetype: "m4a" });
  const { client, calls } = createStubSlackClient({
    resolvedFiles: {
      F_RESOLVED: resolvedFile,
    },
  });
  const adapter = createAdapter(client);

  const event = await adapter.normalizeEvent(
    createRawSlackEvent({
      userId: "U_USER",
      files: [{ id: "F_RESOLVED" }],
      eventId: "EvResolve",
    })
  );

  assert.ok(event);
  assert.deepEqual(calls.getFile, ["F_RESOLVED"]);
  assert.equal(event.audio.mediaId, "F_RESOLVED");
  assert.equal(event.audio.mimeType, "audio/mp4");
  assert.equal(event.audio.fileName, "voice-note.m4a");
  assert.equal(event.sourceIdentity.eventId, "EvResolve");
});

test("Slack adapter maps thread, source, and dedupe identity from Slack IDs", async () => {
  const { client } = createStubSlackClient();
  const adapter = createAdapter(client);

  const event = await adapter.normalizeEvent(
    createRawSlackEvent({
      userId: "U_USER",
      threadTs: "1712345600.000001",
      messageTs: "1712345678.000100",
      eventId: "EvThread",
      files: [createRawSlackFilePayload({ id: "F_THREAD" })],
    })
  );

  assert.ok(event);
  assert.equal(event.sourceIdentity.scopeId, "T_WORKSPACE");
  assert.equal(event.sourceIdentity.eventId, "EvThread");
  assert.equal(event.sourceIdentity.messageId, "1712345678.000100");
  assert.equal(event.sourceIdentity.fileId, "F_THREAD");
  assert.equal(event.conversation.scopeId, "T_WORKSPACE");
  assert.equal(event.conversation.conversationId, "C_ALLOWED");
  assert.equal(event.conversation.threadId, "1712345600.000001");
  assert.equal(event.dedupe.scopeId, "T_WORKSPACE");
  assert.equal(event.dedupe.unitId, "C_ALLOWED:1712345678.000100");
  assert.equal(event.dedupe.variantId, "F_THREAD");
  assert.equal(
    buildConversationKey(event.source, event.conversation),
    "conversation:v1:slack:T_WORKSPACE:C_ALLOWED:1712345600.000001"
  );
  assert.equal(
    buildDedupeKey(event.source, event.dedupe),
    "dedupe:v1:slack:T_WORKSPACE:C_ALLOWED%3A1712345678.000100:F_THREAD"
  );
});

test("Slack adapter uses message timestamp as thread identity for top-level posts", async () => {
  const { client } = createStubSlackClient();
  const adapter = createAdapter(client);

  const event = await adapter.normalizeEvent(createRawSlackEvent({ userId: "U_USER", messageTs: "1712345000.000999" }));

  assert.ok(event);
  assert.equal(event.conversation.threadId, "1712345000.000999");
});

test("Slack adapter filters self-authored and sidecar repost messages before normalization", async () => {
  const { client } = createStubSlackClient();
  const adapter = createAdapter(client);

  const selfAuthoredEvent = await adapter.normalizeEvent(
    createRawSlackEvent({
      ...(TEST_INSTALLATION.botUserId ? { userId: TEST_INSTALLATION.botUserId } : {}),
      ...(TEST_INSTALLATION.botId ? { botId: TEST_INSTALLATION.botId } : {}),
    })
  );
  const repostEvent = await adapter.normalizeEvent(
    createRawSlackEvent({ userId: "U_USER", metadataEventType: SIDECAR_REPOST_EVENT_TYPE })
  );

  assert.equal(selfAuthoredEvent, null);
  assert.equal(repostEvent, null);
});

test("Slack adapter filters sidecar repost messages when the relay-grid marker is present", async () => {
  const { client } = createStubSlackClient();
  const adapter = createAdapter(client);

  const repostEvent = await adapter.normalizeEvent(
    createRawSlackEvent({
      userId: "U_USER",
      metadataEventPayload: {
        relayGrid: {
          kind: SIDECAR_REPOST_MARKER,
        },
      },
    })
  );

  assert.equal(repostEvent, null);
});

test("Slack adapter does not treat missing botId values as self-authored matches", async () => {
  const { client } = createStubSlackClient();
  const adapter = createSlackSourceAdapter({
    config: TEST_CONFIG,
    client,
    installation: {
      scopeId: TEST_INSTALLATION.scopeId,
      ...(TEST_INSTALLATION.botUserId ? { botUserId: TEST_INSTALLATION.botUserId } : {}),
    },
    logger: createLogger(),
  });

  const event = await adapter.normalizeEvent(
    createRawSlackEvent({
      userId: "U_NORMAL_USER",
      files: [createRawSlackFilePayload({ id: "F_NORMAL" })],
    })
  );

  assert.ok(event);
  assert.equal(event.sourceIdentity.fileId, "F_NORMAL");
});

test("Slack adapter fetchAudio downloads authenticated audio and returns normalized fetched audio", async () => {
  const { client, calls } = createStubSlackClient({
    downloadedBytes: new Uint8Array([10, 20, 30]),
  });
  const adapter = createAdapter(client);

  const event = (await adapter.normalizeEvent(createRawSlackEvent({ userId: "U_USER" }))) as NormalizedSourceEvent | null;

  assert.ok(event);

  const fetchedAudio = await adapter.fetchAudio(event);
  const bytes = await readFile(fetchedAudio.localPath);

  assert.equal(fetchedAudio.source, "slack");
  assert.equal(fetchedAudio.audio.mediaId, event.audio.mediaId);
  assert.equal(fetchedAudio.audio.fileName, "voice.mp3");
  assert.deepEqual(Array.from(bytes), [10, 20, 30]);
  assert.deepEqual(calls.downloadFile, ["F_AUDIO"]);

  await rm(dirname(fetchedAudio.localPath), { recursive: true, force: true });
});

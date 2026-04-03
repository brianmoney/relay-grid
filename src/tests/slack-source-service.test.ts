import assert from "node:assert/strict";
import test from "node:test";

import pino from "pino";

import type { SlackConfig } from "../config";
import type { NormalizedSourceEvent } from "../types/events";
import type { SourceEventHandler } from "../types/service";
import {
  createSlackSourceService,
  type SlackApiClient,
  type SlackFileRecord,
  type SlackInstallationContext,
  type SlackSocketModeClient,
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
};

const createLogger = () => pino({ level: "silent" });

const createApiFile = (overrides: Partial<SlackFileRecord> = {}): SlackFileRecord => ({
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

const createSocketModeBody = (): Record<string, unknown> => ({
  type: "event_callback",
  team_id: "T_WORKSPACE",
  event_id: "EvSocket",
  authorizations: [{ team_id: "T_WORKSPACE" }],
  event: {
    type: "message",
    channel: "C_ALLOWED",
    ts: "1712345678.000100",
    user: "U_USER",
    files: [
      {
        id: "F_AUDIO",
        name: "voice.mp3",
        mimetype: "audio/mpeg",
        filetype: "mp3",
        size: 128,
        url_private: "https://slack.example/private",
        url_private_download: "https://slack.example/private-download",
      },
    ],
  },
});

class FakeSocketModeClient implements SlackSocketModeClient {
  private messageListener: ((payload: unknown) => void) | null = null;

  started = false;
  disconnected = false;

  on(event: "message", listener: (payload: unknown) => void): void {
    if (event === "message") {
      this.messageListener = listener;
    }
  }

  off(event: "message", listener: (payload: unknown) => void): void {
    if (event === "message" && this.messageListener === listener) {
      this.messageListener = null;
    }
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
  }

  emitMessage(payload: unknown): void {
    this.messageListener?.(payload);
  }
}

const createStubApiClient = (): { client: SlackApiClient } => {
  
  return {
    client: {
      async authTest() {
        return TEST_INSTALLATION;
      },
      async getFile() {
        return null;
      },
      async downloadFile(file) {
        return new Uint8Array([1, 2, 3]);
      },
    },
  };
};

test("Slack source service acks Socket Mode events and forwards normalized source events", async () => {
  const socketClient = new FakeSocketModeClient();
  const { client } = createStubApiClient();
  const handledEvents: NormalizedSourceEvent[] = [];
  let acked = false;
  let resolveHandledEvent: (() => void) | null = null;
  const handledEventPromise = new Promise<void>((resolve) => {
    resolveHandledEvent = resolve;
  });

  const sourceEventHandler: SourceEventHandler = {
    async handle(event) {
      handledEvents.push(event);
      resolveHandledEvent?.();
    },
  };

  const service = await createSlackSourceService({
    config: TEST_CONFIG,
    logger: createLogger(),
    sourceEventHandler,
    apiClient: client,
    socketClientFactory: () => socketClient,
  });

  await service.lifecycle.start();

  socketClient.emitMessage({
    ack: async () => {
      acked = true;
    },
    body: createSocketModeBody(),
  });

  await handledEventPromise;

  assert.equal(socketClient.started, true);
  assert.equal(acked, true);
  assert.equal(handledEvents.length, 1);
  assert.equal(handledEvents[0]?.source, "slack");
  assert.equal(handledEvents[0]?.audio.mediaId, "F_AUDIO");

  await service.lifecycle.stop();
  assert.equal(socketClient.disconnected, true);
});

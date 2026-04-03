import { SocketModeClient } from "@slack/socket-mode";

import type { SlackConfig } from "../../../config";
import type { LifecycleService, SourceEventHandler } from "../../../types/service";
import { withLogContext, type AppLogger } from "../../../utils/logger";
import { createSlackApiClient, type SlackApiClient, type SlackInstallationContext } from "./api";
import { createSlackSourceAdapter } from "./adapter";

interface SlackMessageCallbackPayload {
  ack: () => Promise<void>;
  body: unknown;
  retry_num?: number;
  retry_reason?: string;
}

interface SlackSourceServiceDependencies {
  config: SlackConfig;
  logger: AppLogger;
  sourceEventHandler: SourceEventHandler;
  apiClient?: SlackApiClient;
  socketClientFactory?: (appToken: string) => SlackSocketModeClient;
}

export interface SlackSocketModeClient {
  on(event: "message", listener: (payload: unknown) => void): void;
  off(event: "message", listener: (payload: unknown) => void): void;
  start(): Promise<unknown>;
  disconnect(): Promise<void>;
}

export interface SlackSourceRuntime {
  lifecycle: LifecycleService;
  adapter: ReturnType<typeof createSlackSourceAdapter>;
  installation: SlackInstallationContext;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const parseMessageCallbackPayload = (value: unknown): SlackMessageCallbackPayload | null => {
  if (!isRecord(value) || typeof value.ack !== "function") {
    return null;
  }

  return {
    ack: value.ack as () => Promise<void>,
    body: value.body,
    ...(typeof value.retry_num === "number" ? { retry_num: value.retry_num } : {}),
    ...(typeof value.retry_reason === "string" ? { retry_reason: value.retry_reason } : {}),
  };
};

export const createSlackSourceService = async ({
  config,
  logger,
  sourceEventHandler,
  apiClient,
  socketClientFactory,
}: SlackSourceServiceDependencies): Promise<SlackSourceRuntime> => {
  const serviceLogger = withLogContext(logger, {
    stage: "slack_socket_mode",
    source: "slack",
  });
  const slackApiClient = apiClient ?? createSlackApiClient({ botToken: config.botToken });
  const installation = await slackApiClient.authTest();
  const adapter = createSlackSourceAdapter({
    config,
    client: slackApiClient,
    installation,
    logger,
  });
  let started = false;
  let socketClient: SlackSocketModeClient | null = null;
  let messageListener: ((payload: unknown) => void) | null = null;

  return {
    installation,
    adapter,
    lifecycle: {
      async start() {
        if (started) {
          return;
        }

        socketClient = socketClientFactory
          ? socketClientFactory(config.appToken)
          : new SocketModeClient({ appToken: config.appToken });
        messageListener = (payload: unknown): void => {
          void (async () => {
            const callbackPayload = parseMessageCallbackPayload(payload);

            if (!callbackPayload) {
              return;
            }

            try {
              await callbackPayload.ack();
            } catch (error) {
              serviceLogger.error(
                {
                  event: "slack_event_ack_failed",
                  retryNum: callbackPayload.retry_num,
                  retryReason: callbackPayload.retry_reason,
                  error,
                },
                "Failed to acknowledge Slack message event"
              );
              return;
            }

            try {
              const normalizedEvent = await adapter.normalizeEvent(callbackPayload.body);

              if (!normalizedEvent) {
                return;
              }

              await sourceEventHandler.handle(normalizedEvent);
            } catch (error) {
              serviceLogger.error(
                {
                  event: "slack_event_processing_failed",
                  retryNum: callbackPayload.retry_num,
                  retryReason: callbackPayload.retry_reason,
                  error,
                },
                "Slack message event processing failed"
              );
            }
          })();
        };

        socketClient.on("message", messageListener);

        serviceLogger.info(
          {
            event: "slack_socket_mode_starting",
            allowlistedChannelCount: config.allowlistedChannels.length,
            scopeId: installation.scopeId,
          },
          "Starting Slack Socket Mode intake"
        );

        await socketClient.start();
        started = true;

        serviceLogger.info(
          {
            event: "slack_socket_mode_started",
            scopeId: installation.scopeId,
          },
          "Slack Socket Mode intake ready"
        );
      },

      async stop() {
        if (!started) {
          return;
        }

        started = false;

        if (socketClient && messageListener) {
          socketClient.off("message", messageListener);
        }

        if (socketClient) {
          await socketClient.disconnect();
        }

        socketClient = null;
        messageListener = null;

        serviceLogger.info({ event: "slack_socket_mode_stopped" }, "Slack Socket Mode intake stopped");
      },
    },
  };
};

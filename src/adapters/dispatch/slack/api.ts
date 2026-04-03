import { WebClient } from "@slack/web-api";

import type { SlackConfig } from "../../../config";

export interface SlackThreadMessageMetadata {
  eventType: string;
  eventPayload: Record<string, unknown>;
}

export interface SlackThreadMessageRequest {
  channelId: string;
  threadTs: string;
  text: string;
  metadata?: SlackThreadMessageMetadata;
}

export interface SlackThreadMessageResponse {
  channelId: string;
  messageTs?: string;
}

export interface SlackPostingApiClient {
  postThreadMessage(request: SlackThreadMessageRequest): Promise<SlackThreadMessageResponse>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const readString = (value: Record<string, unknown>, key: string): string | undefined => {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : undefined;
};

export const createSlackPostingApiClient = ({
  botToken,
}: Pick<SlackConfig, "botToken">): SlackPostingApiClient => {
  const webClient = new WebClient(botToken);

  return {
    async postThreadMessage(request) {
      const response = await webClient.apiCall("chat.postMessage", {
        channel: request.channelId,
        thread_ts: request.threadTs,
        text: request.text,
        unfurl_links: false,
        unfurl_media: false,
        ...(request.metadata
          ? {
              metadata: {
                event_type: request.metadata.eventType,
                event_payload: request.metadata.eventPayload,
              },
            }
          : {}),
      });

      if (!isRecord(response)) {
        return { channelId: request.channelId };
      }

      const messageTs = readString(response, "ts");

      return {
        channelId: readString(response, "channel") ?? request.channelId,
        ...(messageTs ? { messageTs } : {}),
      };
    },
  };
};

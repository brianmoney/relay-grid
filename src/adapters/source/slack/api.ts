import { WebClient } from "@slack/web-api";

import type { SlackConfig } from "../../../config";

export interface SlackInstallationContext {
  scopeId: string;
  botUserId?: string;
  botId?: string;
}

export interface SlackFileRecord {
  id: string;
  name?: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  urlPrivate?: string;
  urlPrivateDownload?: string;
}

export interface SlackApiClient {
  authTest(): Promise<SlackInstallationContext>;
  getFile(fileId: string): Promise<SlackFileRecord | null>;
  downloadFile(file: SlackFileRecord): Promise<Uint8Array>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const readString = (value: Record<string, unknown>, key: string): string | undefined => {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : undefined;
};

const readNumber = (value: Record<string, unknown>, key: string): number | undefined => {
  const candidate = value[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
};

const createSlackFileRecord = (
  id: string,
  options: {
    name?: string | undefined;
    mimetype?: string | undefined;
    filetype?: string | undefined;
    size?: number | undefined;
    urlPrivate?: string | undefined;
    urlPrivateDownload?: string | undefined;
  }
): SlackFileRecord => {
  return {
    id,
    ...(options.name ? { name: options.name } : {}),
    ...(options.mimetype ? { mimetype: options.mimetype } : {}),
    ...(options.filetype ? { filetype: options.filetype } : {}),
    ...(options.size !== undefined ? { size: options.size } : {}),
    ...(options.urlPrivate ? { urlPrivate: options.urlPrivate } : {}),
    ...(options.urlPrivateDownload ? { urlPrivateDownload: options.urlPrivateDownload } : {}),
  };
};

const parseSlackFileRecord = (value: unknown): SlackFileRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value, "id");

  if (!id) {
    return null;
  }

  return createSlackFileRecord(id, {
    name: readString(value, "name"),
    mimetype: readString(value, "mimetype"),
    filetype: readString(value, "filetype"),
    size: readNumber(value, "size"),
    urlPrivate: readString(value, "url_private"),
    urlPrivateDownload: readString(value, "url_private_download"),
  });
};

export const createSlackApiClient = ({ botToken }: Pick<SlackConfig, "botToken">): SlackApiClient => {
  const webClient = new WebClient(botToken);

  return {
    async authTest() {
      const response = await webClient.auth.test();
      const scopeId = response.team_id ?? response.enterprise_id;

      if (!scopeId) {
        throw new Error("Slack auth.test did not return a workspace scope identifier");
      }

      return {
        scopeId,
        ...(response.user_id ? { botUserId: response.user_id } : {}),
        ...(response.bot_id ? { botId: response.bot_id } : {}),
      };
    },

    async getFile(fileId) {
      const response = await webClient.files.info({ file: fileId });
      return parseSlackFileRecord(response.file);
    },

    async downloadFile(file) {
      const downloadUrl = file.urlPrivateDownload ?? file.urlPrivate;

      if (!downloadUrl) {
        throw new Error(`Slack file ${file.id} is missing an authenticated download URL`);
      }

      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${botToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Slack file download failed with status ${response.status}`);
      }

      return new Uint8Array(await response.arrayBuffer());
    },
  };
};

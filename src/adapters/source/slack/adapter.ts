import { mkdtemp, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";

import type { SlackConfig } from "../../../config";
import type { NormalizedFetchedAudio, NormalizedSourceEvent } from "../../../types/events";
import { buildConversationKey, buildDedupeKey } from "../../../utils/ids";
import { withLogContext, type AppLogger } from "../../../utils/logger";
import type { SourceAdapter } from "../base";
import type { SlackApiClient, SlackFileRecord, SlackInstallationContext } from "./api";

export const SLACK_SOURCE_NAME = "slack";
export const SIDECAR_REPOST_EVENT_TYPE = "relay_grid.sidecar_repost";
export const SIDECAR_REPOST_MARKER = "sidecar_repost";

interface SlackMessageEnvelope {
  scopeId: string;
  eventId: string;
  channelId: string;
  messageTs: string;
  threadTs?: string;
  occurredAt: string;
  userId?: string;
  botId?: string;
  subtype?: string;
  metadataEventType?: string;
  metadataRelayGridMarker?: string;
  files: SlackFileRecord[];
}

interface SlackEventMetadata {
  slack: {
    channelId: string;
    eventId: string;
    messageTs: string;
    threadTs?: string;
    userId?: string;
    botId?: string;
    file: SlackFileRecord;
  };
}

interface SlackSourceAdapterDependencies {
  config: SlackConfig;
  client: SlackApiClient;
  installation: SlackInstallationContext;
  logger: AppLogger;
}

const SUPPORTED_AUDIO_FILE_TYPES = new Set([
  "aac",
  "aiff",
  "amr",
  "caf",
  "flac",
  "m4a",
  "mp3",
  "mpga",
  "oga",
  "ogg",
  "opus",
  "wav",
  "weba",
  "wma",
]);

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  "audio/aac": ".aac",
  "audio/aiff": ".aiff",
  "audio/amr": ".amr",
  "audio/flac": ".flac",
  "audio/m4a": ".m4a",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/opus": ".opus",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "audio/x-aiff": ".aiff",
  "audio/x-m4a": ".m4a",
  "audio/x-wav": ".wav",
};

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

const readFileRecords = (value: unknown): SlackFileRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = readString(entry, "id");

    if (!id) {
      return [];
    }

    return [
      createSlackFileRecord(id, {
        name: readString(entry, "name"),
        mimetype: readString(entry, "mimetype"),
        filetype: readString(entry, "filetype"),
        size: readNumber(entry, "size"),
        urlPrivate: readString(entry, "url_private"),
        urlPrivateDownload: readString(entry, "url_private_download"),
      }),
    ];
  });
};

const parseSlackTimestamp = (value: string): string => {
  const timestampMs = Number(value) * 1000;

  if (!Number.isFinite(timestampMs)) {
    throw new Error(`Invalid Slack timestamp: ${value}`);
  }

  return new Date(timestampMs).toISOString();
};

const readRelayGridMetadataMarker = (metadata: Record<string, unknown> | null): string | undefined => {
  if (!metadata || !isRecord(metadata.event_payload)) {
    return undefined;
  }

  const eventPayload = metadata.event_payload;

  if (isRecord(eventPayload.relayGrid)) {
    return readString(eventPayload.relayGrid, "kind");
  }

  return readString(eventPayload, "marker");
};

const parseMessageEnvelope = (
  rawEvent: unknown,
  installation: SlackInstallationContext
): SlackMessageEnvelope | null => {
  if (!isRecord(rawEvent)) {
    return null;
  }

  const outerType = readString(rawEvent, "type");
  const event = isRecord(rawEvent.event) ? rawEvent.event : null;

  if (outerType !== "event_callback" || !event || readString(event, "type") !== "message") {
    return null;
  }

  const channelId = readString(event, "channel");
  const messageTs = readString(event, "ts");

  if (!channelId || !messageTs) {
    return null;
  }

  const authorizations = Array.isArray(rawEvent.authorizations) ? rawEvent.authorizations : [];
  const authorizationScopeId = authorizations.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const teamId = readString(entry, "team_id");
    return teamId ? [teamId] : [];
  })[0];

  const metadata = isRecord(event.metadata) ? event.metadata : null;
  const threadTs = readString(event, "thread_ts");
  const userId = readString(event, "user");
  const botId = readString(event, "bot_id");
  const subtype = readString(event, "subtype");
  const metadataEventType = metadata ? readString(metadata, "event_type") : undefined;
  const metadataRelayGridMarker = readRelayGridMetadataMarker(metadata);

  return {
    scopeId: readString(rawEvent, "team_id") ?? authorizationScopeId ?? installation.scopeId,
    eventId: readString(rawEvent, "event_id") ?? `${channelId}:${messageTs}`,
    channelId,
    messageTs,
    ...(threadTs ? { threadTs } : {}),
    occurredAt: parseSlackTimestamp(messageTs),
    ...(userId ? { userId } : {}),
    ...(botId ? { botId } : {}),
    ...(subtype ? { subtype } : {}),
    ...(metadataEventType ? { metadataEventType } : {}),
    ...(metadataRelayGridMarker ? { metadataRelayGridMarker } : {}),
    files: readFileRecords(event.files),
  };
};

const isSupportedAudioFile = (file: SlackFileRecord): boolean => {
  const mimeType = file.mimetype?.toLowerCase();

  if (mimeType?.startsWith("audio/")) {
    return true;
  }

  const fileType = file.filetype?.toLowerCase();

  if (fileType && SUPPORTED_AUDIO_FILE_TYPES.has(fileType)) {
    return true;
  }

  const extension = file.name ? extname(file.name).toLowerCase().replace(/^\./, "") : undefined;
  return extension ? SUPPORTED_AUDIO_FILE_TYPES.has(extension) : false;
};

const hasDownloadUrl = (file: SlackFileRecord): boolean => {
  return Boolean(file.urlPrivateDownload ?? file.urlPrivate);
};

const hasFileHints = (file: SlackFileRecord): boolean => {
  return Boolean(file.mimetype ?? file.filetype ?? file.name);
};

const mergeFileRecords = (base: SlackFileRecord, override: SlackFileRecord): SlackFileRecord => {
  return createSlackFileRecord(override.id, {
    name: override.name ?? base.name,
    mimetype: override.mimetype ?? base.mimetype,
    filetype: override.filetype ?? base.filetype,
    size: override.size ?? base.size,
    urlPrivate: override.urlPrivate ?? base.urlPrivate,
    urlPrivateDownload: override.urlPrivateDownload ?? base.urlPrivateDownload,
  });
};

const getSlackMetadata = (metadata: Record<string, unknown> | undefined): SlackEventMetadata | null => {
  if (!metadata || !isRecord(metadata.slack) || !isRecord(metadata.slack.file)) {
    return null;
  }

  const slack = metadata.slack;
  const file = metadata.slack.file;
  const channelId = readString(slack, "channelId");
  const eventId = readString(slack, "eventId");
  const messageTs = readString(slack, "messageTs");
  const fileId = readString(file, "id");
  const threadTs = readString(slack, "threadTs");
  const userId = readString(slack, "userId");
  const botId = readString(slack, "botId");

  if (!channelId || !eventId || !messageTs || !fileId) {
    return null;
  }

  return {
    slack: {
      channelId,
      eventId,
      messageTs,
      ...(threadTs ? { threadTs } : {}),
      ...(userId ? { userId } : {}),
      ...(botId ? { botId } : {}),
      file: createSlackFileRecord(fileId, {
        name: readString(file, "name"),
        mimetype: readString(file, "mimetype"),
        filetype: readString(file, "filetype"),
        size: readNumber(file, "size"),
        urlPrivate: readString(file, "urlPrivate"),
        urlPrivateDownload: readString(file, "urlPrivateDownload"),
      }),
    },
  };
};

const sanitizeFileName = (value: string): string => {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
};

const deriveFileExtension = (file: SlackFileRecord, fallbackFileName: string | undefined): string => {
  const explicitName = file.name ?? fallbackFileName;

  if (explicitName) {
    const extension = extname(explicitName);

    if (extension) {
      return extension;
    }
  }

  if (file.filetype && SUPPORTED_AUDIO_FILE_TYPES.has(file.filetype.toLowerCase())) {
    return `.${file.filetype.toLowerCase()}`;
  }

  if (file.mimetype) {
    return MIME_TYPE_TO_EXTENSION[file.mimetype.toLowerCase()] ?? ".audio";
  }

  return ".audio";
};

const buildSlackMetadata = (
  envelope: SlackMessageEnvelope,
  file: SlackFileRecord
): Record<string, unknown> => {
  return {
    slack: {
      channelId: envelope.channelId,
      eventId: envelope.eventId,
      messageTs: envelope.messageTs,
      ...(envelope.threadTs ? { threadTs: envelope.threadTs } : {}),
      ...(envelope.userId ? { userId: envelope.userId } : {}),
      ...(envelope.botId ? { botId: envelope.botId } : {}),
      file,
    },
  };
};

export const createSlackSourceAdapter = ({
  config,
  client,
  installation,
  logger,
}: SlackSourceAdapterDependencies): SourceAdapter => {
  const adapterLogger = withLogContext(logger, {
    stage: "slack_source_adapter",
    source: SLACK_SOURCE_NAME,
  });
  const allowlistedChannels = new Set(config.allowlistedChannels);

  const resolveCandidateFile = async (candidate: SlackFileRecord): Promise<SlackFileRecord | null> => {
    if (!candidate.id) {
      return null;
    }

    const shouldResolve = !hasDownloadUrl(candidate) || !hasFileHints(candidate);
    const resolvedCandidate = shouldResolve ? await client.getFile(candidate.id) : null;
    const file = resolvedCandidate ? mergeFileRecords(candidate, resolvedCandidate) : candidate;

    if (!isSupportedAudioFile(file)) {
      return null;
    }

    if (!hasDownloadUrl(file)) {
      throw new Error(`Slack file ${candidate.id} is missing download metadata after resolution`);
    }

    return file;
  };

  const selectAudioFile = async (envelope: SlackMessageEnvelope): Promise<SlackFileRecord | null> => {
    for (const candidate of envelope.files) {
      const file = await resolveCandidateFile(candidate);

      if (file) {
        return file;
      }
    }

    return null;
  };

  return {
    source: SLACK_SOURCE_NAME,

    async normalizeEvent(rawEvent) {
      const envelope = parseMessageEnvelope(rawEvent, installation);

      if (!envelope) {
        return null;
      }

      if (!allowlistedChannels.has(envelope.channelId)) {
        adapterLogger.debug(
          {
            event: "slack_event_ignored",
            reason: "channel_not_allowlisted",
            channelId: envelope.channelId,
          },
          "Ignoring Slack message outside the allowlist"
        );
        return null;
      }

      const isSelfAuthoredByUser = Boolean(
        installation.botUserId && envelope.userId && envelope.userId === installation.botUserId
      );
      const isSelfAuthoredByBot = Boolean(
        installation.botId && envelope.botId && envelope.botId === installation.botId
      );

      if (isSelfAuthoredByUser || isSelfAuthoredByBot) {
        adapterLogger.debug(
          {
            event: "slack_event_ignored",
            reason: "self_authored_message",
            channelId: envelope.channelId,
            messageTs: envelope.messageTs,
          },
          "Ignoring self-authored Slack message"
        );
        return null;
      }

      if (
        envelope.metadataEventType === SIDECAR_REPOST_EVENT_TYPE ||
        envelope.metadataRelayGridMarker === SIDECAR_REPOST_MARKER
      ) {
        adapterLogger.debug(
          {
            event: "slack_event_ignored",
            reason: "sidecar_repost_loop",
            channelId: envelope.channelId,
            messageTs: envelope.messageTs,
            metadataEventType: envelope.metadataEventType,
            metadataRelayGridMarker: envelope.metadataRelayGridMarker,
          },
          "Ignoring sidecar repost message"
        );
        return null;
      }

      const selectedFile = await selectAudioFile(envelope);

      if (!selectedFile) {
        adapterLogger.debug(
          {
            event: "slack_event_ignored",
            reason: "no_supported_audio",
            channelId: envelope.channelId,
            messageTs: envelope.messageTs,
          },
          "Ignoring Slack message without ingestible audio"
        );
        return null;
      }

      const conversationId = envelope.channelId;
      const threadId = envelope.threadTs ?? envelope.messageTs;

      return {
        source: SLACK_SOURCE_NAME,
        occurredAt: envelope.occurredAt,
        sourceIdentity: {
          scopeId: envelope.scopeId,
          eventId: envelope.eventId,
          messageId: envelope.messageTs,
          fileId: selectedFile.id,
        },
        conversation: {
          scopeId: envelope.scopeId,
          conversationId,
          threadId,
        },
        dedupe: {
          scopeId: envelope.scopeId,
          unitId: `${envelope.channelId}:${envelope.messageTs}`,
          variantId: selectedFile.id,
        },
        audio: {
          mediaId: selectedFile.id,
          ...(selectedFile.mimetype ? { mimeType: selectedFile.mimetype } : {}),
          ...(selectedFile.name ? { fileName: selectedFile.name } : {}),
          ...(selectedFile.size !== undefined ? { byteLength: selectedFile.size } : {}),
        },
        metadata: buildSlackMetadata(envelope, selectedFile),
      };
    },

    async fetchAudio(event) {
      const fileId = event.sourceIdentity.fileId;

      if (!fileId) {
        throw new Error("Slack normalized event is missing a source file identifier");
      }

      const metadata = getSlackMetadata(event.metadata);
      const metadataFile = metadata?.slack.file;
      let file = metadataFile?.id === fileId ? metadataFile : null;

      if (!file || !hasDownloadUrl(file)) {
        const resolvedFile = await client.getFile(fileId);

        if (!resolvedFile) {
          throw new Error(`Slack file ${fileId} could not be resolved for download`);
        }

        file = file ? mergeFileRecords(file, resolvedFile) : resolvedFile;
      }

      if (!isSupportedAudioFile(file)) {
        throw new Error(`Slack file ${fileId} is not a supported audio type`);
      }

      const downloadedAudio = await client.downloadFile(file);
      const tempDirectory = await mkdtemp(join(tmpdir(), "relay-grid-slack-"));
      const fileExtension = deriveFileExtension(file, event.audio.fileName);
      const fileName = sanitizeFileName(`${fileId}${fileExtension}`);
      const outputPath = join(tempDirectory, fileName);

      await writeFile(outputPath, downloadedAudio);

      const conversationKey = buildConversationKey(event.source, event.conversation);
      const dedupeKey = buildDedupeKey(event.source, event.dedupe);
      const fetchLogger = withLogContext(adapterLogger, {
        conversationKey,
        dedupeKey,
      });

      fetchLogger.info(
        {
          event: "slack_audio_downloaded",
          fileId,
          byteLength: downloadedAudio.byteLength,
          localPath: outputPath,
        },
        "Downloaded Slack audio to local storage"
      );

      const normalizedAudio = {
        mediaId: file.id,
        ...(file.mimetype ?? event.audio.mimeType ? { mimeType: file.mimetype ?? event.audio.mimeType } : {}),
        ...(file.name ?? event.audio.fileName ? { fileName: file.name ?? event.audio.fileName } : {}),
        ...(file.size ?? event.audio.byteLength !== undefined
          ? { byteLength: file.size ?? event.audio.byteLength }
          : {}),
      };

      const fetchedAudio: NormalizedFetchedAudio = {
        source: event.source,
        sourceIdentity: event.sourceIdentity,
        conversation: event.conversation,
        dedupe: event.dedupe,
        audio: normalizedAudio,
        localPath: outputPath,
        ...(metadata
          ? {
              metadata: buildSlackMetadata(
                {
                  scopeId: event.sourceIdentity.scopeId,
                  eventId: metadata.slack.eventId,
                  channelId: metadata.slack.channelId,
                  messageTs: metadata.slack.messageTs,
                  ...(metadata.slack.threadTs ? { threadTs: metadata.slack.threadTs } : {}),
                  occurredAt: event.occurredAt,
                  ...(metadata.slack.userId ? { userId: metadata.slack.userId } : {}),
                  ...(metadata.slack.botId ? { botId: metadata.slack.botId } : {}),
                  files: [file],
                },
                file
              ),
            }
          : event.metadata
            ? { metadata: event.metadata }
            : {}),
      };

      return fetchedAudio;
    },
  };
};

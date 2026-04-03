import { join } from "node:path";
import { tmpdir } from "node:os";

import { config as loadEnvironmentFile } from "dotenv";
import { z } from "zod";

import type { STTBackendName } from "../types/stt";

loadEnvironmentFile();

const DEFAULT_AUDIO_TEMP_DIRECTORY = join(tmpdir(), "relay-grid");
const DEFAULT_PROCESSING_STATE_FILE_PATH = join(DEFAULT_AUDIO_TEMP_DIRECTORY, "processing-state.json");
const DEFAULT_NORMALIZATION_MAX_INPUT_BYTES = 25 * 1024 * 1024;
const DEFAULT_NORMALIZATION_MAX_DURATION_MS = 15 * 60 * 1000;
const DEFAULT_STT_BACKEND: STTBackendName = "faster-whisper";
const DEFAULT_STT_FASTER_WHISPER_PYTHON_PATH = "python3";
const DEFAULT_STT_FASTER_WHISPER_MODEL = "base";
const DEFAULT_STT_FASTER_WHISPER_DEVICE = "cpu";
const DEFAULT_STT_FASTER_WHISPER_COMPUTE_TYPE = "int8";
const DEFAULT_STT_FASTER_WHISPER_BEAM_SIZE = 5;
const DEFAULT_PROCESSING_MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_PROCESSING_RETRY_BACKOFF_MS = 0;

const optionalTrimmedStringSchema = z.string().optional().transform((value) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
});

const booleanFromEnvironmentSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const slackAllowlistedChannelsSchema = z
  .string()
  .trim()
  .min(1, "SLACK_ALLOWLISTED_CHANNELS must include at least one channel ID")
  .transform((value, context) => {
    const channelIds = value
      .split(",")
      .map((channelId) => channelId.trim())
      .filter((channelId) => channelId.length > 0);

    if (channelIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SLACK_ALLOWLISTED_CHANNELS must include at least one channel ID",
      });
      return z.NEVER;
    }

    const invalidChannelId = channelIds.find((channelId) => !/^[A-Z0-9]+$/.test(channelId));

    if (invalidChannelId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SLACK_ALLOWLISTED_CHANNELS contains an invalid channel ID: ${invalidChannelId}`,
      });
      return z.NEVER;
    }

    return Array.from(new Set(channelIds));
  });

const runtimeConfigSchema = z.object({
  SIDECAR_SERVICE_NAME: z
    .string()
    .trim()
    .min(1, "SIDECAR_SERVICE_NAME must be set to a non-empty value"),
  NODE_ENV: z.enum(["development", "test", "production"]),
  SIDECAR_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
  SLACK_BOT_TOKEN: z
    .string()
    .trim()
    .regex(/^xoxb-[A-Za-z0-9-]+$/, "SLACK_BOT_TOKEN must be a Slack bot token starting with xoxb-"),
  SLACK_APP_TOKEN: z
    .string()
    .trim()
    .regex(/^xapp-[A-Za-z0-9-]+$/, "SLACK_APP_TOKEN must be a Slack app token starting with xapp-"),
  SLACK_ALLOWLISTED_CHANNELS: slackAllowlistedChannelsSchema,
  SLACK_FAILURE_NOTICES_ENABLED: booleanFromEnvironmentSchema,
  AUDIO_NORMALIZATION_FFMPEG_PATH: z.string().trim().min(1).default("ffmpeg"),
  AUDIO_NORMALIZATION_FFPROBE_PATH: z.string().trim().min(1).default("ffprobe"),
  AUDIO_NORMALIZATION_TEMP_DIRECTORY: z.string().trim().min(1).default(DEFAULT_AUDIO_TEMP_DIRECTORY),
  AUDIO_NORMALIZATION_MAX_INPUT_BYTES: z.coerce
    .number()
    .int()
    .positive("AUDIO_NORMALIZATION_MAX_INPUT_BYTES must be a positive integer")
    .default(DEFAULT_NORMALIZATION_MAX_INPUT_BYTES),
  AUDIO_NORMALIZATION_MAX_DURATION_MS: z.coerce
    .number()
    .int()
    .positive("AUDIO_NORMALIZATION_MAX_DURATION_MS must be a positive integer")
    .default(DEFAULT_NORMALIZATION_MAX_DURATION_MS),
  STT_BACKEND: z.enum(["faster-whisper"]).default(DEFAULT_STT_BACKEND),
  STT_DEFAULT_LANGUAGE: optionalTrimmedStringSchema,
  STT_FASTER_WHISPER_PYTHON_PATH: z
    .string()
    .trim()
    .min(1, "STT_FASTER_WHISPER_PYTHON_PATH must be set to a non-empty value")
    .default(DEFAULT_STT_FASTER_WHISPER_PYTHON_PATH),
  STT_FASTER_WHISPER_MODEL: z
    .string()
    .trim()
    .min(1, "STT_FASTER_WHISPER_MODEL must be set to a non-empty value")
    .default(DEFAULT_STT_FASTER_WHISPER_MODEL),
  STT_FASTER_WHISPER_DEVICE: z
    .string()
    .trim()
    .min(1, "STT_FASTER_WHISPER_DEVICE must be set to a non-empty value")
    .default(DEFAULT_STT_FASTER_WHISPER_DEVICE),
  STT_FASTER_WHISPER_COMPUTE_TYPE: z
    .string()
    .trim()
    .min(1, "STT_FASTER_WHISPER_COMPUTE_TYPE must be set to a non-empty value")
    .default(DEFAULT_STT_FASTER_WHISPER_COMPUTE_TYPE),
  STT_FASTER_WHISPER_BEAM_SIZE: z.coerce
    .number()
    .int()
    .positive("STT_FASTER_WHISPER_BEAM_SIZE must be a positive integer")
    .default(DEFAULT_STT_FASTER_WHISPER_BEAM_SIZE),
  PROCESSING_STATE_FILE_PATH: z.string().trim().min(1).default(DEFAULT_PROCESSING_STATE_FILE_PATH),
  PROCESSING_MAX_RETRY_ATTEMPTS: z.coerce
    .number()
    .int()
    .positive("PROCESSING_MAX_RETRY_ATTEMPTS must be a positive integer")
    .default(DEFAULT_PROCESSING_MAX_RETRY_ATTEMPTS),
  PROCESSING_RETRY_BACKOFF_MS: z.coerce
    .number()
    .int()
    .nonnegative("PROCESSING_RETRY_BACKOFF_MS must be zero or a positive integer")
    .default(DEFAULT_PROCESSING_RETRY_BACKOFF_MS),
});

export type NodeEnvironment = z.infer<typeof runtimeConfigSchema>["NODE_ENV"];
export type LogLevel = z.infer<typeof runtimeConfigSchema>["SIDECAR_LOG_LEVEL"];

export interface SlackConfig {
  botToken: string;
  appToken: string;
  allowlistedChannels: string[];
  failureNoticesEnabled: boolean;
}

export interface RuntimeConfig {
  serviceName: string;
  nodeEnv: NodeEnvironment;
  logLevel: LogLevel;
  slack: SlackConfig;
  normalization: AudioNormalizationConfig;
  stt: STTConfig;
  processing: ProcessingConfig;
}

export interface AudioNormalizationConfig {
  ffmpegPath: string;
  ffprobePath: string;
  tempDirectory: string;
  maxInputBytes: number;
  maxDurationMs: number;
}

export interface FasterWhisperConfig {
  pythonPath: string;
  model: string;
  device: string;
  computeType: string;
  beamSize: number;
  language?: string;
}

export interface STTConfig {
  backend: STTBackendName;
  fasterWhisper: FasterWhisperConfig;
}

export interface ProcessingConfig {
  stateFilePath: string;
  maxRetryAttempts: number;
  retryBackoffMs: number;
}

export class ConfigurationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super("Invalid runtime configuration.");
    this.name = "ConfigurationError";
    this.issues = issues;
  }
}

export const loadConfig = (): RuntimeConfig => {
  const parsedConfig = runtimeConfigSchema.safeParse(process.env);

  if (!parsedConfig.success) {
    const issues = parsedConfig.error.issues.map((issue) => {
      const path = issue.path.join(".") || "environment";
      return `${path}: ${issue.message}`;
    });

    throw new ConfigurationError(issues);
  }

  return {
    serviceName: parsedConfig.data.SIDECAR_SERVICE_NAME,
    nodeEnv: parsedConfig.data.NODE_ENV,
    logLevel: parsedConfig.data.SIDECAR_LOG_LEVEL,
    slack: {
      botToken: parsedConfig.data.SLACK_BOT_TOKEN,
      appToken: parsedConfig.data.SLACK_APP_TOKEN,
      allowlistedChannels: parsedConfig.data.SLACK_ALLOWLISTED_CHANNELS,
      failureNoticesEnabled: parsedConfig.data.SLACK_FAILURE_NOTICES_ENABLED,
    },
    normalization: {
      ffmpegPath: parsedConfig.data.AUDIO_NORMALIZATION_FFMPEG_PATH,
      ffprobePath: parsedConfig.data.AUDIO_NORMALIZATION_FFPROBE_PATH,
      tempDirectory: parsedConfig.data.AUDIO_NORMALIZATION_TEMP_DIRECTORY,
      maxInputBytes: parsedConfig.data.AUDIO_NORMALIZATION_MAX_INPUT_BYTES,
      maxDurationMs: parsedConfig.data.AUDIO_NORMALIZATION_MAX_DURATION_MS,
    },
    stt: {
      backend: parsedConfig.data.STT_BACKEND,
      fasterWhisper: {
        pythonPath: parsedConfig.data.STT_FASTER_WHISPER_PYTHON_PATH,
        model: parsedConfig.data.STT_FASTER_WHISPER_MODEL,
        device: parsedConfig.data.STT_FASTER_WHISPER_DEVICE,
        computeType: parsedConfig.data.STT_FASTER_WHISPER_COMPUTE_TYPE,
        beamSize: parsedConfig.data.STT_FASTER_WHISPER_BEAM_SIZE,
        ...(parsedConfig.data.STT_DEFAULT_LANGUAGE
          ? { language: parsedConfig.data.STT_DEFAULT_LANGUAGE }
          : {}),
      },
    },
    processing: {
      stateFilePath: parsedConfig.data.PROCESSING_STATE_FILE_PATH,
      maxRetryAttempts: parsedConfig.data.PROCESSING_MAX_RETRY_ATTEMPTS,
      retryBackoffMs: parsedConfig.data.PROCESSING_RETRY_BACKOFF_MS,
    },
  };
};

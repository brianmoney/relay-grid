import type {
  ConversationIdentity,
  DedupeIdentity,
  SourceAudioDescriptor,
  SourceIdentity,
  SourceName,
} from "./events";

export type AudioNormalizationErrorCode =
  | "unsupported_media_type"
  | "input_too_large"
  | "duration_limit_exceeded"
  | "ffmpeg_unavailable"
  | "probe_failed"
  | "normalization_failed";

export interface NormalizedAudioFormat {
  container: "wav";
  codec: "pcm_s16le";
  channelCount: 1;
  sampleRateHz: 16000;
}

export interface NormalizedAudioDescriptor extends SourceAudioDescriptor, NormalizedAudioFormat {
  mimeType: "audio/wav";
  fileName: string;
  byteLength: number;
  durationMs: number;
}

export interface NormalizedAudioCleanupPlan {
  owner: "pipeline";
  artifactPath: string;
  directoryPath: string;
}

export interface NormalizedAudio {
  source: SourceName;
  sourceIdentity: SourceIdentity;
  conversation: ConversationIdentity;
  dedupe: DedupeIdentity;
  sourceAudio: SourceAudioDescriptor;
  audio: NormalizedAudioDescriptor;
  artifactPath: string;
  artifactDirectory: string;
  cleanup: NormalizedAudioCleanupPlan;
  metadata?: Record<string, unknown>;
}

export class AudioNormalizationError extends Error {
  readonly code: AudioNormalizationErrorCode;
  readonly retryable: boolean;

  constructor(code: AudioNormalizationErrorCode, message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = "AudioNormalizationError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}

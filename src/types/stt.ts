import type { TranscriptSegment } from "./transcript";

export type STTBackendName = "faster-whisper";

export type STTErrorCode =
  | "unsupported_backend"
  | "backend_unavailable"
  | "transcription_failed"
  | "invalid_response";

export interface STTResultMetadata {
  backend: STTBackendName | string;
  model?: string;
  device?: string;
  computeType?: string;
  durationMs?: number;
  languageProbability?: number;
  [key: string]: unknown;
}

export interface STTTranscription {
  text: string;
  language?: string;
  segments?: TranscriptSegment[];
  metadata?: STTResultMetadata;
}

export class STTError extends Error {
  readonly code: STTErrorCode;
  readonly retryable: boolean;

  constructor(code: STTErrorCode, message: string, options?: { retryable?: boolean; cause?: unknown }) {
    super(message, options?.cause instanceof Error ? { cause: options.cause } : undefined);
    this.name = "STTError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}

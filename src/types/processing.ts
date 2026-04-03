import type { ConversationKey, DedupeKey, SourceName } from "./events";

export type ProcessingStatus =
  | "received"
  | "audio_fetched"
  | "audio_normalized"
  | "transcribed"
  | "dispatched"
  | "completed"
  | "failed";

export interface ProcessingStateReference {
  source: SourceName;
  conversationKey: ConversationKey;
  dedupeKey: DedupeKey;
}

export interface ProcessingFailure {
  code: string;
  message: string;
  retryable: boolean;
}

interface ProcessingStateBase extends ProcessingStateReference {
  status: ProcessingStatus;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  occurredAt?: string;
  lastAttemptStartedAt?: string;
  completedAt?: string;
  failedAt?: string;
  stageTimestamps: Partial<Record<ProcessingStatus, string>>;
  metadata?: Record<string, unknown>;
}

export interface ActiveProcessingState extends ProcessingStateBase {
  status: Exclude<ProcessingStatus, "failed">;
}

export interface FailedProcessingState extends ProcessingStateBase {
  status: "failed";
  error: ProcessingFailure;
}

export type ProcessingState = ActiveProcessingState | FailedProcessingState;

export const TERMINAL_PROCESSING_STATUSES: ReadonlySet<ProcessingStatus> = new Set([
  "dispatched",
  "completed",
  "failed",
]);

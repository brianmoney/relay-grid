import type { ProcessingFailure, ProcessingState, ProcessingStateReference, ProcessingStatus } from "../types/processing";

export interface BeginProcessingAttemptInput extends ProcessingStateReference {
  occurredAt?: string;
  maxAttempts: number;
  metadata?: Record<string, unknown>;
}

export interface ProcessingStateUpdateOptions {
  metadata?: Record<string, unknown>;
}

export interface ProcessingStateStore {
  get(reference: ProcessingStateReference): Promise<ProcessingState | null>;
  list(): Promise<ProcessingState[]>;
  beginAttempt(input: BeginProcessingAttemptInput): Promise<ProcessingState>;
  markStage(
    reference: ProcessingStateReference,
    status: Exclude<ProcessingStatus, "failed">,
    options?: ProcessingStateUpdateOptions
  ): Promise<ProcessingState>;
  markFailed(
    reference: ProcessingStateReference,
    failure: ProcessingFailure,
    options?: ProcessingStateUpdateOptions
  ): Promise<ProcessingState>;
}

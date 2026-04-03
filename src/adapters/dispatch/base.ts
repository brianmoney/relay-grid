import type { TranscriptHandler } from "../../types/service";
import type { ProcessingFailure, ProcessingStateReference } from "../../types/processing";
import type { TranscriptEnvelope } from "../../types/transcript";

export interface TranscriptDispatchAdapter {
  dispatch(transcript: TranscriptEnvelope): Promise<void>;
  notifyFailure?(
    reference: ProcessingStateReference,
    failure: ProcessingFailure & { attempt: number; maxAttempts: number }
  ): Promise<void>;
}

export const createDispatchTranscriptHandler = (
  adapter: TranscriptDispatchAdapter
): TranscriptHandler => {
  return {
    async handle(transcript) {
      await adapter.dispatch(transcript);
    },
  };
};

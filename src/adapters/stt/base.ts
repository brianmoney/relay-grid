import type { NormalizedAudio } from "../../types/audio";
import type { TranscriptEnvelope } from "../../types/transcript";
import type { STTBackendName, STTTranscription } from "../../types/stt";

export interface STTAdapter {
  readonly backend: STTBackendName;
  assertReady(): Promise<void>;
  transcribe(audio: NormalizedAudio): Promise<STTTranscription>;
}

export const createTranscriptEnvelope = (
  audio: NormalizedAudio,
  transcription: STTTranscription
): TranscriptEnvelope => {
  const metadata: Record<string, unknown> = {};

  if (audio.metadata) {
    metadata.source = audio.metadata;
  }

  if (transcription.metadata) {
    metadata.stt = transcription.metadata;
  }

  return {
    source: audio.source,
    sourceIdentity: audio.sourceIdentity,
    conversation: audio.conversation,
    dedupe: audio.dedupe,
    text: transcription.text,
    ...(transcription.language ? { language: transcription.language } : {}),
    ...(transcription.segments && transcription.segments.length > 0
      ? { segments: transcription.segments }
      : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
};

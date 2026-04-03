import type { NormalizedFetchedAudio, NormalizedSourceEvent } from "./events";
import type { NormalizedAudio } from "./audio";
import type { TranscriptEnvelope } from "./transcript";

export interface LifecycleService {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface FetchedAudioHandler {
  handle(audio: NormalizedFetchedAudio): Promise<void>;
}

export interface SourceEventHandler {
  handle(event: NormalizedSourceEvent): Promise<void>;
}

export interface NormalizedAudioHandler {
  handle(audio: NormalizedAudio): Promise<void>;
}

export interface TranscriptHandler {
  handle(transcript: TranscriptEnvelope): Promise<void>;
}

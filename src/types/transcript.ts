import type {
  ConversationIdentity,
  DedupeIdentity,
  SourceIdentity,
  SourceName,
} from "./events";

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string;
}

export interface TranscriptEnvelope {
  source: SourceName;
  sourceIdentity: SourceIdentity;
  conversation: ConversationIdentity;
  dedupe: DedupeIdentity;
  text: string;
  language?: string;
  segments?: TranscriptSegment[];
  metadata?: Record<string, unknown>;
}

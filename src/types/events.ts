export type SourceName = string;
export type ConversationKey = string;
export type DedupeKey = string;

export interface SourceIdentity {
  scopeId: string;
  eventId: string;
  messageId?: string;
  fileId?: string;
}

export interface ConversationIdentity {
  scopeId: string;
  conversationId: string;
  threadId?: string;
}

export interface DedupeIdentity {
  scopeId: string;
  unitId: string;
  variantId?: string;
}

export interface SourceAudioDescriptor {
  mediaId: string;
  mimeType?: string;
  fileName?: string;
  byteLength?: number;
  durationMs?: number;
}

export interface NormalizedSourceEvent {
  source: SourceName;
  occurredAt: string;
  sourceIdentity: SourceIdentity;
  conversation: ConversationIdentity;
  dedupe: DedupeIdentity;
  audio: SourceAudioDescriptor;
  metadata?: Record<string, unknown>;
}

export interface NormalizedFetchedAudio {
  source: SourceName;
  sourceIdentity: SourceIdentity;
  conversation: ConversationIdentity;
  dedupe: DedupeIdentity;
  audio: SourceAudioDescriptor;
  localPath: string;
  metadata?: Record<string, unknown>;
}

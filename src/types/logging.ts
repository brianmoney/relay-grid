import type { ConversationKey, DedupeKey, SourceName } from "./events";

export interface ProcessingLogContext {
  source?: SourceName;
  conversationKey?: ConversationKey;
  dedupeKey?: DedupeKey;
  stage?: string;
  [key: string]: unknown;
}

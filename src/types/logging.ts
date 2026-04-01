export interface ProcessingLogContext {
  source?: string;
  conversationKey?: string;
  dedupeKey?: string;
  stage?: string;
  [key: string]: unknown;
}

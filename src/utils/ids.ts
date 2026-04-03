import type {
  ConversationIdentity,
  ConversationKey,
  DedupeIdentity,
  DedupeKey,
  SourceName,
} from "../types/events";

const KEY_VERSION = "v1";
const KEY_SEPARATOR = ":";

// Key builders are the single source of truth for conversation and dedupe identifiers.
// Invariants:
// - identical normalized inputs produce identical keys across retries
// - optional trailing parts are omitted instead of encoded as empty segments
// - each part is percent-encoded so provider IDs can safely contain separators
// - adapters, stores, and logs should call these helpers instead of formatting keys locally
const encodeKeyPart = (label: string, value: string): string => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`);
  }

  return encodeURIComponent(normalized);
};

const buildKey = (
  kind: "conversation" | "dedupe",
  source: SourceName,
  parts: Array<readonly [label: string, value: string | undefined]>
): string => {
  return [
    kind,
    KEY_VERSION,
    encodeKeyPart("source", source),
    ...parts.flatMap(([label, value]) => {
      if (value === undefined) {
        return [];
      }

      return [encodeKeyPart(label, value)];
    }),
  ].join(KEY_SEPARATOR);
};

export const buildConversationKey = (
  source: SourceName,
  identity: ConversationIdentity
): ConversationKey => {
  return buildKey("conversation", source, [
    ["scopeId", identity.scopeId],
    ["conversationId", identity.conversationId],
    ["threadId", identity.threadId],
  ]);
};

export const buildDedupeKey = (source: SourceName, identity: DedupeIdentity): DedupeKey => {
  return buildKey("dedupe", source, [
    ["scopeId", identity.scopeId],
    ["unitId", identity.unitId],
    ["variantId", identity.variantId],
  ]);
};

import test from "node:test";
import assert from "node:assert/strict";

import { buildConversationKey, buildDedupeKey } from "../utils/ids";

test("buildConversationKey is deterministic and omits undefined optional parts", () => {
  const input = {
    scopeId: "workspace-1",
    conversationId: "channel-99",
  };

  const first = buildConversationKey("slack", input);
  const second = buildConversationKey("slack", input);

  assert.equal(first, second);
  assert.equal(first, "conversation:v1:slack:workspace-1:channel-99");
});

test("buildDedupeKey percent-encodes parts and remains deterministic", () => {
  const input = {
    scopeId: "workspace/a",
    unitId: "event:42",
    variantId: "file 7",
  };

  const key = buildDedupeKey("slack-enterprise", input);

  assert.equal(key, "dedupe:v1:slack-enterprise:workspace%2Fa:event%3A42:file%207");
  assert.equal(key, buildDedupeKey("slack-enterprise", input));
});

test("key builders reject empty required segments", () => {
  assert.throws(
    () =>
      buildConversationKey("slack", {
        scopeId: "workspace-1",
        conversationId: "   ",
      }),
    /conversationId must not be empty/
  );
});

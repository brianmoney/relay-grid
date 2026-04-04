import assert from "node:assert/strict";
import test from "node:test";

import pino from "pino";

import type {
  OpenDispatchIngressApiClient,
  OpenDispatchTranscriptIngressRequest,
} from "../adapters/dispatch";
import {
  createOpenDispatchHttpAdapter,
  createOpenDispatchIngressApiClient,
  createOpenDispatchIngressRequest,
  OpenDispatchHttpError,
} from "../adapters/dispatch";
import type { OpenDispatchHttpConfig } from "../config";
import type { TranscriptEnvelope } from "../types/transcript";
import { buildConversationKey, buildDedupeKey } from "../utils/ids";

const TEST_CONFIG: OpenDispatchHttpConfig = {
  baseUrl: "http://127.0.0.1:8787",
  endpointPath: "/ingress/transcripts",
  authToken: "test-token",
  timeoutMs: 1_000,
};

const createLogger = () => pino({ level: "silent" });

const createTranscript = (
  overrides: Partial<TranscriptEnvelope> = {}
): TranscriptEnvelope => ({
  source: overrides.source ?? "slack",
  sourceIdentity: overrides.sourceIdentity ?? {
    scopeId: "T_WORKSPACE",
    eventId: "EvTranscript",
    messageId: "1712345678.000100",
    fileId: "F_AUDIO",
  },
  conversation: overrides.conversation ?? {
    scopeId: "T_WORKSPACE",
    conversationId: "C_ALLOWED",
    threadId: "1712345678.000100",
  },
  dedupe: overrides.dedupe ?? {
    scopeId: "T_WORKSPACE",
    unitId: "C_ALLOWED:1712345678.000100",
    variantId: "F_AUDIO",
  },
  text: overrides.text ?? "hello from Open Dispatch",
  ...(overrides.language ? { language: overrides.language } : {}),
  ...(overrides.segments ? { segments: overrides.segments } : {}),
  ...(overrides.metadata ? { metadata: overrides.metadata } : {}),
});

test("Open Dispatch adapter maps a transcript into the sidecar-owned ingress payload", () => {
  const transcript = createTranscript({
    language: "en",
    metadata: {
      source: {
        localPath: "/tmp/source/voice-note.mp3",
      },
      stt: {
        backend: "faster-whisper",
      },
    },
  });

  const request = createOpenDispatchIngressRequest(transcript);

  assert.deepEqual(request, {
    source: transcript.source,
    conversationKey: buildConversationKey(transcript.source, transcript.conversation),
    dedupeKey: buildDedupeKey(transcript.source, transcript.dedupe),
    text: transcript.text,
    identity: {
      sourceScopeId: "T_WORKSPACE",
      eventId: "EvTranscript",
      conversationScopeId: "T_WORKSPACE",
      conversationId: "C_ALLOWED",
      threadId: "1712345678.000100",
      dedupeScopeId: "T_WORKSPACE",
      dedupeUnitId: "C_ALLOWED:1712345678.000100",
      dedupeVariantId: "F_AUDIO",
      messageId: "1712345678.000100",
      fileId: "F_AUDIO",
    },
    routing: {
      mode: "canonical-transcript",
      language: "en",
    },
  });
  assert.equal("metadata" in request, false);
  assert.equal("segments" in request, false);
});

test("Open Dispatch adapter dispatches the mapped payload through the ingress API seam", async () => {
  const requests: OpenDispatchTranscriptIngressRequest[] = [];
  const transcript = createTranscript();
  const apiClient: OpenDispatchIngressApiClient = {
    async postTranscript(request) {
      requests.push(request);
    },
  };
  const adapter = createOpenDispatchHttpAdapter({
    config: TEST_CONFIG,
    logger: createLogger(),
    apiClient,
  });

  await adapter.dispatch(transcript);

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], createOpenDispatchIngressRequest(transcript));
});

test("Open Dispatch HTTP client posts JSON to the configured ingress endpoint on success", async () => {
  const transcript = createTranscript();
  const request = createOpenDispatchIngressRequest(transcript);
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  try {
    await createOpenDispatchIngressApiClient(TEST_CONFIG).postTranscript(request);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(capturedUrl, "http://127.0.0.1:8787/ingress/transcripts");
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(capturedInit?.headers, {
    "content-type": "application/json",
    authorization: "Bearer test-token",
  });
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), request);
});

test("Open Dispatch HTTP client marks upstream 5xx responses as retryable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;

  try {
    await assert.rejects(
      () => createOpenDispatchIngressApiClient(TEST_CONFIG).postTranscript(createOpenDispatchIngressRequest(createTranscript())),
      (error: unknown) => {
        assert.ok(error instanceof OpenDispatchHttpError);
        assert.equal(error.code, "opendispatch_http_retryable_response");
        assert.equal(error.status, 503);
        assert.equal(error.retryable, true);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Open Dispatch HTTP client marks 4xx contract errors as non-retryable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 400 })) as typeof fetch;

  try {
    await assert.rejects(
      () => createOpenDispatchIngressApiClient(TEST_CONFIG).postTranscript(createOpenDispatchIngressRequest(createTranscript())),
      (error: unknown) => {
        assert.ok(error instanceof OpenDispatchHttpError);
        assert.equal(error.code, "opendispatch_http_contract_error");
        assert.equal(error.status, 400);
        assert.equal(error.retryable, false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Open Dispatch HTTP client marks transport failures as retryable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("connect ECONNREFUSED");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => createOpenDispatchIngressApiClient(TEST_CONFIG).postTranscript(createOpenDispatchIngressRequest(createTranscript())),
      (error: unknown) => {
        assert.ok(error instanceof OpenDispatchHttpError);
        assert.equal(error.code, "opendispatch_http_transport_error");
        assert.equal(error.retryable, true);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

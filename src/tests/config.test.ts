import assert from "node:assert/strict";
import test from "node:test";

import { ConfigurationError, loadConfig } from "../config";

const TEST_ENV = {
  SIDECAR_SERVICE_NAME: "relay-grid-sidecar",
  NODE_ENV: "test",
  SIDECAR_LOG_LEVEL: "silent",
  SLACK_BOT_TOKEN: "xoxb-test-token",
  SLACK_APP_TOKEN: "xapp-test-token",
  SLACK_ALLOWLISTED_CHANNELS: "C0123456789",
  SLACK_FAILURE_NOTICES_ENABLED: "false",
  AUDIO_NORMALIZATION_FFMPEG_PATH: "ffmpeg",
  AUDIO_NORMALIZATION_FFPROBE_PATH: "ffprobe",
  AUDIO_NORMALIZATION_TEMP_DIRECTORY: "/tmp/relay-grid-test",
  AUDIO_NORMALIZATION_MAX_INPUT_BYTES: "1024",
  AUDIO_NORMALIZATION_MAX_DURATION_MS: "30000",
  STT_BACKEND: "faster-whisper",
  STT_DEFAULT_LANGUAGE: "en",
  STT_FASTER_WHISPER_PYTHON_PATH: "python3",
  STT_FASTER_WHISPER_MODEL: "base",
  STT_FASTER_WHISPER_DEVICE: "cpu",
  STT_FASTER_WHISPER_COMPUTE_TYPE: "int8",
  STT_FASTER_WHISPER_BEAM_SIZE: "5",
  PROCESSING_STATE_FILE_PATH: "/tmp/relay-grid-test/state.json",
  PROCESSING_MAX_RETRY_ATTEMPTS: "3",
  PROCESSING_RETRY_BACKOFF_MS: "0",
} as const;

const withEnvironment = async (
  values: Record<string, string | undefined>,
  run: () => void | Promise<void>
): Promise<void> => {
  const originalValues = new Map<string, string | undefined>();

  for (const key of Object.keys(values)) {
    originalValues.set(key, process.env[key]);

    const nextValue = values[key];

    if (nextValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = nextValue;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of originalValues) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test("loadConfig defaults to explicit Slack repost dispatch mode", async () => {
  await withEnvironment(
    {
      ...TEST_ENV,
      DISPATCH_MODE: undefined,
      OPENDISPATCH_HTTP_BASE_URL: undefined,
      OPENDISPATCH_HTTP_ENDPOINT_PATH: undefined,
      OPENDISPATCH_HTTP_AUTH_TOKEN: undefined,
      OPENDISPATCH_HTTP_TIMEOUT_MS: undefined,
    },
    () => {
      const config = loadConfig();

      assert.equal(config.dispatch.mode, "slack-repost");
      assert.equal(config.dispatch.openDispatchHttp.endpointPath, "/ingress/transcripts");
      assert.equal(config.dispatch.openDispatchHttp.timeoutMs, 10_000);
    }
  );
});

test("loadConfig accepts explicit Open Dispatch HTTP configuration", async () => {
  await withEnvironment(
    {
      ...TEST_ENV,
      DISPATCH_MODE: "opendispatch-http",
      OPENDISPATCH_HTTP_BASE_URL: "http://127.0.0.1:8787/",
      OPENDISPATCH_HTTP_ENDPOINT_PATH: "/api/ingress/transcripts",
      OPENDISPATCH_HTTP_AUTH_TOKEN: "secret-token",
      OPENDISPATCH_HTTP_TIMEOUT_MS: "5000",
    },
    () => {
      const config = loadConfig();

      assert.equal(config.dispatch.mode, "opendispatch-http");
      assert.equal(config.dispatch.openDispatchHttp.baseUrl, "http://127.0.0.1:8787");
      assert.equal(config.dispatch.openDispatchHttp.endpointPath, "/api/ingress/transcripts");
      assert.equal(config.dispatch.openDispatchHttp.authToken, "secret-token");
      assert.equal(config.dispatch.openDispatchHttp.timeoutMs, 5_000);
    }
  );
});

test("loadConfig fails clearly when Open Dispatch mode is selected without a base URL", async () => {
  await withEnvironment(
    {
      ...TEST_ENV,
      DISPATCH_MODE: "opendispatch-http",
      OPENDISPATCH_HTTP_BASE_URL: undefined,
    },
    () => {
      assert.throws(() => loadConfig(), (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.equal(
          error.issues.includes(
            "OPENDISPATCH_HTTP_BASE_URL: OPENDISPATCH_HTTP_BASE_URL must be set when DISPATCH_MODE=opendispatch-http"
          ),
          true
        );
        return true;
      });
    }
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import type { FasterWhisperConfig, STTConfig } from "../config";
import { createTranscriptEnvelope, type STTAdapter } from "../adapters/stt/base";
import { createSTTAdapter } from "../adapters/stt";
import { createFasterWhisperAdapter } from "../adapters/stt/faster-whisper";
import type { NormalizedAudio } from "../types/audio";
import { STTError } from "../types/stt";

const TEST_FASTER_WHISPER_CONFIG: FasterWhisperConfig = {
  pythonPath: "python3",
  model: "base",
  device: "cpu",
  computeType: "int8",
  beamSize: 5,
  language: "en",
};

const createNormalizedAudio = (): NormalizedAudio => ({
  source: "slack",
  sourceIdentity: {
    scopeId: "T_WORKSPACE",
    eventId: "EvAudio",
    messageId: "1712345678.000100",
    fileId: "F_AUDIO",
  },
  conversation: {
    scopeId: "T_WORKSPACE",
    conversationId: "C_ALLOWED",
    threadId: "1712345678.000100",
  },
  dedupe: {
    scopeId: "T_WORKSPACE",
    unitId: "C_ALLOWED:1712345678.000100",
    variantId: "F_AUDIO",
  },
  sourceAudio: {
    mediaId: "F_AUDIO",
    mimeType: "audio/mpeg",
    fileName: "voice-note.mp3",
    byteLength: 128,
  },
  audio: {
    mediaId: "F_AUDIO:normalized",
    mimeType: "audio/wav",
    fileName: "voice-note.wav",
    byteLength: 256,
    durationMs: 2_000,
    container: "wav",
    codec: "pcm_s16le",
    channelCount: 1,
    sampleRateHz: 16_000,
  },
  artifactPath: "/tmp/normalized/normalized.wav",
  artifactDirectory: "/tmp/normalized",
  cleanup: {
    owner: "pipeline",
    artifactPath: "/tmp/normalized/normalized.wav",
    directoryPath: "/tmp/normalized",
  },
  metadata: {
    sourceEventType: "slack.message",
  },
});

test("STT factory selects the configured backend explicitly", async () => {
  const adapter = createSTTAdapter({
    backend: "faster-whisper",
    fasterWhisper: TEST_FASTER_WHISPER_CONFIG,
  });

  assert.equal(adapter.backend, "faster-whisper");
});

test("STT factory fails clearly for unsupported backend selection", async () => {
  assert.throws(
    () =>
      createSTTAdapter(
        {
          backend: "invalid-backend",
          fasterWhisper: TEST_FASTER_WHISPER_CONFIG,
        } as unknown as STTConfig,
        {}
      ),
    (error: unknown) => {
      assert.ok(error instanceof STTError);
      assert.equal(error.code, "unsupported_backend");
      return true;
    }
  );
});

test("transcript mapping preserves canonical envelope and hides backend details behind metadata", async () => {
  const transcript = createTranscriptEnvelope(createNormalizedAudio(), {
    text: "hello world",
    language: "en",
    segments: [{ startMs: 0, endMs: 500, text: "hello world" }],
    metadata: {
      backend: "faster-whisper",
      model: "base",
      languageProbability: 0.98,
    },
  });

  assert.equal(transcript.text, "hello world");
  assert.equal(transcript.language, "en");
  assert.deepEqual(transcript.segments, [{ startMs: 0, endMs: 500, text: "hello world" }]);
  assert.deepEqual(transcript.metadata, {
    source: { sourceEventType: "slack.message" },
    stt: {
      backend: "faster-whisper",
      model: "base",
      languageProbability: 0.98,
    },
  });
});

test("faster-whisper readiness check validates the configured runtime dependency", async () => {
  const commandCalls: Array<{ command: string; args: string[] }> = [];
  const adapter = createFasterWhisperAdapter(TEST_FASTER_WHISPER_CONFIG, {
    async runCommand(command, args) {
      commandCalls.push({ command, args });
      return { stdout: "ready\n", stderr: "" };
    },
  });

  await adapter.assertReady();

  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0]?.command, "python3");
  assert.deepEqual(commandCalls[0]?.args.slice(0, 2), ["-c", commandCalls[0]?.args[1] as string]);
  assert.deepEqual(commandCalls[0]?.args.slice(2), ["base", "cpu", "int8"]);
});

test("faster-whisper readiness failure surfaces an explicit STT error", async () => {
  const adapter = createFasterWhisperAdapter(TEST_FASTER_WHISPER_CONFIG, {
    async runCommand() {
      throw new Error("No module named faster_whisper");
    },
  });

  await assert.rejects(() => adapter.assertReady(), (error: unknown) => {
    assert.ok(error instanceof STTError);
    assert.equal(error.code, "backend_unavailable");
    return true;
  });
});

test("faster-whisper transcription maps text language segments and metadata", async () => {
  const audio = createNormalizedAudio();
  const commandCalls: Array<{ command: string; args: string[] }> = [];
  const adapter = createFasterWhisperAdapter(TEST_FASTER_WHISPER_CONFIG, {
    async runCommand(command, args) {
      commandCalls.push({ command, args });
      return {
        stdout: JSON.stringify({
          text: "hello world",
          language: "en",
          segments: [{ startMs: 0, endMs: 900, text: "hello world" }],
          metadata: {
            durationMs: 900,
            languageProbability: 0.99,
          },
        }),
        stderr: "",
      };
    },
  });

  const transcription = await adapter.transcribe(audio);

  assert.deepEqual(commandCalls, [
    {
      command: "python3",
      args: [
        "-c",
        commandCalls[0]?.args[1] as string,
        "base",
        "cpu",
        "int8",
        "en",
        "5",
        "/tmp/normalized/normalized.wav",
      ],
    },
  ]);
  assert.equal(transcription.text, "hello world");
  assert.equal(transcription.language, "en");
  assert.deepEqual(transcription.segments, [{ startMs: 0, endMs: 900, text: "hello world" }]);
  assert.deepEqual(transcription.metadata, {
    backend: "faster-whisper",
    model: "base",
    device: "cpu",
    computeType: "int8",
    durationMs: 900,
    languageProbability: 0.99,
  });
});

test("faster-whisper transcription failure does not silently fall back", async () => {
  const adapter = createFasterWhisperAdapter(TEST_FASTER_WHISPER_CONFIG, {
    async runCommand() {
      throw new Error("python process exited 1");
    },
  });

  await assert.rejects(() => adapter.transcribe(createNormalizedAudio()), (error: unknown) => {
    assert.ok(error instanceof STTError);
    assert.equal(error.code, "transcription_failed");
    return true;
  });
});

test("STT adapter contract remains provider-agnostic at the service seam", async () => {
  class StubAdapter implements STTAdapter {
    readonly backend = "faster-whisper" as const;

    async assertReady(): Promise<void> {
      return;
    }

    async transcribe(): Promise<{ text: string }> {
      return { text: "hello" };
    }
  }

  const adapter: STTAdapter = new StubAdapter();
  const result = await adapter.transcribe(createNormalizedAudio());

  assert.deepEqual(result, { text: "hello" });
});

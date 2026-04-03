import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { AudioNormalizationConfig } from "../config";
import {
  AudioNormalizationError,
  type NormalizedAudio,
  type NormalizedAudioDescriptor,
} from "../types/audio";
import type { NormalizedFetchedAudio } from "../types/events";
import { createFfmpegAudioNormalizer } from "../pipeline/audio-normalization";

const FIXTURE_DIRECTORY = join(__dirname, "fixtures", "audio");
const SUPPORTED_FIXTURE_PATH = join(FIXTURE_DIRECTORY, "sample.mp3");
const UNSUPPORTED_FIXTURE_PATH = join(FIXTURE_DIRECTORY, "sample.txt");

const createTempDirectory = (suffix: string): Promise<string> => {
  return mkdtemp(join(tmpdir(), `relay-grid-audio-test-${suffix}-`));
};

const getRequiredOutputPath = (args: string[]): string => {
  const outputPath = args.at(-1);

  if (!outputPath) {
    throw new Error("Expected ffmpeg output path");
  }

  return outputPath;
};

const createConfig = (tempDirectory: string, overrides: Partial<AudioNormalizationConfig> = {}) => ({
  ffmpegPath: "ffmpeg",
  ffprobePath: "ffprobe",
  tempDirectory,
  maxInputBytes: 1024,
  maxDurationMs: 30_000,
  ...overrides,
});

const createFetchedAudio = (localPath: string, overrides: Partial<NormalizedFetchedAudio> = {}): NormalizedFetchedAudio => ({
  source: overrides.source ?? "slack",
  sourceIdentity: overrides.sourceIdentity ?? {
    scopeId: "T_WORKSPACE",
    eventId: "EvAudio",
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
  audio: overrides.audio ?? {
    mediaId: "F_AUDIO",
    mimeType: localPath.endsWith(".mp3") ? "audio/mpeg" : "text/plain",
    fileName: localPath.endsWith(".mp3") ? "voice-note.mp3" : "notes.txt",
  },
  localPath,
  ...(overrides.metadata ? { metadata: overrides.metadata } : {}),
});

test("audio normalizer produces canonical wav output and cleanup metadata", async (t) => {
  const tempDirectory = await createTempDirectory("success");
  t.after(async () => rm(tempDirectory, { recursive: true, force: true }));

  const commandCalls: Array<{ command: string; args: string[] }> = [];
  const normalizer = createFfmpegAudioNormalizer(createConfig(tempDirectory), {
    async runCommand(command, args) {
      commandCalls.push({ command, args });

      if (command === "ffprobe") {
        return { stdout: JSON.stringify({ format: { duration: "1.5" } }), stderr: "" };
      }

      if (command === "ffmpeg") {
        const outputPath = getRequiredOutputPath(args);
        await writeFile(outputPath, Buffer.from("normalized-wav"));
        return { stdout: "", stderr: "" };
      }

      throw new Error(`Unexpected command: ${command}`);
    },
  });

  const normalizedAudio = await normalizer.normalize(createFetchedAudio(SUPPORTED_FIXTURE_PATH));
  const writtenBytes = await readFile(normalizedAudio.artifactPath);

  assert.equal(normalizedAudio.audio.mimeType, "audio/wav");
  assert.equal(normalizedAudio.audio.container, "wav");
  assert.equal(normalizedAudio.audio.codec, "pcm_s16le");
  assert.equal(normalizedAudio.audio.channelCount, 1);
  assert.equal(normalizedAudio.audio.sampleRateHz, 16_000);
  assert.equal(normalizedAudio.audio.durationMs, 1_500);
  assert.equal(normalizedAudio.cleanup.owner, "pipeline");
  assert.match(normalizedAudio.artifactPath, /normalized-[^/]+\/normalized\.wav$/);
  assert.deepEqual(Array.from(writtenBytes), Array.from(Buffer.from("normalized-wav")));
  assert.deepEqual(commandCalls, [
    {
      command: "ffprobe",
      args: ["-v", "error", "-show_entries", "format=duration", "-of", "json", SUPPORTED_FIXTURE_PATH],
    },
    {
      command: "ffmpeg",
      args: [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-i",
        SUPPORTED_FIXTURE_PATH,
        "-vn",
        "-map_metadata",
        "-1",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        normalizedAudio.artifactPath,
      ],
    },
  ]);

  await normalizer.cleanup(normalizedAudio);
  await assert.rejects(() => access(dirname(normalizedAudio.artifactPath)));
});

test("audio normalizer rejects unsupported input before probing", async (t) => {
  const tempDirectory = await createTempDirectory("unsupported");
  t.after(async () => rm(tempDirectory, { recursive: true, force: true }));

  const commandCalls: Array<{ command: string; args: string[] }> = [];
  const normalizer = createFfmpegAudioNormalizer(createConfig(tempDirectory), {
    async runCommand(command, args) {
      commandCalls.push({ command, args });
      return { stdout: "", stderr: "" };
    },
  });

  await assert.rejects(
    () => normalizer.normalize(createFetchedAudio(UNSUPPORTED_FIXTURE_PATH)),
    (error: unknown) => {
      assert.ok(error instanceof AudioNormalizationError);
      assert.equal(error.code, "unsupported_media_type");
      return true;
    }
  );

  assert.deepEqual(commandCalls, []);
});

test("audio normalizer enforces file-size guardrails", async (t) => {
  const tempDirectory = await createTempDirectory("size");
  t.after(async () => rm(tempDirectory, { recursive: true, force: true }));

  const normalizer = createFfmpegAudioNormalizer(createConfig(tempDirectory, { maxInputBytes: 4 }), {
    async runCommand() {
      throw new Error("size guardrail should fail before external commands run");
    },
  });

  await assert.rejects(
    () => normalizer.normalize(createFetchedAudio(SUPPORTED_FIXTURE_PATH)),
    (error: unknown) => {
      assert.ok(error instanceof AudioNormalizationError);
      assert.equal(error.code, "input_too_large");
      return true;
    }
  );
});

test("audio normalizer rejects oversized files even when metadata understates byteLength", async (t) => {
  const tempDirectory = await createTempDirectory("size-metadata-bypass");
  t.after(async () => rm(tempDirectory, { recursive: true, force: true }));

  const oversizedInputPath = join(tempDirectory, "oversized.mp3");
  await writeFile(oversizedInputPath, Buffer.alloc(2048, 1));

  const normalizer = createFfmpegAudioNormalizer(createConfig(tempDirectory, { maxInputBytes: 10 }), {
    async runCommand() {
      throw new Error("actual file-size guardrail should fail before external commands run");
    },
  });

  await assert.rejects(
    () =>
      normalizer.normalize(
        createFetchedAudio(oversizedInputPath, {
          audio: {
            mediaId: "F_OVERSIZED",
            mimeType: "audio/mpeg",
            fileName: "oversized.mp3",
            byteLength: 1,
          },
        })
      ),
    (error: unknown) => {
      assert.ok(error instanceof AudioNormalizationError);
      assert.equal(error.code, "input_too_large");
      return true;
    }
  );
});

test("audio normalizer enforces duration guardrails from ffprobe output", async (t) => {
  const tempDirectory = await createTempDirectory("duration");
  t.after(async () => rm(tempDirectory, { recursive: true, force: true }));

  const normalizer = createFfmpegAudioNormalizer(createConfig(tempDirectory, { maxDurationMs: 1_000 }), {
    async runCommand(command) {
      if (command === "ffprobe") {
        return { stdout: JSON.stringify({ format: { duration: "1.25" } }), stderr: "" };
      }

      throw new Error("duration guardrail should fail before ffmpeg conversion runs");
    },
  });

  await assert.rejects(
    () => normalizer.normalize(createFetchedAudio(SUPPORTED_FIXTURE_PATH)),
    (error: unknown) => {
      assert.ok(error instanceof AudioNormalizationError);
      assert.equal(error.code, "duration_limit_exceeded");
      return true;
    }
  );
});

test("audio normalizer removes partial artifacts when conversion fails", async (t) => {
  const tempDirectory = await createTempDirectory("cleanup");
  t.after(async () => rm(tempDirectory, { recursive: true, force: true }));

  let attemptedOutputPath: string | null = null;
  const normalizer = createFfmpegAudioNormalizer(createConfig(tempDirectory), {
    async runCommand(command, args) {
      if (command === "ffprobe") {
        return { stdout: JSON.stringify({ format: { duration: "1.5" } }), stderr: "" };
      }

      if (command === "ffmpeg") {
        attemptedOutputPath = getRequiredOutputPath(args);
        await writeFile(attemptedOutputPath, Buffer.from("partial-output"));
        throw new Error("ffmpeg exited with code 1");
      }

      throw new Error(`Unexpected command: ${command}`);
    },
  });

  await assert.rejects(
    () => normalizer.normalize(createFetchedAudio(SUPPORTED_FIXTURE_PATH)),
    (error: unknown) => {
      assert.ok(error instanceof AudioNormalizationError);
      assert.equal(error.code, "normalization_failed");
      return true;
    }
  );

  if (!attemptedOutputPath) {
    assert.fail("Expected ffmpeg conversion attempt to produce an output path");
  }

  const outputPath = attemptedOutputPath;
  await assert.rejects(() => access(dirname(outputPath)));
});

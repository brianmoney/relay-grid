import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import type { AudioNormalizationConfig } from "../config";
import {
  AudioNormalizationError,
  type NormalizedAudio,
  type NormalizedAudioDescriptor,
} from "../types/audio";
import type { NormalizedFetchedAudio } from "../types/events";

const SUPPORTED_INPUT_EXTENSIONS = new Set([
  "aac",
  "aiff",
  "amr",
  "caf",
  "flac",
  "m4a",
  "mp3",
  "mpga",
  "oga",
  "ogg",
  "opus",
  "wav",
  "weba",
  "webm",
  "wma",
]);

const SUPPORTED_INPUT_MIME_TYPES = new Set([
  "audio/aac",
  "audio/aiff",
  "audio/amr",
  "audio/basic",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
  "audio/x-aiff",
  "audio/x-m4a",
  "audio/x-wav",
]);

const CANONICAL_OUTPUT_FORMAT = {
  container: "wav",
  codec: "pcm_s16le",
  channelCount: 1,
  sampleRateHz: 16000,
} as const;

interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface AudioNormalizer {
  assertReady(): Promise<void>;
  normalize(audio: NormalizedFetchedAudio): Promise<NormalizedAudio>;
  cleanup(audio: NormalizedAudio): Promise<void>;
}

interface AudioNormalizerDependencies {
  runCommand?: (command: string, args: string[]) => Promise<CommandResult>;
}

interface ProbeFormatResult {
  format?: {
    duration?: string;
  };
}

const runCommand = (command: string, args: string[]): Promise<CommandResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk) => {
      stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };

      if (exitCode === 0) {
        resolve(result);
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${String(exitCode)}${
            result.stderr.trim().length > 0 ? `: ${result.stderr.trim()}` : ""
          }`
        )
      );
    });
  });
};

const sanitizeFileName = (value: string): string => {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
};

const getExtension = (filePath: string | undefined): string | null => {
  if (!filePath) {
    return null;
  }

  const extension = extname(filePath).toLowerCase().replace(/^\./, "");
  return extension.length > 0 ? extension : null;
};

const isSupportedInput = (audio: NormalizedFetchedAudio): boolean => {
  const mimeType = audio.audio.mimeType?.toLowerCase();

  if (mimeType && SUPPORTED_INPUT_MIME_TYPES.has(mimeType)) {
    return true;
  }

  const extensions = [audio.audio.fileName, audio.localPath]
    .map((value) => getExtension(value))
    .filter((value): value is string => value !== null);

  return extensions.some((extension) => SUPPORTED_INPUT_EXTENSIONS.has(extension));
};

const ensureInputIsSupported = (audio: NormalizedFetchedAudio): void => {
  if (isSupportedInput(audio)) {
    return;
  }

  throw new AudioNormalizationError(
    "unsupported_media_type",
    `Audio input ${audio.audio.mediaId} is not supported for normalization`
  );
};

const ensureInputSizeWithinLimits = async (
  audio: NormalizedFetchedAudio,
  config: AudioNormalizationConfig
): Promise<number> => {
  const byteLength = (await stat(audio.localPath)).size;

  if (byteLength > config.maxInputBytes) {
    throw new AudioNormalizationError(
      "input_too_large",
      `Audio input ${audio.audio.mediaId} exceeds the ${String(config.maxInputBytes)} byte limit`
    );
  }

  return byteLength;
};

const parseDurationMs = (
  stdout: string,
  fallbackDurationMs: number | undefined,
  mediaId: string
): number => {
  const parsed = JSON.parse(stdout) as ProbeFormatResult;
  const durationSeconds = parsed.format?.duration;

  if (durationSeconds) {
    const durationMs = Math.round(Number(durationSeconds) * 1000);

    if (Number.isFinite(durationMs) && durationMs >= 0) {
      return durationMs;
    }
  }

  if (fallbackDurationMs !== undefined) {
    return fallbackDurationMs;
  }

  throw new AudioNormalizationError(
    "probe_failed",
    `Audio input ${mediaId} is missing duration metadata after probing`
  );
};

const probeDurationMs = async (
  audio: NormalizedFetchedAudio,
  config: AudioNormalizationConfig,
  commandRunner: (command: string, args: string[]) => Promise<CommandResult>
): Promise<number> => {
  try {
    const result = await commandRunner(config.ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      audio.localPath,
    ]);

    return parseDurationMs(result.stdout, audio.audio.durationMs, audio.audio.mediaId);
  } catch (error) {
    if (error instanceof AudioNormalizationError) {
      throw error;
    }

    throw new AudioNormalizationError(
      "probe_failed",
      `Failed to probe audio input ${audio.audio.mediaId} duration: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }
};

const ensureDurationWithinLimits = (mediaId: string, durationMs: number, limitMs: number): void => {
  if (durationMs <= limitMs) {
    return;
  }

  throw new AudioNormalizationError(
    "duration_limit_exceeded",
    `Audio input ${mediaId} exceeds the ${String(limitMs)} ms duration limit`
  );
};

const createNormalizedDescriptor = async (
  audio: NormalizedFetchedAudio,
  outputPath: string,
  durationMs: number
): Promise<NormalizedAudioDescriptor> => {
  const outputStats = await stat(outputPath);
  const baseName = basename(audio.audio.fileName ?? audio.localPath, extname(audio.audio.fileName ?? audio.localPath));

  return {
    mediaId: `${audio.audio.mediaId}:normalized`,
    mimeType: "audio/wav",
    fileName: `${sanitizeFileName(baseName.length > 0 ? baseName : audio.audio.mediaId)}.wav`,
    byteLength: outputStats.size,
    durationMs,
    ...CANONICAL_OUTPUT_FORMAT,
  };
};

const removePath = async (path: string): Promise<void> => {
  await rm(path, { force: true, recursive: true });
};

export const createFfmpegAudioNormalizer = (
  config: AudioNormalizationConfig,
  dependencies: AudioNormalizerDependencies = {}
): AudioNormalizer => {
  const commandRunner = dependencies.runCommand ?? runCommand;

  return {
    async assertReady() {
      try {
        await commandRunner(config.ffmpegPath, ["-version"]);
        await commandRunner(config.ffprobePath, ["-version"]);
      } catch (error) {
        throw new AudioNormalizationError(
          "ffmpeg_unavailable",
          `ffmpeg dependencies are not available: ${error instanceof Error ? error.message : "unknown error"}`
        );
      }
    },

    async normalize(audio) {
      ensureInputIsSupported(audio);
      await ensureInputSizeWithinLimits(audio, config);
      const durationMs = await probeDurationMs(audio, config, commandRunner);
      ensureDurationWithinLimits(audio.audio.mediaId, durationMs, config.maxDurationMs);

      await mkdir(config.tempDirectory, { recursive: true });

      const outputDirectory = await mkdtemp(join(config.tempDirectory, "normalized-"));
      const outputPath = join(outputDirectory, "normalized.wav");

      try {
        await commandRunner(config.ffmpegPath, [
          "-v",
          "error",
          "-nostdin",
          "-y",
          "-i",
          audio.localPath,
          "-vn",
          "-map_metadata",
          "-1",
          "-ac",
          String(CANONICAL_OUTPUT_FORMAT.channelCount),
          "-ar",
          String(CANONICAL_OUTPUT_FORMAT.sampleRateHz),
          "-c:a",
          CANONICAL_OUTPUT_FORMAT.codec,
          outputPath,
        ]);

        const normalizedDescriptor = await createNormalizedDescriptor(audio, outputPath, durationMs);

        return {
          source: audio.source,
          sourceIdentity: audio.sourceIdentity,
          conversation: audio.conversation,
          dedupe: audio.dedupe,
          sourceAudio: audio.audio,
          audio: normalizedDescriptor,
          artifactPath: outputPath,
          artifactDirectory: outputDirectory,
          cleanup: {
            owner: "pipeline",
            artifactPath: outputPath,
            directoryPath: outputDirectory,
          },
          ...(audio.metadata ? { metadata: audio.metadata } : {}),
        };
      } catch (error) {
        await removePath(outputDirectory).catch(() => undefined);

        if (error instanceof AudioNormalizationError) {
          throw error;
        }

        throw new AudioNormalizationError(
          "normalization_failed",
          `Failed to normalize audio input ${audio.audio.mediaId}: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
    },

    async cleanup(audio) {
      await removePath(audio.cleanup.directoryPath);
    },
  };
};

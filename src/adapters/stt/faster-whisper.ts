import { spawn } from "node:child_process";

import type { FasterWhisperConfig } from "../../config";
import type { NormalizedAudio } from "../../types/audio";
import { STTError, type STTResultMetadata, type STTTranscription } from "../../types/stt";
import type { STTAdapter } from "./base";

interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface FasterWhisperAdapterDependencies {
  runCommand?: (command: string, args: string[]) => Promise<CommandResult>;
}

interface FasterWhisperResponse {
  text?: unknown;
  language?: unknown;
  segments?: unknown;
  metadata?: {
    durationMs?: unknown;
    languageProbability?: unknown;
  };
}

const FASTER_WHISPER_READINESS_SCRIPT = [
  "import sys",
  "from faster_whisper import WhisperModel",
  "WhisperModel(sys.argv[1], device=sys.argv[2], compute_type=sys.argv[3])",
  'print("ready")',
].join("\n");

const FASTER_WHISPER_TRANSCRIBE_SCRIPT = [
  "import json",
  "import sys",
  "from faster_whisper import WhisperModel",
  "model = WhisperModel(sys.argv[1], device=sys.argv[2], compute_type=sys.argv[3])",
  "language = sys.argv[4] or None",
  "beam_size = int(sys.argv[5])",
  "audio_path = sys.argv[6]",
  "segments, info = model.transcribe(audio_path, beam_size=beam_size, language=language)",
  "segment_payload = []",
  "text_parts = []",
  "for segment in segments:",
  "    segment_text = segment.text.strip()",
  "    if segment_text:",
  "        text_parts.append(segment_text)",
  "    segment_payload.append({",
  '        "startMs": int(round(segment.start * 1000)),',
  '        "endMs": int(round(segment.end * 1000)),',
  '        "text": segment_text,',
  "    })",
  'payload = {',
  '    "text": " ".join(text_parts).strip(),',
  '    "language": getattr(info, "language", None),',
  '    "segments": segment_payload,',
  '    "metadata": {',
  '        "durationMs": int(round(getattr(info, "duration") * 1000)) if getattr(info, "duration", None) is not None else None,',
  '        "languageProbability": getattr(info, "language_probability", None),',
  "    },",
  "}",
  "print(json.dumps(payload))",
].join("\n");

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

const parseOptionalNumber = (value: unknown): number | undefined => {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const parseSegments = (value: unknown): STTTranscription["segments"] => {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  return value.flatMap((segment) => {
    if (!segment || typeof segment !== "object") {
      return [];
    }

    const candidate = segment as Record<string, unknown>;

    if (
      typeof candidate.startMs !== "number" ||
      !Number.isFinite(candidate.startMs) ||
      typeof candidate.endMs !== "number" ||
      !Number.isFinite(candidate.endMs) ||
      typeof candidate.text !== "string"
    ) {
      return [];
    }

    return [
      {
        startMs: candidate.startMs,
        endMs: candidate.endMs,
        text: candidate.text,
      },
    ];
  });
};

const parseTranscription = (
  stdout: string,
  config: FasterWhisperConfig
): STTTranscription => {
  let parsed: FasterWhisperResponse;

  try {
    parsed = JSON.parse(stdout) as FasterWhisperResponse;
  } catch (error) {
    throw new STTError(
      "invalid_response",
      "Faster-Whisper returned invalid JSON output",
      { cause: error }
    );
  }

  if (typeof parsed.text !== "string") {
    throw new STTError("invalid_response", "Faster-Whisper response is missing transcript text");
  }

  const metadata: STTResultMetadata = {
    backend: "faster-whisper",
    model: config.model,
    device: config.device,
    computeType: config.computeType,
  };
  const durationMs = parseOptionalNumber(parsed.metadata?.durationMs);
  const languageProbability = parseOptionalNumber(parsed.metadata?.languageProbability);

  if (durationMs !== undefined) {
    metadata.durationMs = durationMs;
  }

  if (languageProbability !== undefined) {
    metadata.languageProbability = languageProbability;
  }

  const segments = parseSegments(parsed.segments);

  return {
    text: parsed.text,
    ...(typeof parsed.language === "string" && parsed.language.length > 0
      ? { language: parsed.language }
      : {}),
    ...(segments && segments.length > 0 ? { segments } : {}),
    metadata,
  };
};

export const createFasterWhisperAdapter = (
  config: FasterWhisperConfig,
  dependencies: FasterWhisperAdapterDependencies = {}
): STTAdapter => {
  const commandRunner = dependencies.runCommand ?? runCommand;

  return {
    backend: "faster-whisper",

    async assertReady() {
      try {
        await commandRunner(config.pythonPath, [
          "-c",
          FASTER_WHISPER_READINESS_SCRIPT,
          config.model,
          config.device,
          config.computeType,
        ]);
      } catch (error) {
        throw new STTError(
          "backend_unavailable",
          `Faster-Whisper backend is not ready: ${error instanceof Error ? error.message : "unknown error"}`,
          { cause: error }
        );
      }
    },

    async transcribe(audio: NormalizedAudio) {
      try {
        const result = await commandRunner(config.pythonPath, [
          "-c",
          FASTER_WHISPER_TRANSCRIBE_SCRIPT,
          config.model,
          config.device,
          config.computeType,
          config.language ?? "",
          String(config.beamSize),
          audio.artifactPath,
        ]);

        return parseTranscription(result.stdout, config);
      } catch (error) {
        if (error instanceof STTError) {
          throw error;
        }

        throw new STTError(
          "transcription_failed",
          `Faster-Whisper transcription failed for ${audio.audio.mediaId}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
          { cause: error, retryable: true }
        );
      }
    },
  };
};

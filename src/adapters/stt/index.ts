import type { STTConfig } from "../../config";
import { STTError } from "../../types/stt";
import { createFasterWhisperAdapter, type FasterWhisperAdapterDependencies } from "./faster-whisper";
import type { STTAdapter } from "./base";

export interface STTAdapterFactoryDependencies {
  fasterWhisper?: FasterWhisperAdapterDependencies;
}

export const createSTTAdapter = (
  config: STTConfig,
  dependencies: STTAdapterFactoryDependencies = {}
): STTAdapter => {
  switch (config.backend) {
    case "faster-whisper":
      return createFasterWhisperAdapter(config.fasterWhisper, dependencies.fasterWhisper);

    default:
      throw new STTError("unsupported_backend", `Unsupported STT backend: ${String(config.backend)}`);
  }
};

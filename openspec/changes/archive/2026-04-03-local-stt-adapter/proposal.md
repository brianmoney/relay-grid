## Why

The sidecar can now produce canonical normalized audio artifacts, but it still cannot turn that audio into transcript text. Adding the local STT adapter next completes the provider-agnostic speech-to-text seam and unlocks the first end-to-end transcript path before dispatch integration lands.

## What Changes

- Add a provider-agnostic `STTAdapter` contract that accepts normalized audio and returns the canonical transcript envelope plus optional segment and metadata details.
- Implement the MVP local STT backend using Faster-Whisper behind that shared adapter contract.
- Add config-driven backend selection so service wiring can choose the active STT backend without changing pipeline logic.
- Add readiness checks, failure handling, and explicit error surfaces for STT startup and transcription failures.
- Wire the STT stage into the service seam after audio normalization and before future dispatch delivery.
- Extend docs and configuration guidance for local STT runtime requirements and backend configuration.

## Capabilities

### New Capabilities
- `stt-adapter-contract`: Provider-agnostic STT adapter interface, transcription result types, and transcript-envelope mapping from normalized audio.
- `faster-whisper-backend`: MVP local Faster-Whisper implementation of the shared STT adapter contract.
- `stt-backend-selection`: Config-driven STT backend selection, readiness checks, and explicit failure behavior.

### Modified Capabilities
- None.

## Impact

- Affected code: STT modules under `src/adapters/stt/`, shared transcript or audio-related types, runtime config, service wiring, and tests.
- Affected docs: `README.md`, `docs/architecture.md`, `.env.example`, and any runbook notes covering local STT dependencies and configuration.
- Dependencies: local Faster-Whisper runtime integration, backend invocation utilities, and transcription fixtures or mocks for tests.
- Systems: normalized-audio handling from the pipeline, transcript-envelope generation, future dispatch input, and service startup/readiness behavior.

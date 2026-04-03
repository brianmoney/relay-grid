## Context

The sidecar now receives normalized audio artifacts in a canonical WAV format, but there is still no provider-agnostic speech-to-text layer to convert that audio into transcript text. The next stage in the MVP path must accept normalized audio, transcribe it using a local-first backend, and return the existing transcript envelope shape without coupling the rest of the service to one STT implementation.

This change should keep transcription logic behind a stable adapter contract, just as source-specific logic is isolated behind source adapters and normalization is isolated in the pipeline. That ensures future backend changes do not require service-wide rewiring.

## Goals / Non-Goals

**Goals:**
- Define a provider-agnostic `STTAdapter` contract that accepts `NormalizedAudio` and returns transcript results that can map cleanly into `TranscriptEnvelope`.
- Implement a local Faster-Whisper backend behind that shared adapter contract.
- Make backend selection config-driven so later backend changes do not affect pipeline code outside adapter wiring.
- Add explicit readiness checks and clear error surfaces for backend startup and transcription failures.
- Wire the STT stage into the service seam after audio normalization and before future dispatch integration.
- Preserve optional transcript segments and backend metadata for downstream consumers.

**Non-Goals:**
- Implement transcript delivery or dispatch adapters.
- Add remote/cloud STT backends in this change.
- Solve advanced STT concerns such as diarization, translation, or confidence calibration beyond what the chosen backend returns directly.
- Introduce implicit fallback across multiple STT backends in the MVP.

## Decisions

### Keep one stable `STTAdapter` interface
The sidecar should define one provider-agnostic transcription interface for all backends. The interface should include readiness checks, a single transcription method, and a result shape that can map directly into the canonical transcript envelope.

Alternative considered: let each backend define its own bespoke invocation and result shape. Rejected because it would spread backend-specific assumptions into service wiring and future dispatch logic.

### Use Faster-Whisper as the first local backend
The MVP backend should be Faster-Whisper because the umbrella proposal already names it as the preferred first STT implementation and it fits the local-first requirement.

Alternative considered: start with Whisper.cpp or a remote API backend. Rejected because Faster-Whisper is already the planned MVP path and keeps the stack local-first.

### Keep backend selection explicit and config-driven
Runtime configuration should select the active STT backend. The service seam should instantiate one backend explicitly instead of embedding hidden fallback logic.

Alternative considered: implicit backend fallback if the preferred backend is unavailable. Rejected because the project guidance favors explicit fallbacks and clear operational behavior over hidden recovery paths.

### Keep transcript mapping close to the adapter boundary
The STT adapter should return transcription results with enough structure to build `TranscriptEnvelope` immediately after transcription. This includes transcript text, optional language, optional segments, and backend metadata.

Alternative considered: let the service layer invent transcript result mapping after each backend returns a loose payload. Rejected because transcript result shaping is part of the STT boundary and should stay consistent across backends.

### Treat backend readiness as a startup concern
The active STT backend should expose a readiness check the service can run during startup, similar to audio normalization dependency checks. That keeps failure modes early and obvious.

Alternative considered: only fail when the first transcription request arrives. Rejected because delayed readiness errors would be harder to diagnose and make the runtime appear healthy when it is not.

## Risks / Trade-offs

- [Faster-Whisper runtime requirements may be heavier than the rest of the sidecar] -> Document the dependency and isolate backend startup checks behind the adapter interface.
- [Backend output may vary by model and runtime environment] -> Keep the transcript result contract narrow and preserve backend metadata separately.
- [Future backends may need slightly different result details] -> Make the shared transcription result extensible while keeping core transcript fields stable.
- [Startup may fail if the configured backend is unavailable] -> Keep backend selection explicit and surface readiness failures clearly in logs and service startup behavior.

## Migration Plan

1. Add provider-agnostic STT types and the shared `STTAdapter` contract.
2. Add runtime configuration for STT backend selection and Faster-Whisper settings.
3. Implement the Faster-Whisper adapter and transcript result mapping.
4. Wire the STT stage into the service seam after normalization.
5. Add tests for backend selection, transcription mapping, and failure behavior.
6. Update docs for local STT runtime requirements and configuration.

Rollback is low risk because the STT seam sits between normalization and future dispatch work. If the first backend integration needs revision, the shared adapter contract can still be preserved while the backend implementation changes.

## Open Questions

- Should the Faster-Whisper integration call a local binary, an HTTP service, or a Python sidecar process in the MVP?
- Which model-size and language configuration options should be exposed immediately versus deferred?
- Should STT segment timestamps map one-to-one into `TranscriptSegment`, or should the adapter normalize missing timing data into coarse ranges only when present?

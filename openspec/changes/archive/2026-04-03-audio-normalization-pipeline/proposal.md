## Why

The sidecar can now fetch real audio files from Slack, but downstream transcription still has no stable media contract to rely on. Adding an audio normalization pipeline next creates one deterministic transcription input format and prevents STT adapters from inheriting source-specific media quirks.

## What Changes

- Add a provider-agnostic audio normalization pipeline that accepts fetched audio and produces one canonical transcription input format.
- Validate downloaded media before normalization, including supported input checks plus configured size and duration guardrails.
- Normalize accepted audio to a stable STT-friendly output shape, including deterministic ffmpeg invocation and normalized metadata.
- Define temp-file lifecycle rules so intermediate artifacts are created predictably and cleaned up promptly on success or failure.
- Surface normalization failures clearly for later retry, logging, and failure-handling work.
- Extend docs and configuration guidance for normalization behavior and operational limits.

## Capabilities

### New Capabilities
- `audio-normalization`: Canonical normalization of fetched audio into one stable transcription input format.
- `audio-validation-guards`: Input validation and guardrails for supported media types, file size, and duration before or during normalization.
- `normalization-artifact-lifecycle`: Deterministic temp-file handling, cleanup rules, and failure behavior for normalization artifacts.

### Modified Capabilities
- None.

## Impact

- Affected code: normalization modules under `src/pipeline/` or adjacent provider-agnostic services, shared audio-related types, service wiring, and cleanup utilities.
- Affected docs: `README.md`, `docs/architecture.md`, `.env.example`, and any runbook notes covering normalization dependencies and limits.
- Dependencies: ffmpeg invocation, any narrow media probing utilities, and tests/fixtures for normalization cases.
- Systems: fetched-audio handling from Slack ingest, future STT adapter input, temp storage usage, and failure visibility for media preprocessing.

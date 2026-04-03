## Context

Slack ingest now produces real `NormalizedFetchedAudio` inputs, but the sidecar still has no stable media preprocessing layer between raw downloaded files and future STT adapters. Without normalization, each transcription backend would need to handle source-specific file types, inconsistent channel layouts, and varying sample rates on its own.

This change establishes a provider-agnostic normalization stage that consumes fetched audio, validates it against configured guardrails, converts it into one canonical STT-friendly format, and manages all temporary artifacts predictably. That creates a narrow seam for the upcoming STT adapter change and keeps source-specific file quirks out of backend-specific transcription logic.

## Goals / Non-Goals

**Goals:**
- Accept fetched audio from the source layer and normalize it into one canonical transcription input format.
- Validate media before and during normalization using deterministic supported-type, size, and duration guardrails.
- Define the normalized-audio output contract that later STT adapters can consume without source-specific assumptions.
- Keep ffmpeg invocation deterministic and isolated behind a provider-agnostic normalization interface.
- Create predictable temp-file lifecycle and cleanup behavior for normalized outputs and transient artifacts.
- Surface normalization failures clearly so later retry and observability work can build on them.

**Non-Goals:**
- Implement transcription backends or transcript delivery.
- Add source-specific normalization behavior beyond what is required to consume `NormalizedFetchedAudio`.
- Persist processing state or retries for normalization failures.
- Support every possible media codec in the MVP beyond the accepted fetched-audio inputs and ffmpeg-supported conversions.

## Decisions

### Normalize to a single canonical WAV target
Normalization should produce mono 16 kHz PCM WAV output for the MVP. This is widely accepted by local transcription engines, deterministic to generate, and easy to inspect during debugging.

Alternative considered: allow multiple normalized output formats depending on the STT backend. Rejected because it would leak backend-specific decisions into the normalization layer before the STT adapter contract is even established.

### Keep normalization provider-agnostic and driven by fetched-audio contracts
The normalization pipeline should only accept `NormalizedFetchedAudio` and return a new normalized-audio contract. It should not inspect Slack-specific metadata to decide how conversion works.

Alternative considered: thread Slack file metadata directly into normalization logic. Rejected because normalization belongs after source-specific concerns have already been abstracted away.

### Use ffmpeg as the canonical conversion engine
The pipeline should use ffmpeg for probing and conversion because it is the most practical single tool for handling the range of audio types likely to arrive from Slack.

Alternative considered: custom codec handling in Node libraries only. Rejected because it would increase implementation complexity and codec coverage risk for little MVP benefit.

### Apply explicit validation and guardrails early
The pipeline should reject obviously unsupported or oversized inputs before expensive conversion work begins, and it should fail clearly when duration or decode constraints are exceeded.

Alternative considered: hand all fetched media to ffmpeg and let downstream stages decide. Rejected because it wastes compute, obscures failure reasons, and complicates retry behavior.

### Treat normalization artifacts as owned temporary resources
The normalization stage should create normalized output in a dedicated temp location, return that path in the normalized-audio contract, and provide a clear cleanup seam for later pipeline stages to call once transcription is complete.

Alternative considered: overwrite the source-downloaded file in place. Rejected because it destroys the original artifact too early and makes debugging or fallback behavior harder.

## Risks / Trade-offs

- [ffmpeg may not be installed or may behave differently across environments] -> Validate ffmpeg availability explicitly and document it in setup and runbook guidance.
- [Large or malformed files could consume excess compute or disk] -> Apply size and duration guardrails before or during conversion and fail fast with clear errors.
- [Temp artifacts could accumulate if later stages crash] -> Define explicit cleanup ownership and add best-effort cleanup for failed normalization attempts.
- [A single canonical format may not be ideal for every future backend] -> Keep the normalized output contract extensible while using one MVP default until backend needs prove otherwise.

## Migration Plan

1. Add normalization-specific types and service/module structure.
2. Add configuration and docs for ffmpeg dependency plus media guardrails.
3. Implement fetched-audio validation and deterministic ffmpeg normalization to the canonical output format.
4. Add temp-artifact lifecycle and cleanup behavior for success and failure paths.
5. Wire the normalization stage into the service seam after fetched audio is produced.
6. Add fixture-driven tests for valid normalization, guardrail failures, and cleanup behavior.

Rollback is low risk because this stage sits between source ingest and future STT work. If the contract or command shape needs revision, it can be adjusted before transcription adapters depend on it broadly.

## Open Questions

- Should duration probing happen with `ffprobe` explicitly, or should the first ffmpeg pass be used to infer and enforce duration limits?
- What exact default limits should the MVP use for maximum file size and duration?
- Should cleanup of successful normalized outputs be owned by the normalization stage, the future STT stage, or an explicit temp-artifact manager shared by both?

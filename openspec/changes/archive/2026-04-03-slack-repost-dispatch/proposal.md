## Why

The sidecar can now ingest, normalize, and transcribe Slack audio messages, but it still does not deliver transcript text anywhere. Adding Slack repost dispatch next creates the first end-to-end MVP loop by posting the transcript back into the originating Slack thread while the preferred Open Dispatch ingress path remains a later follow-on change.

## What Changes

- Add a Slack dispatch adapter that reposts transcript text into the originating Slack thread using the existing normalized conversation identity.
- Define the fallback transcript repost message shape, including explicit sidecar metadata or markers that allow the Slack ingest path to ignore sidecar-authored reposts.
- Add narrow Slack thread-targeting logic that maps transcript delivery to the original channel and thread without leaking Slack-specific details into upstream transcription logic.
- Add minimal duplicate suppression around repost delivery so retries do not create duplicate transcript posts during the first end-to-end demo path.
- Wire transcript delivery into the service seam after STT transcription completes, keeping dispatch behavior behind a provider-specific adapter boundary.
- Extend docs and configuration guidance for Slack repost behavior, repost tagging, and loop-safe fallback delivery.

## Capabilities

### New Capabilities
- `slack-transcript-repost`: Slack transcript delivery into the originating thread as the MVP fallback dispatch path.
- `slack-repost-tagging`: Explicit Slack repost message tagging or metadata that allows source ingestion to identify and ignore sidecar-authored reposts.
- `slack-repost-dedupe`: Minimal duplicate suppression for Slack repost delivery during the first end-to-end demo path.

### Modified Capabilities
- None.

## Impact

- Affected code: Slack dispatch modules under `src/adapters/dispatch/`, service wiring, Slack API helpers, transcript handling seams, and related tests.
- Affected docs: `README.md`, `docs/architecture.md`, `.env.example`, and runbook notes covering fallback transcript delivery.
- Dependencies: Slack Web API usage for message posting, transcript formatting logic, and test fixtures for repost behavior.
- Systems: transcript delivery after STT, Slack thread targeting, repost-loop filtering, and duplicate-suppression behavior for fallback dispatch.

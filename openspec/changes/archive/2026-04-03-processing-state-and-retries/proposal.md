## Why

The MVP pipeline can now ingest, normalize, transcribe, and repost transcripts, but its duplicate suppression and failure handling are still mostly in-memory and best-effort. Adding persisted processing state and bounded retries next is necessary to survive restarts, prevent duplicate downstream work, and make terminal failures visible and actionable.

## What Changes

- Add a persistence-backed processing-state store keyed by the canonical conversation and dedupe identifiers.
- Extend the runtime pipeline to record state transitions across fetch, normalization, transcription, and dispatch.
- Replace the current in-process-only duplicate suppression with persisted idempotency for the relevant pipeline stages.
- Add bounded retry behavior for retryable failures and explicit terminal failure handling when retry limits are exceeded.
- Surface terminal failures clearly in logs and optionally through Slack-side operator notices when configured.
- Document retry, idempotency, and failure-state behavior for the MVP runtime.

## Capabilities

### New Capabilities
- `retry-policy`: Bounded retry behavior for retryable failures across the ingest-to-dispatch pipeline.
- `terminal-failure-visibility`: Explicit terminal failure recording, logging, and optional Slack error notices for unrecoverable or exhausted failures.
- `idempotent-dispatch-state`: Persisted duplicate-suppression and state-tracking behavior that survives restarts for the MVP pipeline.

### Modified Capabilities
- `processing-state`: Extend the store-agnostic processing-state model into persisted runtime state transitions and identifier-backed state management.

## Impact

- Affected code: store modules under `src/store/`, service orchestration, dispatch duplicate handling, processing-state types, and related tests.
- Affected docs: `README.md`, `docs/architecture.md`, `.env.example`, and runbook notes for retries, failure handling, and state persistence.
- Dependencies: a lightweight persistence mechanism for MVP state, retry/backoff utilities, and tests that simulate retries, duplicates, and restarts.
- Systems: dedupe and idempotency behavior, retry attempts, failure visibility, and restart-safe pipeline execution.

## Why

The sidecar can now ingest Slack audio, normalize it, transcribe it, and deliver the transcript through the Slack repost fallback path. The umbrella MVP plan still treats direct transcript delivery into Open Dispatch as the preferred target state, so the next sidecar change should add that HTTP ingress path without collapsing the existing adapter boundaries or silently bypassing Open Dispatch.

This change should stay sidecar-scoped. If Open Dispatch is maintained in another repository, the server-side ingest endpoint remains a linked change there rather than being implied as already complete in this repository.

## What Changes

- Add a provider-specific Open Dispatch HTTP dispatch adapter under `src/adapters/dispatch/` that delivers canonical transcript text to a configured ingress endpoint.
- Define the sidecar-owned HTTP request payload shape using normalized conversation and dedupe identity so Open Dispatch receives stable routing context without source-specific audio details.
- Add explicit runtime configuration for dispatch mode selection so Slack repost and Open Dispatch ingress remain separate, intentional delivery modes.
- Keep retry behavior in the existing provider-agnostic orchestration layer by surfacing retryable versus non-retryable HTTP failures clearly from the dispatch adapter.
- Document the linked boundary between the sidecar HTTP client and the Open Dispatch server endpoint, including explicit fallback expectations when HTTP ingress is not enabled.

## Capabilities

### New Capabilities
- `opendispatch-http-dispatch`: Sidecar transcript delivery into a configured Open Dispatch HTTP ingress endpoint.
- `dispatch-mode-selection`: Explicit runtime selection between Slack repost fallback and Open Dispatch HTTP ingress.

### Modified Capabilities
- None.

## Impact

- Affected code: dispatch modules under `src/adapters/dispatch/`, config loading, service wiring, request/response error handling, and related tests.
- Affected docs: `README.md`, `docs/architecture.md`, `.env.example`, and runbook notes covering HTTP ingress mode and linked endpoint expectations.
- Dependencies: a reachable Open Dispatch ingress endpoint, HTTP auth configuration if required by the endpoint, and tests that cover payload generation and failure classification.
- Systems: transcript delivery after STT, dispatch adapter selection, retry classification for HTTP delivery failures, and explicit sidecar versus Open Dispatch ownership boundaries.

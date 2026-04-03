# AGENTS.md

## Project overview
This project implements a modular ingestion pipeline for audio-bearing messages from external channels, beginning with Slack voice/file messages.

The system is intentionally split into layers:

1. **Source adapters** fetch inbound events and download audio.
2. **Audio normalization** converts media into a stable transcription format.
3. **STT adapters** transcribe normalized audio using a selected backend.
4. **Dispatch adapters** hand transcript text to an agent-routing system.
5. **Agent backends** handle conversation with OpenCode first, with future support for other agent systems.

The MVP target is:

- Slack source adapter
- local-first STT
- transcript delivery into Open Dispatch
- OpenCode as the first agent backend

## Document lookup policy
- For OpenSpec and other repo markdown that is available through grounded-docs, prefer searching the grounded-docs index first.
- The grounded-docs index name for this repo is `relay-grid`.
- Use grounded-docs search to locate the relevant proposal, design, task, or spec content quickly.
- After locating relevant results, use local file tools to inspect full files when detailed context, verification, or edits are needed.
- Prefer the repo skill `grounded-docs-openspec` for this workflow.

## Architecture principles
- Keep source-specific logic out of STT and agent-routing layers.
- Keep STT backend logic out of source adapters.
- Keep agent-backend details out of core ingestion flow.
- Prefer narrow interfaces and explicit contracts.
- Prefer idempotent processing and bounded retries.
- Preserve conversation/thread identity across the pipeline.
- Treat all inbound events as retryable and possibly duplicated.
- Favor local/private defaults over cloud dependencies when practical.

## Code organization expectations
Use a layered structure. Core logic should not depend directly on Slack SDK types or other provider-native event types beyond adapter boundaries.

Preferred top-level structure:

- `src/adapters/source/`
- `src/adapters/stt/`
- `src/adapters/dispatch/`
- `src/adapters/agent/`
- `src/pipeline/`
- `src/store/`
- `src/types/`
- `src/tests/`

## Implementation rules
- Define provider-agnostic types in `src/types/`.
- Convert provider-native payloads into normalized internal objects as early as possible.
- Every inbound event must produce a stable dedupe key.
- Every conversation must produce a stable conversation key.
- Avoid hidden fallback behavior. Make fallbacks explicit in code and logs.
- Do not let temporary audio files accumulate.
- Do not mix source-fetch concerns with transcript dispatch concerns.
- Avoid premature support for many channels in core flow; expand via adapters instead.
- Keep Open Dispatch integration narrow so a future direct backend path is possible.

## Reliability requirements
- Use structured logs.
- Include source, conversation key, dedupe key, and stage in every log context where possible.
- Retries must be bounded.
- Duplicate events must not create duplicate downstream prompts.
- Terminal failures must be visible and easy to inspect.
- Persist enough state to survive sidecar restarts.

## Security requirements
- Do not log secrets, bearer tokens, raw auth headers, or full private download URLs.
- Minimize retention of raw audio and transcripts.
- Delete temporary media artifacts promptly.
- Prefer localhost or private-network-only defaults for local services.
- Use least-privilege scopes for external providers.

## Testing expectations
- Prefer deterministic fixtures over live network tests.
- Include unit tests for adapters.
- Include integration tests for the full ingest → normalize → transcribe → dispatch path.
- Include at least one golden-path Slack voice-message fixture.
- Mock external APIs unless a test is explicitly marked as live/manual.

## Decision rules for agents
When making design choices:
- prioritize clear boundaries over convenience
- prefer pluggable interfaces over hardcoded service assumptions
- optimize for future channel expansion without overbuilding the MVP
- keep the MVP centered on one clean Slack path first

## Initial MVP scope
In scope:
- Slack audio/file event handling
- audio normalization
- local-first transcription backend
- transcript dispatch to Open Dispatch
- OpenCode backend support
- dedupe, retries, and basic observability

Out of scope for MVP:
- many simultaneous channels
- advanced admin UI
- rich analytics dashboards
- speaker diarization
- multi-tenant auth model
- production-grade cloud deployment abstractions

## When to use project skills
Use the repo skills when working on:
- OpenSpec document lookup through grounded-docs
- source adapter contracts
- Slack voice ingestion
- audio normalization
- STT backends
- Open Dispatch ingress
- agent backend abstraction
- observability and retries
- integration testing

If a task touches one of those areas, load the relevant skill first.

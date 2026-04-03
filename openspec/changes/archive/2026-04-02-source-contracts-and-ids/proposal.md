## Why

Slack ingest is the next implementation step, but the sidecar still lacks the provider-agnostic contracts and stable identifiers that core pipeline code will depend on. Defining those contracts now prevents Slack-native payload shapes, ad hoc key formats, and store-specific state models from leaking into later changes.

## What Changes

- Add provider-agnostic source event, fetched-audio, transcript, and processing-state types under `src/types/`.
- Define a narrow `SourceAdapter` contract that normalizes provider-native events before they reach core pipeline code.
- Add deterministic conversation-key and dedupe-key rules plus small helper utilities for building those keys consistently.
- Define the canonical processing lifecycle as `received`, `audio_fetched`, `audio_normalized`, `transcribed`, `dispatched`, `completed`, and `failed`.
- Document the key invariants and normalized payload expectations that later source, dispatch, and retry changes must follow.
- Update architecture guidance so future changes use the new contracts instead of inventing local event or ID formats.

## Capabilities

### New Capabilities
- `source-event-contracts`: Normalized provider-agnostic source event, fetched-audio, transcript-envelope, and source-adapter contract definitions.
- `processing-identifiers`: Deterministic conversation-key and dedupe-key rules with reusable helper utilities.
- `processing-state`: Canonical processing lifecycle states and state payloads that remain independent of any persistence backend.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/adapters/source/base.ts`, `src/types/events.ts`, `src/types/transcript.ts`, `src/types/processing.ts`, and `src/utils/ids.ts`.
- Affected docs: `docs/architecture.md` and any examples that describe normalized event flow or key semantics.
- Dependencies: no new external runtime systems; possible lightweight test additions for deterministic key behavior.
- Systems: future Slack ingest, repost dedupe, dispatch delivery, and retry/state persistence work will all depend on these contracts.

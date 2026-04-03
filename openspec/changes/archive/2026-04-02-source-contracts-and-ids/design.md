## Context

The service foundation is now in place, but the sidecar still lacks the provider-agnostic contracts that future source ingestion, dispatch delivery, and persistence code will rely on. The MVP proposal already defines the intended architectural boundary: provider-native payloads should be converted into normalized internal objects as early as possible, and every inbound event must produce stable conversation and dedupe identifiers.

This change introduces those contracts before Slack-specific ingestion lands. That keeps the next feature slices focused on adapter behavior instead of inventing data shapes, key formats, or state models inline.

## Goals / Non-Goals

**Goals:**
- Define normalized provider-agnostic types for source events, fetched audio, transcript envelopes, and processing state.
- Add a narrow `SourceAdapter` contract that isolates provider-native payload parsing at the adapter boundary.
- Define deterministic conversation-key and dedupe-key rules plus reusable helper utilities.
- Keep processing state independent of any specific backing store so later persistence work can adopt the same model.
- Document the invariants that later changes must follow when adding new sources or delivery paths.

**Non-Goals:**
- Implement Slack event parsing or file download behavior.
- Implement dispatch adapters, STT adapters, or pipeline orchestration.
- Choose or implement a persistence backend for processing state.
- Finalize every source-specific metadata field needed for future providers.

## Decisions

### Normalize at the adapter boundary
Source adapters will accept provider-native events as `unknown` and convert them into explicit internal types before core code consumes them. Core pipeline code should only see normalized event and fetched-audio shapes.

Alternative considered: allow provider-native payloads to flow through the pipeline until later normalization. Rejected because it would couple core logic to Slack-specific fields and make future channel expansion harder.

### Separate source identity, conversation identity, and dedupe identity
The contract should treat these as distinct concepts:
- source identity identifies the inbound event or file from the provider
- conversation identity identifies the logical thread or session for downstream routing
- dedupe identity identifies one logical processing unit for duplicate suppression

Alternative considered: reuse one identifier across all purposes. Rejected because thread continuity and duplicate suppression have different stability requirements.

### Keep key generation deterministic and centralized
Conversation and dedupe keys should be built by shared helper functions instead of ad hoc string concatenation in adapters or stores. Helpers should be pure and produce the same output for the same normalized inputs.

Alternative considered: let each adapter or store derive keys locally. Rejected because that would create subtle divergence between ingest, logging, retries, and dispatch layers.

### Model processing state as a store-agnostic lifecycle
Processing state will be represented as a small canonical status set with enough information for later stores and logs to reason about progress. The type should describe the state machine without depending on Redis, SQLite, or in-memory persistence.

The implemented canonical status set is:
- `received`
- `audio_fetched`
- `audio_normalized`
- `transcribed`
- `dispatched`
- `completed`
- `failed`

The lifecycle intentionally does not keep separate `downloading`, `downloaded`, or `transcribing` states. The contract uses stable stage checkpoints rather than transient in-flight labels.

Alternative considered: wait until persistence work to define state. Rejected because dedupe, retries, and operational logs already depend on a shared concept of processing progress.

### Keep metadata extensible but the core contract narrow
Normalized event and transcript types should require the fields the pipeline must have, while allowing optional metadata for source-specific details. This keeps the interface stable without forcing every future provider detail into the core shape now.

Alternative considered: define very broad `Record<string, unknown>` payloads everywhere. Rejected because it weakens the contract and makes downstream assumptions implicit.

## Risks / Trade-offs

- [Contracts may be too narrow for later providers] -> Keep metadata extensible and revise in follow-on changes only when a concrete provider need appears.
- [Key formats may be hard to change once persisted] -> Define clear invariants now and keep key builders centralized so any future migration is localized.
- [State model may not capture all retry details later] -> Establish the canonical lifecycle now and allow future changes to extend stored metadata without changing the top-level status enum.
- [Too much abstraction too early] -> Limit this change to types, contracts, key helpers, and documentation; do not add pipeline logic or provider-specific implementations.

## Migration Plan

1. Add new provider-agnostic types under `src/types/`.
2. Add the source adapter base contract under `src/adapters/source/`.
3. Add shared helper utilities for conversation and dedupe key construction.
4. Update architecture guidance to reference the normalized contracts and key responsibilities.
5. Add lightweight deterministic tests for key builders and contract-level invariants.

Rollback is simple because no external systems depend on these contracts yet. If the shapes prove inadequate, they can be revised before Slack ingest and persistence layers are implemented widely.

## Open Questions

- Should the normalized fetched-audio type include both provider file identity and local file path, or should local path only appear after download-specific changes land?
- How much source-specific metadata should be standardized now versus left in a generic metadata map?
- Should processing state include timestamp fields in the base type now, or leave that for the persistence-focused follow-on change?

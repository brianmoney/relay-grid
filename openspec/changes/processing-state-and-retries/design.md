## Context

The sidecar now completes the MVP media path from Slack ingest through transcript repost, but its reliability behavior is still shallow. Duplicate suppression is partly in-memory, repost dedupe does not survive restarts, and failures are only visible in transient logs. The next change needs to turn the existing processing-state model into a persisted runtime mechanism that supports idempotency, bounded retries, and clear terminal-failure visibility.

This work should extend the existing canonical processing-state contract rather than invent a second state model. It should also preserve the current adapter boundaries so reliability logic lives in provider-agnostic orchestration and store modules rather than inside Slack-, normalization-, STT-, or dispatch-specific code.

## Goals / Non-Goals

**Goals:**
- Add a persisted processing-state store keyed by normalized conversation and dedupe identifiers.
- Record canonical state transitions across the current fetch, normalization, transcription, and dispatch stages.
- Make duplicate suppression and dispatch idempotency survive process restarts.
- Add bounded retries for retryable failures with explicit terminal-failure handling when retry limits are exhausted.
- Keep terminal failures visible in structured logs and optionally expose operator-facing Slack notices.
- Preserve adapter boundaries by keeping retry and state management in provider-agnostic service or store layers.

**Non-Goals:**
- Implement the Open Dispatch HTTP ingress path.
- Introduce a production-grade distributed workflow engine or queue system.
- Provide fully general backoff tuning for every future provider or backend.
- Replace the canonical processing-state lifecycle with a new set of statuses.

## Decisions

### Extend the canonical processing-state contract into persisted runtime records
The existing `processing-state` capability already defines the canonical lifecycle and identifier relationships. This change should add persisted runtime records and transition management that use that same lifecycle rather than creating a parallel retry-state model.

Alternative considered: create a separate retry-specific state contract detached from `ProcessingState`. Rejected because it would split observability and idempotency across two models.

### Use a lightweight persistence mechanism for the MVP
The first persistence layer should be lightweight and local-first, matching the MVP scope and keeping restart durability simple to reason about. It should expose a narrow store interface so later backing stores can replace it without rewriting the orchestration logic.

Alternative considered: jump directly to Redis or another networked store. Rejected because the MVP does not yet need external infrastructure just to achieve restart-safe idempotency and retries.

### Separate retry policy from provider-specific code
Retry classification, attempt counting, and terminal-failure promotion should happen in provider-agnostic orchestration using explicit error metadata such as `retryable`, not inside the Slack source or Slack dispatch adapters themselves.

Alternative considered: let each adapter implement its own retry behavior. Rejected because it would fragment failure handling and make duplicate suppression inconsistent across stages.

### Keep retries bounded and explicit
Retryable failures should increment attempt counts until a configured ceiling is reached, after which the state becomes terminal and no more automatic retries occur. The retry policy should be small and obvious in the MVP.

Alternative considered: indefinite retries until manual intervention. Rejected because unbounded retries can create noisy loops and make terminal failures harder to detect.

### Make operator visibility explicit but optional
Terminal failures should always be recorded in persisted state and structured logs. Optional Slack notices can be added behind configuration for operational visibility, but they should not be required to understand the canonical failure path.

Alternative considered: only log failures and defer all user-facing or operator-facing visibility. Rejected because terminal failures need a more actionable path in the MVP.

## Risks / Trade-offs

- [A lightweight local store may not cover every future deployment topology] -> Keep a narrow persistence interface so the MVP backing store can be replaced later.
- [Retries can still duplicate work if state transitions are not written atomically enough] -> Centralize idempotency checks and transition updates in the store interface rather than scattering them across handlers.
- [Terminal failure notices in Slack could add noise] -> Keep notices optional and concise, with structured logs as the default source of truth.
- [Too much retry complexity could slow the next Open Dispatch change] -> Keep the policy minimal: explicit retryable classification, a small max-attempt count, and clear terminal-state behavior.

## Migration Plan

1. Add a provider-agnostic processing-state store interface and MVP persisted backing implementation.
2. Extend processing-state records with persisted runtime fields needed for attempts, errors, and timestamps.
3. Wire state transitions and idempotency checks into the service orchestration path.
4. Add bounded retry handling and terminal-failure promotion.
5. Add optional Slack failure notices if configured.
6. Add tests that cover duplicate replay, restart-safe dedupe behavior, retry exhaustion, and terminal failure visibility.

Rollback is manageable because the current behavior is still mostly in-memory. If the persisted-state approach needs revision, the orchestration layer can temporarily fall back to the existing best-effort behavior while keeping the canonical processing-state model intact.

## Open Questions

- Which lightweight persistence mechanism best fits the MVP: SQLite, JSONL/file-backed state, or another local-first option?
- Should retry timing be immediate for the MVP, or should there be a small backoff delay even before a queue exists?
- Which terminal failures should emit optional Slack notices versus only persisted state and logs?

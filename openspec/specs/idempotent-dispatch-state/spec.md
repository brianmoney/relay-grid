## Purpose

Define restart-safe duplicate suppression and dispatch completion tracking for the MVP pipeline.

## Requirements

### Requirement: Duplicate suppression survives restarts
The sidecar SHALL persist enough state to suppress duplicate processing and duplicate transcript delivery across process restarts for the MVP pipeline.

#### Scenario: Duplicate replay after restart is suppressed
- **WHEN** the same logical processing unit is replayed after the sidecar has restarted
- **THEN** persisted state prevents duplicate downstream processing or duplicate transcript delivery for that unit

### Requirement: Idempotency uses normalized processing identity
The sidecar SHALL key persisted idempotency behavior from the normalized dedupe identity or derived dedupe key rather than provider-specific ad hoc identifiers.

#### Scenario: Persisted idempotency uses shared dedupe semantics
- **WHEN** the sidecar checks whether a processing unit has already advanced through a stage
- **THEN** it uses the canonical dedupe identity or derived dedupe key already shared across the pipeline

### Requirement: Persisted state tracks dispatch completion
The sidecar SHALL persist dispatch-related completion state so transcript repost or later dispatch paths can avoid duplicate delivery attempts.

#### Scenario: Dispatch completion is recorded for duplicate-safe delivery
- **WHEN** transcript delivery succeeds for a processing unit
- **THEN** persisted state records that dispatch completion so later duplicate events or retries do not post the transcript again

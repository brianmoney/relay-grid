## Purpose

Define the canonical processing-state lifecycle and store-agnostic status model for inbound audio processing.

## Requirements

### Requirement: Processing state uses a canonical lifecycle
The sidecar SHALL define a canonical processing-state model with explicit lifecycle statuses for inbound audio processing.

The canonical status values SHALL be:
- `received`
- `audio_fetched`
- `audio_normalized`
- `transcribed`
- `dispatched`
- `completed`
- `failed`

#### Scenario: Processing status is represented consistently
- **WHEN** sidecar code records or reports processing progress
- **THEN** it uses the canonical processing-state status values instead of ad hoc per-module labels

#### Scenario: Historical terminology maps to the canonical lifecycle
- **WHEN** earlier planning language refers to `downloading`, `downloaded`, or `delivered`
- **THEN** the canonical lifecycle maps those concepts to `audio_fetched` and `dispatched`
- **AND** no separate `transcribing` state is required by the canonical processing-state contract

### Requirement: Processing state is store-agnostic
The sidecar SHALL define processing-state types independently of any persistence backend so the same state model can be used with in-memory, file-backed, or network-backed stores.

#### Scenario: State model does not depend on a specific store
- **WHEN** a future store implementation persists or retrieves processing state
- **THEN** it can use the canonical processing-state contract without requiring backend-specific fields in the core state model

### Requirement: Processing state can be related to identifiers
The sidecar SHALL allow processing state to be associated with normalized conversation and dedupe identifiers for logging, retries, and delivery tracking.

#### Scenario: State can be linked to keys used elsewhere in the system
- **WHEN** sidecar code emits logs or updates future persistence for a processing unit
- **THEN** the processing-state contract can be associated with the relevant conversation key and dedupe key

### Requirement: Processing state supports persisted runtime progress
The sidecar SHALL persist runtime processing-state records that track attempt count, timestamps, and the latest stage reached for a processing unit.

#### Scenario: Runtime progress survives restart
- **WHEN** a processing unit advances through one or more stages and the sidecar restarts
- **THEN** the persisted processing-state record still reflects the latest known stage, attempt count, and timing information for that unit

### Requirement: Processing state records terminal failure details
The sidecar SHALL persist terminal failure details alongside the canonical processing-state record when a processing unit fails permanently.

#### Scenario: Terminal failure retains last known error details
- **WHEN** a processing unit reaches the `failed` state permanently
- **THEN** the persisted processing-state record includes the latest relevant failure code, message, and retryability context

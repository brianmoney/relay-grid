## Purpose

Define how the sidecar selects and validates the active STT backend at runtime.

## Requirements

### Requirement: STT backend selection is config-driven
The sidecar SHALL select the active STT backend through runtime configuration so pipeline code does not change when backend wiring changes.

#### Scenario: Runtime config selects the active backend
- **WHEN** the sidecar starts with a configured STT backend value
- **THEN** service wiring instantiates the matching backend through configuration rather than hardcoded pipeline logic

### Requirement: Unsupported backend selection fails clearly
The sidecar SHALL fail clearly when runtime configuration selects an unsupported or unavailable STT backend.

#### Scenario: Invalid backend selection fails startup
- **WHEN** the configured STT backend is unknown or cannot be initialized
- **THEN** service startup fails with a clear configuration or readiness error

### Requirement: No implicit backend fallback occurs in the MVP
The sidecar SHALL not switch silently to another STT backend when the configured backend fails readiness or transcription in the MVP.

#### Scenario: Backend failure does not trigger hidden fallback
- **WHEN** the configured STT backend fails readiness or transcription
- **THEN** the sidecar surfaces the failure explicitly without silently selecting a different backend

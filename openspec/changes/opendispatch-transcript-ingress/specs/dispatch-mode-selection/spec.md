## ADDED Requirements

### Requirement: Dispatch mode selection is explicit
The sidecar SHALL select its transcript delivery path from explicit runtime configuration rather than hidden fallback behavior.

#### Scenario: Open Dispatch mode is selected intentionally
- **WHEN** runtime configuration chooses the Open Dispatch HTTP dispatch mode
- **THEN** the sidecar initializes the Open Dispatch HTTP adapter for transcript delivery
- **AND** it does not silently switch to Slack repost delivery during that run

#### Scenario: Slack repost fallback remains available explicitly
- **WHEN** runtime configuration chooses the Slack repost dispatch mode
- **THEN** the sidecar uses the existing Slack repost adapter
- **AND** no Open Dispatch HTTP delivery is attempted for that run

### Requirement: Dispatch mode startup fails clearly when required config is missing
The sidecar SHALL fail startup clearly when the selected dispatch mode does not have the configuration required to initialize its adapter.

#### Scenario: HTTP dispatch mode is misconfigured
- **WHEN** the sidecar is configured for Open Dispatch HTTP ingress but the required endpoint configuration is missing or malformed
- **THEN** startup fails with a clear configuration error instead of degrading into another dispatch mode automatically

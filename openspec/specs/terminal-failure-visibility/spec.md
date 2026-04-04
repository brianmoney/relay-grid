## Purpose

Define how terminal processing failures remain visible through persisted state, logs, and optional Slack notices.

## Requirements

### Requirement: Terminal failures are persisted and logged clearly
The sidecar SHALL persist terminal failures and emit structured logs that identify the failed processing unit and failure details.

#### Scenario: Terminal failure is visible in persisted state and logs
- **WHEN** a processing unit reaches a terminal failure condition
- **THEN** the sidecar records the failure in persisted state and emits a structured log with the relevant source, conversation, dedupe, and error context

### Requirement: Terminal failures can emit optional Slack notices
The sidecar SHALL support optional Slack-facing failure notices for terminal failures when that behavior is configured.

#### Scenario: Configured terminal failure notice is sent
- **WHEN** a terminal failure occurs and Slack failure notices are enabled
- **THEN** the sidecar emits the configured Slack-facing operator notice for that failure

### Requirement: Failure visibility does not depend only on transient logs
The sidecar SHALL not rely only on transient process logs to understand terminal failures.

#### Scenario: Failure can be inspected after process restart
- **WHEN** an operator inspects a previously failed processing unit after a restart
- **THEN** persisted state still identifies the terminal failure and its last known details

## ADDED Requirements

### Requirement: Slack messages map to normalized conversation identity
The Slack source adapter SHALL map Slack workspace, channel, and thread identifiers into the normalized conversation identity used by downstream routing.

#### Scenario: Thread reply maps to thread-scoped conversation identity
- **WHEN** a Slack audio-bearing message is posted as a reply in a thread
- **THEN** the normalized conversation identity uses the thread identifier as the stable thread context for downstream processing

#### Scenario: Top-level message maps to message-scoped conversation identity
- **WHEN** a Slack audio-bearing message is posted as a top-level channel message
- **THEN** the normalized conversation identity uses the top-level message timestamp as the thread context for downstream processing

### Requirement: Slack messages map to normalized source identity
The Slack source adapter SHALL map Slack workspace, message, and file identifiers into the normalized source identity for the inbound processing unit.

#### Scenario: Slack source identity captures provider identifiers
- **WHEN** the adapter normalizes an ingestible Slack audio message
- **THEN** the normalized source identity includes the Slack scope and the provider identifiers needed to trace the original message and file

### Requirement: Slack messages map to normalized dedupe identity
The Slack source adapter SHALL derive normalized dedupe identity values from Slack identifiers so the shared dedupe-key helper can produce a stable duplicate-suppression key.

#### Scenario: Same Slack file event maps to the same dedupe identity
- **WHEN** the adapter normalizes the same logical Slack audio event more than once
- **THEN** it derives the same normalized dedupe identity values each time

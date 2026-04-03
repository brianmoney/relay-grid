## ADDED Requirements

### Requirement: Slack ingest ignores sidecar-authored repost messages
The Slack source adapter SHALL ignore Slack messages that the sidecar can positively identify as its own reposted output.

#### Scenario: Sidecar repost is filtered before normalization
- **WHEN** the Slack app receives a message event authored by the sidecar bot or marked as a sidecar repost
- **THEN** the adapter does not emit a normalized source event for that message

### Requirement: Loop filtering does not block valid user audio posts
The Slack source adapter SHALL base repost-loop filtering on explicit source identification rather than broad text matching so valid user messages are not suppressed accidentally.

#### Scenario: User audio message is not filtered by repost protection
- **WHEN** a user posts a supported audio-bearing Slack message in an allowlisted channel or thread
- **THEN** repost-loop filtering does not block the message unless it matches the explicit sidecar-originated filtering rules

### Requirement: Loop filtering happens before downstream processing
The Slack source adapter SHALL apply self-message and repost-loop filtering before emitting normalized source events or downloading audio.

#### Scenario: Loop candidate does not consume downstream work
- **WHEN** a Slack message event matches the explicit loop-filtering rules
- **THEN** the adapter ignores it before normalization output or audio download begins

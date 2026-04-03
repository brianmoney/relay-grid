## ADDED Requirements

### Requirement: Slack ingest uses Socket Mode intake
The sidecar SHALL receive Slack message events for the MVP source path through a dedicated Slack app operating in Socket Mode.

#### Scenario: Slack event is received through Socket Mode
- **WHEN** the Slack app delivers a supported message event to the sidecar
- **THEN** the Slack source adapter receives the event through the Socket Mode ingest path

### Requirement: Slack ingest filters by allowlisted channels
The Slack source adapter SHALL ignore message events outside configured allowlisted channels.

#### Scenario: Message outside allowlist is ignored
- **WHEN** a Slack message event arrives for a channel that is not in the configured allowlist
- **THEN** the adapter does not emit a normalized source event for that message

### Requirement: Slack ingest detects supported audio-bearing messages
The Slack source adapter SHALL detect Slack messages that carry supported audio or voice-file attachments and ignore messages that do not provide ingestible audio.

#### Scenario: Audio-bearing Slack message is accepted
- **WHEN** a Slack message event includes a supported audio or voice attachment
- **THEN** the adapter recognizes the message as ingestible and continues the fetch flow

#### Scenario: Non-audio Slack message is ignored
- **WHEN** a Slack message event does not include a supported audio or voice attachment
- **THEN** the adapter does not emit a normalized source event for that message

### Requirement: Slack file metadata is resolved before download when needed
The Slack source adapter SHALL resolve file metadata before download when the message event payload does not contain enough information to fetch a supported audio file directly.

#### Scenario: Incomplete file payload triggers metadata resolution
- **WHEN** a Slack message event references an audio file but omits required download metadata
- **THEN** the adapter resolves the file metadata through Slack before attempting download

### Requirement: Slack audio download uses authenticated file access
The Slack source adapter SHALL download supported audio files using Slack-authenticated access and return a normalized fetched-audio object.

#### Scenario: Authenticated Slack file download succeeds
- **WHEN** the adapter has a supported Slack audio file with sufficient metadata
- **THEN** it downloads the file using Slack-authenticated access and returns normalized fetched-audio data for downstream processing

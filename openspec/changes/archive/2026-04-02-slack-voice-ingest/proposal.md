## Why

The sidecar now has a service foundation and normalized source contracts, but it still cannot ingest any real events. Implementing Slack voice ingest next creates the first concrete source path and exercises the adapter boundary, key rules, and processing flow with the MVP's primary source system.

## What Changes

- Add a Slack source adapter that listens for message events in Socket Mode and filters them to allowlisted channels.
- Detect Slack messages that carry supported audio or voice-file attachments and ignore messages that do not contain ingestible audio.
- Resolve Slack file metadata when event payloads are incomplete, including Slack Connect edge cases.
- Download audio files with Slack-authenticated access and convert Slack-native payloads into the normalized event and fetched-audio contracts already defined in the repo.
- Add Slack-specific filtering so sidecar-authored repost messages and other self-generated events do not re-enter the ingest path.
- Extend docs and configuration guidance for Slack app credentials, allowlists, and ingest behavior.

## Capabilities

### New Capabilities
- `slack-source-ingest`: Slack Socket Mode event intake, allowlist filtering, audio attachment detection, metadata resolution, and authenticated audio download.
- `slack-thread-mapping`: Slack thread and channel identity mapping into normalized conversation and dedupe identities for downstream processing.
- `slack-repost-loop-filtering`: Slack-specific self-message and repost-loop filtering so sidecar-originated transcript reposts do not trigger duplicate ingest.

### Modified Capabilities
- None.

## Impact

- Affected code: Slack-specific adapter and service modules under `src/adapters/source/`, `src/services/`, and related config/types updates.
- Affected docs: `README.md`, `docs/architecture.md`, and `.env.example` for Slack credentials and allowlist configuration.
- Dependencies: Slack SDK packages and any narrow HTTP/file utilities needed for metadata resolution and download.
- Systems: Slack app configuration, Socket Mode event delivery, authenticated file access, and downstream normalized event generation.

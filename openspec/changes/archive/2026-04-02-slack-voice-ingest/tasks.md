## 1. Slack Runtime Setup

- [x] 1.1 Add Slack configuration fields and validation for bot credentials, app credentials, and allowlisted channels
- [x] 1.2 Add the Slack adapter and supporting service module structure without leaking Slack SDK types into core pipeline code
- [x] 1.3 Wire the Slack source adapter into the service lifecycle so Socket Mode intake can start from the existing bootstrap seam

## 2. Event Intake And Filtering

- [x] 2.1 Implement Slack Socket Mode message-event intake for the MVP source path
- [x] 2.2 Add allowlisted channel filtering so non-allowlisted messages are ignored
- [x] 2.3 Detect supported audio-bearing Slack messages and ignore messages without ingestible audio
- [x] 2.4 Add explicit self-message and repost-loop filtering before normalization or download begins

## 3. Slack File Resolution And Download

- [x] 3.1 Implement Slack file selection and metadata-resolution logic for incomplete event payloads
- [x] 3.2 Implement authenticated Slack audio download for supported file types
- [x] 3.3 Return normalized fetched-audio data from the Slack adapter using the shared source contracts

## 4. Identity Mapping

- [x] 4.1 Map Slack workspace, channel, message, and file identifiers into normalized source identity
- [x] 4.2 Map Slack thread context into normalized conversation identity, using thread timestamp when present and message timestamp for top-level posts
- [x] 4.3 Derive normalized dedupe identity from Slack identifiers so the shared dedupe-key helpers stay stable across retries

## 5. Documentation And Verification

- [x] 5.1 Update `.env.example`, `README.md`, and architecture guidance for Slack configuration and ingest behavior
- [x] 5.2 Add tests for allowlist filtering, audio detection, metadata resolution paths, thread mapping, and repost-loop filtering
- [x] 5.3 Run project verification and confirm the Slack ingest path compiles cleanly with the new configuration and adapter code

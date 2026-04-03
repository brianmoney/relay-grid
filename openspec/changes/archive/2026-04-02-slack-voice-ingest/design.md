## Context

The sidecar now has a bootstrap runtime plus normalized source contracts, identifiers, and processing-state types, but there is still no concrete source implementation. The MVP proposal makes Slack the first real source and expects the sidecar to detect voice or audio-bearing Slack messages, resolve any missing file metadata, download the audio with authenticated access, and map Slack thread context into normalized conversation and dedupe identities.

This change must keep Slack-native payload handling inside the Slack adapter boundary. It should exercise the generic `SourceAdapter` contract without leaking Slack SDK payload types into the core pipeline, dispatch, or STT layers.

## Goals / Non-Goals

**Goals:**
- Add a Slack source adapter that can receive Socket Mode events for the MVP allowlisted channel scope.
- Detect messages that contain supported audio or voice attachments and ignore non-audio messages.
- Resolve full Slack file metadata before download when event payloads are incomplete.
- Download audio content with Slack-authenticated access and return normalized fetched-audio objects.
- Map Slack workspace, channel, thread, message, and file identifiers into the normalized source, conversation, and dedupe identities already defined in the codebase.
- Filter self-authored or reposted Slack messages so the sidecar does not ingest its own transcript reposts.

**Non-Goals:**
- Implement audio normalization, transcription, or dispatch delivery.
- Support multiple source providers beyond Slack.
- Add a persistence backend for dedupe or retries.
- Implement broad Slack message handling outside supported audio-bearing messages in allowlisted channels.

## Decisions

### Use Socket Mode as the MVP event transport
Slack event intake will use a dedicated Slack app in Socket Mode, matching the MVP proposal. This avoids public HTTP ingress setup for the first source path and keeps the service runtime self-contained.

Alternative considered: Events API via public webhook endpoint. Rejected because Socket Mode is already the planned MVP path and removes the need for external ingress during early development.

### Keep Slack-native parsing inside the source adapter and helper services
The Slack adapter should own event shape inspection, file selection, Slack Connect metadata resolution, and download URL handling. The rest of the service should only receive normalized contracts.

Alternative considered: expose selected Slack payload fragments to the pipeline for convenience. Rejected because it weakens the adapter boundary and would couple future pipeline code to Slack-specific fields.

### Separate message detection from file resolution and download
The ingest path should move through explicit stages: determine whether a Slack event is a supported audio-bearing message, resolve a usable file record, then download the file. This keeps edge cases isolated and makes failure handling easier to reason about.

Alternative considered: combine detection, metadata lookup, and download into one large adapter method. Rejected because Slack payload variability and Slack Connect edge cases benefit from smaller, testable seams.

### Derive normalized identities directly from Slack thread and file identifiers
The adapter should map Slack workspace/channel/thread/message/file IDs into the normalized `SourceIdentity`, `ConversationIdentity`, and `DedupeIdentity` contracts using the shared identifier helpers. Thread continuity should prefer `thread_ts` when present and fall back to the message timestamp for top-level posts.

Alternative considered: defer thread and dedupe mapping to downstream pipeline code. Rejected because identity mapping is source-specific and belongs at the adapter boundary.

### Add explicit self-message and repost-loop filtering
The Slack ingest path should ignore messages authored by the sidecar's bot user and any reposted transcript messages that the sidecar can positively identify as its own output. The filtering rules should be explicit and testable.

Alternative considered: rely only on later dedupe or persistence layers to suppress loops. Rejected because the first safe repost-based demo needs loop protection before persistence hardening lands.

## Risks / Trade-offs

- [Slack event payloads may omit full file details] -> Add a metadata-resolution seam that can call Slack file APIs before download when needed.
- [Slack Connect and shared-channel behavior can vary] -> Keep all metadata repair logic in the Slack adapter and cover it with targeted tests and fixtures.
- [Loop filtering could suppress valid user messages if too broad] -> Base filtering on explicit bot identity and clearly tagged repost characteristics instead of loose text heuristics.
- [Slack SDK choices may shape later adapter internals] -> Keep SDK usage behind Slack-specific services and keep normalized types free of SDK types.

## Migration Plan

1. Add Slack configuration fields and the Slack adapter/service module structure.
2. Implement allowlist filtering and audio-bearing message detection.
3. Implement metadata resolution and authenticated file download for supported audio files.
4. Map Slack identifiers into normalized source, conversation, and dedupe identities.
5. Add self-message and repost-loop filtering.
6. Add tests and docs for the Slack ingest path and configuration.

Rollback is low risk because Slack is the first source adapter. If the design needs refinement, it can be revised before other providers or downstream ingest stages depend on it.

## Open Questions

- Which Slack SDK surface best fits the service boundary: direct Bolt usage, lower-level Web API clients, or a narrow wrapper over both?
- How should the adapter recognize reposted transcript messages most safely: bot user ID, message metadata, a text marker, or a combination?
- Which Slack file types and MIME types count as supported audio in the MVP, especially for voice clips versus generic uploaded files?

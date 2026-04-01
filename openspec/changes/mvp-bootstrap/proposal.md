# OpenCode + Open Dispatch + Slack Voice Ingress MVP Plan

## 1. Purpose

Build an MVP that allows a Slack voice message posted in a designated Slack channel or thread to be:

1. detected by a sidecar service,
2. fetched and normalized as audio,
3. transcribed by a pluggable speech-to-text (STT) layer,
4. delivered to Open Dispatch as plain text,
5. routed to an OpenCode session using existing Open Dispatch text handling, and
6. answered back in Slack using the existing Open Dispatch response path.

This MVP is intentionally designed so that **audio ingestion is external to Open Dispatch** and **text routing remains inside Open Dispatch**.

---

## 2. Goals

### Primary goals

- Support Slack voice/audio messages in one allowlisted Slack channel.
- Keep Open Dispatch as intact as possible.
- Avoid coupling STT logic to Slack-specific code.
- Create clean interfaces so future source adapters can support Discord, Telegram, Twilio, email voicemail, or uploaded web audio.
- Support local STT first.
- Maintain thread/session continuity by mapping one Slack thread to one Open Dispatch/OpenCode conversation path.

### Non-goals for MVP

- Full multi-channel support.
- Diarization, speaker identification, or advanced audio analytics.
- Rich transcript editing UI.
- Human review queue.
- Production-grade horizontal scaling.
- Full Open Dispatch plugin framework changes.

---

## 3. Architecture Summary

### Core principle

Split the system into two layers:

- **Voice ingress sidecar**: owns source-specific event handling, audio fetch, normalization, STT, dedupe, minimal processing state, repost-loop protection, and transcript delivery.
- **Open Dispatch + OpenCode**: owns existing text routing, session handling, and model replies.

### MVP architecture

```text
Slack voice message
  -> Slack Source Adapter
  -> Audio Ingress Sidecar
      -> fetch file metadata
      -> download audio
      -> normalize audio
      -> transcribe via STT adapter
      -> dedupe / track state
      -> deliver transcript text
  -> Open Dispatch
      -> existing Slack/OpenCode routing
  -> OpenCode
  -> Open Dispatch reply
  -> Slack thread reply
```

### Delivery modes

The MVP should support two transcript delivery modes:

1. **Preferred mode: Open Dispatch ingress endpoint**  
   The sidecar delivers transcript text to a small local HTTP endpoint exposed by Open Dispatch.

2. **Fallback mode: Slack repost**  
   The sidecar posts the transcript as a normal text message in the same Slack thread so Open Dispatch handles it as standard text.

The MVP may begin with fallback mode if it reduces time to first working demo, but the first repost-based demo must still include minimal duplicate suppression and repost-loop protection. The plan should treat the ingress endpoint as the target state, while recognizing that the Open Dispatch ingress endpoint may need to ship as a linked change in a separate repository.

---

## 4. Why this architecture

This design is chosen because:

- Open Dispatch already handles chat routing and is a natural text-router layer.
- OpenCode already exposes a server and SDK for programmatic integration.
- Current OpenCode plugin capabilities are not the ideal boundary for external channel voice ingestion.
- Slack audio/file handling has platform-specific edge cases that should remain outside Open Dispatch core.
- A sidecar plus adapters gives a cleaner future path to support additional channels without rewriting the STT core.

---

## 5. MVP Scope

### In scope

- One self-hosted sidecar service.
- One Slack workspace.
- One allowlisted Slack channel.
- Thread-aware transcript delivery.
- One or more pluggable STT backends behind a common interface.
- Local audio normalization.
- Transcript dedupe and retry protection, with a minimal early slice required for the first safe repost-based demo.
- Transcript handoff to Open Dispatch.
- Basic observability via structured logs.

### Out of scope

- Video transcription.
- Channel-wide historical backfill.
- Translation to multiple languages.
- Editing or summarizing transcripts before dispatch.
- Dashboard UI.
- Multi-tenant architecture.

---

## 6. Functional Requirements

### FR-1 Slack message detection
The system shall listen for Slack message events in allowlisted channels and detect messages that include audio or voice-file attachments.

### FR-2 File metadata resolution
The system shall resolve file metadata when Slack returns incomplete file data, including Slack Connect cases.

### FR-3 Audio download
The system shall download the audio payload using authenticated Slack file access.

### FR-4 Audio normalization
The system shall normalize audio into a transcription-friendly format before STT execution.

### FR-5 Transcription
The system shall pass normalized audio to an STT adapter and receive transcript text.

### FR-6 Transcript delivery
The system shall deliver transcript text into the existing Open Dispatch/OpenCode flow.

### FR-7 Thread continuity
The system shall preserve the originating Slack thread context.

### FR-8 Deduplication
The system shall avoid double-processing the same audio file/event.

### FR-9 Failure handling
The system shall log failures and optionally post a short error notice to Slack only when configured.

### FR-10 Extensibility
The system shall define clear interfaces for source adapters, STT adapters, and dispatch adapters.

---

## 7. Non-Functional Requirements

- **Modular**: source, STT, and dispatch concerns must be isolated.
- **Local-first**: default STT path should support local execution.
- **Observable**: all major steps should emit structured logs.
- **Safe**: secrets must remain in environment variables or secret storage.
- **Deterministic**: transcript processing must be idempotent per file/event.
- **Configurable**: channel allowlist, STT backend, and delivery mode must be configurable.

---

## 8. Proposed Repository Structure

```text
voice-ingress/
  README.md
  AGENTS.md
  package.json
  tsconfig.json
  .env.example
  src/
    app.ts
    config/
      env.ts
    adapters/
      source/
        base.ts
        slack.ts
      stt/
        base.ts
        faster-whisper.ts
        whispercpp.ts
      dispatch/
        base.ts
        opendispatch-http.ts
        slack-repost.ts
    pipeline/
      process-event.ts
      normalize-audio.ts
      dedupe.ts
      policy.ts
    services/
      slack-client.ts
      file-download.ts
      audio.ts
    store/
      memory.ts
      redis.ts
    types/
      events.ts
      transcript.ts
    util/
      logger.ts
      ids.ts
      retry.ts
  docs/
    architecture.md
    api.md
    runbook.md
```

If implementation happens inside an OpenCode project root, this repo may also include:

```text
.opencode/
opencode.json
```

---

## 9. Interface Contracts

### 9.1 Source adapter

```ts
export interface SourceAdapter {
  canHandle(event: unknown): boolean
  fetchAudio(event: unknown): Promise<{
    source: string
    sourceId: string
    conversationId: string
    userId?: string
    localPath: string
    mimeType?: string
    metadata?: Record<string, unknown>
  }>
}
```

### 9.2 STT adapter

```ts
export interface STTAdapter {
  transcribe(input: {
    localPath: string
    mimeType?: string
    language?: string
  }): Promise<{
    text: string
    segments?: Array<{ start: number; end: number; text: string }>
    confidence?: number
  }>
}
```

### 9.3 Dispatch adapter

```ts
export interface DispatchAdapter {
  deliverTranscript(input: {
    source: string
    conversationId: string
    sourceId: string
    userId?: string
    text: string
    metadata?: Record<string, unknown>
  }): Promise<void>
}
```

---

## 10. Slack-Specific MVP Design

### Event source
Use a dedicated Slack app in Socket Mode.

### Initial supported events
- channel message events for one allowlisted channel
- thread replies in the same allowlisted channel

### Initial required capabilities
- detect audio attachments in message payloads
- resolve file metadata when needed
- download the file with authentication
- map Slack thread identifiers to dispatch conversation identifiers

### Slack-specific processing notes
- treat file handling as Slack-specific logic inside the Slack source adapter
- isolate Slack event parsing from the rest of the pipeline
- treat Slack Connect file resolution as adapter responsibility

---

## 11. Audio Processing Design

### Step 1: validation
- confirm the file looks like supported audio
- reject unsupported file types early

### Step 2: normalization
Normalize audio to a predictable input shape, such as mono 16 kHz WAV, before transcription.

### Step 3: transcription
Pass normalized audio to the selected STT adapter.

### Step 4: cleanup
Delete temporary files after success or after terminal failure unless debug retention is enabled.

---

## 12. STT Strategy

### Default MVP backend
- local Faster-Whisper backend

### Optional MVP backend
- Whisper.cpp backend

### STT backend rules
- all STT implementations must conform to the same `STTAdapter` interface
- sidecar business logic must not depend on a specific backend
- backend selection must be config-driven

---

## 13. Dispatch Strategy

### Preferred target state
Add a minimal ingress endpoint to Open Dispatch, for example:

`POST /ingest/transcript`

Example payload:

```json
{
  "source": "slack",
  "conversationId": "T123:C456:1712345678.1234",
  "sourceId": "F999",
  "userId": "U123",
  "text": "Please summarize the last build failure.",
  "metadata": {
    "origin": "voice",
    "threadTs": "1712345678.1234",
    "confidence": 0.93
  }
}
```

### Fallback mode
If the ingress endpoint is not yet implemented, use a dispatch adapter that reposts the transcript to Slack as plain text in the original thread. For this repository, the repost adapter is the initial required delivery path because it enables the first end-to-end demo without assuming ownership of Open Dispatch server changes.

### Cross-repo boundary
If Open Dispatch is maintained in a separate repository, the HTTP ingest endpoint should be tracked as a linked OpenSpec change there rather than bundled into the sidecar implementation by default. This proposal treats the sidecar HTTP dispatch adapter and the Open Dispatch ingest endpoint as related but separable change surfaces.

### Rule
The sidecar must not call OpenCode directly in the MVP if Open Dispatch is present in the stack. Open Dispatch remains the routing layer.

---

## 14. Data Model

### Processing key
Use a deterministic dedupe key such as:

`workspace_id:channel_id:thread_ts:file_id`

### Transcript envelope

```ts
export type TranscriptEnvelope = {
  source: string
  sourceId: string
  conversationId: string
  userId?: string
  text: string
  metadata?: Record<string, unknown>
}
```

### Processing state
Track:
- received
- downloading
- downloaded
- transcribing
- transcribed
- delivered
- failed

---

## 15. Configuration

### Required environment variables

```bash
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_ALLOWED_CHANNELS=

DISPATCH_MODE=http   # http | slack-repost
OPENDISPATCH_BASE_URL=
OPENDISPATCH_API_KEY=

STT_BACKEND=faster-whisper
STT_LANGUAGE=en

TEMP_DIR=.tmp
LOG_LEVEL=info
REDIS_URL=
```

### Optional configuration
- debug transcript retention
- maximum audio size
- maximum duration
- per-channel enable/disable flags
- Slack error posting enable/disable

---

## 16. OpenCode Project Initialization Guidance

The implementation project should include an `AGENTS.md` and an `opencode.json` tuned for a TypeScript service repository.

### Recommended `AGENTS.md` guidance
Include project instructions such as:
- preserve adapter boundaries
- avoid coupling Slack parsing to STT logic
- prefer interface-first design
- write tests for each adapter independently
- do not introduce provider-specific logic into pipeline core

### Recommended `opencode.json` goals
- include instruction files like `AGENTS.md` and `docs/**/*.md`
- enable approval for dangerous shell commands if desired
- ignore noisy directories like `node_modules`, `dist`, and temp audio directories
- optionally configure MCP servers used for development support

---

## 17. Milestones

### Milestone 0: Project bootstrap
Deliverables:
- repo initialized
- TypeScript toolchain configured
- `.env.example` created
- base interfaces defined
- structured logger in place
- basic README and architecture doc created

### Milestone 1: Slack source adapter
Deliverables:
- Socket Mode Slack app wired
- allowlisted channel filtering working
- audio/file detection working
- file metadata resolution implemented
- authenticated file download working
- sidecar-authored repost messages ignored to prevent transcript loops

### Milestone 2: STT pipeline
Deliverables:
- audio normalization utility implemented
- Faster-Whisper adapter working
- transcript returned for local test audio
- temp-file cleanup working

### Milestone 3: Delivery adapter
Deliverables:
- Slack repost adapter working
- transcript appears in original Slack thread
- Open Dispatch processes reposted transcript successfully
- minimal duplicate suppression in place for the first repost-based demo

### Milestone 4: Persistence and retries
Deliverables:
- deterministic dedupe key persisted across retries
- memory store or Redis-backed state working
- retries do not double-send transcripts
- failure states are visible and inspectable

### Milestone 5: Preferred ingress path
Deliverables:
- sidecar HTTP dispatch adapter implemented
- linked Open Dispatch ingest endpoint change tracked in the owning repo when applicable
- Slack repost fallback remains available behind config

### Milestone 6: Hardening
Deliverables:
- integration tests for happy path and key failures
- rate limiting and size guards
- operational runbook
- deployment notes

---

## 18. Planned Follow-on Changes

The `mvp-bootstrap` proposal is the umbrella change. Implementation should proceed through smaller follow-on changes that keep repository boundaries clear and move the first safe demo path forward early.

### Proposed sidecar follow-on changes

1. `bootstrap-sidecar-foundation`
   - TypeScript service scaffold
   - config and env loading
   - structured logger
   - README and architecture doc

2. `source-contracts-and-ids`
   - provider-agnostic event and transcript types
   - conversation key rules
   - dedupe key rules
   - processing state model

3. `slack-voice-ingest`
   - Socket Mode wiring
   - allowlisted channel filtering
   - audio attachment detection
   - file metadata resolution
   - authenticated download
   - self-message and repost-loop filtering

4. `audio-normalization-pipeline`
   - audio validation
   - normalization to stable STT input
   - temp-file cleanup
   - duration and size guards

5. `local-stt-adapter`
   - STT adapter contract
   - Faster-Whisper MVP backend
   - config-driven backend selection

6. `slack-repost-dispatch`
   - transcript repost delivery into the originating Slack thread
   - minimal duplicate suppression for the first end-to-end demo

7. `processing-state-and-retries`
   - persisted processing state
   - bounded retries
   - failure handling
   - optional Slack error notices

8. `opendispatch-transcript-ingress`
   - sidecar HTTP dispatch adapter
   - linked Open Dispatch ingest endpoint change when Open Dispatch lives in another repo

9. `mvp-test-harness-and-runbook`
   - fixture-driven unit and integration tests
   - duplicate replay coverage
   - repost and HTTP ingress mode validation
   - runbook and deployment notes

### Recommended implementation order

For the first working demo, prioritize:

`bootstrap-sidecar-foundation -> source-contracts-and-ids -> slack-voice-ingest -> audio-normalization-pipeline -> local-stt-adapter -> slack-repost-dispatch`

Minimal duplicate suppression and repost-loop protection should be included during `slack-voice-ingest` and `slack-repost-dispatch`, not deferred until later hardening.

## 19. Acceptance Criteria

The MVP is complete when all of the following are true:

1. A user posts a supported audio or voice message in the allowlisted Slack channel.
2. The sidecar detects it and downloads the file.
3. The sidecar normalizes and transcribes the audio.
4. The transcript is delivered into the existing Open Dispatch/OpenCode flow.
5. A model response appears in the same Slack thread.
6. Re-delivery or retry of the same event does not create duplicate transcript submissions.
7. Fallback repost mode does not create transcript repost loops.
8. Logs clearly show each major processing stage.
9. Switching STT backend does not require pipeline code changes outside adapter wiring.

---

## 20. Risks and Mitigations

### Risk: Slack file metadata inconsistency
**Mitigation:** keep all Slack-specific metadata resolution inside the Slack source adapter.

### Risk: duplicate event delivery
**Mitigation:** use deterministic dedupe keys and minimal early duplicate suppression in the first repost-based demo, then extend that into persisted processing state.

### Risk: transcript repost loops in fallback mode
**Mitigation:** tag or identify reposted messages and ensure the source adapter ignores sidecar-originated transcript posts before enabling the first Slack repost demo.

### Risk: STT latency on large files
**Mitigation:** impose duration and size limits in MVP.

### Risk: Open Dispatch integration churn
**Mitigation:** isolate dispatch behind a `DispatchAdapter` so HTTP ingress and Slack repost can coexist, and track the Open Dispatch ingress endpoint as a linked change in the owning repo when necessary.

---

## 21. Testing Strategy

### Unit tests
- Slack event parsing
- file selection logic
- dedupe key generation
- STT adapter contract behavior
- dispatch adapter payload generation

### Integration tests
- Slack audio event -> transcript -> dispatch handoff
- duplicate event replay handling
- fallback repost mode end-to-end
- preferred HTTP ingress mode end-to-end

### Manual validation
- post a short voice clip in the test channel
- confirm transcript post or ingest
- confirm Open Dispatch routes to OpenCode
- confirm response appears in thread

---

## 22. Deliverables

### Required deliverables
- working sidecar service
- Slack source adapter
- Faster-Whisper STT adapter
- one dispatch adapter using Slack repost
- deterministic dedupe key and minimal repost-loop protection for the first safe demo
- README with local setup instructions
- architecture doc
- runbook for common failures

### Linked or follow-on deliverables
- sidecar HTTP dispatch adapter for Open Dispatch ingest
- Open Dispatch ingest endpoint change in the owning repo when Open Dispatch is maintained separately

### Optional stretch deliverables
- Whisper.cpp adapter
- Redis-backed state store
- transcript confidence metadata
- metrics endpoint

---

## 23. Recommended First Tasks for OpenCode

1. Initialize a TypeScript Node project for the sidecar.
2. Create adapter interfaces, project folder structure, and key-generation rules.
3. Implement Slack Socket Mode event ingestion.
4. Implement audio file detection, metadata resolution, and authenticated download.
5. Add minimal dedupe and repost-loop filtering before enabling transcript reposts.
6. Implement audio normalization.
7. Implement a local Faster-Whisper adapter.
8. Implement transcript repost delivery into Slack threads.
9. Verify Open Dispatch consumes reposted transcripts correctly.
10. Add persisted state, bounded retries, and failure handling.
11. Add the preferred Open Dispatch HTTP ingress path as a linked or follow-on change.
12. Write integration tests and deployment notes.

---

## 24. Definition of Done

This MVP is done when a Slack voice message can reliably traverse the complete path from:

**Slack audio -> sidecar fetch -> normalization -> STT -> Open Dispatch -> OpenCode -> Slack reply**

with deterministic behavior, configuration-based backend selection, and a code structure that can support future source adapters without redesigning the pipeline.

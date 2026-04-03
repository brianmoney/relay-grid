# Sidecar architecture

## Purpose

The sidecar is the runtime shell for the relay-grid ingestion pipeline. This bootstrap change sets up the process boundary and the shared runtime concerns that later feature changes will extend.

## Service boundaries

- `src/adapters/source/`: provider-specific event ingestion and media download.
- `src/adapters/stt/`: speech-to-text backend integrations.
- `src/adapters/dispatch/`: transcript delivery into downstream routing systems.
- `src/adapters/agent/`: agent backend integration seams when dispatch needs a direct backend path.
- `src/pipeline/`: provider-agnostic orchestration across ingest, normalization, transcription, and dispatch.
- `src/store/`: persistence for dedupe keys, processing state, and retry bookkeeping.
- `src/types/`: shared provider-agnostic interfaces and payload shapes.
- `src/config/`: runtime configuration loading and validation.
- `src/utils/`: shared utilities such as structured logging.
- `src/services/`: service lifecycle composition and bootstrap-owned seams.

## Normalized event flow

Inbound provider payloads should be normalized as soon as they cross the source-adapter boundary.

1. A source adapter accepts a provider-native payload as `unknown`.
2. The adapter converts that payload into a `NormalizedSourceEvent`.
3. Core pipeline code only works with normalized event, fetched-audio, transcript, and processing-state contracts.
4. If audio is downloaded, downstream code receives a `NormalizedFetchedAudio` with normalized identity fields plus the local file path.
5. The normalization seam converts `NormalizedFetchedAudio` into canonical `NormalizedAudio` metadata plus a managed temp artifact path for downstream STT work.
6. The STT seam converts `NormalizedAudio` into a canonical `TranscriptEnvelope` while keeping backend-specific runtime details inside `src/adapters/stt/`.
7. The dispatch seam consumes `TranscriptEnvelope` objects and decides how to deliver transcript text without pulling provider-native event payloads back into the pipeline.

This keeps Slack-specific or future provider-specific payload shapes out of pipeline, retry, logging, and dispatch code.

## Identity model

The sidecar treats source identity, conversation identity, and dedupe identity as different responsibilities:

- source identity identifies the provider event or file that entered the system
- conversation identity identifies the logical thread or session used for downstream routing
- dedupe identity identifies one logical processing unit for duplicate suppression

Shared helpers in `src/utils/ids.ts` derive stable `conversationKey` and `dedupeKey` values from normalized identity data. Adapters, stores, and logs should use those helpers instead of building local string formats.

## Processing state

Processing state is a store-agnostic lifecycle tied back to normalized identifiers. Each processing record should carry:

- `source`
- `conversationKey`
- `dedupeKey`
- `status`

Example progression:

1. A normalized source event is created for a provider message.
2. `buildConversationKey(...)` produces the stable routing identity for the message thread.
3. `buildDedupeKey(...)` produces the stable duplicate-suppression identity for the logical processing unit.
4. Processing state advances from `received` to later statuses such as `audio_fetched`, `transcribed`, or `failed` while keeping the same conversation and dedupe keys.

Runtime persistence extends that lifecycle with attempt counters, stage timestamps, completion metadata, and terminal failure details while keeping the core processing-state contract provider-agnostic.

## Bootstrap seam

The application entrypoint is intentionally narrow:

1. `src/index.ts` owns process startup, signal handling, and fatal error reporting.
2. `src/app.ts` composes config, logger, and the service lifecycle.
3. `src/services/service.ts` is the current extension point for future adapter and pipeline registration.

Follow-on changes should plug new capabilities into `src/services/service.ts` and adjacent modules instead of rewriting the entrypoint.

## STT seam

The first transcription path is intentionally narrow and explicit:

- `src/adapters/stt/base.ts` defines the shared `STTAdapter` contract and canonical transcript-envelope mapping.
- `src/adapters/stt/faster-whisper.ts` owns the MVP local Faster-Whisper runtime integration.
- `src/config/index.ts` selects the active backend and validates Faster-Whisper settings at startup.
- `src/services/service.ts` validates STT readiness during startup, performs transcription after normalization, and hands `TranscriptEnvelope` objects to the next provider-agnostic seam.

The MVP does not introduce hidden fallback across STT backends. Unsupported backend selection and unavailable runtime dependencies fail startup clearly.

## Dispatch seam

The first dispatch path is an explicit Slack fallback adapter:

- `src/adapters/dispatch/base.ts` defines the narrow transcript-delivery contract used by the service seam.
- `src/adapters/dispatch/slack/adapter.ts` maps normalized conversation identity into Slack channel and thread targets, formats transcript-first repost text, and emits structured repost logs.
- `src/adapters/dispatch/slack/api.ts` owns the Slack Web API seam for thread-targeted `chat.postMessage` calls.
- `src/services/service.ts` keeps transcript delivery behind the dispatch adapter boundary after STT completes and records dispatch completion in persisted state.

The MVP repost path now relies on persisted processing state keyed by the shared normalized dedupe key. Duplicate suppression and dispatch completion survive restarts because the orchestration layer skips terminal processing units before dispatch is attempted again.

## Retry and failure policy

- `src/services/service.ts` owns bounded retries so provider-specific adapters do not hide retry behavior.
- Retry classification follows explicit `retryable` metadata from canonical error types when available.
- Retryable failures increment the persisted attempt counter until `PROCESSING_MAX_RETRY_ATTEMPTS` is exhausted.
- Exhausted or non-retryable failures persist a terminal `failed` state with the latest error code, message, and retryability context.
- Structured logs for terminal failure include `source`, `conversationKey`, `dedupeKey`, `stage`, and error fields.
- Optional Slack-facing terminal failure notices stay behind config and do not replace persisted state as the source of truth.

## Logging contract

The shared logger emits structured JSON and supports contextual fields needed by future processing stages:

- `source`
- `conversationKey`
- `dedupeKey`
- `stage`

Modules should add context through child loggers so those fields stay consistent from ingestion through dispatch.

## Configuration contract

Runtime configuration is loaded once in `src/config/index.ts`. The rest of the application receives typed configuration objects instead of reading environment variables directly. This keeps validation centralized and makes startup failures clear and early.

## Current scope

The current source implementation is Slack-only and follows a narrow boundary:

- `src/adapters/source/slack/service.ts` owns Socket Mode lifecycle and event acknowledgement.
- `src/adapters/source/slack/adapter.ts` owns Slack message filtering, audio detection, metadata resolution, and normalized identity mapping.
- `src/adapters/source/slack/api.ts` owns Slack Web API and authenticated file-download calls.
- `src/pipeline/audio-normalization.ts` owns provider-agnostic media validation, probing, deterministic ffmpeg conversion, and normalized artifact cleanup semantics.
- `src/adapters/stt/faster-whisper.ts` owns local transcription and maps backend output into canonical transcript fields.
- `src/services/service.ts` consumes normalized source events, performs fetch/normalize/transcribe/dispatch with persisted state transitions, and hands canonical transcript envelopes to the dispatch layer.

Slack-specific logic remains inside the Slack source and Slack dispatch modules. Retry policy, state durability, and duplicate suppression now live in provider-agnostic orchestration and store layers so later sources or dispatch paths can reuse the same behavior.

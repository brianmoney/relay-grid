# relay-grid sidecar

This repository bootstraps the sidecar service that ingests audio-bearing events, normalizes media, transcribes audio, and dispatches transcript text into an agent backend. The current MVP includes the first concrete source path: Slack Socket Mode intake for allowlisted channels, audio attachment detection, file metadata resolution, authenticated audio download, normalized identity mapping into the provider-agnostic contracts used by the rest of the sidecar, plus explicit dispatch delivery through either Slack repost fallback or a linked Open Dispatch HTTP ingress endpoint.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- Python 3 with the `faster-whisper` package installed in the selected interpreter
- `ffmpeg` and `ffprobe` available on `PATH`

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Install Faster-Whisper into the Python runtime you plan to use, for example `python3 -m pip install faster-whisper`.
4. Verify `ffmpeg -version`, `ffprobe -version`, and `${STT_FASTER_WHISPER_PYTHON_PATH:-python3} -c "import faster_whisper"` succeed on your machine.
5. Update the environment values for your local machine.
6. Start the service with `npm run dev`.

## Required environment variables

- `SIDECAR_SERVICE_NAME`: logical service name emitted in logs.
- `NODE_ENV`: runtime environment. Allowed values are `development`, `test`, or `production`.
- `SIDECAR_LOG_LEVEL`: structured log level. Allowed values are `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`.
- `DISPATCH_MODE`: transcript delivery mode. Allowed values are `slack-repost` or `opendispatch-http`.
- `OPENDISPATCH_HTTP_BASE_URL`: required absolute base URL when `DISPATCH_MODE=opendispatch-http`.
- `OPENDISPATCH_HTTP_ENDPOINT_PATH`: ingress endpoint path joined onto `OPENDISPATCH_HTTP_BASE_URL`. Defaults to `/ingress/transcripts`.
- `OPENDISPATCH_HTTP_AUTH_TOKEN`: optional bearer token sent to the Open Dispatch ingress endpoint.
- `OPENDISPATCH_HTTP_TIMEOUT_MS`: request timeout for Open Dispatch HTTP ingress. Defaults to `10000`.
- `SLACK_BOT_TOKEN`: Slack bot token used for authenticated API calls and file download. Must start with `xoxb-`.
- `SLACK_APP_TOKEN`: Slack app-level Socket Mode token. Must start with `xapp-`.
- `SLACK_ALLOWLISTED_CHANNELS`: comma-separated Slack channel IDs the sidecar is allowed to ingest from.
- `SLACK_FAILURE_NOTICES_ENABLED`: when `true`, terminal processing failures post a concise operator-facing notice back into the originating Slack thread.
- `AUDIO_NORMALIZATION_FFMPEG_PATH`: path to the `ffmpeg` executable. Defaults to `ffmpeg`.
- `AUDIO_NORMALIZATION_FFPROBE_PATH`: path to the `ffprobe` executable. Defaults to `ffprobe`.
- `AUDIO_NORMALIZATION_TEMP_DIRECTORY`: base directory for managed normalized-audio temp artifacts. Defaults to `/tmp/relay-grid`.
- `AUDIO_NORMALIZATION_MAX_INPUT_BYTES`: maximum accepted fetched-audio size before normalization. Defaults to `26214400` (25 MiB).
- `AUDIO_NORMALIZATION_MAX_DURATION_MS`: maximum accepted fetched-audio duration. Defaults to `900000` (15 minutes).
- `STT_BACKEND`: active speech-to-text backend. The MVP supports `faster-whisper`.
- `STT_DEFAULT_LANGUAGE`: optional language hint passed to the active STT backend.
- `STT_FASTER_WHISPER_PYTHON_PATH`: Python interpreter used for Faster-Whisper commands. Defaults to `python3`.
- `STT_FASTER_WHISPER_MODEL`: Faster-Whisper model name loaded during startup and transcription. Defaults to `base`.
- `STT_FASTER_WHISPER_DEVICE`: Faster-Whisper device selection such as `cpu` or `cuda`. Defaults to `cpu`.
- `STT_FASTER_WHISPER_COMPUTE_TYPE`: Faster-Whisper compute type such as `int8` or `float16`. Defaults to `int8`.
- `STT_FASTER_WHISPER_BEAM_SIZE`: beam-search width used for transcription. Defaults to `5`.
- `PROCESSING_STATE_FILE_PATH`: file-backed processing-state and idempotency store. Defaults to `/tmp/relay-grid/processing-state.json`.
- `PROCESSING_MAX_RETRY_ATTEMPTS`: bounded attempt budget for retryable failures. Defaults to `3`.
- `PROCESSING_RETRY_BACKOFF_MS`: delay between retry attempts. Defaults to `0`.

Startup fails before any work begins if one of those values is missing or malformed.

## Audio normalization behavior

The provider-agnostic normalization seam lives in `src/pipeline/audio-normalization.ts` and runs after source download succeeds.

- Accepted fetched audio is validated before conversion using supported media, byte-size, and duration guardrails.
- The canonical output is deterministic mono `16 kHz` PCM WAV (`audio/wav`, `pcm_s16le`).
- Duration is probed with `ffprobe` before conversion so overlong inputs fail clearly.
- Normalized artifacts are written under `AUDIO_NORMALIZATION_TEMP_DIRECTORY` in managed temp directories.
- Failed normalization attempts clean up partial output directories on a best-effort basis.
- Successful artifacts expose an explicit cleanup plan and are currently removed by the service after downstream handling completes.
- Source-downloaded audio is also removed by the orchestration layer after each attempt so retries do not accumulate temp files.

## STT behavior

The provider-agnostic STT seam lives under `src/adapters/stt/` and runs immediately after audio normalization succeeds.

- Runtime configuration selects one explicit STT backend. The MVP does not silently fall back to another backend.
- Startup validates the configured Faster-Whisper runtime before Slack ingestion begins.
- Transcription returns canonical transcript text plus optional language, segments, and backend metadata.
- The service forwards a `TranscriptEnvelope` into the next provider-agnostic seam without coupling the pipeline to dispatch behavior.
- Structured STT logs include `source`, `conversationKey`, `dedupeKey`, and `stage` context while avoiding raw transcript text in logs.

## Dispatch behavior

The sidecar selects one explicit dispatch target at startup.

- `DISPATCH_MODE=slack-repost` keeps the existing Slack-only fallback that reposts transcript text into the originating Slack thread after STT succeeds.
- `DISPATCH_MODE=opendispatch-http` posts canonical transcript ingress payloads to a configured Open Dispatch HTTP endpoint.
- The sidecar never auto-falls back from `opendispatch-http` to `slack-repost` during a run. Switching modes is an explicit operator choice.

### Slack repost mode

- The dispatch adapter lives under `src/adapters/dispatch/slack/` and only receives canonical `TranscriptEnvelope` objects.
- Thread targeting comes from normalized conversation identity: `conversationId` maps to the Slack channel and `threadId` maps to the repost thread timestamp.
- Reposts carry explicit Slack message metadata using the event type `relay_grid.sidecar_repost` and a relay-grid marker payload so the Slack source adapter can ignore sidecar-authored reposts before download.
- Repost bodies stay transcript-first and concise rather than exposing backend-specific details in the user-facing thread.
- Duplicate repost suppression is now keyed from the persisted normalized dedupe key and survives process restarts.
- Structured dispatch logs include repost attempts, duplicate skips, repost success, and repost failure with stable `source`, `conversationKey`, `dedupeKey`, and `stage` fields.

### Open Dispatch HTTP mode

- The HTTP adapter lives under `src/adapters/dispatch/opendispatch/` and stays limited to payload mapping, HTTP transport, and explicit error surfacing.
- Request bodies include canonical `source`, `conversationKey`, `dedupeKey`, transcript text, and minimal identity metadata needed for downstream routing continuity.
- Request bodies intentionally exclude fetched-audio paths, normalization artifact paths, and other source-specific media-processing details.
- Transport failures, timeouts, `408`, `425`, `429`, and `5xx` responses surface as retryable failures to the existing orchestration policy.
- Contract-style failures such as `4xx` request errors surface as non-retryable failures and do not trigger hidden adapter-level retries.
- This repository only owns the sidecar HTTP client path. The receiving Open Dispatch endpoint may live in another repository and should be tracked as a linked dependency there.

## Processing state and retries

The service now persists canonical processing state under `src/store/` and drives retries from `src/services/service.ts`.

- Each processing unit is keyed by the shared normalized `conversationKey` and `dedupeKey`.
- Persisted records track the latest canonical stage, attempt count, timestamps, and terminal failure details.
- Duplicate replay after restart is suppressed once a unit reaches `completed`, `dispatched`, or `failed`.
- Retry classification stays explicit in orchestration code and follows the `retryable` metadata exposed by normalization, STT, and Open Dispatch HTTP adapter errors.
- Retryable failures stop automatically after `PROCESSING_MAX_RETRY_ATTEMPTS`, then persist a terminal `failed` state and emit a structured log.
- When `SLACK_FAILURE_NOTICES_ENABLED=true`, terminal failures also post a concise Slack notice into the originating thread.

## Slack ingest behavior

The Slack source path is intentionally narrow:

- Intake runs through Slack Socket Mode from `src/services/service.ts`.
- Only messages in `SLACK_ALLOWLISTED_CHANNELS` are considered.
- The adapter only accepts messages with supported audio-bearing file attachments.
- Slack-native payload parsing, file metadata repair, and authenticated file download stay inside `src/adapters/source/slack/`.
- Self-authored bot messages and reposts marked with the metadata event type `relay_grid.sidecar_repost` or the relay-grid repost marker payload are filtered before normalization or download.
- Top-level Slack posts map conversation thread identity from the message timestamp; thread replies map it from `thread_ts`.

## Startup flow

1. `src/index.ts` enters the process through a single bootstrap path.
2. `src/config/index.ts` loads environment variables and validates them into typed runtime config.
3. `src/utils/logger.ts` creates the shared structured logger for bootstrap and follow-on modules.
4. `src/app.ts` composes the runtime dependencies and starts the service.
5. `src/services/service.ts` starts the Slack source lifecycle, persists canonical processing state, runs fetch/normalize/transcribe/dispatch with explicit retries, and forwards transcripts into the configured dispatch seam.

The bootstrap keeps the process alive and only exits on `SIGINT` or `SIGTERM`, so later changes can add adapters and pipeline stages without rewriting the entrypoint.

## Development expectations

- Keep source adapters, STT adapters, dispatch adapters, and pipeline logic in separate layers.
- Add provider-agnostic types under `src/types`.
- Route all runtime configuration through `src/config` instead of reading `process.env` directly.
- Reuse the shared logger so logs keep stable context fields such as `source`, `conversationKey`, `dedupeKey`, and `stage`.
- Keep Slack SDK types and payload parsing inside `src/adapters/source/slack/`.
- Prefer deterministic local verification before adding live integrations.

## Commands

- `npm run dev`: start the sidecar directly from TypeScript.
- `npm run check`: run the TypeScript type check.
- `npm run build`: compile the service to `dist/`.
- `npm run start`: run the compiled service.

## Architecture notes

See `docs/architecture.md` for the service boundary and bootstrap seam details.

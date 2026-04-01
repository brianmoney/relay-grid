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

## Bootstrap seam

The application entrypoint is intentionally narrow:

1. `src/index.ts` owns process startup, signal handling, and fatal error reporting.
2. `src/app.ts` composes config, logger, and the service lifecycle.
3. `src/services/service.ts` is the current extension point for future adapter and pipeline registration.

Follow-on changes should plug new capabilities into `src/services/service.ts` and adjacent modules instead of rewriting the entrypoint.

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

This scaffold does not implement Slack ingestion, audio normalization, STT execution, dispatch delivery, retries, or persistence. Those behaviors should arrive as follow-on changes that extend the existing seams.

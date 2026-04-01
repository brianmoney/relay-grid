# relay-grid sidecar

This repository bootstraps the sidecar service that will ingest audio-bearing events, normalize media, transcribe audio, and dispatch transcript text into an agent backend. The current scaffold is intentionally narrow: it sets up runtime configuration, structured logging, service lifecycle wiring, and baseline docs without embedding any source-specific, STT-specific, or dispatch-specific behavior yet.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Update the environment values for your local machine.
4. Start the service with `npm run dev`.

## Required environment variables

- `SIDECAR_SERVICE_NAME`: logical service name emitted in logs.
- `NODE_ENV`: runtime environment. Allowed values are `development`, `test`, or `production`.
- `SIDECAR_LOG_LEVEL`: structured log level. Allowed values are `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`.

Startup fails before any work begins if one of those values is missing or malformed.

## Startup flow

1. `src/index.ts` enters the process through a single bootstrap path.
2. `src/config/index.ts` loads environment variables and validates them into typed runtime config.
3. `src/utils/logger.ts` creates the shared structured logger for bootstrap and follow-on modules.
4. `src/app.ts` composes the runtime dependencies and starts the baseline service.
5. `src/services/service.ts` holds the long-lived service lifecycle seam that future changes can extend with adapter registration.

The bootstrap keeps the process alive and only exits on `SIGINT` or `SIGTERM`, so later changes can add adapters and pipeline stages without rewriting the entrypoint.

## Development expectations

- Keep source adapters, STT adapters, dispatch adapters, and pipeline logic in separate layers.
- Add provider-agnostic types under `src/types`.
- Route all runtime configuration through `src/config` instead of reading `process.env` directly.
- Reuse the shared logger so logs keep stable context fields such as `source`, `conversationKey`, `dedupeKey`, and `stage`.
- Prefer deterministic local verification before adding live integrations.

## Commands

- `npm run dev`: start the sidecar directly from TypeScript.
- `npm run check`: run the TypeScript type check.
- `npm run build`: compile the service to `dist/`.
- `npm run start`: run the compiled service.

## Architecture notes

See `docs/architecture.md` for the service boundary and bootstrap seam details.

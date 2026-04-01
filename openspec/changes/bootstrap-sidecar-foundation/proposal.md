## Why

The project needs a consistent service foundation before source adapters, STT adapters, and dispatch integrations can be implemented safely. Building that foundation now creates the baseline runtime, configuration, logging, and documentation conventions that every follow-on change will depend on.

## What Changes

- Initialize the sidecar as a TypeScript Node service with the repository structure described by the MVP proposal.
- Add a configuration layer that loads environment variables, validates required settings, and exposes typed runtime configuration.
- Add structured logging that can be reused across pipeline stages and adapter boundaries.
- Establish baseline project documentation, including setup guidance, architecture context, and an example environment file.
- Define the initial application bootstrap path so later changes can register adapters and pipeline stages without restructuring the service entrypoint.

## Capabilities

### New Capabilities
- `service-foundation`: Baseline service bootstrap, runtime configuration, structured logging, and project documentation required for the voice-ingress sidecar.

### Modified Capabilities
- None.

## Impact

- Affected code: service entrypoint, config module, logger utility, and baseline project structure under `src/`.
- Affected docs: `README.md`, architecture documentation, and `.env.example`.
- Dependencies: TypeScript/Node toolchain, environment parsing/validation utilities, and structured logging libraries selected for the service.
- Systems: local developer setup, future adapter wiring, and operational debugging flows for the sidecar service.

## Context

The repository is starting from a blank slate, but the MVP proposal already fixes several architectural constraints: source adapters, STT adapters, dispatch adapters, and pipeline logic must remain cleanly separated; configuration must stay explicit; and the service must be operable locally before deeper feature work begins. This change provides the baseline project structure and runtime wiring that later follow-on changes will extend rather than revisit.

The bootstrap change is intentionally narrow. It does not implement Slack ingestion, STT execution, or transcript dispatch behavior. It creates the service shell those later changes will plug into.

## Goals / Non-Goals

**Goals:**
- Establish the initial TypeScript Node service layout for the sidecar.
- Define a typed runtime configuration boundary driven by environment variables.
- Provide structured logging that carries consistent context across future pipeline stages.
- Create the application bootstrap path so later changes can register adapters and processing flows without reshaping the entrypoint.
- Add baseline project documentation that explains setup, architecture, and required environment variables.

**Non-Goals:**
- Implement Slack Socket Mode or any source-adapter behavior.
- Implement audio normalization, STT backends, or dispatch adapters.
- Finalize persistence, retries, or production deployment topology.
- Lock in every future dependency choice beyond what is needed for a clean service foundation.

## Decisions

### Use a layered TypeScript service structure from day one
The bootstrap will create the top-level folders already described in the MVP proposal, even if many begin as placeholders. This keeps future changes aligned with the intended boundaries and avoids a later file-move refactor once adapters and pipeline logic appear.

Alternative considered: start with a minimal flat `src/` tree and reorganize later. Rejected because the project already has strong architectural boundaries, and deferring the structure would create churn exactly when feature work starts accelerating.

### Add a dedicated configuration module with validation at startup
Environment variables will be read in one place and exposed as typed configuration to the rest of the service. Startup will fail fast when required settings are missing or malformed.

Alternative considered: read directly from `process.env` throughout the codebase. Rejected because it spreads parsing logic across modules, makes testing harder, and weakens the contract for future adapters.

### Standardize on structured logs with shared base context
The service foundation will expose a logger utility that emits structured logs and can be enriched with per-stage metadata such as source, conversation key, dedupe key, and stage. This aligns with the project reliability requirements before any pipeline logic exists.

Alternative considered: use ad hoc `console` logging until pipeline work begins. Rejected because later converting log call sites is noisy and makes early debugging inconsistent.

### Keep the application bootstrap path narrow
The initial `app` bootstrap should compose config, logger, and service lifecycle wiring only. It should not embed Slack-, STT-, or dispatch-specific behavior. Later changes can register adapters through explicit seams instead of rewriting startup behavior.

Alternative considered: start the first adapter directly from the main entrypoint and refactor later. Rejected because it would immediately couple bootstrap code to the first implementation path.

### Document the foundation as part of the change, not after it
The bootstrap includes `README.md`, `.env.example`, and architecture notes because this project will be implemented incrementally across multiple changes. Those artifacts need to exist before deeper implementation so contributors share the same startup and boundary assumptions.

Alternative considered: delay docs until after the first end-to-end demo. Rejected because configuration and architecture misunderstandings would otherwise show up during every follow-on change.

## Risks / Trade-offs

- [Early structure may include mostly empty directories] -> Keep the initial layout minimal and focused on the folders that anchor architectural boundaries, while avoiding placeholder code that implies unfinished behavior.
- [Dependency choices made in bootstrap may constrain later work] -> Select only low-risk foundational tooling now and keep adapter-specific dependencies out of this change.
- [Over-design could slow the first feature slice] -> Limit the bootstrap to runtime, configuration, logging, and docs; defer feature-specific abstractions to their dedicated follow-on changes.
- [Insufficient bootstrap seams could force entrypoint rewrites later] -> Keep the app bootstrap intentionally compositional so future changes can add adapter registration with small edits.

## Migration Plan

1. Create the baseline Node and TypeScript project files.
2. Add the initial `src/` structure, application bootstrap, configuration module, and logger utility.
3. Add `.env.example` and baseline documentation for local setup and architecture.
4. Verify the service can start locally with validated configuration and structured logging enabled.

Rollback is straightforward because this is a new project. If the bootstrap shape proves wrong, the change can be revised before downstream features land, without migration of production data or live integrations.

## Open Questions

- Which logging library best balances structured output and minimal footprint for this service?
- Should configuration validation use a schema library immediately, or start with a small local validation helper?
- Which package manager and test runner should be standardized in the initial scaffold?

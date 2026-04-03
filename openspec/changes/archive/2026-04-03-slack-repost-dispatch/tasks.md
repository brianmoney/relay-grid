## 1. Dispatch Foundations

- [x] 1.1 Add the provider-specific Slack dispatch module structure under `src/adapters/dispatch/`
- [x] 1.2 Add any dispatch-facing transcript delivery types or helper interfaces needed for Slack repost delivery without changing the canonical transcript envelope
- [x] 1.3 Add a narrow Slack posting API seam for thread-targeted transcript reposts

## 2. Slack Transcript Repost

- [x] 2.1 Implement transcript repost delivery into the originating Slack channel and thread using normalized conversation identity
- [x] 2.2 Implement a concise transcript-first Slack repost message format
- [x] 2.3 Validate required Slack channel or thread targeting fields and fail clearly when repost delivery cannot be targeted safely

## 3. Repost Tagging And Loop Safety

- [x] 3.1 Attach explicit sidecar repost metadata or markers to Slack repost messages
- [x] 3.2 Ensure the repost tagging scheme is compatible with the existing Slack ingest loop-filtering rules
- [x] 3.3 Avoid relying solely on broad transcript text matching for repost identification

## 4. Duplicate Suppression

- [x] 4.1 Add in-process duplicate suppression for repost delivery keyed by the normalized dedupe identity or derived dedupe key
- [x] 4.2 Skip duplicate repost attempts during a single process lifetime instead of posting multiple transcript messages
- [x] 4.3 Document the in-memory scope and non-durable limitations of the MVP repost dedupe behavior

## 5. Service Integration And Verification

- [x] 5.1 Wire the Slack dispatch adapter into the service seam after STT transcript generation
- [x] 5.2 Add structured logs around repost attempts, duplicate skips, repost success, and repost failure using stable source, conversation, dedupe, and stage context
- [x] 5.3 Update `.env.example`, `README.md`, and architecture guidance for Slack repost behavior and fallback delivery expectations
- [x] 5.4 Add tests for thread targeting, repost formatting, repost tagging, duplicate suppression, and loop-safe behavior
- [x] 5.5 Run project verification and confirm the Slack repost dispatch path compiles cleanly with the new wiring and tests

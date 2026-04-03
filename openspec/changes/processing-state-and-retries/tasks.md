## 1. State Store Foundations

- [x] 1.1 Add a provider-agnostic processing-state store interface under `src/store/`
- [x] 1.2 Implement the MVP persisted backing store for processing-state and idempotency data
- [x] 1.3 Extend processing-state types with persisted runtime fields needed for attempts, timestamps, and terminal failure details

## 2. Persisted State Transitions And Idempotency

- [x] 2.1 Wire canonical processing-state transitions into the current fetch, normalization, transcription, and dispatch pipeline stages
- [x] 2.2 Use persisted dedupe identity or dedupe keys to suppress duplicate processing across process restarts
- [x] 2.3 Record dispatch completion in persisted state so transcript repost delivery is duplicate-safe after restart

## 3. Retry Policy

- [x] 3.1 Add bounded retry classification and attempt tracking based on retryable versus non-retryable failures
- [x] 3.2 Promote retry exhaustion to terminal failure state and stop automatic retries after the configured limit
- [x] 3.3 Keep retry behavior explicit in orchestration code rather than hiding retries inside source, STT, or dispatch adapters

## 4. Terminal Failure Visibility

- [x] 4.1 Persist terminal failure details and emit structured logs with source, conversation, dedupe, and error context
- [x] 4.2 Add optional Slack-facing failure notices for terminal failures when configured
- [x] 4.3 Ensure previously failed processing units remain inspectable after restart through persisted state

## 5. Documentation And Verification

- [x] 5.1 Update `.env.example`, `README.md`, and architecture guidance for persisted state, retries, and failure visibility
- [x] 5.2 Add tests covering duplicate replay after restart, bounded retries, retry exhaustion, and terminal failure persistence
- [x] 5.3 Run project verification and confirm the persisted state and retry path compiles cleanly with the new wiring and tests

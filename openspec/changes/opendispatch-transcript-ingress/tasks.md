## 1. Dispatch Mode Foundations

- [x] 1.1 Extend runtime configuration with an explicit dispatch mode for `slack-repost` versus `opendispatch-http`
- [x] 1.2 Add any Open Dispatch-specific config fields needed for the HTTP ingress client such as base URL, endpoint path, or auth token
- [x] 1.3 Update startup wiring so the selected dispatch adapter is chosen explicitly and logged clearly

## 2. Open Dispatch HTTP Adapter

- [x] 2.1 Add an Open Dispatch HTTP API seam under `src/adapters/dispatch/`
- [x] 2.2 Implement the Open Dispatch HTTP dispatch adapter using the canonical `TranscriptEnvelope` contract
- [x] 2.3 Keep the adapter thin by limiting it to payload mapping, HTTP transport, and clear error surfacing

## 3. Ingress Payload Contract

- [x] 3.1 Define the sidecar-owned HTTP request payload shape for transcript ingress
- [x] 3.2 Include normalized `conversationKey` and `dedupeKey` plus minimal routing metadata in the request body
- [x] 3.3 Exclude source-specific audio-fetch or normalization details from the ingress payload

## 4. Retry Classification And Explicit Fallback

- [x] 4.1 Classify transport errors, timeouts, and retryable upstream responses so the existing retry policy can handle them
- [x] 4.2 Fail clearly for non-retryable HTTP contract errors without hidden adapter-level retries
- [x] 4.3 Preserve Slack repost as an explicit configured mode rather than an automatic fallback on HTTP failure

## 5. Documentation And Verification

- [x] 5.1 Update `.env.example`, `README.md`, and `docs/architecture.md` for dispatch-mode selection and Open Dispatch HTTP ingress settings
- [x] 5.2 Document the linked Open Dispatch server-endpoint dependency when that endpoint is owned in another repository
- [x] 5.3 Add tests covering dispatch-mode selection, HTTP payload generation, success handling, and failure classification
- [x] 5.4 Run project verification and confirm the Open Dispatch HTTP ingress path compiles cleanly with the new wiring and tests

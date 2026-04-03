## Context

The sidecar already has a working fallback dispatch path that reposts transcript text into Slack, but the preferred MVP destination is still Open Dispatch. That target should arrive as a narrow HTTP client integration from the sidecar into an explicit Open Dispatch ingress endpoint, not as a direct OpenCode integration and not as a hidden behavior change inside the service.

The previous retry and persistence change already established that retries, duplicate suppression, and terminal failure handling belong in provider-agnostic orchestration. This change should preserve that boundary by making the HTTP adapter a thin payload-mapping and transport seam that returns clear success or failure information without hiding retry logic internally.

## Goals / Non-Goals

**Goals:**
- Add an Open Dispatch HTTP dispatch adapter that posts canonical transcript text to a configured ingress endpoint.
- Preserve stable routing context by including normalized conversation and dedupe identity in the ingress payload.
- Keep source-specific audio and provider payload details out of the Open Dispatch ingress contract.
- Add explicit runtime dispatch-mode selection so HTTP ingress and Slack repost can coexist without hidden fallback.
- Classify HTTP delivery failures clearly enough for the service retry policy to continue working as designed.
- Document the linked cross-repo dependency when the Open Dispatch server endpoint is owned elsewhere.

**Non-Goals:**
- Implement or modify the Open Dispatch server endpoint in this repository.
- Introduce automatic failover from HTTP ingress to Slack repost when HTTP delivery fails.
- Bypass Open Dispatch and call OpenCode directly.
- Add rich delivery acknowledgements, queueing, or webhook callbacks beyond the minimal ingress contract.

## Decisions

### Keep Open Dispatch delivery behind a dedicated HTTP dispatch adapter
The service should continue to hand canonical `TranscriptEnvelope` values to a dispatch adapter seam. The new Open Dispatch path belongs in `src/adapters/dispatch/` beside the Slack fallback adapter so delivery targets remain swappable without changing normalization, STT, or orchestration logic.

Alternative considered: send HTTP requests directly from `src/services/service.ts`. Rejected because it would couple orchestration to one downstream transport and make dispatch-mode selection harder to reason about.

### Use a narrow transcript-ingress payload based on normalized identity
The sidecar should send only the fields Open Dispatch needs for routing and traceability: transcript text, source name, stable conversation key, stable dedupe key, and small identity metadata derived from the canonical transcript envelope. Raw audio metadata, source-native Slack payload fragments, and normalization internals should stay out of the HTTP contract.

Alternative considered: forward the full transcript envelope or source-native event payload. Rejected because it would leak sidecar-specific or provider-specific details into the downstream routing layer.

### Make dispatch mode explicit in config
The sidecar should select either Slack repost or Open Dispatch HTTP ingress from runtime configuration. It should not silently fall back from HTTP to Slack repost on transient or terminal HTTP errors because that would blur operational intent and make duplicate handling harder to audit.

Alternative considered: automatically fall back to Slack repost whenever the HTTP endpoint is unavailable. Rejected because hidden fallback behavior conflicts with the project rule to keep fallbacks explicit in code and logs.

### Keep retry classification in the existing orchestration path
The HTTP adapter should surface errors with explicit retryability metadata. Transport failures, timeouts, and upstream `5xx` responses should remain retryable by default, while obvious contract failures such as malformed requests or permanent `4xx` responses should fail clearly without entering indefinite retry.

Alternative considered: let the HTTP client retry internally. Rejected because it would duplicate the retry policy already centralized in `src/services/service.ts`.

### Treat the Open Dispatch endpoint as a linked boundary
This repository owns the sidecar client behavior and payload contract. If the receiving endpoint is implemented in another repository, that server-side change should be tracked separately and referenced explicitly in docs or linked planning rather than assumed to exist.

Alternative considered: describe the server endpoint as implicitly provided once the sidecar adapter lands. Rejected because it hides a cross-repo dependency and makes MVP verification ambiguous.

## Risks / Trade-offs

- [The sidecar and Open Dispatch could drift on payload shape] -> Keep the ingress payload minimal and documented in one place, and test request generation deterministically.
- [Automatic fallback would mask HTTP integration problems] -> Keep fallback mode configuration explicit and log the selected dispatch mode at startup.
- [Incorrect HTTP error classification could either over-retry or under-retry] -> Keep the first classification rules small and obvious, and verify them with focused adapter tests.
- [Conversation continuity could break if the payload omits stable routing identity] -> Include canonical `conversationKey` and `dedupeKey` directly in the request body rather than expecting Open Dispatch to reconstruct them.

## Migration Plan

1. Add dispatch-mode configuration and validation for Slack repost versus Open Dispatch HTTP ingress.
2. Add an Open Dispatch HTTP API seam and thin dispatch adapter implementation.
3. Define the ingress request payload mapping from `TranscriptEnvelope` into the HTTP contract.
4. Surface retryable and non-retryable HTTP errors for the existing service retry logic.
5. Wire the selected dispatch adapter into service startup and transcript handling.
6. Add tests for payload generation, config selection, and HTTP failure classification.
7. Update docs to describe the explicit fallback mode and linked Open Dispatch endpoint boundary.

Rollback is low risk because the Slack repost path already exists. If the HTTP ingress path needs revision, the sidecar can continue running in explicit Slack repost mode while the adapter or linked endpoint contract is adjusted.

## Open Questions

- What exact authentication mechanism should the first Open Dispatch ingress endpoint require: bearer token, no auth on localhost, or another narrow option?
- Should the ingress response body include a returned routing identifier, or is HTTP success alone enough for the MVP sidecar?
- Should `429` responses be treated as retryable in the first policy slice, or should that remain configurable later?

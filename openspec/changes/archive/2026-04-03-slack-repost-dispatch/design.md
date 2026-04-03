## Context

The sidecar now reaches canonical transcript text from Slack audio input, but it still stops at the provider-agnostic transcript seam. The MVP needs one concrete delivery path before Open Dispatch ingress exists, and the umbrella proposal identifies Slack repost into the originating thread as that fallback path.

This change must keep Slack-specific delivery logic behind a dispatch adapter boundary, preserve the normalized conversation identity already established upstream, and avoid creating repost loops in the Slack ingest path. It also needs a minimal duplicate-suppression layer so the first demo path is safe to retry without posting the same transcript repeatedly.

## Goals / Non-Goals

**Goals:**
- Add a Slack dispatch adapter that posts transcript text into the originating Slack thread.
- Reuse normalized conversation and source identity to target the correct channel and thread without leaking Slack-specific logic into the STT or normalization layers.
- Add explicit repost tagging or metadata so Slack ingest can identify and ignore sidecar-authored repost messages.
- Add minimal duplicate suppression for repost delivery in the MVP fallback path.
- Wire transcript delivery into the service seam after STT completes while keeping dispatch behind an adapter boundary.
- Document fallback repost behavior and its loop-safe expectations.

**Non-Goals:**
- Implement the preferred Open Dispatch HTTP ingress path.
- Add a persistent retry store or full processing-state persistence.
- Deliver model responses back into Slack beyond the transcript repost itself.
- Support non-Slack dispatch targets in this change.

## Decisions

### Keep repost delivery behind a dedicated Slack dispatch adapter
Transcript posting should live in `src/adapters/dispatch/` rather than inside the service or STT layers. The service should hand canonical `TranscriptEnvelope` objects to a transcript handler or dispatch adapter seam.

Alternative considered: post directly to Slack from `src/services/service.ts`. Rejected because it would couple service orchestration to Slack-specific delivery behavior and make later dispatch changes harder.

### Derive thread targeting from normalized conversation identity
The adapter should use the normalized conversation identity to recover the Slack channel and thread timestamp for repost delivery. That keeps thread targeting aligned with the upstream source adapter contract and avoids re-parsing Slack-native payload fragments downstream.

Alternative considered: pass raw Slack thread fields alongside the transcript handler path. Rejected because the identity contract already exists for this purpose.

### Tag reposts explicitly with Slack message metadata
The repost message should carry an explicit marker that the Slack source adapter can identify deterministically, such as a dedicated metadata event type or clearly scoped marker field. Text-only heuristics should not be the primary loop-prevention mechanism.

Alternative considered: rely on message text prefixes alone to detect reposts. Rejected because text-only tagging is more fragile and can create false positives for legitimate user messages.

### Use narrow in-process duplicate suppression for the MVP fallback path
The first repost path should suppress duplicate transcript posts within the running process using the stable dedupe key. This is sufficient for the MVP fallback change and can later be replaced or extended by persisted retry/state handling.

Alternative considered: defer all duplicate suppression until the persistence-focused follow-on change. Rejected because the first end-to-end demo must already be safe against obvious duplicate reposts.

### Keep repost formatting simple and transcript-first
The reposted Slack message should prioritize clear transcript text and minimal metadata needed for operators and users to understand what was posted. It should not expose internal source or backend details beyond what is necessary for loop-safe tagging.

Alternative considered: include large blocks of backend metadata in the repost body. Rejected because it adds noise to the user-facing thread and duplicates information already present in logs.

## Risks / Trade-offs

- [In-process dedupe will not survive restarts] -> Accept that limitation for the MVP fallback path and make persisted dedupe a follow-on change.
- [Slack repost tagging could still collide with future message usage if underspecified] -> Use a narrowly scoped metadata marker tied to the sidecar rather than generic text matching.
- [Thread targeting may fail if normalized identities are incomplete or malformed] -> Validate the required conversation identity fields before posting and fail clearly when they are missing.
- [User-facing reposts may be noisy in active threads] -> Keep formatting concise and transcript-first while leaving richer delivery to later dispatch integrations.

## Migration Plan

1. Add a provider-specific Slack dispatch adapter and posting API seam.
2. Define transcript repost formatting and explicit repost tagging metadata.
3. Add in-process dedupe around repost delivery keyed by the normalized dedupe identity.
4. Wire transcript delivery into the service seam after STT completion.
5. Add tests for thread targeting, repost tagging, duplicate suppression, and loop-safe behavior.
6. Update docs for Slack fallback dispatch and its known limitations.

Rollback is low risk because this is the first dispatch path. If repost formatting or tagging needs revision, the adapter can change without affecting upstream ingest, normalization, or STT contracts.

## Open Questions

- Should the repost body include the original filename or source metadata, or only transcript text in the MVP?
- Which Slack metadata shape is safest for loop detection given the current Web API and source adapter behavior?
- Should duplicate suppression be best-effort in the dispatch adapter itself, or should the service own the in-process dedupe wrapper around the adapter?

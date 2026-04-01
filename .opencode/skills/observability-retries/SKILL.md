---
name: observability-retries
description: Apply logging, idempotency, retry, and failure-handling rules for ingestion, transcription, and dispatch workflows.
compatibility: opencode
---

## Use this skill when
- Adding logs, metrics, retries, or dead-letter handling
- Debugging duplicate events or delivery failures
- Designing Redis keys or idempotency rules

## Required outcomes
- Every stage logs enough context to debug failures
- Retries are bounded and idempotent
- Duplicate source events do not duplicate downstream prompts
- Terminal failures are visible and actionable

## Output checklist
- Log fields
- Retry policy
- Dedupe/idempotency keys
- Failure states

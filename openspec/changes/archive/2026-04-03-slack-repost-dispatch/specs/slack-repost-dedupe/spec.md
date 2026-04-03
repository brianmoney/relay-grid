## ADDED Requirements

### Requirement: Repost delivery suppresses obvious duplicates in the MVP path
The Slack repost dispatch path SHALL suppress duplicate transcript repost attempts for the same logical processing unit within the running process.

#### Scenario: Duplicate repost attempt is skipped
- **WHEN** the sidecar attempts to repost the same transcript more than once for the same normalized dedupe identity during a single process lifetime
- **THEN** the duplicate repost attempt is skipped instead of posting another transcript message

### Requirement: Duplicate suppression uses normalized identity
The Slack repost duplicate-suppression path SHALL use the normalized dedupe identity or derived dedupe key rather than Slack-specific ad hoc identifiers in the dispatch layer.

#### Scenario: Repost dedupe uses shared dedupe semantics
- **WHEN** the dispatch adapter decides whether a transcript repost is a duplicate
- **THEN** it uses the shared normalized dedupe identity or derived dedupe key already used elsewhere in the sidecar

### Requirement: Duplicate suppression limitations remain explicit
The MVP Slack repost duplicate-suppression behavior SHALL remain explicit about its in-memory scope and shall not imply durable duplicate protection across restarts.

#### Scenario: MVP repost dedupe is described as best-effort in-process behavior
- **WHEN** operators or developers read the fallback dispatch documentation
- **THEN** the documentation explains that Slack repost dedupe is currently in-process and not yet backed by persistent state

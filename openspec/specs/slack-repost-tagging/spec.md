# Slack Repost Tagging

## Purpose

Define the explicit sidecar tagging used on Slack repost messages so the Slack ingest path can ignore sidecar-authored reposts deterministically.

## Requirements

### Requirement: Slack reposts carry explicit sidecar identification
The Slack repost adapter SHALL attach explicit sidecar identification to reposted transcript messages so the Slack source adapter can identify sidecar-authored reposts deterministically.

#### Scenario: Repost includes sidecar marker
- **WHEN** the Slack dispatch adapter posts a transcript message
- **THEN** the repost includes the explicit sidecar marker or metadata required for loop-safe source filtering

### Requirement: Repost tagging supports loop-safe ingestion behavior
The Slack repost tagging scheme SHALL work with the existing Slack source filtering behavior so sidecar-authored reposts are ignored before normalization and download.

#### Scenario: Tagged repost is ignored by source ingest
- **WHEN** Slack later delivers the reposted transcript message back through source events
- **THEN** the source adapter can identify it as sidecar-authored and ignore it before downstream processing

### Requirement: Tagging does not rely only on broad text matching
The Slack repost tagging scheme SHALL not depend solely on generic text matching to identify sidecar-authored reposts.

#### Scenario: Loop detection is based on explicit repost identity
- **WHEN** the sidecar evaluates whether a message is its own repost
- **THEN** it can use explicit repost metadata or a narrowly scoped marker instead of broad transcript-text heuristics alone

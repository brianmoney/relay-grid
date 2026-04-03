## ADDED Requirements

### Requirement: Sidecar can dispatch transcripts to Open Dispatch over HTTP
The sidecar SHALL support a dispatch adapter that delivers canonical transcript text to a configured Open Dispatch HTTP ingress endpoint.

#### Scenario: Transcript is posted to the configured ingress endpoint
- **WHEN** dispatch mode is configured for Open Dispatch HTTP ingress and transcript delivery succeeds
- **THEN** the sidecar sends an HTTP request to the configured ingress endpoint
- **AND** the request body is derived from the canonical transcript envelope rather than provider-native event payloads

### Requirement: HTTP ingress payload carries normalized routing identity
The sidecar SHALL include normalized routing identity in the Open Dispatch ingress payload so downstream routing can preserve conversation continuity.

#### Scenario: Payload includes shared routing keys
- **WHEN** the sidecar sends a transcript to Open Dispatch
- **THEN** the payload includes the canonical `conversationKey` and `dedupeKey`
- **AND** it includes the transcript `source` and transcript text

### Requirement: HTTP ingress payload excludes sidecar-specific media details
The sidecar SHALL not require Open Dispatch to understand audio download, audio normalization, or source-provider media metadata in order to accept transcript ingress.

#### Scenario: Payload stays transcript-focused
- **WHEN** the sidecar maps a canonical transcript envelope into the HTTP request body
- **THEN** it omits source-specific fetched-audio paths, normalization artifact paths, and equivalent media-processing internals

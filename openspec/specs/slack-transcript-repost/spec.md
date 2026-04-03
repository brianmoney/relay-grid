# Slack Transcript Repost

## Purpose

Define the fallback Slack transcript delivery path that reposts transcript text into the originating thread after transcription succeeds.

## Requirements

### Requirement: Transcripts repost into the originating Slack thread
The sidecar SHALL provide a Slack fallback dispatch path that reposts transcript text into the originating Slack thread after transcription succeeds.

#### Scenario: Transcript repost succeeds for a Slack thread
- **WHEN** the sidecar has a transcript envelope for a Slack-originated audio message
- **THEN** the Slack dispatch adapter posts the transcript into the originating Slack channel and thread

### Requirement: Repost targeting uses normalized conversation identity
The Slack repost adapter SHALL derive channel and thread targeting from the normalized conversation identity rather than raw provider payloads passed through the pipeline.

#### Scenario: Top-level message repost targets the original message thread
- **WHEN** a transcript was produced from a top-level Slack post
- **THEN** the repost targets the normalized channel identity and the message timestamp used as the thread identifier

#### Scenario: Thread reply repost targets the existing thread
- **WHEN** a transcript was produced from a Slack thread reply
- **THEN** the repost targets the normalized channel identity and the existing thread identifier from the conversation identity

### Requirement: Repost message format remains transcript-first
The Slack repost adapter SHALL deliver a transcript-first message format that keeps the transcript readable without exposing unnecessary backend internals in the user-facing thread.

#### Scenario: Repost body is readable in Slack
- **WHEN** the adapter posts a transcript message to Slack
- **THEN** the resulting message clearly presents the transcript text in a concise user-facing format

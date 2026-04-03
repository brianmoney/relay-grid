## Purpose

Define stable conversation-key and dedupe-key requirements plus shared helper expectations for reuse across the sidecar.

## Requirements

### Requirement: Every processing unit has a stable dedupe key
The sidecar SHALL define deterministic dedupe-key rules so that one logical inbound audio event or file resolves to the same dedupe key across retries and reprocessing attempts.

#### Scenario: Same logical event produces the same dedupe key
- **WHEN** the dedupe key is generated multiple times from the same normalized source identifiers
- **THEN** the resulting key value is identical each time

### Requirement: Every conversation has a stable conversation key
The sidecar SHALL define deterministic conversation-key rules so that one logical thread or session resolves to the same conversation key across ingest, transcription, and dispatch stages.

#### Scenario: Same logical thread produces the same conversation key
- **WHEN** the conversation key is generated multiple times from the same normalized conversation identifiers
- **THEN** the resulting key value is identical each time

### Requirement: Key generation is reusable across modules
The sidecar SHALL provide shared helper utilities for key generation so adapters, logs, retries, and stores do not implement divergent key-building logic.

#### Scenario: Multiple modules use the same key generation rules
- **WHEN** different parts of the sidecar need a conversation key or dedupe key
- **THEN** they use the shared key-building helpers rather than duplicating local formatting logic

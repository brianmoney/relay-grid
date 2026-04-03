## ADDED Requirements

### Requirement: Source adapters normalize inbound events
The sidecar SHALL define a source-adapter contract that accepts provider-native input and converts it into normalized provider-agnostic objects before core pipeline code consumes the event.

#### Scenario: Core pipeline receives normalized event data
- **WHEN** a source adapter reports an inbound event to core sidecar code
- **THEN** the event is represented by a provider-agnostic contract rather than a provider-native payload shape

### Requirement: Source adapters return fetched audio in a provider-agnostic shape
The sidecar SHALL define a normalized fetched-audio contract that includes the source identity, conversation identity, local file path, and optional metadata needed by downstream normalization and transcription steps.

#### Scenario: Downstream code receives normalized fetched audio
- **WHEN** a source adapter completes audio fetch preparation for an inbound event
- **THEN** downstream code receives a provider-agnostic fetched-audio object with the fields required for normalization, transcription, and dispatch preparation

### Requirement: Transcript delivery uses a canonical transcript envelope
The sidecar SHALL define a transcript envelope type that dispatch-oriented code can use without depending on any source-provider payload structure.

#### Scenario: Transcript payload is source-agnostic
- **WHEN** transcript text is prepared for dispatch delivery
- **THEN** the payload is represented by the canonical transcript envelope contract with normalized source, conversation, and metadata fields

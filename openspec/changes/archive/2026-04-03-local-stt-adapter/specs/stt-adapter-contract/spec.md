## ADDED Requirements

### Requirement: STT backends implement a shared adapter contract
The sidecar SHALL define a provider-agnostic `STTAdapter` contract that accepts normalized audio and returns transcription results without exposing backend-specific invocation details to pipeline code.

#### Scenario: Service transcribes normalized audio through the shared contract
- **WHEN** the service submits normalized audio to the active STT backend
- **THEN** it does so through the shared `STTAdapter` contract rather than backend-specific service logic

### Requirement: STT results map to the canonical transcript envelope
The STT adapter contract SHALL return transcription results that can be mapped into the canonical `TranscriptEnvelope`, including transcript text and optional language, segments, and metadata.

#### Scenario: Transcript result can become transcript envelope
- **WHEN** an STT adapter completes transcription successfully
- **THEN** the result contains the fields required to build the canonical transcript envelope for downstream delivery

### Requirement: STT adapter exposes readiness checks
The STT adapter contract SHALL expose a readiness check so service startup can fail clearly when the configured backend is unavailable.

#### Scenario: Service validates STT backend readiness at startup
- **WHEN** the sidecar starts with an STT backend configured
- **THEN** the service can verify the backend is ready before processing normalized audio

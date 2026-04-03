## Purpose

Define the MVP Faster-Whisper backend behavior behind the shared STT adapter interface.

## Requirements

### Requirement: Faster-Whisper implements the shared STT adapter contract
The sidecar SHALL provide a Faster-Whisper backend that implements the shared `STTAdapter` contract for the MVP local transcription path.

#### Scenario: Faster-Whisper transcribes normalized audio
- **WHEN** the active STT backend is configured as Faster-Whisper and receives normalized audio
- **THEN** the backend transcribes the audio through the shared adapter contract and returns transcript results

### Requirement: Faster-Whisper preserves transcript structure when available
The Faster-Whisper backend SHALL include transcript text and preserve optional language, segment timing, and backend metadata when those details are available from the backend.

#### Scenario: Faster-Whisper returns text with optional segments
- **WHEN** Faster-Whisper returns transcript segment or language details
- **THEN** the sidecar includes those details in the transcription result without changing the canonical transcript contract

### Requirement: Faster-Whisper surfaces clear transcription failures
The Faster-Whisper backend SHALL surface transcription failures with explicit error information rather than swallowing backend errors silently.

#### Scenario: Faster-Whisper transcription failure is visible
- **WHEN** Faster-Whisper cannot transcribe a normalized audio artifact
- **THEN** the backend returns or throws a clear STT failure that the service can log and handle explicitly

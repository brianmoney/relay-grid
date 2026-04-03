## 1. STT Foundations

- [x] 1.1 Add provider-agnostic STT result types and any supporting error or metadata types needed for transcription
- [x] 1.2 Add the shared `STTAdapter` contract under `src/adapters/stt/` using normalized-audio input and transcript-oriented output types
- [x] 1.3 Ensure transcript results map cleanly into the canonical `TranscriptEnvelope` without backend-specific leakage

## 2. Configuration And Backend Selection

- [x] 2.1 Add runtime configuration and validation for STT backend selection plus Faster-Whisper-specific settings
- [x] 2.2 Implement config-driven backend selection so the service instantiates the active STT backend explicitly
- [x] 2.3 Fail startup clearly for unsupported backend selection or unavailable configured backend

## 3. Faster-Whisper Backend

- [x] 3.1 Implement the Faster-Whisper adapter behind the shared `STTAdapter` contract
- [x] 3.2 Add readiness checks for the Faster-Whisper backend so startup validates the runtime dependency before processing audio
- [x] 3.3 Map Faster-Whisper transcription output into transcript text, optional language, optional segments, and backend metadata
- [x] 3.4 Surface transcription failures with explicit STT errors rather than hidden fallback or silent failure

## 4. Service Integration

- [x] 4.1 Wire the STT stage into the service seam after audio normalization
- [x] 4.2 Add structured logs around STT startup, transcription success, and transcription failure using stable source, conversation, dedupe, and stage context
- [x] 4.3 Forward transcript results into the next provider-agnostic seam without introducing dispatch behavior in this change

## 5. Documentation And Verification

- [x] 5.1 Update `.env.example`, `README.md`, and architecture guidance for local STT requirements, backend selection, and runtime behavior
- [x] 5.2 Add tests for backend selection, transcript mapping, readiness failures, and Faster-Whisper success or error behavior
- [x] 5.3 Run project verification and confirm the STT adapter path compiles cleanly with the new wiring and tests

## 1. Normalization Foundations

- [x] 1.1 Add provider-agnostic normalized-audio types and any supporting error or metadata types needed for the normalization stage
- [x] 1.2 Add normalization configuration and validation for ffmpeg dependency checks plus default size and duration guardrails
- [x] 1.3 Create the provider-agnostic normalization module structure and interfaces without introducing source-specific branching

## 2. Media Validation And Conversion

- [x] 2.1 Implement supported-input validation for fetched-audio media before expensive conversion work begins
- [x] 2.2 Implement size and duration guardrail enforcement with clear normalization failure errors
- [x] 2.3 Implement deterministic ffmpeg-based normalization to the canonical mono 16 kHz PCM WAV output format
- [x] 2.4 Return normalized-audio metadata required by downstream transcription and cleanup stages

## 3. Artifact Lifecycle And Cleanup

- [x] 3.1 Write normalization output to managed temporary storage with predictable paths or directory ownership
- [x] 3.2 Add best-effort cleanup for partial normalization artifacts on failure
- [x] 3.3 Make cleanup responsibility explicit for successful normalized artifacts so later stages can remove them safely

## 4. Service Integration

- [x] 4.1 Wire the normalization stage into the service seam after fetched audio is produced
- [x] 4.2 Update logging around normalization start, success, and failure using stable source, conversation, dedupe, and stage context

## 5. Documentation And Verification

- [x] 5.1 Update `.env.example`, `README.md`, and architecture guidance for ffmpeg requirements, normalization behavior, and guardrails
- [x] 5.2 Add fixture-driven tests for successful normalization, unsupported input rejection, size or duration guardrail failures, and cleanup behavior
- [x] 5.3 Run project verification and confirm the normalization pipeline compiles cleanly with the new wiring and tests

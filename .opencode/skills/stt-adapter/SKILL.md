---
name: stt-adapter
description: Define the shared STT adapter contract and backend selection rules for local and remote speech-to-text engines.
compatibility: opencode
---

## Use this skill when
- Adding or changing an STT backend
- Designing transcription response shapes
- Debugging transcript quality or backend fallbacks

## Required outcomes
- Keep one stable STTAdapter interface
- Separate backend selection from business logic
- Return transcript text plus optional segments/metadata
- Make fallback behavior explicit

## Output checklist
- STTAdapter interface
- Backend capability matrix
- Fallback rules
- Error/timeout handling

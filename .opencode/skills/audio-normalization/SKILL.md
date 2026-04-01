---
name: audio-normalization
description: Normalize inbound audio into a stable format for transcription and document temp-file, codec, and cleanup rules.
compatibility: opencode
---

## Use this skill when
- Adding a new audio source
- Debugging STT accuracy caused by bad media input
- Changing ffmpeg or preprocessing behavior

## Required outcomes
- Normalize to one canonical transcription format
- Keep preprocessing deterministic
- Clean up temp artifacts
- Surface normalization failures clearly

## Output checklist
- Input/output format rules
- ffmpeg command shape
- Temp-file lifecycle
- Error cases and retries

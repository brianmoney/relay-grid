---
name: slack-voice-ingest
description: Implement Slack-specific voice/file ingestion, including clip detection, file metadata lookup, download flow, and thread mapping.
compatibility: opencode
---

## Use this skill when
- Working on Slack event handling
- Implementing file fetch and audio download
- Handling Slack thread mapping or Slack-specific edge cases

## Required outcomes
- Detect audio-bearing Slack messages safely
- Resolve full file metadata before download when needed
- Preserve thread context for downstream dispatch
- Keep Slack-specific logic out of core STT and agent-routing layers

## Output checklist
- Event handling path
- File resolution/download logic
- Thread/conversation mapping
- Failure handling notes

---
name: dispatch-ingress
description: Define how normalized transcripts enter Open Dispatch, including preferred ingress seam and fallback repost behavior.
compatibility: opencode
---

## Use this skill when
- Designing transcript delivery into Open Dispatch
- Adding an ingress endpoint or internal bridge
- Comparing direct ingress versus Slack repost fallback

## Required outcomes
- Prefer a narrow transcript-ingress contract
- Keep Open Dispatch unaware of source-specific audio details
- Preserve conversation/thread identity
- Define fallback behavior if direct ingress is unavailable

## Output checklist
- Ingress payload schema
- Delivery path
- Conversation/session mapping notes
- Fallback strategy

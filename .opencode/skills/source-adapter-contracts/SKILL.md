---
name: source-adapter-contracts
description: Define canonical interfaces and invariants for source adapters, reply adapters, event payloads, dedupe keys, and conversation IDs.
compatibility: opencode
---

## Use this skill when
- Designing or changing SourceAdapter and ReplyAdapter interfaces
- Adding a new inbound channel
- Deciding conversation and dedupe key formats

## Required outcomes
- Keep adapter contracts narrow and transport-agnostic
- Prefer normalized event objects over provider-specific types in core code
- Every source event must produce a stable dedupe key
- Every conversation must produce a stable conversation/session key

## Output checklist
- Interface definitions
- Key invariants
- Example payloads
- Migration notes if contracts changed

---
name: agent-backend-abstraction
description: Define a backend-agnostic contract for routing prompts and responses across OpenCode and future agent systems.
compatibility: opencode
---

## Use this skill when
- Designing support for OpenCode, Claude Code, Codex, Gemini, or others
- Refactoring backend-specific logic
- Deciding what the common backend interface should expose

## Required outcomes
- Isolate backend-specific transport and session details
- Keep prompt envelope and response shape portable
- Avoid leaking provider-specific types into core code
- Make capability differences explicit

## Output checklist
- AgentBackend interface
- Capability notes
- Session semantics
- Migration notes

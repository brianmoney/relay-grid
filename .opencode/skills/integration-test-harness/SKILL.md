---
name: integration-test-harness
description: Build fixture-driven tests for source ingestion, audio normalization, STT mocks, and end-to-end transcript dispatch.
compatibility: opencode
---

## Use this skill when
- Creating or expanding automated tests
- Building fixtures for Slack events or sample audio
- Adding end-to-end coverage for transcript flow

## Required outcomes
- Prefer deterministic fixtures over live network dependence
- Test source parsing, normalization, STT integration, and dispatch separately
- Include at least one end-to-end golden path
- Make transcript assertions resilient to backend differences

## Output checklist
- Fixture list
- Test pyramid
- Mock boundaries
- End-to-end cases

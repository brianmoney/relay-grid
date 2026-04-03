## 1. Core Contracts

- [x] 1.1 Add provider-agnostic source event and fetched-audio types under `src/types/`
- [x] 1.2 Add canonical transcript envelope types under `src/types/`
- [x] 1.3 Add canonical processing-state status and payload types under `src/types/`

## 2. Source Adapter Boundary

- [x] 2.1 Add the base `SourceAdapter` contract under `src/adapters/source/` using the normalized types
- [x] 2.2 Ensure the source adapter contract keeps provider-native payloads at the adapter boundary and only exposes normalized shapes downstream

## 3. Identifier Utilities

- [x] 3.1 Add shared helper utilities for deterministic conversation-key generation
- [x] 3.2 Add shared helper utilities for deterministic dedupe-key generation
- [x] 3.3 Document key-generation invariants in code so later adapters and stores do not reimplement local formats

## 4. Documentation Alignment

- [x] 4.1 Update `docs/architecture.md` to describe normalized event flow and the distinction between source identity, conversation identity, and dedupe identity
- [x] 4.2 Add examples or guidance showing how processing state relates to conversation and dedupe keys

## 5. Verification

- [x] 5.1 Add lightweight deterministic tests for key generation behavior
- [x] 5.2 Add lightweight contract-level tests or checks for the normalized types and source adapter boundary
- [x] 5.3 Run project verification and confirm the new contracts compile cleanly

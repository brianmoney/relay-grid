## Purpose

Define the provider-agnostic audio normalization contract and canonical output required before STT execution.

## Requirements

### Requirement: Fetched audio normalizes to a canonical STT input format
The sidecar SHALL normalize accepted fetched audio into one canonical transcription input format that downstream STT adapters can consume without source-specific media assumptions.

#### Scenario: Supported fetched audio is normalized successfully
- **WHEN** the normalization pipeline receives a supported fetched-audio input within configured limits
- **THEN** it produces a normalized audio artifact in the canonical STT input format for downstream processing

### Requirement: Normalization remains provider-agnostic
The audio normalization pipeline SHALL operate on provider-agnostic fetched-audio contracts rather than source-provider payload types or provider-specific branching logic.

#### Scenario: Normalization consumes fetched-audio contract only
- **WHEN** the normalization stage receives an input from the source layer
- **THEN** it relies on the normalized fetched-audio contract and does not require source-provider-specific payload parsing

### Requirement: Normalized output carries metadata needed downstream
The normalization pipeline SHALL return normalized audio metadata needed by downstream transcription and cleanup stages, including the normalized artifact path and normalized format details.

#### Scenario: Downstream stage receives normalized audio metadata
- **WHEN** normalization succeeds
- **THEN** downstream code can access the normalized artifact path and the metadata required to prepare transcription and later cleanup

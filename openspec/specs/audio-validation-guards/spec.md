## Purpose

Define the validation and guardrail requirements that constrain fetched audio before expensive normalization work begins.

## Requirements

### Requirement: Normalization validates supported media inputs
The audio normalization pipeline SHALL reject fetched-audio inputs that do not meet the supported media requirements for the MVP normalization path.

#### Scenario: Unsupported media input is rejected
- **WHEN** the normalization stage receives fetched audio with an unsupported or unusable media format
- **THEN** normalization fails with a clear validation error before producing normalized output

### Requirement: Normalization enforces size guardrails
The audio normalization pipeline SHALL enforce configured maximum file-size limits before or during normalization.

#### Scenario: Oversized fetched audio is rejected
- **WHEN** fetched audio exceeds the configured maximum size guardrail
- **THEN** normalization fails with a clear size-limit error and does not produce normalized output

### Requirement: Normalization enforces duration guardrails
The audio normalization pipeline SHALL enforce configured maximum duration limits before or during normalization.

#### Scenario: Overlong fetched audio is rejected
- **WHEN** fetched audio exceeds the configured maximum duration guardrail
- **THEN** normalization fails with a clear duration-limit error and does not produce normalized output

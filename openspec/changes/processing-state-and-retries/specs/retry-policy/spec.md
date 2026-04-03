## ADDED Requirements

### Requirement: Retryable failures use bounded retries
The sidecar SHALL retry retryable pipeline failures using a bounded retry policy rather than unbounded repeated execution.

#### Scenario: Retryable failure is retried within the configured attempt budget
- **WHEN** a retryable failure occurs for a processing unit and the configured retry limit has not been exhausted
- **THEN** the sidecar schedules or performs another attempt for that processing unit within the bounded retry policy

### Requirement: Retry exhaustion promotes terminal failure
The sidecar SHALL stop retrying a processing unit once the configured retry limit is exhausted and mark the failure as terminal.

#### Scenario: Retry budget is exhausted
- **WHEN** a processing unit continues to fail with retryable errors until the configured retry limit is reached
- **THEN** the sidecar stops automatic retries and records a terminal failure state for that processing unit

### Requirement: Non-retryable failures do not enter the retry loop
The sidecar SHALL not retry failures explicitly classified as non-retryable.

#### Scenario: Non-retryable error fails immediately
- **WHEN** a processing unit fails with a non-retryable error
- **THEN** the sidecar records failure without scheduling automatic retries

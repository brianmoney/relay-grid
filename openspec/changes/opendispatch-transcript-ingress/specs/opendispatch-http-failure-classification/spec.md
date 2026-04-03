## ADDED Requirements

### Requirement: HTTP dispatch failures surface retryability explicitly
The Open Dispatch HTTP dispatch path SHALL classify delivery failures so the sidecar's existing bounded retry policy can make explicit retry decisions.

#### Scenario: Retryable HTTP failure is surfaced to orchestration
- **WHEN** transcript delivery fails because of a transport error, timeout, or retryable upstream response
- **THEN** the dispatch path surfaces a retryable failure to the orchestration layer

#### Scenario: Non-retryable HTTP failure fails clearly
- **WHEN** transcript delivery fails because of a non-retryable request or contract error
- **THEN** the dispatch path surfaces a non-retryable failure without performing hidden adapter-level retries

### Requirement: Linked endpoint dependency remains explicit
The sidecar SHALL describe the Open Dispatch ingress endpoint as a linked dependency when that endpoint is owned outside this repository.

#### Scenario: Docs describe the cross-repo boundary clearly
- **WHEN** developers or operators read sidecar configuration and architecture guidance for Open Dispatch HTTP ingress
- **THEN** the docs explain that the sidecar owns the HTTP client path here
- **AND** they explain that the receiving Open Dispatch endpoint may be tracked as a separate linked change in the owning repository

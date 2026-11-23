# Delta: Validation, TDD Checkpoints & Coverage

**Capability:** `validation-and-tdd`

## ADDED Requirements

### REQ VAL-005: Task traceability validation for prompt compilation

The system SHALL validate at the `tasks` stage that tasks cite target `REQ-NNN` or scenario IDs and backticked file paths so deterministic prompt compilation can resolve exact dependencies.

#### Scenario VAL-005.S1: Refusing untraceable tasks at tasks gate

- **Given** a newly authored `tasks.md` containing a task without any `REQ` reference or target path
- **When** `medra validate <change> --stage tasks --json` runs
- **Then** validation reports a `tasks.*` finding identifying the untraceable task before the `tasks` gate can pass

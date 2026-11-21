# Validation, TDD Checkpoints & Coverage

**Capability:** `validation-and-tdd`
**ID prefix:** `VAL`
**Paths:** `cli/src/validate.js`, `cli/src/fix.js`, `cli/src/testdiff.js`, `cli/src/change.js`

## Purpose

Enforces structural and cross-document rules, deterministic auto-repair, test-first red/green task checkpoints, test-tampering protection, and BDD scenario coverage. Prevents incomplete or inconsistent artifacts from passing human gates.

## Requirements

### REQ VAL-001: Stage and project validation

The system SHALL validate project documents and active change stages via `medra validate`, exiting `1` with structured `findings` when any error rule fails.

#### Scenario VAL-001.S1: Validation refusal on structural error

- **Given** a change document missing a required section or cross-reference
- **When** `medra validate <change> --stage <stage> --json` runs
- **Then** the CLI exits `1` with `ok: false` and rule-tagged findings

### REQ VAL-002: Deterministic structural repair

The system SHALL repair mechanical document structure issues (`proposal.structure`, `proposal.capabilities`, headings, tables) via `medra fix <change>` without altering judgment prose.

#### Scenario VAL-002.S1: Auto-fixing capability table drift

- **Given** a change whose delta spec files do not match the proposal Capabilities table
- **When** `medra fix <change>` runs
- **Then** the Capabilities table is synchronized from the delta files on disk

### REQ VAL-003: TDD red/green checkpoints and anti-tampering

The system SHALL enforce red-before-green task completion via `medra task done --run`, hashing test files at `[TEST]` completion and refusing implementation completion (`task.test-tampered`) if locked tests are weakened without `--allow-test-edit`.

#### Scenario VAL-003.S1: Locking test files on red

- **Given** a change in `tdd` testing mode with a `[TEST]` task
- **When** `medra task done <id> --run` observes the expected failure
- **Then** the task is marked done and the test file hashes are recorded in `.medra.yaml`

### REQ VAL-004: Scenario-to-test coverage

The system SHALL verify via `medra coverage <change>` that every added or modified BDD scenario ID (`<REQ-ID>.S<n>`) is cited in the configured `testing.paths`.

#### Scenario VAL-004.S1: Uncovered scenario blocks verify

- **Given** an added scenario whose ID is absent from all test files
- **When** `medra validate <change> --stage verify` runs in `tdd` or `test-after` mode
- **Then** validation fails reporting the uncovered scenario ID

### REQ VAL-005: Task traceability validation for prompt compilation

The system SHALL validate at the `tasks` stage that tasks cite target `REQ-NNN` or scenario IDs and backticked file paths so deterministic prompt compilation can resolve exact dependencies.

#### Scenario VAL-005.S1: Refusing untraceable tasks at tasks gate

- **Given** a newly authored `tasks.md` containing a task without any `REQ` reference or target path
- **When** `medra validate <change> --stage tasks --json` runs
- **Then** validation reports a `tasks.*` finding identifying the untraceable task before the `tasks` gate can pass

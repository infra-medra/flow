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

### REQ VAL-006: Isolate child test and check processes from MEDRA_SUBAGENT

The CLI SHALL strip `MEDRA_SUBAGENT` from the child process environment when executing `medra task done --run`, `testing.checks`, and `medra suite` via a shared `childEnv()` helper in `cli/src/core.js`, preserving all other environment variables while continuing to enforce `process.env.MEDRA_SUBAGENT` in `requireCoordinator` for direct CLI invocations.

#### Scenario VAL-006.S1: Child test and check commands do not inherit MEDRA_SUBAGENT while other env vars pass through

- **Given** a project with `testing.command` and `testing.checks` that read `process.env.MEDRA_SUBAGENT` and a custom variable such as `MEDRA_TEST_MARKER`
- **When** a subagent runs `MEDRA_SUBAGENT=1 medra suite <change> --json` or `MEDRA_SUBAGENT=1 medra task done <change> <T-ID> --run "<cmd>"` with `MEDRA_TEST_MARKER=x`
- **Then** the child commands observe `MEDRA_SUBAGENT` as unset (empty), `MEDRA_TEST_MARKER` as `x`, and exit `0`

#### Scenario VAL-006.S2: Direct privileged CLI commands still refuse MEDRA_SUBAGENT=1

- **Given** `MEDRA_SUBAGENT=1` is set in the CLI process environment
- **When** a subagent invokes `medra gate <change> verify --approve` or `medra verify-fix <change>`
- **Then** the CLI refuses execution with rule `subagent.forbidden` and exit code `1`

### REQ VAL-007: Scenario-matched red failure requirement in TDD

The system SHALL require `[TEST]` tasks in `tdd` (across `plugins/medra/pipelines/implementer-apply.md`, compiled `batch` prompts, and compiled `fast`-track `inline` prompts) to confirm that the observed `red` failure matches the missing behavior predicted by the scenario (fixing import, syntax, fixture, or environment errors before `--kind red`), accompanied by a one-sentence rationale explaining that a wrong-reason `red` invalidates the subsequent `green`.

#### Scenario VAL-007.S1: Scenario-matched red rule in apply pipeline and compiled prompts

- **Given** `plugins/medra/pipelines/implementer-apply.md` and `compileStep` outputs for `batch` and `fast`-track `inline` `apply`
- **When** inspected for `tdd` `[TEST]` instructions
- **Then** all three explicitly require the `red` failure to match the scenario's predicted missing behavior (not load/environment errors) and state why

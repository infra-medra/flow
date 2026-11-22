# Context Packing, Archive & Learnings

**Capability:** `context-and-memory`
**ID prefix:** `CTX`
**Paths:** `cli/src/context.js`, `cli/src/archive.js`, `cli/src/learnings.js`

## Purpose

Delivers bounded project indexes and stage-specific context packs so agents avoid reading the entire repository. Merges approved deltas into living specs at archive and curates scoped project lessons.

## Requirements

<!-- retired: CTX-005.S1, CTX-005.S2, CTX-005.S3, CTX-005.S4, CTX-005.S5, CTX-005.S6, CTX-005.S7, CTX-005.S9, CTX-005.S10, CTX-005.S11, CTX-005.S12, CTX-005.S13 -->

### REQ CTX-001: Bounded project index

The system SHALL emit a compact project index via `medra index` listing constitution article titles, capability summaries, requirement titles, active changes, spec drift, and optional scoped learnings.

#### Scenario CTX-001.S1: Listing capabilities without full spec bodies

- **Given** a project with living specs in `docs/specs/`
- **When** `medra index` runs
- **Then** only capability headers, requirement IDs/titles, and active change summaries are output

### REQ CTX-002: Stage-scoped context packs

The system SHALL assemble bounded context packs via `medra context <change> --stage <stage>` containing touched requirements, collapsed sibling titles, scoped learnings, and `last_changed_by` archive pointers.

#### Scenario CTX-002.S1: Packing context for plan or apply

- **Given** an active change touching specific capabilities and requirements
- **When** `medra context <change> --stage apply --md` runs
- **Then** the pack includes only the touched requirements, matching learnings, and the next pending task

### REQ CTX-003: Delta archive merge

The system SHALL merge approved `ADDED`, `MODIFIED`, and `REMOVED` deltas byte-for-byte into `docs/specs/` via `medra archive`, move the change to `docs/changes/archive/`, and append to `INDEX.md`.

#### Scenario CTX-003.S1: Clean archive merge

- **Given** a change with an approved `verify` gate and no merge conflicts
- **When** `medra archive <change> --json` runs
- **Then** living specs are updated, the change folder is archived, and `INDEX.md` gains one summary row

### REQ CTX-004: Bounded learnings store

The system SHALL manage scoped lessons and preferences in `docs/learnings.md` via `medra learn`, enforcing `max_active` compaction and `promote_after` amendment candidates.

#### Scenario CTX-004.S1: Recording and scoping a learning

- **Given** a project with `docs/learnings.md`
- **When** `medra learn add` records a lesson scoped to a capability or path
- **Then** `medra context` surfaces it only when a change touches that scope

### REQ CTX-005: Deterministic step and prompt compilation

The system SHALL compile a minimal, self-contained step prompt and handoff envelope from on-disk change state via the `medra` CLI, resolving only the active step's touched requirements, scenarios, scoped decisions, scoped learnings, hybrid code references, and unambiguous runtime-portable plugin pointers, mapping flow stages to valid `medra validate` stages, transitioning `verify` deterministically between `dispatch` and `gate` using coordinator-recorded CLI fix rounds (without delegating `medra verify-fix` to subagent `exit_command`s), resolving per-subagent models (`role -> stage -> default -> inherit`), deduplicating large embedded blocks at the top level, supporting compact default `--json` envelopes with deterministic `--role <role> [--task <T-ID>] --md` subagent fetch output (`--full` preserved), and supporting `action: "inline"` for small `fast`-track `apply` and `propose`/`plan`/`tasks`, while surfacing git diff failures explicitly and fencing untrusted embedded content with `<untrusted_data>`.

#### Scenario CTX-005.S8: Verify action transitions with CLI-tracked fix rounds

- **Given** a change at `verify` with valid current review/security reports
- **When** `resolveStage` and `compileStep` evaluate `verifyFindings`
- **Then** no blockers returns `action: "gate", gate: "verify"`, blocking findings with `0` fix rounds returns `action: "dispatch"` for a fix implementer whose `exit_command` runs test verification (never `medra verify-fix`), repeated `compileStep` calls without `medra verify-fix` are idempotent, coordinator-recorded `medra verify-fix` makes old reports stale for re-verification, and blocking findings after `1` fix round returns `action: "gate", gate: "verify"` with findings in the envelope for human decision

#### Scenario CTX-005.S14: Step envelope schemas and size measurement script

- **Given** the updated optional envelope fields (`fetch_command`, `embedded` keys, `plugin_pointers`, `findings`, per-subagent `model`)
- **When** `cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`, and `cli/scripts/measure-envelope.js` are evaluated
- **Then** both schemas validate the fields without breaking existing 1.x/2.0-rc consumers and `measure-envelope.js` reports coordinator `verify` `--json` size < 4 KB with no stage growing more than 10% over `2.0.0-rc.3`

#### Scenario CTX-005.S15: Coordinator-owned fix round and idempotent compileStep

- **Given** a change at `verify` with blocking review findings and `0` recorded fix rounds
- **When** `medra step` runs twice consecutively without `medra verify-fix` in between
- **Then** both calls return the identical fix-implementer envelope without incrementing `verify_fix_rounds` and no subagent `exit_command` contains `verify-fix`

#### Scenario CTX-005.S16: Per-subagent model resolution precedence and inline warning

- **Given** `docs/config-flow.yaml` with `models` overrides across `role`, `stage`, and `default`
- **When** `compileStep` builds `subagents[]`
- **Then** each subagent resolves `role -> stage -> default -> inherit` while the envelope `model` remains the stage tier, and `medra validate --project` (or documentation) addresses `models.<stage>` / `models.author` on `inline` stages

#### Scenario CTX-005.S17: Recorded review timestamp and hash freshness (plan-gated)

- **Given** a review report recorded via `medra review` with `reviews[].recorded_at` and file hash stored in state
- **When** the file's `mtime` is touched to the future and a new task is completed afterward (or the file hash diverges)
- **Then** if Item 5 is approved at the `plan` gate, the report is treated as stale using `recorded_at` and hash (falling back to `mtime` only for 1.x changes lacking `recorded_at`); if rejected at the `plan` gate, the limitation is recorded under Known issues in `CHANGELOG.md`

### REQ CTX-006: Deduplicated batch context compilation

The system SHALL deduplicate touched requirements, scenarios, scoped decisions, scoped learnings, and code pointers across all tasks included in an `apply` `batch` prompt, without duplicating shared context per task.

#### Scenario CTX-006.S1: Deduplicating shared REQs and pointers across batch tasks

- **Given** a `batch` of 3 pending tasks in the same phase citing overlapping `REQ`s and file paths
- **When** `compileStep` builds the batch `implementer` prompt
- **Then** each shared requirement, decision, learning, and pointer appears once in the compiled prompt

### REQ CTX-007: Honest full-stage token and byte measurement

The system SHALL measure per-stage byte/token cost in `cli/scripts/measure-envelope.js` as `coordinator skill + pointed pipeline(s) + envelope/prompt` (in addition to `cli_json_bytes`), and record both `task` vs `batch` benchmark figures on `docs/changes/archive/2026-11-21-remodel-deterministic-v2-flow` and corrected `rc.1` numbers in `CHANGELOG.md`.

#### Scenario CTX-007.S1: Measuring skill + pipeline + envelope totals per stage

- **Given** `cli/scripts/measure-envelope.js` run on a benchmark project
- **When** it reports per-stage metrics
- **Then** output includes coordinator skill bytes, pointed pipeline bytes, envelope/prompt bytes, and their combined total per stage

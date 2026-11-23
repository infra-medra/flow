# Delta: runtime-plugin

**Capability:** `runtime-plugin`

## ADDED Requirements

### REQ PLUG-013: Lean core pipelines with on-demand references

The system SHALL structure all 9 `plugins/medra/pipelines/*.md` files as compact core workflows (reducing combined `pipeline_bytes` in `cli/scripts/measure-envelope.js` by at least 40% relative to `2.0.0-rc.7`'s `74,369 B`) while moving verbose edge-case, fallback, and recovery procedures into `plugins/medra/references/*.md` loaded only when triggered, and keeping bundled `cli/plugin/` and `.agents/plugins/medra/` in parity.

#### Scenario PLUG-013.S1: Lean pipeline byte budget and reference parity

- **Given** the refactored `plugins/medra/pipelines/*.md` and `plugins/medra/references/*.md` files
- **When** `node cli/scripts/measure-envelope.js` and `node cli/scripts/check-bundle-drift.js` run
- **Then** `total_pipeline_bytes` across the 5 measured stages is at least 40% below `74,369 B` (`<= 44,621 B`) and bundle drift checks pass

### REQ PLUG-014: Scoped per-task test commands during apply

The system SHALL instruct `apply` subagents (in `plugins/medra/pipelines/implementer-apply.md` and compiled `apply` prompts when `testing.command` is set) to prefer targeted test-file commands in `medra task done ... --run "<cmd>"` rather than re-running the full `testing.command` suite on every task, reserving full-suite execution for `medra suite` before `verify`.

#### Scenario PLUG-014.S1: Scoped test guidance in apply prompts and pipeline

- **Given** a project with `testing.command` configured
- **When** `compileStep` compiles `apply` (`--md`) or an agent reads `plugins/medra/pipelines/implementer-apply.md`
- **Then** the instructions explicitly direct `--run` to target relevant test files/patterns per task and leave the full `testing.command` suite to `medra suite`

## MODIFIED Requirements

### REQ PLUG-006: Batch apply granularity across satisfied dependencies

The system SHALL support `apply.granularity: task | batch` (default `batch`), `apply.batch_max_tasks` (default `4`), and `apply.batch_scope: phase | cross-phase` (default `cross-phase`) in `docs/config-flow.yaml` so `full`-track `apply` groups pending tasks whose dependencies are satisfied—within the same phase when `apply.batch_scope: phase`, or across adjacent phases when `apply.batch_scope: cross-phase`—allowing `[TEST]` and dependent implementation tasks in the same batch while requiring per-task `medra task done` checkpoints and stopping on `needs-decision`, while `legacy_fallback` and `apply.granularity: task` preserve single-task dispatch.

#### Scenario PLUG-006.S1: Cross-phase and phase-scoped batch grouping

- **Given** a `full`-track change with pending tasks across phases (`T001 [TEST]` in Phase 1, `T002 after T001` in Phase 2, `T003` with satisfied dependencies in Phase 2, `T004` in Phase 3, `T005` in Phase 3) and `apply.granularity: batch`, `apply.batch_max_tasks: 4`
- **When** `compileStep` compiles `apply` with `apply.batch_scope: cross-phase`
- **Then** it returns `granularity: "batch"` with `T001`–`T004` in one implementer dispatch (stopping at `batch_max_tasks`), and when `apply.batch_scope: phase` it groups only same-phase tasks (`T001`)

#### Scenario PLUG-006.S2: Preserving task granularity for config override and legacy fallback

- **Given** `apply.granularity: task` or a 1.x `legacy_fallback` `tasks.md`
- **When** `compileStep` compiles `apply`
- **Then** it dispatches one task at a time (`granularity: "task"`)

# Delta: workflow-state

**Capability:** `workflow-state`

## ADDED Requirements

### REQ STATE-006: Incremental verify handoff metadata and pre-dispatch checks

The system SHALL reuse `cli/src/handoff.js` inside `buildVerifySubagents` (`cli/src/step.js`) to emit per-subagent `round`, round-numbered `report` (`reviews/<date>-verify-<role>-r<N>.md`), `previous_report`, `changed_since_previous` (from round 2 onward), and `suite` (when `testing.command` is configured), while gating dispatch on handoff readiness checks (`verify.suite`, `verify.merge`) and keeping `latestReport` / `reportFreshness` accurate across round-numbered report filenames.

#### Scenario STATE-006.S1: Incremental second-round diff and non-overwriting report paths

- **Given** a change that completed round 1 of `verify` (`reviews/*-verify-reviewer-r1.md`) and then modified a subset of files
- **When** `compileStep` builds round 2 `verify` subagents
- **Then** `round` is `2`, `report` points to `reviews/<date>-verify-reviewer-r2.md` without overwriting round 1, `previous_report` points to round 1, `changed_since_previous` lists only files changed since round 1, and `latestReport` / `reportFreshness` resolve the highest round

#### Scenario STATE-006.S2: Pre-dispatch suite and merge check gating

- **Given** a change at `verify` with a configured `testing.command` whose `suite` is stale or failing (or `verify.merge` fails)
- **When** `compileStep` compiles the `verify` step
- **Then** it returns `action: "gate"` with the blocking finding instead of dispatching `reviewer` or `security` subagents

### REQ STATE-007: Clean project configuration without inline model warnings

The system SHALL keep `docs/config-flow.yaml` free of ineffective inline model overrides (`models.plan: inherit`) and document `apply.granularity` and `apply.batch_max_tasks` so `medra validate --project` exits 0 with zero warnings.

#### Scenario STATE-007.S1: Zero warnings from medra validate --project

- **Given** `docs/config-flow.yaml` with `models.plan: inherit` and documented `apply.granularity` / `apply.batch_max_tasks`
- **When** `medra validate --project specs --json` runs
- **Then** it exits `0` with zero warnings

## MODIFIED Requirements

### REQ STATE-005: Release-candidate versioning and 1.x docs compatibility

The system SHALL ship the 2.0 workflow on branch `v2` at version `2.0.0-rc.5` across `cli/package.json`, `plugin.json`, the plugin bundle, and `CHANGELOG.md` while preserving full compatibility with 1.x `docs/` layouts, existing CLI commands, additive `docs/config-flow.yaml` keys (including `apply.inline_max_tasks`, `apply.granularity`, `apply.batch_max_tasks`, and per-role `models`), and deterministic `verify_fix_rounds` reset semantics.

#### Scenario STATE-005.S1: Running 2.0-rc CLI on a 1.x docs layout

- **Given** a project initialized with 1.x `docs/` files and no `models:` or `apply:` section in `docs/config-flow.yaml`
- **When** the `2.0.0-rc.5` CLI runs `status`, `context`, or the step-prompt compiler
- **Then** all commands succeed using safe defaults (`inherit` model policy, `apply.inline_max_tasks: 3`, `apply.granularity: batch`, `apply.batch_max_tasks: 4`) without requiring manual file migration

# Delta: Workflow State

**Capability:** `workflow-state`

## MODIFIED Requirements

### REQ STATE-006: Incremental verify handoff metadata and pre-dispatch checks

The system SHALL reuse `cli/src/handoff.js` inside `buildVerifySubagents` (`cli/src/step.js`) to emit per-subagent `round`, round-numbered `report` (`reviews/<date>-verify-<role>-r<N>.md`), `previous_report`, `changed_since_previous` (from round 2 onward), and `suite` (when `testing.command` is configured), tagging `verify.suite` findings with a structured `reason` (`not-run`, `stale`, or `failed`) so `compileVerifyStep` gates only on `failed` suites or `verify.merge` findings while routing `not-run`/`stale` suite findings to `coordinator_steps[]`, and keeping `latestReport` / `reportFreshness` accurate across round-numbered report filenames.

#### Scenario STATE-006.S1: Incremental second-round diff and non-overwriting report paths

- **Given** a change that completed round 1 of `verify` (`reviews/*-verify-reviewer-r1.md`) and then modified a subset of files
- **When** `compileStep` builds round 2 `verify` subagents
- **Then** `round` is `2`, `report` points to `reviews/<date>-verify-reviewer-r2.md` without overwriting round 1, `previous_report` points to round 1, `changed_since_previous` lists only files changed since round 1, and `latestReport` / `reportFreshness` resolve the highest round

#### Scenario STATE-006.S2: Pre-dispatch suite and merge check gating

- **Given** a change at `verify` with a configured `testing.command` whose `suite` failed (`reason: "failed"`) or where `verify.merge` fails
- **When** `compileStep` compiles the `verify` step
- **Then** it returns `action: "gate"` with the blocking finding instead of dispatching `reviewer` or `security` subagents

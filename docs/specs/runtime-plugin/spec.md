# Runtime Plugin & Portability

**Capability:** `runtime-plugin`
**ID prefix:** `PLUG`
**Paths:** `plugins/medra/**`, `cli/src/install.js`, `cli/src/handoff.js`, `cli/scripts/bundle-plugin.js`, `cli/scripts/check-version.js`

## Purpose

Provides the `/medra:*` command skills, delegated `reviewer` and `security` agents, runtime portability across Claude Code and Antigravity, guard hooks, and plugin bundling/installation.

## Requirements

<!-- retired: PLUG-001.S1, PLUG-001.S2, PLUG-001.S3, PLUG-002.S1, PLUG-004.S1, PLUG-004.S2, PLUG-004.S3, PLUG-005.S1 -->

### REQ PLUG-001: Command skills and delegated agents

The system SHALL provide thin coordinator command skills (`init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `archive`, `review`, and `run`) that obtain deterministic step envelopes from the `medra` CLI, follow only the envelope's `action` (`dispatch`, `gate`, or `inline`) without inferring dispatch from stage names, run `medra verify-fix` as coordinator before dispatching a verify fix implementer, pass subagents their `fetch_command` with an `<untrusted_data>` reminder instead of copying full prompt bodies, direct subagents to subagent-facing pipeline/reference files, and warn the user instead of dispatching a blind verify when `compileStep` reports a git diff error.

#### Scenario PLUG-001.S4: Coordinator skills follow envelope action without stage-name dispatch contradictions

- **Given** `plugins/medra/skills/{propose,plan,tasks,apply,verify,run}/SKILL.md` and affected pipelines
- **When** inspected for stage-dispatch contradictions
- **Then** `run/SKILL.md` and the other command skills follow `action` strictly and no skill states that `propose`, `plan`, or `tasks` are dispatched to a subagent

### REQ PLUG-002: Cross-runtime portability

The system SHALL keep command skills, plugin-relative pointers, and agent contracts portable across Claude Code and Antigravity using the runtime tool mapping in `references/portability.md`.

#### Scenario PLUG-002.S2: Portable plugin pointers and subagent guard documentation

- **Given** a user project running under Claude Code or Antigravity
- **When** skills resolve plugin pointers, select subagent model tiers, or enforce subagent gate and `verify-fix` boundaries
- **Then** `references/portability.md` documents how plugin pointers resolve on both runtimes, notes that Antigravity subagent model tiers apply only when `invoke_subagent` supports model selection (otherwise inheriting the session model), and documents the Antigravity boundary for subagent gate and `verify-fix` protection

### REQ PLUG-003: Bundled plugin and version parity

The system SHALL keep `cli/plugin/` and any versioned `.agents/plugins/medra/` bundle synchronized with `plugins/medra/` without divergence and enforce matching versions via `npm --prefix cli run check-version` and CI drift checks.

#### Scenario PLUG-003.S1: Prepack and CI parity check

- **Given** edits to `plugins/medra/` or `cli/package.json` for `2.0.0-rc.5`
- **When** `npm --prefix cli run check-version`, bundle generation, and CI drift checks run
- **Then** versions match and `cli/plugin/` and `.agents/plugins/medra/` reflect `plugins/medra/` with zero divergence

### REQ PLUG-004: Claude Code PreToolUse guard hook

The system SHALL enforce CLI-owned file boundaries, `medra gate ... --approve`, and `medra verify-fix` coordinator-only boundaries on Claude Code via `hooks/guard.mjs`, preventing subagents from running `medra gate ... --approve` or `medra verify-fix` using verified Claude Code PreToolUse subagent detection (`agent_id` or `MEDRA_SUBAGENT=1`) with any platform limitation documented in `references/gate.md`.

#### Scenario PLUG-004.S4: Blocking medra verify-fix for subagents

- **Given** a subagent dispatched under Claude Code (`input.agent_id` set or `MEDRA_SUBAGENT=1`)
- **When** `guard.mjs` evaluates a `medra verify-fix` Bash command
- **Then** `guard.mjs` denies the command for subagents while allowing coordinator calls, and `references/gate.md` documents the rule and Antigravity boundary

### REQ PLUG-005: Optional subagent model overrides with inherit fallback

The system SHALL default subagent model selection to `inherit`, support optional per-role (`author`, `implementer`, `reviewer`, `security`) and per-stage overrides in `docs/config-flow.yaml` with precedence `role -> stage -> default -> inherit`, and fall back to `inherit` if a configured model or tier is unavailable on the active runtime.

#### Scenario PLUG-005.S2: Per-role subagent model resolution

- **Given** `docs/config-flow.yaml` configuring `models: { verify: pro, security: flash }` or `models: { implementer: flash }`
- **When** `compileStep` builds `subagents[]`
- **Then** `reviewer` receives `pro`, `security` receives `flash`, task `implementer` receives `flash`, and unconfigured setups default all roles to `inherit`

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

### REQ PLUG-007: Agent-oriented lean coordinator skills

The system SHALL structure all 9 coordinator skills in `plugins/medra/skills/` (`init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `archive`, `review`, `run`) with `Purpose`, `Input`, `Preconditions`, `Loop/Steps`, and `Avoid` (with rationale), omitting spec/mitigation IDs, eliminating repeated stage-dispatch boilerplate, restoring the user-language rule, and keeping total skill size within `+10%` of `2.0.0-rc.4`.

#### Scenario PLUG-007.S1: Lean skill structure, no spec IDs, and user-language rule

- **Given** the 9 `plugins/medra/skills/*/SKILL.md` files
- **When** audited for structure, spec IDs, user-language instruction, and byte size vs `2.0.0-rc.4`
- **Then** all 9 skills omit `REQ`/`PLUG-*`/`CTX-*`/`M-*` IDs, include the user-language rule and `Avoid` with rationale, and total size is `<= 110%` of `2.0.0-rc.4`

### REQ PLUG-008: Deterministic coordinator_steps[] in step envelopes

The system SHALL emit an explicit `coordinator_steps[]` array in `medra step` envelopes (listing ordered coordinator actions such as `medra verify-fix`, `medra suite <change> --json` when `verify.suite` is `not-run` or `stale` without other blocking findings, and `ask_user` pauses on `diff_error`) before `subagents[]`, so coordinator skills execute `coordinator_steps[]` in order and loop back to `medra step` even when `subagents[]` is empty.

#### Scenario PLUG-008.S1: Explicit coordinator_steps[] for verify-fix and diff_error

- **Given** a `verify` step with blocking findings (`0` fix rounds) or a git `diff_error`
- **When** `compileStep` builds the envelope
- **Then** `coordinator_steps[]` explicitly lists the `medra verify-fix` command or `ask_user` pause step before `subagents[]`

#### Scenario PLUG-008.S2: Pre-verify suite command step when suite is not-run or stale

- **Given** a change entering `verify` with `testing.command` configured and `verify.suite` reporting `reason: "not-run"` or `reason: "stale"` (and no `failed` or `verify.merge` findings)
- **When** `compileStep` compiles the `verify` step
- **Then** it returns `action: "dispatch"`, `coordinator_steps: [{ type: "command", command: "medra suite <change> --json" }]`, `subagents: []`, writes no round snapshot to state, and after running `medra suite` the next `medra step` dispatches `reviewer` (and `security` when relevant) with `round: 1` and `suite: "green"` (or emits `coordinator_steps` again if code changes before verify); if `testing.command` is unconfigured, no suite step is emitted

### REQ PLUG-009: CLI-level MEDRA_SUBAGENT=1 enforcement for runtimes without hooks

The system SHALL refuse `medra verify-fix`, `medra gate ... --approve`, and `medra gate ... --request-changes` inside the CLI whenever `process.env.MEDRA_SUBAGENT === '1'`, prefix every subagent `fetch_command` and `exit_command` in `medra step` envelopes with `MEDRA_SUBAGENT=1` (while leaving `coordinator_steps[]` and `inline` `exit_command` unprefixed), include a short `MEDRA_SUBAGENT=1` command-prefix instruction in compiled subagent prompts (`--md` / `--full`), support `MEDRA_SUBAGENT=1 medra ...` in `hooks/guard.mjs`, and accurately document the envelope convention and remaining Antigravity manual-edit/omission limits in `references/portability.md` and `references/gate.md`.

#### Scenario PLUG-009.S1: CLI refuses privileged commands when MEDRA_SUBAGENT=1

- **Given** `MEDRA_SUBAGENT=1` in the process environment
- **When** `medra verify-fix`, `medra gate <c> <s> --approve`, or `medra gate <c> <s> --request-changes` runs
- **Then** the CLI refuses with exit code `1` while allowing normal coordinator invocations when `MEDRA_SUBAGENT` is unset

#### Scenario PLUG-009.S2: Subagent commands carry MEDRA_SUBAGENT=1 while coordinator and inline commands do not

- **Given** `medra step` compiling `dispatch` / `done` subagents (`apply` task/batch/stage, `reviewer`, `security`, fix `implementer`, `archive`), `coordinator_steps[]`, and `inline` stages
- **When** the envelope and `--md`/`--full` subagent prompts are inspected and `hooks/guard.mjs` evaluates `MEDRA_SUBAGENT=1 medra gate x verify --approve`
- **Then** every subagent `fetch_command` and `exit_command` starts with `MEDRA_SUBAGENT=1 `, compiled subagent prompts state the `MEDRA_SUBAGENT=1` prefix rule, `coordinator_steps[]` and `inline` `exit_command` omit `MEDRA_SUBAGENT=1`, and `guard.mjs` denies the prefixed `gate`/`verify-fix` command for subagents

### REQ PLUG-010: Envelope-only archive dispatch on done

The system SHALL require `/medra:run` (`plugins/medra/skills/run/SKILL.md`) on `action === "done"` to dispatch the envelope's `subagents[]` (the `author` archive subagent pointing to `author-archive.md` with `MEDRA_SUBAGENT=1 medra archive <change> --json` as `exit_command`) and present the final summary, without offering a direct `medra archive` coordinator shortcut, remaining consistent with `plugins/medra/skills/archive/SKILL.md`.

#### Scenario PLUG-010.S1: Done step dispatches archive subagent per envelope

- **Given** a change ready for archive compiled via `medra step <change> --json`
- **When** `compileStep` returns `action: "done"`
- **Then** `subagents[]` contains one `author` subagent pointing to `author-archive.md` with `exit_command` starting with `MEDRA_SUBAGENT=1 medra archive <change> --json`, and `run/SKILL.md` instructs dispatching `subagents[]` rather than running `medra archive` directly

### REQ PLUG-011: Isolate test harness CLI helpers from caller MEDRA_SUBAGENT

The test harness helpers `medra()` and `medraHuman()` in `cli/test/helpers.js` SHALL strip `MEDRA_SUBAGENT` from the default child environment so the test suite passes identically whether invoked directly or from a subagent shell with `MEDRA_SUBAGENT=1`, while tests verifying subagent refusal explicitly set `MEDRA_SUBAGENT: '1'` per call.

#### Scenario PLUG-011.S1: Full test suite passes when invoked under MEDRA_SUBAGENT=1

- **Given** the test suite is executed with `MEDRA_SUBAGENT=1` in the parent environment
- **When** `npm --prefix cli test` runs
- **Then** all tests pass, including gate/verify fixture tests and explicit `MEDRA_SUBAGENT=1` refusal tests

### REQ PLUG-012: Document MEDRA_SUBAGENT=1 command scope in plugin references

`plugins/medra/references/gate.md` and `plugins/medra/references/portability.md` SHALL state that `MEDRA_SUBAGENT=1` applies only to the `medra` command invoked by the subagent and that the CLI removes it from the environment of test and check commands it executes, with bundle parity maintained.

#### Scenario PLUG-012.S1: Reference docs and bundled plugin reflect MEDRA_SUBAGENT=1 scope

- **Given** `plugins/medra/references/gate.md` and `plugins/medra/references/portability.md` are updated
- **When** bundles are regenerated and `node cli/scripts/check-bundle-drift.js` runs
- **Then** both reference files state that `MEDRA_SUBAGENT=1` applies only to the `medra` command called by the subagent and is stripped from child test/check processes, and bundle parity passes

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

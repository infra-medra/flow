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

### REQ PLUG-006: Batch-by-phase apply granularity on full track

The system SHALL support `apply.granularity: task | batch` (default `batch`) and `apply.batch_max_tasks` (default `4`) in `docs/config-flow.yaml` so `full`-track `apply` groups pending tasks from the same `tasks.md` phase whose dependencies are satisfied (allowing `[TEST]` and dependent implementation tasks in the same batch while requiring per-task `medra task done` checkpoints and stopping on `needs-decision`), while `legacy_fallback` and `apply.granularity: task` preserve single-task dispatch.

#### Scenario PLUG-006.S1: Grouping same-phase pending tasks into a batch

- **Given** a `full`-track change with pending tasks in the same phase (`T001 [TEST]`, `T002 after T001`, `T003`, `T004`, `T005`) and `apply.granularity: batch`, `apply.batch_max_tasks: 4`
- **When** `compileStep` compiles `apply`
- **Then** it returns `granularity: "batch"` with `T001`–`T004` in one implementer dispatch (excluding `T005` beyond `batch_max_tasks` and tasks from later phases), requiring `medra task done` per task and stopping on `needs-decision`

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

The system SHALL emit an explicit `coordinator_steps[]` array in `medra step` envelopes (listing ordered coordinator actions such as `medra verify-fix` commands and `ask_user` pauses on `diff_error`) before `subagents[]`, so coordinator skills execute `coordinator_steps[]` in order without conditional stage/role heuristics.

#### Scenario PLUG-008.S1: Explicit coordinator_steps[] for verify-fix and diff_error

- **Given** a `verify` step with blocking findings (`0` fix rounds) or a git `diff_error`
- **When** `compileStep` builds the envelope
- **Then** `coordinator_steps[]` explicitly lists the `medra verify-fix` command or `ask_user` pause step before `subagents[]`

### REQ PLUG-009: CLI-level MEDRA_SUBAGENT=1 enforcement for runtimes without hooks

The system SHALL refuse `medra verify-fix`, `medra gate ... --approve`, and `medra gate ... --request-changes` inside the CLI itself whenever `process.env.MEDRA_SUBAGENT === '1'`, propagate `MEDRA_SUBAGENT=1` to Antigravity subagents per `references/portability.md`, and document the remaining manual file-edit boundary in `references/gate.md`.

#### Scenario PLUG-009.S1: CLI refuses privileged commands when MEDRA_SUBAGENT=1

- **Given** `MEDRA_SUBAGENT=1` in the process environment
- **When** `medra verify-fix`, `medra gate <c> <s> --approve`, or `medra gate <c> <s> --request-changes` runs
- **Then** the CLI refuses with exit code `1` while allowing normal coordinator invocations when `MEDRA_SUBAGENT` is unset

# Delta: runtime-plugin

**Capability:** `runtime-plugin`

## MODIFIED Requirements

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

- **Given** edits to `plugins/medra/` or `cli/package.json` for `2.0.0-rc.4`
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

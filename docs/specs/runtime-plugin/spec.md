# Runtime Plugin & Portability

**Capability:** `runtime-plugin`
**ID prefix:** `PLUG`
**Paths:** `plugins/medra/**`, `cli/src/install.js`, `cli/src/handoff.js`, `cli/scripts/bundle-plugin.js`, `cli/scripts/check-version.js`

## Purpose

Provides the `/medra:*` command skills, delegated `reviewer` and `security` agents, runtime portability across Claude Code and Antigravity, guard hooks, and plugin bundling/installation.

## Requirements

### REQ PLUG-001: Command skills and delegated agents

The system SHALL provide thin coordinator command skills (`init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `archive`, `review`, and `run`) that obtain deterministic step prompts from the `medra` CLI, dispatch clean-context subagents (`author`, `implementer`, `reviewer`, `security`) directed to subagent-facing pipeline/reference files, use standardized `<untrusted_data>` fencing, and warn the user instead of dispatching a blind verify when `compileStep` reports a git diff error.

#### Scenario PLUG-001.S1: Delegating verification in parallel

- **Given** a security-relevant change with all tasks completed
- **When** `/medra:verify` runs
- **Then** `reviewer` and `security` are dispatched in isolated clean-context subagents using CLI-compiled handoffs and feed one isolated fix loop, or warn the user if a git diff error is reported

#### Scenario PLUG-001.S2: Continuous /medra:run until next human gate

- **Given** an active change whose current step requires no human decision
- **When** `/medra:run` executes
- **Then** it dispatches clean-context subagents for deterministic steps, warns and pauses on git diff errors during `verify`, and pauses at human gates or open clarification prompts

#### Scenario PLUG-001.S3: Adaptive apply granularity

- **Given** an approved change ready for `/medra:apply`
- **When** `track` is `full` versus `fast`
- **Then** `full` dispatches one clean-context subagent per pending task while `fast` executes all tasks in a single clean-context subagent, without empty persona headers in `apply/SKILL.md`

### REQ PLUG-002: Cross-runtime portability

The system SHALL keep command skills and agent contracts portable across Claude Code and Antigravity using the runtime tool mapping in `references/portability.md`.

#### Scenario PLUG-002.S1: Bundling for Antigravity workspace

- **Given** `antigravity` listed under `integrations` in `docs/config-flow.yaml`
- **When** `medra install --target antigravity` or `medra init` runs
- **Then** the plugin is installed into `.agents/plugins/medra/`

### REQ PLUG-003: Bundled plugin and version parity

The system SHALL keep `cli/plugin/` and any versioned `.agents/plugins/medra/` bundle synchronized with `plugins/medra/` without divergence and enforce matching versions via `npm --prefix cli run check-version` and CI drift checks.

#### Scenario PLUG-003.S1: Prepack and CI parity check

- **Given** edits to `plugins/medra/` or `cli/package.json`
- **When** `npm --prefix cli run check-version`, bundle generation, and CI drift checks run
- **Then** versions match and `cli/plugin/` and `.agents/plugins/medra/` reflect `plugins/medra/` with zero divergence

### REQ PLUG-004: Claude Code PreToolUse guard hook

The system SHALL enforce CLI-owned file boundaries and gate/ratify confirmation boundaries on Claude Code via `hooks/guard.mjs`, preventing subagents from approving human gates via `medra gate ... --approve`.

#### Scenario PLUG-004.S1: Blocking hand-edits to CLI-owned files

- **Given** a Claude Code session running `medra`
- **When** an agent attempts to directly write or edit `.medra.yaml` or `docs/changes/archive/`
- **Then** `guard.mjs` denies the tool call and directs the agent to the `medra` CLI

#### Scenario PLUG-004.S2: Guarding human gate approvals

- **Given** a Claude Code session running `medra`
- **When** a command attempts to run `medra gate <change> <stage> --approve` outside an authorized human-gate flow
- **Then** `guard.mjs` enforces the gate-approval boundary according to the evaluated guard policy

### REQ PLUG-005: Optional subagent model overrides with inherit fallback

The system SHALL default subagent model selection to `inherit`, support optional per-role or per-stage overrides in `docs/config-flow.yaml`, and fall back to `inherit` if a configured model or tier is unavailable on the active runtime.

#### Scenario PLUG-005.S1: Fallback to inherit when configured tier is unavailable

- **Given** `docs/config-flow.yaml` configures a model tier override for a stage that the active runtime rejects or lacks
- **When** the coordinator dispatches the subagent for that step
- **Then** the coordinator falls back to `inherit` without failing the step

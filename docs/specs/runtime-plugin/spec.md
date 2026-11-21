# Runtime Plugin & Portability

**Capability:** `runtime-plugin`
**ID prefix:** `PLUG`
**Paths:** `plugins/medra/**`, `cli/src/install.js`, `cli/src/handoff.js`, `cli/scripts/bundle-plugin.js`, `cli/scripts/check-version.js`

## Purpose

Provides the `/medra:*` command skills, delegated `reviewer` and `security` agents, runtime portability across Claude Code and Antigravity, guard hooks, and plugin bundling/installation.

## Requirements

### REQ PLUG-001: Command skills and delegated agents

The system SHALL provide thin coordinator command skills (`init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `archive`, `review`, and `run`) that obtain deterministic step prompts from the `medra` CLI and dispatch clean-context subagents (`author`, `implementer`, `reviewer`, `security`) using adaptive granularity.

#### Scenario PLUG-001.S1: Delegating verification in parallel

- **Given** a security-relevant change with all tasks completed
- **When** `/medra:verify` runs
- **Then** `reviewer` and `security` are dispatched in isolated clean-context subagents using CLI-compiled handoffs and feed one isolated fix loop

#### Scenario PLUG-001.S2: Continuous /medra:run until next human gate

- **Given** an active change whose current step requires no human decision
- **When** `/medra:run` executes
- **Then** it dispatches clean-context subagents for deterministic steps and pauses only at human gates or open clarification prompts

#### Scenario PLUG-001.S3: Adaptive apply granularity

- **Given** an approved change ready for `/medra:apply`
- **When** `track` is `full` versus `fast`
- **Then** `full` dispatches one clean-context subagent per pending task while `fast` executes all tasks in a single clean-context subagent

### REQ PLUG-002: Cross-runtime portability

The system SHALL keep command skills and agent contracts portable across Claude Code and Antigravity using the runtime tool mapping in `references/portability.md`.

#### Scenario PLUG-002.S1: Bundling for Antigravity workspace

- **Given** `antigravity` listed under `integrations` in `docs/config-flow.yaml`
- **When** `medra install --target antigravity` or `medra init` runs
- **Then** the plugin is installed into `.agents/plugins/medra/`

### REQ PLUG-003: Bundled plugin and version parity

The system SHALL keep `cli/plugin/` synchronized with `plugins/medra/` via `npm --prefix cli run bundle-plugin` and enforce matching versions via `npm --prefix cli run check-version`.

#### Scenario PLUG-003.S1: Prepack parity check

- **Given** edits to `plugins/medra/` or `cli/package.json`
- **When** `npm --prefix cli run check-version` and `bundle-plugin` run
- **Then** versions match and `cli/plugin/` reflects `plugins/medra/`

### REQ PLUG-004: Claude Code PreToolUse guard hook

The system SHALL enforce CLI-owned file boundaries and gate/ratify confirmation prompts on Claude Code via `hooks/guard.mjs`.

#### Scenario PLUG-004.S1: Blocking hand-edits to CLI-owned files

- **Given** a Claude Code session running `medra`
- **When** an agent attempts to directly write or edit `.medra.yaml` or `docs/changes/archive/`
- **Then** `guard.mjs` denies the tool call and directs the agent to the `medra` CLI

### REQ PLUG-005: Optional subagent model overrides with inherit fallback

The system SHALL default subagent model selection to `inherit`, support optional per-role or per-stage overrides in `docs/config-flow.yaml`, and fall back to `inherit` if a configured model or tier is unavailable on the active runtime.

#### Scenario PLUG-005.S1: Fallback to inherit when configured tier is unavailable

- **Given** `docs/config-flow.yaml` configures a model tier override for a stage that the active runtime rejects or lacks
- **When** the coordinator dispatches the subagent for that step
- **Then** the coordinator falls back to `inherit` without failing the step

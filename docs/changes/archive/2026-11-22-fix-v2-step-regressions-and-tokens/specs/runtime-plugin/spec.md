# Delta: Runtime Plugin & Portability

**Capability:** `runtime-plugin`

## MODIFIED Requirements

### REQ PLUG-001: Command skills and delegated agents

The system SHALL provide thin coordinator command skills (`init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `archive`, `review`, and `run`) that obtain deterministic step envelopes from the `medra` CLI, follow the envelope's `action` (`dispatch`, `gate`, or `inline`), pass subagents their `fetch_command` with an `<untrusted_data>` reminder instead of copying full prompt bodies, direct subagents to subagent-facing pipeline/reference files, and warn the user instead of dispatching a blind verify when `compileStep` reports a git diff error.

#### Scenario PLUG-001.S1: Delegating verification in parallel

- **Given** a security-relevant change with all tasks completed
- **When** `/medra:verify` runs
- **Then** it follows the envelope `action`, dispatching `reviewer` and `security` in isolated clean-context subagents via `fetch_command` and feeding one isolated fix loop, transitioning to `gate` when reports pass or after 1 fix round, or warning the user if a git diff error is reported

#### Scenario PLUG-001.S2: Continuous /medra:run until next human gate

- **Given** an active change whose current step requires no human decision
- **When** `/medra:run` executes
- **Then** it follows `action` (`dispatch`, `inline`, or `gate`), passing `fetch_command` on `dispatch`, warns and pauses on git diff errors during `verify`, and pauses at human gates or open clarification prompts

#### Scenario PLUG-001.S3: Adaptive apply granularity

- **Given** an approved change ready for `/medra:apply`
- **When** `track` is `full` versus `fast`
- **Then** `full` dispatches one clean-context subagent per pending task via `fetch_command` while `fast` executes inline when pending tasks `<= apply.inline_max_tasks` or in a single clean-context subagent above the threshold, without empty persona headers in `apply/SKILL.md`

### REQ PLUG-002: Cross-runtime portability

The system SHALL keep command skills, plugin-relative pointers, and agent contracts portable across Claude Code and Antigravity using the runtime tool mapping in `references/portability.md`.

#### Scenario PLUG-002.S1: Bundling for Antigravity workspace

- **Given** `antigravity` listed under `integrations` in `docs/config-flow.yaml`
- **When** `medra install --target antigravity` or `medra init` runs
- **Then** the plugin is installed into `.agents/plugins/medra/`

#### Scenario PLUG-002.S2: Portable plugin pointers and subagent guard documentation

- **Given** a user project running under Claude Code or Antigravity
- **When** skills resolve plugin pointers or enforce subagent gate boundaries
- **Then** `references/portability.md` documents how plugin pointers resolve on both runtimes and the Antigravity equivalent for subagent gate protection

### REQ PLUG-003: Bundled plugin and version parity

The system SHALL keep `cli/plugin/` and any versioned `.agents/plugins/medra/` bundle synchronized with `plugins/medra/` without divergence and enforce matching versions via `npm --prefix cli run check-version` and CI drift checks.

#### Scenario PLUG-003.S1: Prepack and CI parity check

- **Given** edits to `plugins/medra/` or `cli/package.json` for `2.0.0-rc.3`
- **When** `npm --prefix cli run check-version`, bundle generation, and CI drift checks run
- **Then** versions match and `cli/plugin/` and `.agents/plugins/medra/` reflect `plugins/medra/` with zero divergence

### REQ PLUG-004: Claude Code PreToolUse guard hook

The system SHALL enforce CLI-owned file boundaries and gate/ratify confirmation boundaries on Claude Code via `hooks/guard.mjs`, preventing subagents from approving human gates via `medra gate ... --approve` using verified Claude Code PreToolUse subagent detection (`agent_id` or `MEDRA_SUBAGENT=1`) with any platform limitation documented in `references/gate.md`.

#### Scenario PLUG-004.S1: Blocking hand-edits to CLI-owned files

- **Given** a Claude Code session running `medra`
- **When** an agent attempts to directly write or edit `.medra.yaml` or `docs/changes/archive/`
- **Then** `guard.mjs` denies the tool call and directs the agent to the `medra` CLI

#### Scenario PLUG-004.S2: Guarding human gate approvals

- **Given** a Claude Code session running `medra`
- **When** a command attempts to run `medra gate <change> <stage> --approve` outside an authorized human-gate flow
- **Then** `guard.mjs` enforces the gate-approval boundary according to the evaluated guard policy

#### Scenario PLUG-004.S3: Subagent detection in PreToolUse hook

- **Given** a subagent dispatched under Claude Code
- **When** `guard.mjs` evaluates a `medra gate ... --approve` command
- **Then** subagent detection (`agent_id` if provided by Claude Code PreToolUse, or `MEDRA_SUBAGENT=1` propagated to subagents) blocks the approval and `references/gate.md` documents the verified detection mechanism and any limitation

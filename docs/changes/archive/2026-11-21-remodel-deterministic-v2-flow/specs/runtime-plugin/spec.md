# Delta: Runtime Plugin & Portability

**Capability:** `runtime-plugin`

## ADDED Requirements

### REQ PLUG-005: Optional subagent model overrides with inherit fallback

The system SHALL default subagent model selection to `inherit`, support optional per-role or per-stage overrides in `docs/config-flow.yaml`, and fall back to `inherit` if a configured model or tier is unavailable on the active runtime.

#### Scenario PLUG-005.S1: Fallback to inherit when configured tier is unavailable

- **Given** `docs/config-flow.yaml` configures a model tier override for a stage that the active runtime rejects or lacks
- **When** the coordinator dispatches the subagent for that step
- **Then** the coordinator falls back to `inherit` without failing the step

## MODIFIED Requirements

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

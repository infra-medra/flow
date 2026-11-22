# Delta: Runtime Plugin

**Capability:** `runtime-plugin`

## ADDED Requirements

### REQ PLUG-010: Envelope-only archive dispatch on done

The system SHALL require `/medra:run` (`plugins/medra/skills/run/SKILL.md`) on `action === "done"` to dispatch the envelope's `subagents[]` (the `author` archive subagent pointing to `author-archive.md` with `MEDRA_SUBAGENT=1 medra archive <change> --json` as `exit_command`) and present the final summary, without offering a direct `medra archive` coordinator shortcut, remaining consistent with `plugins/medra/skills/archive/SKILL.md`.

#### Scenario PLUG-010.S1: Done step dispatches archive subagent per envelope

- **Given** a change ready for archive compiled via `medra step <change> --json`
- **When** `compileStep` returns `action: "done"`
- **Then** `subagents[]` contains one `author` subagent pointing to `author-archive.md` with `exit_command` starting with `MEDRA_SUBAGENT=1 medra archive <change> --json`, and `run/SKILL.md` instructs dispatching `subagents[]` rather than running `medra archive` directly

## MODIFIED Requirements

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

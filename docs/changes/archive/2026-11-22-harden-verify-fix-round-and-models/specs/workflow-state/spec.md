# Delta: workflow-state

**Capability:** `workflow-state`

## MODIFIED Requirements

### REQ STATE-005: Release-candidate versioning and 1.x docs compatibility

The system SHALL ship the 2.0 workflow on branch `v2` at version `2.0.0-rc.4` across `cli/package.json`, `plugin.json`, the plugin bundle, and `CHANGELOG.md` while preserving full compatibility with 1.x `docs/` layouts, existing CLI commands, additive `docs/config-flow.yaml` keys (including `apply.inline_max_tasks` and per-role `models`), and deterministic `verify_fix_rounds` reset semantics.

#### Scenario STATE-005.S1: Running 2.0-rc CLI on a 1.x docs layout

- **Given** a project initialized with 1.x `docs/` files and no `models:` or `apply:` section in `docs/config-flow.yaml`
- **When** the `2.0.0-rc.4` CLI runs `status`, `context`, or the step-prompt compiler
- **Then** all commands succeed using safe defaults (`inherit` model policy, `apply.inline_max_tasks: 3`) without requiring manual file migration

#### Scenario STATE-005.S2: Resetting verify_fix_rounds after request-changes or new work

- **Given** a change whose `verify_fix_rounds` reached `1` and was sent back via `medra gate <change> verify --request-changes` (with subsequent work completed)
- **When** the change returns to `verify` with blocking findings
- **Then** `verify_fix_rounds` has been reset according to the plan-approved rule so one new automatic fix round is allowed (or the non-reset rule is documented in `references/gate.md` and `workflow-state`)

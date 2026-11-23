# Delta: Workflow State & Gates

**Capability:** `workflow-state`

## ADDED Requirements

### REQ STATE-005: Release-candidate versioning and 1.x docs compatibility

The system SHALL ship the 2.0 workflow on branch `v2` as a `2.0.0-rc.x` release candidate while preserving full compatibility with 1.x `docs/` layouts, existing CLI commands, and additive `docs/config-flow.yaml` keys.

#### Scenario STATE-005.S1: Running 2.0-rc CLI on a 1.x docs layout

- **Given** a project initialized with 1.x `docs/` files and no `models:` section in `docs/config-flow.yaml`
- **When** the `2.0.0-rc.x` CLI runs `status`, `context`, or the step-prompt compiler
- **Then** all commands succeed using safe defaults (`inherit` model policy) without requiring manual file migration

# Workflow State & Gates

**Capability:** `workflow-state`
**ID prefix:** `STATE`
**Paths:** `cli/src/change.js`, `cli/src/commands.js`, `cli/src/documents.js`, `cli/src/specs.js`, `cli/bin/medra.js`

## Purpose

Manages project initialization, active change lifecycles, track classification, cryptographic human gates, and constitution ratification. Ensures all state transitions are deterministic and persisted atomically on disk.

## Requirements

### REQ STATE-001: Project initialization and layout

The system SHALL initialize the `docs/` scaffold (`config-flow.yaml`, `constitution.md`, `learnings.md`, `specs/`, `changes/archive/INDEX.md`) via `medra init` without overwriting existing files.

#### Scenario STATE-001.S1: Fresh project initialization

- **Given** a directory without `docs/config-flow.yaml`
- **When** the user runs `medra init --language en --integrations claude,antigravity --testing-mode tdd`
- **Then** the `docs/` scaffold is created with the configured values
- **And** existing files are never overwritten on subsequent runs

### REQ STATE-002: Change creation and track lifecycle

The system SHALL create change folders via `medra new <change> --track <fast|full>` with `.medra.yaml` state and allow track escalation via `medra track`.

#### Scenario STATE-002.S1: Creating a full-track change

- **Given** a project with a ratified constitution
- **When** the user runs `medra new add-feature --track full`
- **Then** `docs/changes/add-feature/.medra.yaml` is created in phase `proposed` with track `full`

### REQ STATE-003: SHA-256 human gates

The system SHALL record human gate decisions (`--approve`, `--request-changes --note`) via `medra gate`, hashing the stage's artifacts with SHA-256 and marking approved gates `stale` if artifacts change afterward.

#### Scenario STATE-003.S1: Stale gate detection

- **Given** an approved `proposal` gate on an active change
- **When** `proposal.md` or a delta spec is edited on disk
- **Then** `medra status` reports the `proposal` gate as `stale`

### REQ STATE-004: Constitution ratification and amendments

The system SHALL ratify and amend `docs/constitution.md` via `medra constitution ratify`, updating status, version, and the Amendments table deterministically.

#### Scenario STATE-004.S1: Initial ratification

- **Given** a valid `docs/constitution.md` in `draft` status
- **When** the user runs `medra constitution ratify --note "Initial constitution" --source init`
- **Then** `docs/constitution.md` status becomes `ratified` at version `1.0`

### REQ STATE-005: Release-candidate versioning and 1.x docs compatibility

The system SHALL ship the 2.0 workflow on branch `v2` as a `2.0.0-rc.x` release candidate while preserving full compatibility with 1.x `docs/` layouts, existing CLI commands, and additive `docs/config-flow.yaml` keys.

#### Scenario STATE-005.S1: Running 2.0-rc CLI on a 1.x docs layout

- **Given** a project initialized with 1.x `docs/` files and no `models:` section in `docs/config-flow.yaml`
- **When** the `2.0.0-rc.x` CLI runs `status`, `context`, or the step-prompt compiler
- **Then** all commands succeed using safe defaults (`inherit` model policy) without requiring manual file migration

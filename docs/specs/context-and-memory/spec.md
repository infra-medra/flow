# Context Packing, Archive & Learnings

**Capability:** `context-and-memory`
**ID prefix:** `CTX`
**Paths:** `cli/src/context.js`, `cli/src/archive.js`, `cli/src/learnings.js`

## Purpose

Delivers bounded project indexes and stage-specific context packs so agents avoid reading the entire repository. Merges approved deltas into living specs at archive and curates scoped project lessons.

## Requirements

### REQ CTX-001: Bounded project index

The system SHALL emit a compact project index via `medra index` listing constitution article titles, capability summaries, requirement titles, active changes, spec drift, and optional scoped learnings.

#### Scenario CTX-001.S1: Listing capabilities without full spec bodies

- **Given** a project with living specs in `docs/specs/`
- **When** `medra index` runs
- **Then** only capability headers, requirement IDs/titles, and active change summaries are output

### REQ CTX-002: Stage-scoped context packs

The system SHALL assemble bounded context packs via `medra context <change> --stage <stage>` containing touched requirements, collapsed sibling titles, scoped learnings, and `last_changed_by` archive pointers.

#### Scenario CTX-002.S1: Packing context for plan or apply

- **Given** an active change touching specific capabilities and requirements
- **When** `medra context <change> --stage apply --md` runs
- **Then** the pack includes only the touched requirements, matching learnings, and the next pending task

### REQ CTX-003: Delta archive merge

The system SHALL merge approved `ADDED`, `MODIFIED`, and `REMOVED` deltas byte-for-byte into `docs/specs/` via `medra archive`, move the change to `docs/changes/archive/`, and append to `INDEX.md`.

#### Scenario CTX-003.S1: Clean archive merge

- **Given** a change with an approved `verify` gate and no merge conflicts
- **When** `medra archive <change> --json` runs
- **Then** living specs are updated, the change folder is archived, and `INDEX.md` gains one summary row

### REQ CTX-004: Bounded learnings store

The system SHALL manage scoped lessons and preferences in `docs/learnings.md` via `medra learn`, enforcing `max_active` compaction and `promote_after` amendment candidates.

#### Scenario CTX-004.S1: Recording and scoping a learning

- **Given** a project with `docs/learnings.md`
- **When** `medra learn add` records a lesson scoped to a capability or path
- **Then** `medra context` surfaces it only when a change touches that scope

### REQ CTX-005: Deterministic step and prompt compilation

The system SHALL compile a minimal, self-contained step prompt and handoff envelope from on-disk change state via the `medra` CLI, resolving only the active step's touched requirements, scenarios, scoped decisions, scoped learnings, and hybrid code references.

#### Scenario CTX-005.S1: Compiling a single-task apply prompt

- **Given** a `full-track` change in `implementing` phase with pending task `T-01` citing `REQ CTX-005` and path `cli/src/context.js`
- **When** the CLI step-prompt compiler runs for the change
- **Then** the compiled output contains only `T-01`, the cited requirement/scenarios, scoped decisions/learnings, code path pointers, and the exact `medra task done` exit command

#### Scenario CTX-005.S2: Embedding contracts and diff for verify

- **Given** a change with all tasks completed and files in `contracts/`
- **When** the CLI step-prompt compiler runs for `verify`
- **Then** the compiled handoff embeds `contracts/*` contents and the change diff while keeping `apply` and `plan` steps pointer-only

#### Scenario CTX-005.S3: Legacy 1.x task fallback

- **Given** an existing 1.x `tasks.md` whose tasks omit explicit `REQ` or path pointers
- **When** the CLI step-prompt compiler runs for `apply`
- **Then** it falls back gracefully to the stage-scoped context pack without failing

# Delta: Context Packing, Archive & Learnings

**Capability:** `context-and-memory`

## ADDED Requirements

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

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

The system SHALL compile a minimal, self-contained step prompt and handoff envelope from on-disk change state via the `medra` CLI, resolving only the active step's touched requirements, scenarios, scoped decisions, scoped learnings, hybrid code references, and unambiguous runtime-portable plugin pointers, mapping flow stages to valid `medra validate` stages, transitioning `verify` deterministically between `dispatch` and `gate` using CLI-tracked fix rounds, deduplicating large embedded blocks at the top level, supporting compact default `--json` envelopes with deterministic `--role <role> [--task <T-ID>] --md` subagent fetch output (`--full` preserved), and supporting `action: "inline"` for small `fast`-track `apply` (and `propose`/`plan`/`tasks` if approved in plan), while surfacing git diff failures explicitly and fencing untrusted embedded content with `<untrusted_data>`.

#### Scenario CTX-005.S1: Compiling a single-task apply prompt

- **Given** a `full-track` change in `implementing` phase with pending task `T-01` citing `REQ CTX-005` and path `cli/src/context.js`
- **When** the CLI step-prompt compiler runs for the change
- **Then** the compiled output contains only `T-01`, the cited requirement/scenarios, scoped decisions/learnings, code path pointers, the `apply` pipeline pointer, and the exact `medra task done` exit command

#### Scenario CTX-005.S2: Embedding contracts and diff for verify

- **Given** a change in a git repository with a base commit, a modifying commit, all tasks completed, and files in `contracts/`
- **When** the CLI step-prompt compiler runs for `verify`
- **Then** `safeGitDiff` returns `{ diff, truncated }` with the changed lines stored in top-level `embedded` fenced in `<untrusted_data source="git-diff">`, and diffs exceeding `MAX_EMBED_BYTES` set `truncated: true` with a truncation warning in the prompt

#### Scenario CTX-005.S3: Legacy 1.x task fallback

- **Given** an existing 1.x `tasks.md` whose tasks omit explicit `REQ` or path pointers
- **When** the CLI step-prompt compiler runs for `apply`
- **Then** it falls back gracefully to the stage-scoped context pack without failing

#### Scenario CTX-005.S4: Distinguishing empty diff from git diff failure

- **Given** a change whose `diff_base` is a nonexistent git ref or a non-git directory versus a valid ref with no changes
- **When** the CLI step-prompt compiler runs for `verify`
- **Then** a legitimate empty diff succeeds with no error, whereas a git failure surfaces an explicit diff error in the envelope and prompt warning instead of silently returning an empty diff

#### Scenario CTX-005.S5: Pipeline pointers and author template guidance

- **Given** an active change at stage `propose`, `plan`, `tasks`, `apply`, or `verify`
- **When** the CLI step-prompt compiler runs for that stage
- **Then** the compiled envelope includes the corresponding plugin pipeline file in `pointers` instructing the subagent to read it first, and `author` prompts explicitly name the target document's `template.md`, `guide.md`, and completion criteria

#### Scenario CTX-005.S6: Security verify exit command and untrusted tag neutralization

- **Given** a security-relevant change at stage `verify` whose diff contains a closing `</untrusted_data>`, `</ untrusted_data >`, or `</untrusted-data>` injection
- **When** the CLI step-prompt compiler builds the `verify` subagents
- **Then** no subagent `exit_command` invokes `medra gate`, `security` uses a review-recording `exit_command`, and the fenced diff contains exactly one opening `<untrusted_data ...>` tag and one closing `</untrusted_data>` tag

#### Scenario CTX-005.S7: Flow-stage to validate-stage mapping in generated commands

- **Given** an active change at stage `propose`, `plan`, `tasks`, `apply`, or `verify`
- **When** `compileStep` generates `exit_command` and completion criteria text
- **Then** flow stage `propose` maps to `medra validate <change> --stage proposal`, and running any generated `exit_command` on an example project never exits with code `2`

#### Scenario CTX-005.S8: Verify action transitions with CLI-tracked fix rounds

- **Given** a change at `verify` with valid current review/security reports
- **When** `resolveStage` and `compileStep` evaluate `verifyFindings`
- **Then** no blockers returns `action: "gate", gate: "verify"`, blocking findings with `0` fix rounds returns `action: "dispatch"` for a fix implementer, and blocking findings after `1` CLI-recorded fix round returns `action: "gate", gate: "verify"` with findings in the envelope for human decision

#### Scenario CTX-005.S9: Unambiguous plugin pointers in external projects

- **Given** a user project without `plugins/` or `.agents/` at the repository root
- **When** `compileStep` emits `pipelinePointer` and template/guide pointers
- **Then** plugin-relative pointers are distinguished from project-relative pointers, resolve unambiguously in `cli/plugin/`, and do not prefer `.agents/plugins/medra/` over `plugins/medra/`

#### Scenario CTX-005.S10: Deduplicated top-level embedded blocks in verify envelope

- **Given** a security-relevant change at `verify` with a ~60 KB git diff and contracts
- **When** `compileStep` builds the `--full` verify envelope
- **Then** `diff` and `contracts` are stored once in top-level `embedded` and referenced by key from subagents without repeating the diff in `prompt`, so `JSON.stringify(env)` grows by at most 1x diff plus 1x contracts plus small margin

#### Scenario CTX-005.S11: Compact default JSON envelope and deterministic --role --md output

- **Given** an active change at any dispatchable stage
- **When** `medra step <change> --json` runs without `--full` versus `medra step <change> --role <role> [--task <T-ID>] --md`
- **Then** default `--json` omits inline prompt/embedded bodies and returns `role`, `task_id`, `model`, `exit_command`, and `fetch_command` (keeping verify coordinator JSON < 4 KB), while `--role ... --md` deterministically prints that role's exact prompt and referenced embedded blocks matching `--full`

#### Scenario CTX-005.S12: Small fast-track inline apply threshold

- **Given** a `fast`-track change at `apply` with `apply.inline_max_tasks` configured in `docs/config-flow.yaml` (default `3`)
- **When** pending tasks are `<= inline_max_tasks` versus `> inline_max_tasks`
- **Then** `compileStep` returns `action: "inline"` when at or below the threshold and `action: "dispatch"` when above it

#### Scenario CTX-005.S13: Inline propose, plan, and tasks execution (plan-gated)

- **Given** the B3 design decision is approved at the plan gate
- **When** `compileStep` runs for `propose`, `plan`, or `tasks`
- **Then** it returns `action: "inline"` using the CLI context slice and pipeline pointer rather than `action: "dispatch"`

#### Scenario CTX-005.S14: Step envelope schemas and size measurement script

- **Given** the updated optional envelope fields (`fetch_command`, `embedded` keys, `plugin_pointers`, `findings`)
- **When** `cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`, and `cli/scripts/measure-envelope.js` are evaluated
- **Then** both schemas validate the new optional fields without breaking existing 1.x/2.0-rc consumers and `measure-envelope.js` reports coordinator `--json` size < 4 KB

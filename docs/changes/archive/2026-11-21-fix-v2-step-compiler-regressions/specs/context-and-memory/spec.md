# Delta: Step Compiler Regressions & Untrusted Fencing

**Capability:** `context-and-memory`

## MODIFIED Requirements

### REQ CTX-005: Deterministic step and prompt compilation

The system SHALL compile a minimal, self-contained step prompt and handoff envelope from on-disk change state via the `medra` CLI, resolving only the active step's touched requirements, scenarios, scoped decisions, scoped learnings, hybrid code references, and stage pipeline pointers, while surfacing git diff failures explicitly and fencing untrusted embedded content with `<untrusted_data>`.

#### Scenario CTX-005.S1: Compiling a single-task apply prompt

- **Given** a `full-track` change in `implementing` phase with pending task `T-01` citing `REQ CTX-005` and path `cli/src/context.js`
- **When** the CLI step-prompt compiler runs for the change
- **Then** the compiled output contains only `T-01`, the cited requirement/scenarios, scoped decisions/learnings, code path pointers, the `apply` pipeline pointer, and the exact `medra task done` exit command

#### Scenario CTX-005.S2: Embedding contracts and diff for verify

- **Given** a change in a git repository with a base commit, a modifying commit, all tasks completed, and files in `contracts/`
- **When** the CLI step-prompt compiler runs for `verify`
- **Then** `safeGitDiff` returns `{ diff, truncated }` with the changed lines embedded in `reviewer` prompt and `embedded.diff` fenced in `<untrusted_data source="git-diff">`, and diffs exceeding `MAX_EMBED_BYTES` set `truncated: true` with a truncation warning in the prompt

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

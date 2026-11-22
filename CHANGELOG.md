# Changelog

All notable changes to `@medra.dev/flow` (`medra` CLI and the `medra` plugin for Claude Code and Antigravity) are documented in this file.

## [2.0.0-rc.5] — 2026-11-22

### Added
- **Incremental `verify` handoff & pre-dispatch checks (Item 1).** Reused `prepareVerifyRound` (`cli/src/handoff.js`) in `buildVerifySubagents` (`cli/src/step.js`) to emit per-subagent `round`, round-numbered `report` (`reviews/<date>-verify-<role>-r<N>.md`), `previous_report`, `changed_since_previous` (from round 2+), and `suite` (when `testing.command` is configured); enforced pre-dispatch checks (current green suite and `verify.merge`) returning `action: "gate"` with blocking `findings` on failure; kept `latestReport` / `reportFreshness` accurate across round-numbered files; updated `cli/schemas/envelope.schema.json` and `contracts/step-envelope.schema.json`.
- **Phase-scoped `batch` `apply` granularity (Item 2).** Added `apply.granularity: "batch"` (default; `"task"` or `legacy_fallback` preserves per-task dispatch) and `apply.batch_max_tasks: 4` in `DEFAULT_CONFIG`, grouping pending same-phase tasks with satisfied dependencies (including `[TEST]` + dependent implementation tasks) into `granularity: "batch"` with deduplicated REQs, decisions, learnings, and pointers, per-task `medra task done` checkpoints, and immediate `needs-decision` stop on `task.test-tampered` or `blocked`.
  - **`task` vs `batch` benchmark (`2026-11-21-remodel-deterministic-v2-flow`):** `task` granularity required `14` dispatches (`189,545 B` total) vs `batch` granularity with `5` dispatches (`68,113 B` total, `-64.1%`).
- **Deterministic `coordinator_steps[]` in step envelopes (Item 5).** Emitted explicit ordered `coordinator_steps[]` (e.g., `medra verify-fix` before verify fix `implementer`, `ask_user` on `diff_error` or `action: "gate"`) in `compileStep` / `compileVerifyStep` and updated `envelope.schema.json` and `step-envelope.schema.json`.
- **CLI-level `MEDRA_SUBAGENT=1` enforcement (Item 6).** Refused `medra verify-fix`, `medra gate <c> <s> --approve`, and `medra gate <c> <s> --request-changes` with exit code `1` when `MEDRA_SUBAGENT=1` is set (covering Antigravity where Claude Code `PreToolUse` hooks do not run), and documented `MEDRA_SUBAGENT=1` propagation and remaining manual file-edit boundaries in `plugins/medra/references/portability.md` and `plugins/medra/references/gate.md`.

### Changed
- **Honest token & byte measurement (Item 3).** Updated `cli/scripts/measure-envelope.js` to account for coordinator skills + pointed pipelines + compiled envelopes/prompts per stage across 5 stages (`12,849 B` skills + `74,369 B` pipelines + `4,956 B` envelopes = `92,174 B`), correcting the `2.0.0-rc.1` `SKILL.md`-only `-78.9%` (`18,568 B` vs `88,176 B`) comparison that omitted pointed `plugins/medra/pipelines/*.md` files.
- **Agent-oriented coordinator skills (Item 4).** Rewrote all 9 coordinator skills (`plugins/medra/skills/*/SKILL.md`) to a lean structure (`Purpose`, `Input`, `Preconditions`, `Loop`/`Steps`, `Avoid` with rationale), removing spec IDs and redundant stage-dispatch rules, restoring the user-language rule, and executing `coordinator_steps[]` directly.
- **Clean `docs/config-flow.yaml` (Item 7).** Set `models.plan: inherit` (eliminating the `inline` stage model-override warning in `medra validate --project specs --json`) and documented `apply.granularity` and `apply.batch_max_tasks`.

### Verified
- **External-repo `/medra:run` E2E (`propose` -> `archive`).** Executed a full-track `add-greeting` change in an isolated temporary git repository outside `harness` (`init` -> `constitution ratify` -> `install --target antigravity` -> `new --track full` -> `propose` (`inline`) -> `gate proposal` -> `plan` (`inline`) -> `gate plan` -> `tasks` (`inline`) -> `gate tasks` -> `apply` (`batch`, 1 batch for `T001`+`T002`) -> `task done` (`T001` red, `T002` green) -> `suite` -> `verify` (`round: 1`, `report: ...-r1.md`, `suite: "green"`) -> `review` -> `gate verify` -> `archive`), ending with `medra status --json` (`changes: []`) and `medra validate --project specs --json` (`findings: []`).

## [2.0.0-rc.4] — 2026-11-22

### Fixed
- **Coordinator-owned `medra verify-fix` & hook protection (Item 1).** Moved `medra verify-fix` out of the fix `implementer`'s `exit_command` (now `medra suite <change> --json`) into coordinator skills (`run/SKILL.md`, `verify/SKILL.md`), added refusal guards in `verifyFix` when no blockers exist or a fix round is still unreviewed, kept `compileStep` idempotent, denied `medra verify-fix` for subagents in `plugins/medra/hooks/guard.mjs`, and documented the Antigravity boundary in `references/gate.md` and `references/portability.md`.
- **Reset `verify_fix_rounds` on `--request-changes` (Item 2).** Reset `verify_fix_rounds` and `last_fix_round_at` in `medra gate <change> verify --request-changes` so returning to `verify` after reopened work permits a new automatic fix round.
- **Skill & pipeline `inline` consistency (Item 4).** Removed the contradictory `propose`/`plan`/`tasks` subagent-dispatch line in `plugins/medra/skills/run/SKILL.md` and aligned coordinator skills and pipelines to follow envelope `action` strictly without inferring dispatch from stage names.
- **Recorded timestamp & SHA-256 report freshness (Item 5).** Recorded `reviews[].recorded_at` and file SHA-256 `hash` in `medra review`, evaluating freshness in `latestReport` / `verifyFindings` via `recorded_at` + hash verification (with `mtime` fallback only for legacy 1.x states without `recorded_at`).

### Changed
- **Per-subagent model resolution & schema updates (Item 3).** Resolved each `subagents[]` entry's `model` in `compileStep` in `role -> stage -> default -> inherit` order while keeping top-level `model` at the stage tier, added validation warnings when `models.propose/plan/tasks/author` override `inherit` on `inline` stages, and updated `cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`, and `plugins/medra/references/portability.md`.

## [2.0.0-rc.3] — 2026-11-22

### Fixed
- **Stage mapping for `propose` (A1).** Mapped flow stage `propose` to validation stage `proposal` in `compileStep` `exit_command` and completion criteria without altering `medra validate`’s stage vocabulary.
- **Verify state transitions and fix-round tracking (A2).** Aligned `resolveStage` and `compileStep` with `verifyFindings` and CLI-tracked fix-round state so `verify` transitions deterministically between `dispatch` (fix implementer) and `gate` (pass or escalated blockers), and updated `run`/`verify` skills to follow envelope `action`.
- **Unambiguous plugin pointers across runtimes (A3).** Separated plugin-relative pointers from project-relative pointers across Claude Code and Antigravity without preferring `.agents/plugins/medra/` over `plugins/medra/`.
- **Subagent gate-bypass detection (A4).** Verified and documented `agent_id` / `MEDRA_SUBAGENT=1` subagent detection in `plugins/medra/hooks/guard.mjs` and `plugins/medra/references/gate.md`.

### Changed
- **Top-level `embedded` deduplication (B1).** Stored pre-fenced `diff` and `contracts/*` once in top-level `embedded` with `embedded_keys` references on `verify` subagents.
- **Compact default `--json` envelope and `--role ... --md` fetch (B2).** Omitted `prompt` and `embedded` from default `medra step --json` output (adding `fetch_command` while preserving `--full`), added `medra step --role <role> [--task <T-ID>] --md`, updated coordinator skills to pass `fetch_command`, and removed empty persona headers in `apply/SKILL.md`.
- **Inline execution for authoring stages and small fast-track `apply` (B3, B4).** Added `apply.inline_max_tasks` (default `3`) in `DEFAULT_CONFIG` for `action: "inline"` on small `fast`-track `apply` changes, and enabled `action: "inline"` for `propose`, `plan`, and `tasks`.

## [2.0.0-rc.2] — 2026-11-21

### Fixed
- **Verify git diff embedding and failure surfacing (P1, P2).** Unified `safeGitDiff` to return `{ diff, truncated }` and distinguish empty diffs from git command failures, surfacing `diff_error` in the compiled step envelope and `cli/schemas/envelope.schema.json` so `/medra:run` and `/medra:verify` abort instead of reviewing a blind empty diff.
- **Subagent authoring and implementation pipelines (P3).** Restored 1.x authoring rules, personas, phases, and exit criteria into `plugins/medra/pipelines/` (`author-init`, `author-propose`, `author-plan`, `author-tasks`, `author-archive`, `implementer-apply`), wired them into `compileStep` pointers and instructions, and removed empty headers in `apply/SKILL.md`.
- **Security subagent exit command and gate approval guard (P4).** Replaced `security` verify `exit_command` with `medra review` instead of `medra gate`, and enforced blocking `medra gate ... --approve` calls in `plugins/medra/hooks/guard.mjs`.
- **Standardized `<untrusted_data>` fencing (P5).** Unified untrusted-data tags on `<untrusted_data>` across `cli/src/step.js`, skills, and pipelines while neutralizing both hyphen/underscore and whitespace/case closing-tag variants.

### Changed
- **Bundle drift verification (P6).** Added `cli/scripts/check-bundle-drift.js` and CI enforcement to keep `cli/plugin/` and `.agents/plugins/medra/` in lockstep with `plugins/medra/`.
- **`compileStep` envelope helper (P7).** Extracted the `envelope(base, overrides)` helper in `cli/src/step.js` for consistent step-envelope construction.

## [2.0.0-rc.1] — 2026-11-21

### Added
- **Deterministic step compiler (`medra step <change> [--stage <stage>] [--json]`).** Compiles minimal, self-contained handoff envelopes (`action`, `granularity`, `model`, `subagents[]`, `gate`, `legacy_fallback`) from on-disk change state (`cli/src/step.js`). Uses hybrid code references: path `pointers` for `plan`/`apply` and `<untrusted_data>`-fenced `contracts/*` + `git diff` for `verify`.
- **New `/medra:run` coordinator skill.** Loops deterministically through `medra step --json`, dispatches isolated clean-context subagents, and pauses only at human gates or open `[NEEDS CLARIFICATION]` prompts.
- **Optional `models:` config with `inherit` fallback.** `docs/config-flow.yaml` supports optional `models:` per-stage/per-role overrides while defaulting to `inherit` and falling back to `inherit` if a runtime rejects a configured tier (`configWarnings` validates unknown keys/tiers).
- **Task traceability validation (`tasks.traceability`).** At `--stage tasks`, `medra validate` requires tasks to cite target `REQ-NNN`/scenario IDs and backticked file paths, enabling deterministic per-task prompt slicing (`legacy_fallback: true` preserved for 1.x tasks).
- **Path-safe pointer filtering (`resolveSafePath`).** Task `pointers` extracted from `tasks.md` are validated against workspace boundaries to reject traversal (`../`) and absolute paths.

### Changed
- **Thin coordinator command skills & adaptive granularity.** All 9 command skills (`init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `archive`, `review`, `run`) delegate execution to `medra step --json` and isolated subagents (`task` granularity on `full` track, `stage` on `fast` track, parallel `reviewer` + `security` `round` on `verify`).
- **Measured token & payload reduction vs `1.x` (`main`):**
  - **Coordinator `SKILL.md` overhead (`-78.9%`):** `88,176 B` (~`22,044` tokens across 8 skills in `1.x`) reduced to `18,568 B` (~`4,642` tokens across 9 skills in `2.0.0-rc.1`).
  - **Initial `apply` context per task (`-96.4%`):** On the `remodel-deterministic-v2-flow` benchmark (`T001`), `1.x` `medra context --stage apply` references `30,477 B` (~`7,620` tokens) of stage docs loaded cumulatively in one session, whereas `2.0.0-rc.1` `medra step --stage apply --json` compiles `648 B` of task prompt (`1,103 B` full JSON envelope; ~`162` / `276` tokens) for an isolated clean-context subagent — eliminating cross-task context accumulation across 14 tasks.
  - **`verify` isolation:** Embeds `contracts/*` and `git diff` (`15,592 B` / ~`3,898` tokens in the compiled envelope) only at verification inside parallel `reviewer` and `security` subagents.

## [1.10.0] — 2026-11-20

### Added
- **`task.test-tampered` classifies the change.** `medra task done` keeps a snapshot of each test file it locks at red and, when the file changes, compares it with that snapshot. The finding carries `classification` (`additive`, `weakening` or `other`), the `diff` (lines added and removed, test names added or removed, the reasons) and a one-line summary. `additive` is claimed only when every red line is still there and the added lines disable nothing; removing, renaming or skipping a test, dropping an assertion, adding `.skip`/`.only`/`xit`/`fit`, deleting the file or opening an unclosed block comment is never additive.
- **`--reason` with `--allow-test-edit`.** The flag now requires `--reason "<text>"` (`task.test-edit-reason`, exit `1`). The evidence line records the reason and the diff summary, so the verify review sees what was authorized, and the accepted version is re-locked, so the next tasks on the same file pass without the flag.
- **`testing.allow-additive-test-edits`** (default `false`). When `true`, a purely additive edit of a locked test is accepted without the flag, recorded as a `[test-edit-additive: …]` warning in the evidence and re-locked. `weakening` and `other` changes still need `--allow-test-edit`.

### Changed
- **`/medra:apply` asks before any test-edit override.** On `task.test-tampered` the skill shows the diff summary and asks with `AskUserQuestion` ("Permitir --allow-test-edit" or "Reverter as linhas extras"); an ambiguous reply is not an authorization and the agent never passes `--allow-test-edit` on its own. It also states that a test file already checkpointed red is not edited, because corrections belong to the `[TEST]` task, before its checkpoint.
- **`/medra:tasks` lists every case before the red checkpoint.** A `[TEST]` task whose coverage can grow is worded to include all its cases, and `tasks.md` carries a note that editing the locked file afterwards needs the user's authorization.

## [1.9.0] — 2026-11-16

### Added
- **`medra handoff <change> check|audit|threat-model`.** Prints the dispatch payload of a handoff contract — round, report path, previous report and `--fixed` findings — after applying the contract's sender checks (exit `1` names what blocks the dispatch). `/medra:verify` and `/medra:plan` pass it on unchanged and no longer read the handoff files to compose it.
- **`changed_since_previous` in the check and audit payloads.** `medra handoff` hashes the files the change touched at every round and, from the second round on, lists the ones that differ from what the receiver's previous round saw. The reviewer and the security agent then re-inspect only those files and the open findings, and carry the rest of the previous report forward.
- **`medra suite <change>` and the `verify.suite` rule.** The command runs the whole test suite and every `testing.checks` command and records the result with a fingerprint of the change's code. The verify gate, and every `medra handoff check|audit`, now need a green run on the code as it is: an edit after the run, by any means, makes it stale. `/medra:verify` runs it in Readiness and again after each Fix round, and the reviewer no longer re-runs the tests when the payload says `suite: green`. Applies only when `testing.command` is set.
- **`verify.merge` rule.** The merge `medra archive` performs is run in memory at the verify stage and before every dispatch, so a living spec changed by another change is caught before the review and the gate instead of at archive.
- **Guard hook for Claude Code (`hooks/guard.mjs`).** `medra gate … --approve`, `medra constitution ratify` and `medra task done … --allow-test-edit` ask the user at the permission prompt; hand edits of `.medra.yaml`, the archive, and task ticks or evidence lines in `tasks.md` are denied; editing an existing living spec asks first. Each gate now takes two confirmations on Claude Code: the skill's question and the guard's prompt.
- **CI.** `.github/workflows/ci.yml` runs `check-version`, the plugin bundle and the tests on Node 20 and 22.
- **Validation rules:** `proposal.impact` (the four Impact lines are filled), `proposal.open-questions` (the section reads `None.` once no marker is left), and two extensions: `plan.test-strategy` requires every ADDED or MODIFIED scenario ID in the Test Strategy, and `plan.constitution` requires a Note on every `pass`. A change in flight whose proposal or plan misses one of these fails validation until the document is corrected, which makes an approved gate stale.

### Fixed
- **Verbose test output no longer fakes a failure.** `medra task done --run` used Node's 1 MB output limit, so a run that printed more was killed and read as a non-zero exit. The limit is now 64 MB.
- **`red` and `green` evidence needs a run.** `medra task done --evidence "<text>" --kind green` (or `red`) ticked a task on the agent's word, bypassing the exit-code check, the test-tampering guard's purpose and `testing.checks`. `--evidence` now records only `manual` evidence and is refused otherwise (`task.evidence`). In `tdd`, a task that names no requirement and cites no mitigation (setup, documentation) accepts `manual`; every other task is checkpointed with `--run`.

### Changed
- **Template checklists hold only judgment.** The Quality Checklists of the proposal, delta, plan, tasks, spec, constitution and threat-model guides drop every item `medra validate` enforces.
- **Self-review checks the text written in the session.** `/medra:propose`, `/medra:plan` and `/medra:tasks` re-read a document from disk only when `medra fix` repaired it, an earlier session wrote it, or its text is no longer verbatim in the session.
- **Phase 1 no longer repeats the opening call.** Each command skill's first phase works from the output of the opening shell call instead of listing the same commands again.
- **No model or effort pins.** The `model` and `effort` frontmatter keys added in 1.8.0 are removed from the eight command skills and from `agents/reviewer.md` and `agents/security.md`. Commands run on the model and effort of the user's session, and the subagents inherit them.

## [1.8.0] — 2026-11-12

### Changed
- **Command skills are the single source for each command.** The persona and phases that `agents/author.md`, `agents/implementer.md` and eight `pipelines/*.md` files (`author-*`, `implementer-*`, `reviewer-review`) mirrored had drifted from the skills, so those files are removed. `reviewer` and `security` keep their agent files and the three pipelines they run as subagents. `author` and `implementer` are no longer registered as subagent types.
- **Model and effort per command.** Each command skill declares `model` and `effort` (`opus` for `init`, `propose`, `plan`, `tasks`, `archive` and `review`; `sonnet` for `apply` and `verify`; all `high`). A command runs inline, so the values in the agent files never applied to it and it ran on the session's model.
- **One opening turn per command.** Each skill opens by reading `references/conventions.md` and running its precondition and Phase 1 CLI calls as a single shell call, in place of three or four sequential round-trips. The delegated pipelines read their handoff, conventions and template guide in one turn.
- **`references/conventions.md` split by audience.** The gate protocol moved to `references/gate.md`, read only when a command reaches a gate, and the runtime table to `references/portability.md`. The core file every agent and subagent reads went from 6.3 KB to 3.9 KB.
- **`/medra:apply` runs the green test once.** `medra task done --run` is the green run itself; the skill no longer runs the same command first. The `red` pre-run stays, because the failure reason has to be judged before the checkpoint locks the test files.
- **`/medra:apply` session budget.** After 6 or more tasks in one run, the skill ends at the next `tasks.md` phase boundary and recommends resuming in a fresh session.
- **`medra fix` repairs structure and never supplies judgment.** A missing Constitution Check row is added with result `pending` (refused by `plan.constitution`) instead of `pass`; missing proposal and plan sections hold a `[NEEDS CLARIFICATION: …]` marker instead of placeholder prose; `**Security:**` is never added or defaulted. The `propose` and `plan` skills now call `medra fix` for structural findings.
- **Routing as text.** The mermaid flowchart in each command skill and delegated pipeline is replaced by a short Routing list that states the same loops, limits and stop conditions.
- **Leaner subagent files.** `agents/reviewer.md` and `agents/security.md` drop the Summary table of contents and the References section, and shorten Presentation to the header rule.
- **`specDrift` spawns less git:** nothing when no capability can drift, and one diff per distinct spec commit.
- **Test suite split into four files** that `node --test` runs in parallel.

### Added
- **`plan.markers` validation rule:** an open `[NEEDS CLARIFICATION` marker in `plan.md` blocks the plan gate.

## [1.7.6] — 2026-11-12

### Security
- **Path Traversal Guard in Plugin Manifest Cleanup (`safeJoin`):**
  - Hardened `medra install --target antigravity` (`cli/src/install.js`) by adding `safeJoin(base, relative)` to validate all file paths parsed from existing `MANIFEST.json` and legacy manifests.
  - Absolute paths, `../` traversal, and any path escaping the target plugin/base root are rejected before cleanup, preventing arbitrary file deletion attacks from malicious or forged manifests.
  - Hardened directory pruning (`pruneEmpty`) with resolved path boundaries.

## [1.7.5] — 2026-11-12

### Added
- **Smart Slicing via `medra task context <change> [task]`:**
  - Implemented `medra task context <change> [task] [--json|--md]` command for high-efficiency, bounded task context retrieval during implementation.
  - Automatically extracts a 3-layer smart slice:
    1. **Architecture Anchor:** Summary and Test Strategy from `plan.md` (or `proposal.md`'s `why` on the fast track).
    2. **Dependencies & Prior Contracts:** Lists tasks in `after`, their completion status, and recorded evidence (e.g., passing tests or red baseline).
    3. **Scoped Requirements & Learnings:** Inlines the exact requirement delta blocks and living spec blocks cited by the task, along with path- and capability-matched learnings.
  - Defaults to the next executable task (`nextTask`) when `[task]` is omitted, or slices context for any explicit task ID (e.g. `T002`).
  - Added clean human Markdown output (`--md` or non-JSON mode) and JSON envelope support.
  - Updated `/medra:apply` skill to leverage `medra task context` for token-efficient implementation turns.
- **Deterministic Auto-Remediation (`medra fix [change]`):**
  - Added `medra fix [change] [--file <path>]` command (`cli/src/fix.js`) to auto-remediate mechanical validation errors in change documents without spending LLM generation tokens:
    - `plan.md`: Re-aligns anchors (`Summary`, `Constitution Check`, `Complexity Tracking`, `Test Strategy`, `Decisions`) in canonical sequence; injects missing live article rows into `Constitution Check`.
    - `proposal.md`: Syncs `## Capabilities` table against actual spec deltas on disk; aligns `**Track:**` with `.medra.yaml`; defaults `**Security:** not-relevant` when absent.
- **Test Output Noise Trimming & Sanitization (`sanitizeTestOutput`):**
  - Added `sanitizeTestOutput` in `cli/src/commands.js` to strip ANSI escape codes, filter out package manager / runtime boilerplate (`npm error`, `node:internal`), highlight actionable assertion failure blocks, and tightly bound output length (max 8 lines, 250 chars/line) on task failures (`task.red`, `task.green`, `task.check`).

## [1.7.4] — 2026-11-12

### Added
- **Prescriptive validation remediations (`remediation` in findings):**
  - Extended `finding()` (`cli/src/core.js`) with an optional `remediation` field containing prescriptive hints and examples for correcting validation failures.
  - Added `"remediation"` property to `Finding` in `cli/schemas/envelope.schema.json` and documented in `cli/SPEC.md` (§2).
  - Enriched validation rules across specs (`spec.shall`, `spec.scenario`, `spec.structure`, `spec.ids`), deltas (`delta.structure`, `delta.targets`, `delta.new-capability`), proposals (`proposal.structure`, `proposal.markers`, `proposal.capabilities`), plans (`plan.structure`, `plan.constitution`, `plan.threat-model`), tasks (`tasks.structure`, `tasks.after`, `tasks.coverage`, `tasks.test-before-impl`), task checkpoints (`task.test-tampered`, `task.red`, `task.green`, `task.check`), verification (`verify.tasks-done`, `verify.coverage`, `verify.report`), and constitution/learnings stores.
  - Formatted human CLI stderr output to display `↳ fix: <remediation>` below validation error messages for interactive workflows, while exposing `remediation` directly in `--json` output envelopes for agent tool consumption.

## [1.7.3] — 2026-11-11

### Changed
- **Package documentation:** Updated the `## Changelog` summary in `README.md` to document versions 1.7.0, 1.7.1, and 1.7.2 in the published package.

## [1.7.2] — 2026-11-11

### Changed
- **CLI payload token optimization and deduplication:**
  - `nextTaskPayload` (`cli/src/context.js`) now deduplicates requirement blocks in `parallel_batch` and omits duplicate requirements in `next_task` when a parallel batch is present.
  - Added Markdown formatting (`taskDoneMarkdown` and `taskBlockMarkdown`) for `medra task done` and `medra task block` (invocable with `--md` or by default without `--json`), avoiding escaped JSON token inflation during task checkpoints.
  - Compacted green evidence lines in `tasks.md` by omitting verbose stdout tails on `exit 0` runs, aligning with SPEC §5.2.

## [1.7.1] — 2026-11-11

### Changed
- **Token optimization via self-contained command skills (eliminated multi-hop start):**
  - Inlined essential operating persona principles and complete pipeline phase specifications directly into each of the 8 user-facing command skills (`init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `archive`, `review`).
  - Commands begin execution immediately at Phase 1 without requiring 2–4 sequential `read_file` tool call round-trips to load intermediate agent persona and pipeline files.
  - Standalone personas (`agents/`) and pipeline specifications (`pipelines/`) remain intact on disk for subagents (`medra-reviewer`, `medra-security`), references, and offline inspection.

## [1.7.0] — 2026-11-11

### Changed
- **Token optimization through progressive disclosure of plugin resources:**
  - Decoupled internal medra templates, handoffs, protocols, and pipelines from the top-level `skills/` registry. Only the 8 user commands (`init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `archive`, `review`) are now installed as skills.
  - Moved the 10 document templates to `templates/<name>/` (`guide.md` and `template.md`), the 11 pipeline specifications to `pipelines/`, the 3 inter-agent handoff contracts to `handoffs/`, and conventions to `references/conventions.md`.
  - Agents read these supporting resources via file tools (`read_file` / `Read`) only when relevant to the active stage, eliminating ~1,650 tokens of static skill descriptions from the system prompt on every conversation turn (~76% prompt reduction).
  - Updated `medra install --target antigravity` to copy all resource directories while registering strictly the 8 commands under `skills/`.

## [1.6.1] — 2026-11-10

### Fixed
- **`medra task done --kind red` no longer crashes with EISDIR (exit 4)** when a `[TEST]` task description has a backticked token that names a directory (for example `/`, `.`, `src`). Only regular files are now hashed for the test-tampering guard.

## [1.6.0] — 2026-11-06

### Added
- **Reverse spec drift detection (`medra drift`):** Capabilities that declare `**Paths:**` globs in their living spec are checked against git commits since the spec's last update and working-tree modifications (`git status --porcelain -uall`). When code files change without an active change covering that capability, `medra drift`, `medra status`, and `medra index` report the drifted capability and files.
- **Same-session `[P]` task batching (`parallel_batch`):** When the next runnable task in `tasks.md` is marked `[P]`, `medra context --stage apply`, `medra task done`, and `medra task block` group up to 3 ready `[P]` tasks from the same phase and kind (`[TEST]` vs implementation) into `parallel_batch`, allowing the implementer to batch file edits in parallel tool calls within a single warm session before running per-task `medra task done` checkpoints.
- **Expanded README documentation:** Added `Why Use This Workflow?`, `Key Benefits in Detail`, `Upgrading medra`, and the maintainer `Release checklist`.

## [1.5.1] — 2026-11-06

### Added
- **Package documentation:** Bundled `README.md` (with full CLI reference, configuration guide, and changelog) and `CHANGELOG.md` into the published `@medra.dev/flow` npm package, plus `repository`, `homepage`, and `keywords` metadata in `package.json`.

## [1.5.0] — 2026-11-06

### Added
- **Test-tampering guardrail (`task.test-tampered`):** In `tdd` mode, `medra task done` records the SHA-256 hashes of a `[TEST]` task's test files at the `red` checkpoint and refuses the subsequent `green` implementation checkpoint if any locked test file was modified or deleted. Pass `--allow-test-edit` when a test edit is intentional (stamps `[test-edited]` on the evidence line in `tasks.md`).
- **Static checks on green tasks (`testing.checks` / `task.check`):** Added `testing.checks` (list of shell commands, e.g. `["npm run lint", "npm run typecheck"]`) to `docs/config-flow.yaml`. `medra task done` runs them automatically after a passing `green` implementation test run.
- **Capability `**Paths:**` metadata:** Living specs and new-capability deltas now support an optional `**Paths:**` line with comma-separated code globs (e.g. ``**Paths:** `src/auth/**`, `test/auth/**` ``). `medra index` surfaces these paths, and `medra index --learnings` / `medra context` use them to match path-scoped learnings even before `plan.md` or `tasks.md` exist.
- **`next_task` in `medra task done` and `medra task block`:** Both commands now return the full `next_task` payload (`{id, line, requirements, phase_title}`), allowing `/medra:apply` to advance from task to task without re-running `medra context`.
- **Markdown mode for `medra index` (`--md`):** `medra index` now formats a compact Markdown overview by default (and with `--md`), and `medra context --stage verify --md` now includes scenario test locations (`file:line`).
- **Package documentation:** Bundled `README.md` (with full CLI reference, configuration guide, and changelog) and `CHANGELOG.md` into the `@medra.dev/flow` npm package.

### Changed
- **Token-optimized context packs:**
  - `medra context <change> --stage apply` no longer duplicates change-wide `requirements` at the top level (since `next_task.requirements` already carries the current task's requirement blocks).
  - For `MODIFIED` requirements in `medra context`, scenarios in the `living` block that are byte-for-byte identical to the `delta` block are collapsed to a single line (`#### Scenario <ID>: <Title> *(unchanged in delta)*`), keeping only modified or dropped scenarios in full.
  - All agent pipelines now read `medra index` and `medra context --md` as Markdown instead of JSON-escaped strings, and `medra:conventions` was slimmed down to reduce initial prompt overhead.

## [1.4.1] — 2026-11-04

### Fixed
- Resolved documentation drift across skills and CLI specification.
- Hardened `medra archive` atomicity and rollback handling when moving change folders and writing merged living specs.

## [1.4.0] — 2026-11-04

### Added
- **Security agent (`security` / Sentinel):** Joins changes marked `**Security:** relevant` in `proposal.md`:
  - **Threat modeling (`plan` stage):** Produces `threat-model.md` using STRIDE (`TM-NN` threats, `M-NN` mitigations, trust boundaries, entry points), verified against OWASP, ASVS, NVD and CISA KEV. Accepted and declined mitigations are tracked via `D-NN` plan decisions and `tasks.md`.
  - **Security audit (`verify` stage):** Runs in parallel with `reviewer · check` to audit the diff, configuration, and dependencies, writing `reviews/<YYYY-MM-DD>-security-agent-r<round>.md`.
  - **Residual risk tracking:** Security findings inform the verify gate without blocking it in the CLI; accepted findings are recorded via `medra gate verify --approve --note "accepted-risk: S-NN — <reason>"` and harvested into `docs/learnings.md` at archive.

## [1.3.0] — 2026-11-04

### Changed
- **Multi-round verification reports:** Verification reports now carry a `-r<round>` suffix (`<YYYY-MM-DD>-verify-agent-r<round>.md`). The highest round is used as the current report for `verify.report`, while earlier rounds remain on disk so `medra archive` can harvest lessons from findings fixed during verification.

## [1.2.0] — 2026-10-30

### Added
- **Native Antigravity plugin installer (`medra install --target antigravity`):** Generates a native Antigravity plugin in `.agents/plugins/medra/` (workspace) or `~/.gemini/config/plugins/medra/` (global), rewriting tool grants, subagent flags, and variable references, and automatically removing unedited legacy 1.1 loose skills.

## [1.1.0] — 2026-10-30

### Changed
- **Document layout under `docs/`:** Moved project files from `medra/` (`medra/config.yaml`) to `docs/` (`docs/config-flow.yaml`).
- **Automatic layout migration:** Any CLI command run in a 1.0 project automatically migrates `medra/` to `docs/` using `git mv` for tracked files and re-hashes valid approved gates with change-relative paths so approvals do not go stale.

## [1.0.0] — 2026-10-29

### Added
- Initial release of the `medra` spec-driven development workflow (`init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `review`, `archive`) and the deterministic `medra` CLI:
  - Ratified constitution with testable article gates (`docs/constitution.md`).
  - Living specs (`docs/specs/<capability>/spec.md`) with `ADDED`, `MODIFIED` and `REMOVED` deltas and deterministic `medra archive` merge.
  - Fast and full tracks with SHA-256 document-hashed human gates (`medra gate`).
  - Gherkin scenario IDs (`<REQ>.S<n>`) with test traceability (`medra coverage`) and TDD red/green task checkpoints (`medra task done --run`).
  - Bounded project learnings store (`docs/learnings.md`) with scope filtering, compaction, and constitution promotion candidates (`medra learn`).

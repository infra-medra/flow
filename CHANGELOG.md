# Changelog

All notable changes to `@medra.dev/flow` (`medra` CLI and the `medra` plugin for Claude Code and Antigravity) are documented in this file.

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

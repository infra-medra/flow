# Changelog

All notable changes to `@medra.dev/flow` (`medra` CLI and the `medra` plugin for Claude Code and Antigravity) are documented in this file.

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

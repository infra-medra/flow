# Plan: optimize-v2-tokens

## Summary

This change reduces v2 token consumption and step compilation latency across five coordinated improvements: (1) refactoring all 9 `plugins/medra/pipelines/*.md` files into compact core workflows while offloading rare edge-case/recovery procedures to `plugins/medra/references/*.md`, (2) enriching `medra step --role ... --md` with a bounded, deduplicated task pack (constitution summary, referenced `REQ`/scenario excerpts, and task lines) without bloating default `--json`, (3) guiding `apply` prompts and `implementer-apply.md` to run scoped per-task `--run` tests rather than the full `testing.command` suite, (4) adding `apply.batch_scope: phase | cross-phase` (default `cross-phase`) in `DEFAULT_CONFIG` and `buildApplySubagents`, and (5) stage-scoping `compileStep` so non-`verify` stages skip `safeGitDiff`, `suiteFindings`, and `prepareVerifyRound`.

## Constitution Check

| Article | Gate | Result | Note |
|---|---|---|---|
| I | Does every deterministic operation in this change run through the `medra` CLI without agents mutating CLI-owned state directly? | pass | `apply.batch_scope`, `--md` task-pack slicing, and stage-scoped `compileStep` fast paths are implemented deterministically in `cli/src/core.js` and `cli/src/step.js`. |
| II | Does every added or modified scenario map to a `[TEST]` task ordered before its implementation task and verified by `npm --prefix cli test`? | pass | Every scenario (`PLUG-006.S1`, `PLUG-006.S2`, `PLUG-013.S1`, `PLUG-014.S1`, `CTX-008.S1`, `STATE-008.S1`) has a `[TEST]` task before its implementation task. |
| III | Does this change preserve parity across Claude Code and Antigravity and keep `cli/plugin/` and package versions synchronized? | pass | Bundles are regenerated via `npm --prefix cli run bundle-plugin` and `medra install --target antigravity --force`, verified by `check-bundle-drift.js`. |
| IV | Are all path inputs validated against traversal and are all claims, test evidences, and security findings backed by direct tool execution or authoritative sources? | pass | Task-pack spec/constitution reads use resolved workspace paths and existing `resolveSafePath`; all measurements come from `measure-envelope.js` and `npm --prefix cli test`. |
| V | Does the design keep prompts/context bounded to touched artifacts and avoid abstractions or scope beyond the approved deltas? | pass | `pipelines/*.md` shrink by >= 40%, task packs include only referenced REQs and compact constitution summaries, and default `--json` remains untouched. |

## Complexity Tracking

None.

## Test Strategy

- **Command:** `node --test cli/test/optimize-v2-tokens.test.js` (full suite via `medra suite` before verify: `npm --prefix cli test`)
- **Framework:** Node built-in `node:test` + `node:assert/strict`

| Scenario | Level | Test location |
|---|---|---|
| `PLUG-006.S1` | unit | `cli/test/optimize-v2-tokens.test.js` |
| `PLUG-006.S2` | unit | `cli/test/step-compiler.test.js` |
| `PLUG-013.S1` | integration | `cli/test/optimize-v2-tokens.test.js` |
| `PLUG-014.S1` | unit | `cli/test/optimize-v2-tokens.test.js` |
| `CTX-008.S1` | integration | `cli/test/optimize-v2-tokens.test.js` |
| `STATE-008.S1` | unit | `cli/test/optimize-v2-tokens.test.js` |

## Decisions

### D-01: Compact core pipelines + on-demand reference files
**Choice:** Trim all 9 `plugins/medra/pipelines/*.md` files to compact core steps, rules, and output contracts, moving rare edge-case/recovery procedures (e.g., `legacy_fallback` details, `test-tampered` recovery, detailed threat-model checklists) into `plugins/medra/references/*.md`.
**Alternatives:** Inline everything in `pipelines/` (current ~74 KB overhead) or move pipelines into JS strings.
**Rationale:** Keeps pipelines human/agent-editable Markdown while cutting `total_pipeline_bytes` by >= 40%.

### D-02: Task pack injected only in `--md` (`fetch_command`)
**Choice:** Build a bounded task pack (constitution article summaries, referenced `REQ`/scenario blocks, and matching `tasks.md` lines) inside `stepMarkdown` / `buildStepPrompt` (`cli/src/step.js`), leaving default `medra step --json` free of these payloads.
**Alternatives:** Embed task packs in `medra step --json`.
**Rationale:** Coordinator loops stay minimal (`~800 B` per step) while dispatched subagents get self-contained context in one `fetch_command` call.

### D-03: Scoped `--run` tests during `apply`
**Choice:** Instruct `implementer-apply.md` and `apply` prompts (when `testing.command` is configured) to run targeted test files/patterns in `medra task done --run`, leaving the full `testing.command` suite for `medra suite`.
**Alternatives:** Always run full `testing.command` on every task.
**Rationale:** Prevents N redundant full-suite runs during a `batch` before `medra suite` runs once prior to `verify`.

### D-04: `apply.batch_scope: phase | cross-phase` defaulting to `cross-phase`
**Choice:** Add `apply.batch_scope` in `DEFAULT_CONFIG` (`cross-phase` default) and extend `buildApplySubagents` (`cli/src/step.js`) to include pending tasks with satisfied dependencies across phases up to `batch_max_tasks`, while preserving `phase` scoping when configured.
**Alternatives:** Keep `phase`-only batching permanently.
**Rationale:** Eliminates extra subagent dispatches on multi-phase changes with small independent tasks while keeping `phase` as an explicit opt-in fallback.

### D-05: Stage-scoped fast path in `compileStep`
**Choice:** Gate `safeGitDiff`, `suiteFindings`, and `verifyFindings` / `prepareVerifyRound` in `compileStep` (`cli/src/step.js`) behind `stage === 'verify'` (and only compute `verify` diff/handoff when `verify` actually dispatches or checks readiness).
**Alternatives:** Cache git diff on disk across CLI invocations.
**Rationale:** Zero cache-invalidation risk while immediately eliminating git/validation subprocess work on `propose`, `plan`, `tasks`, `apply`, and `done`.

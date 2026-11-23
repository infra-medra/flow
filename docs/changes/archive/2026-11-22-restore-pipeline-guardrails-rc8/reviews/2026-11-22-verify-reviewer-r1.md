# Review: restore-pipeline-guardrails-rc8 — verify

**Stage:** verify
**Verdict:** fail
**Counts:** critical 1 · major 1 · minor 3
**Reviewer:** reviewer agent
**Date:** 2026-11-22

## Summary

Verdict is `fail` because `T001` recorded `--kind red` on a module-load crash (`handleMainPromise`) rather than a scenario assertion, and `T002` subsequently rewrote `cli/test/restore-pipeline-guardrails.test.js` (`+49/-14 weakening`) after implementation, leaving no valid pre-implementation `red` failure for any of the four requirements under Constitution Article II and `VAL-007`. On disk, all four delta requirements (`VAL-007`, `PLUG-015`, `PLUG-016`, `PLUG-017`), `measure-envelope.js` (`36,567 B` vs `< 36,700 B`; `24,864 B` raw across `plugins/medra/pipelines/*.md`), version `2.0.0-rc.8`, and bundle parity (`cli/plugin/` and `.agents/plugins/medra/`) are implemented and `suite: green` is recorded, alongside one `major` test-assertion gap and three `minor` documentation/evidence discrepancies.

## Findings

### F-01 [critical] `T001` red evidence failed at module load and `T002` rewrote tests (`weakening`) post-implementation

**Where:** `docs/changes/restore-pipeline-guardrails-rc8/tasks.md:4,6` · `docs/changes/restore-pipeline-guardrails-rc8/.medra.yaml:27-29` · `cli/test/restore-pipeline-guardrails.test.js` · `T001`, `T002`, Constitution Article II, `VAL-007`
**Problem:** `T001`'s recorded `red` evidence (`# at async handleMainPromise (node:internal/modules/run_main:106:12) | # Node.js v18.19.1`) was a module-load/import failure before any test ran, not an unsatisfied scenario assertion. During `T002` (after implementing the pipeline and `cli/src/step.js` changes), `cli/test/restore-pipeline-guardrails.test.js` was rewritten via `--allow-test-edit` (`+49/-14 weakening (an assertion was removed or changed)` with reason `"User authorized fixing project() import, Node 18 import.meta.url path, and valid proposal/stage:apply fixture in restore-pipeline-guardrails.test.js"`), overwriting `.medra.yaml` `test_snapshots` with the post-edit hash `3069750c39dc60a86ca605653f9b01b3545a871fd63bcfb58e8bbe627cfabaab`. As a result, none of the current tests for `VAL-007.S1`, `PLUG-015.S1`, `PLUG-016.S1`, or `PLUG-017.S1` were ever observed failing against pre-implementation code, violating Constitution Article II ("observed failing before implementation") and `VAL-007`'s rule against wrong-reason `red`.
**Fix:** Verify in a clean baseline against `diff_base` (`20d0e22`) that the finalized `cli/test/restore-pipeline-guardrails.test.js` fails on the missing scenario behavior (not load/fixture errors) and record that verification, or obtain an explicit verify-gate decision from the user accepting the Article II / `--allow-test-edit` waiver for `T001`/`T002`.

### F-02 [major] Test assertions in `restore-pipeline-guardrails.test.js` use OR alternations and omit required clauses

**Where:** `cli/test/restore-pipeline-guardrails.test.js:67-68,84-85,106-108,115` · `VAL-007.S1`, `PLUG-015.S1`, `PLUG-016.S1`
**Problem:** Several assertions do not enforce the full scenario contracts: (1) in `VAL-007.S1` (`lines 67-68`, `84-85`), `inlinePrompt` and `batchPrompt` only match `/missing behavior the scenario predicts/i` and `/because\b/i`, without asserting the requirement to fix import/syntax/fixture/environment errors before `--kind red` or the rationale (`invalidates ... green`); (2) in `PLUG-015.S1` (`lines 107-108`), `/critical|high|medium|low|info/i` and `` /`fail`|`pass-with-findings`|`pass`/ `` use `|` alternation so any single keyword passes, and the test omits checking `plugins/medra/references/verify-checklists.md` §1 for removal of the duplicate verdict table; (3) in `PLUG-016.S1` (`line 115`), `/reason.*scenario|missing behavior.*because\b/i` permits the first branch without `because`. (Additionally, `lines 63,71` hand-write `.medra.yaml` with non-schema key `name:` instead of `change:` and `gates:`.)
**Fix:** Tighten `VAL-007.S1` to assert `import|syntax|fixture|environment` and `invalidates.*green` on both `inlinePrompt` and `batchPrompt`, assert each severity (`critical`, `high`, `medium`, `low`, `info`) and verdict (`` `fail` ``, `` `pass-with-findings` ``, `` `pass` ``) individually on `security-audit.md` plus absence of the duplicate verdict table in `verify-checklists.md` §1, and require `because\b` on both branches at `line 115`.

### F-03 [minor] Stale `session-budget` trigger remains in `implementer-apply.md` and `apply-recovery.md`

**Where:** `plugins/medra/pipelines/implementer-apply.md:10` · `plugins/medra/references/apply-recovery.md:3` · `PLUG-017`
**Problem:** Both files still instruct reading `apply-recovery.md` for `[P]/session-budget boundaries` (`[P] / session-budget edge cases`), even though `REQ PLUG-017` removed the session budget definition from `apply-recovery.md` §4 (`## 4. [P] Batching` at `lines 27-29`). An implementer hitting a session-budget boundary is directed to load `apply-recovery.md` unnecessarily.
**Fix:** Remove `/session-budget` from `plugins/medra/pipelines/implementer-apply.md:10` (keeping `[P] batching`) and `/ session-budget` from `plugins/medra/references/apply-recovery.md:3`, then re-run `npm --prefix cli run bundle-plugin` and `node cli/bin/medra.js install --target antigravity --force`.

### F-04 [minor] Inline verdict shorthand in `security-audit.md` omits `open` and `high`-confidence qualifiers

**Where:** `plugins/medra/pipelines/security-audit.md:27` · `PLUG-015`
**Problem:** Line 27 summarizes `Verdict` as `fail on any critical/high finding or missing mitigation; pass-with-findings on medium/low/info only; pass on 0 findings`, whereas `plugins/medra/templates/security-report/guide.md:82` defines `fail` as any `open` `critical` finding or `high` finding with `confirmed`/`high` confidence, `pass-with-findings` as other `open` findings, and `pass` when no `open` finding remains (so later rounds with only `remediated` findings can still `pass`). Because line 27 still points to `templates/security-report/guide.md` (read in Intake), this is non-blocking.
**Fix:** Clarify `open` findings and `confirmed`/`high` confidence on `high` in `plugins/medra/pipelines/security-audit.md:27` (e.g., `fail on open critical or confirmed/high-confidence high/missing mitigation; pass-with-findings on other open findings; pass on 0 open`) within the `36,700 B` budget, and re-sync bundles.

### F-05 [minor] `T003` checkpoint command omitted `measure-envelope.js` from `--run`

**Where:** `docs/changes/restore-pipeline-guardrails-rc8/tasks.md:7-8` · `T003`
**Problem:** `T003`'s `verify:` clause specifies `node cli/scripts/check-version.js && node cli/scripts/check-bundle-drift.js && node cli/scripts/measure-envelope.js` exits `0`, whereas the recorded `evidence green` command ran `node cli/scripts/check-version.js && node cli/scripts/check-bundle-drift.js && node --test cli/test/restore-pipeline-guardrails.test.js`. Direct verification during review confirmed `node cli/scripts/measure-envelope.js` exits `0` with `total_pipeline_bytes: 36567`, matching `CHANGELOG.md:18`, and `suite: green` (`npm --prefix cli test`) also exercises `measure-envelope.js` via `cli/test/optimize-v2-tokens.test.js:397`.
**Fix:** Include `node cli/scripts/measure-envelope.js` explicitly when re-running release verification checks in any fix round.

## Coverage

| Requirement | Evidence | Status |
|---|---|---|
| `VAL-007` | `plugins/medra/pipelines/implementer-apply.md:20`, `cli/src/step.js:295-298,324,367,407`, `cli/test/restore-pipeline-guardrails.test.js:15-86`, `medra coverage` (4/4), `suite: green` (see F-01, F-02) | met |
| `PLUG-015` | `plugins/medra/pipelines/reviewer-check.md:10,27-32`, `plugins/medra/references/verify-checklists.md:5-17`, `plugins/medra/pipelines/security-audit.md:27`, `cli/test/restore-pipeline-guardrails.test.js:88-109`, `medra coverage` (4/4), `suite: green` (see F-01, F-02, F-04) | met |
| `PLUG-016` | `plugins/medra/pipelines/implementer-apply.md:4,7,20,22`, `plugins/medra/pipelines/reviewer-check.md:6,8,32`, `plugins/medra/pipelines/security-audit.md:6-7`, all 9 `plugins/medra/pipelines/*.md` (`24,864 B` raw / `36,567 B` `measure-envelope.js` < `36,700 B`), `cli/test/restore-pipeline-guardrails.test.js:111-137`, `suite: green` (see F-01, F-02) | met |
| `PLUG-017` | `plugins/medra/pipelines/implementer-apply.md:23`, `plugins/medra/references/apply-recovery.md:27-29`, `cli/test/restore-pipeline-guardrails.test.js:139-147`, `medra coverage` (4/4), `suite: green` (see F-01, F-03) | met |

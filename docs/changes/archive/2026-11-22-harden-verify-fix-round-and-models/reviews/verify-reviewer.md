# Review: harden-verify-fix-round-and-models — verify

**Stage:** verify
**Verdict:** pass-with-findings
**Counts:** critical 0 · major 1 · minor 2
**Reviewer:** reviewer agent
**Date:** 2026-11-22

## Summary

All 12 modified scenarios across the 7 changed requirements are implemented, covered (`medra coverage` 12/12), and backed by 81/81 passing `npm --prefix cli test` checks, clean bundle/version parity (`2.0.0-rc.4`), and compact envelope sizes (`verify` at 1525 B with 0% growth over `2.0.0-rc.3`). One major timestamp-precision mismatch (`nowIso()` stripping milliseconds on `last_task_done_at` while `reviews[].recorded_at` retains them) can cause `reportFreshness` to treat a stale report as fresh when `medra review` and `medra task done` occur in the same second, and two minor documentation/schema consistency issues remain.

## Findings

### F-01 [major] Same-second `nowIso()` truncation on `last_task_done_at` can falsely keep `recorded_at` reports fresh

**Where:** `cli/src/commands.js:207`, `cli/src/commands.js:415`, `cli/src/core.js:147`, `cli/src/validate.js:280-285` · `CTX-005.S17` / T011
**Problem:** `review()` stores `reviews[].recorded_at = new Date().toISOString()` (keeping millisecond precision, e.g., `.200Z`), whereas `taskDone()` writes `state.last_task_done_at = nowIso()` (`cli/src/core.js:147`), which strips milliseconds via `.replace(/\.\d{3}Z$/, 'Z')` (truncating e.g. `.700Z` down to `.000Z`). When `medra review` and a subsequent `medra task done` run in the same UTC second, `recordedMs >= freshFloor` in `reportFreshness` (`cli/src/validate.js:284`) evaluates `true` because `last_task_done_at` was truncated backward to `.000Z`; `cli/test/step-compiler.test.js:1045-1050,1089` avoids this by sleeping via `tickSecond` until the next whole second.
**Fix:** Preserve millisecond precision on `state.last_task_done_at` (`new Date().toISOString()` in `taskDone()` at `cli/src/commands.js:415`, and consistently on `state.suite.at` at `cli/src/commands.js:440,445` so `suiteFindings`'s timestamp fallback aligns), and test same-second `medra review` followed by `medra task done` in `cli/test/step-compiler.test.js` without `tickSecond`.

### F-02 [minor] `run/SKILL.md` references stage-level `step.model.tier` instead of per-subagent `subagent.model.tier`

**Where:** `plugins/medra/skills/run/SKILL.md:27` (and `.agents/plugins/medra/skills/run/SKILL.md:27`) · `CTX-005.S16`, `PLUG-005.S2`
**Problem:** `plugins/medra/skills/run/SKILL.md:27` tells the coordinator to pass `step.model.tier`, and lines 40–46 omit reading `model.tier` per `subagents[]` entry. Because `compileStep` keeps top-level `step.model` at the stage tier (`CTX-005.S16`) while placing role-resolved tiers (`role -> stage -> default -> inherit`) on each `subagents[].model.tier` (`PLUG-005.S2`, `plugins/medra/references/portability.md:30-31`), following `run/SKILL.md:27` literally ignores per-role overrides such as `models.security` or `models.implementer`.
**Fix:** Update `plugins/medra/skills/run/SKILL.md:27` (and note `subagent.model.tier` under `action === "dispatch"`) to use each `subagents[]` entry's `subagent.model.tier` with `inherit` fallback, then regenerate `cli/plugin/` and `.agents/plugins/medra/`.

### F-03 [minor] Envelope schemas omit `subagents[].findings` emitted by fix-implementer dispatch

**Where:** `cli/schemas/envelope.schema.json:48-66`, `contracts/step-envelope.schema.json:51-69` (`cli/src/step.js:354,403`) · `CTX-005.S14`
**Problem:** `compileVerifyStep` (`cli/src/step.js:354`) and `envelope()` (`cli/src/step.js:403`) populate `findings` on the fix `implementer` entry in `subagents[]` as well as top-level `findings`. Both `cli/schemas/envelope.schema.json` and `contracts/step-envelope.schema.json` declare top-level `findings` but omit `findings` under `subagents.items.properties`, and the `CTX-005.S14` check in `cli/test/step-compiler.test.js:862-864` only parses JSON rather than validating envelopes against the schemas.
**Fix:** Add optional `findings` under `subagents.items.properties` in both `cli/schemas/envelope.schema.json` and `contracts/step-envelope.schema.json`.

## Coverage

| Requirement | Evidence | Status |
|---|---|---|
| `CTX-005` | `cli/src/step.js:184-188,312-361,390-396`; `cli/src/commands.js:204-220,450-486`; `cli/src/validate.js:13-41,270-330`; `cli/schemas/envelope.schema.json`; `contracts/step-envelope.schema.json`; `cli/test/step-compiler.test.js:480-569,851-1156`; `npm --prefix cli test` (81/81 pass); `node cli/scripts/measure-envelope.js` (`verify` 1525 B < 4096 B, 0% growth vs `rc.3`); `medra coverage` (5/5 `CTX-005` scenarios). Sub-second edge case in F-01; schema field note in F-03. | met |
| `PLUG-001` | `plugins/medra/skills/{apply,plan,propose,run,tasks,verify}/SKILL.md`; `plugins/medra/pipelines/{author-plan,author-propose,author-tasks,implementer-apply}.md`; `cli/test/install-misc.test.js:491-532`; `medra coverage` (`PLUG-001.S4` covered); `npm --prefix cli test` pass. | met |
| `PLUG-002` | `plugins/medra/references/portability.md:14-32`; `plugins/medra/references/gate.md:17-19`; `cli/test/hooks.test.js:130-150`; `cli/test/install-misc.test.js:453-489`; `medra coverage` (`PLUG-002.S2` covered); `npm --prefix cli test` pass. | met |
| `PLUG-003` | `cli/package.json:3`, `plugins/medra/.claude-plugin/plugin.json:3`, `cli/plugin/.claude-plugin/plugin.json:3`, `.agents/plugins/medra/{VERSION,plugin.json}` at `2.0.0-rc.4`; `npm --prefix cli run check-version` exit 0; `node cli/scripts/check-bundle-drift.js` exit 0; `cli/test/install-misc.test.js:411-424`; `medra coverage` (`PLUG-003.S1` covered). | met |
| `PLUG-004` | `plugins/medra/hooks/guard.mjs:40-42`; `plugins/medra/references/gate.md:17-19`; `cli/test/hooks.test.js:130-150`; `medra coverage` (`PLUG-004.S4` covered); `npm --prefix cli test` pass. | met |
| `PLUG-005` | `cli/src/step.js:184-188,396`; `plugins/medra/references/portability.md:27-32`; `cli/test/step-compiler.test.js:972-1041`; `cli/test/install-misc.test.js:473-489`; `medra coverage` (`PLUG-005.S2` covered); `npm --prefix cli test` pass. Coordinator note in F-02. | met |
| `STATE-005` | `CHANGELOG.md:5-16`; `cli/package.json:3`; `cli/src/commands.js:163-166`; `cli/test/install-misc.test.js:426-451`; `cli/test/step-compiler.test.js:926-970`; `medra coverage` (`STATE-005.S1`, `STATE-005.S2` covered); `npm --prefix cli test` pass. | met |

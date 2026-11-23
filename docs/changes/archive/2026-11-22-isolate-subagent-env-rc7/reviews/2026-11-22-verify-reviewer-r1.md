# Review: isolate-subagent-env-rc7 — verify

**Stage:** verify
**Verdict:** pass
**Counts:** critical 0 · major 0 · minor 0
**Reviewer:** reviewer agent
**Date:** 2026-11-22

## Summary

All three added requirements (`VAL-006`, `PLUG-011`, `PLUG-012`) are implemented as specified, backed by test-first red/green evidence in `tasks.md`, `4/4` scenario coverage in `medra coverage`, and passing verification runs (`MEDRA_SUBAGENT=1 npm --prefix cli test` 102/102, `check-version.js` `2.0.0-rc.7`, and `check-bundle-drift.js`). `childEnv()` in `cli/src/core.js` isolates `medra task done --run`, `testing.checks`, and `medra suite` child processes from `MEDRA_SUBAGENT` while `requireCoordinator` continues enforcing `subagent.forbidden` on direct `medra gate` and `medra verify-fix` calls. `CHANGELOG.md` and `cli/CHANGELOG.md` are synchronized for `2.0.0-rc.7`, and no verify fix-implementer `MEDRA_SUBAGENT=1 medra suite` entry applies at round 1 (`verify_fix_rounds: 0`).

## Findings

None.

## Coverage

| Requirement | Evidence | Status |
|---|---|---|
| `VAL-006` | `cli/src/core.js:158-162` (`childEnv()`), `cli/src/commands.js:365,376,442` (`env: childEnv()` on `--run`, `testing.checks`, `suite`), `cli/src/commands.js:153-157` (`requireCoordinator`); `T001` red (`cli/test/subagent-env.test.js`), `T002` green (`node --test cli/test/subagent-env.test.js` exit 0); `medra coverage` `VAL-006.S1` (`cli/test/subagent-env.test.js:15-16`), `VAL-006.S2` (`cli/test/subagent-env.test.js:65-66`); verified in `MEDRA_SUBAGENT=1 npm --prefix cli test` (102/102 pass) | met |
| `PLUG-011` | `cli/test/helpers.js:10-26` (`cleanEnv()` on `medra()`/`medraHuman()`), `cli/test/hooks.test.js:12-24` (`guard()` default `cleanEnv()`), `cli/scripts/measure-envelope.js:10,29` (`env: childEnv()`); `T003` red (`cli/test/helpers-env.test.js`), `T004` green (`MEDRA_SUBAGENT=1 npm --prefix cli test` exit 0); `medra coverage` `PLUG-011.S1` (`cli/test/helpers-env.test.js:5-6`); verified in `MEDRA_SUBAGENT=1 npm --prefix cli test` (102/102 pass, including `guard.test.js` and `hooks.test.js` explicit `MEDRA_SUBAGENT: '1'` refusal tests) | met |
| `PLUG-012` | `plugins/medra/references/gate.md:18`, `plugins/medra/references/portability.md:25`, `.agents/plugins/medra/` + `cli/plugin/` bundles, `cli/package.json:3`, `plugins/medra/.claude-plugin/plugin.json:3`, `CHANGELOG.md:5-12`, `cli/test/install-misc.test.js:411-436`; `T005` red (`cli/test/plug012-docs.test.js`), `T006` green; `medra coverage` `PLUG-012.S1` (`cli/test/plug012-docs.test.js:10-11`); verified via `node cli/scripts/check-version.js` (`version 2.0.0-rc.7 matches`) and `node cli/scripts/check-bundle-drift.js` (exit 0) | met |

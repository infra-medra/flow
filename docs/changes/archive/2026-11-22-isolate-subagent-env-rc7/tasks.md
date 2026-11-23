# Tasks: isolate-subagent-env-rc7

> A `[TEST]` task locks its test files when it is checkpointed red. Write every case of its scenarios before that checkpoint; editing a locked file afterwards needs the user's explicit authorization (`medra task done … --allow-test-edit --reason`).

## Phase 1: VAL-006 Isolate child test and check processes from MEDRA_SUBAGENT

- [x] T001 [TEST] [VAL-006] Write tests for `VAL-006.S1` and `VAL-006.S2` verifying `MEDRA_SUBAGENT` is stripped from `medra suite`, `medra task done --run`, and `testing.checks` while `MEDRA_TEST_MARKER` passes through, and direct `MEDRA_SUBAGENT=1 medra gate`/`verify-fix` still refuse in `cli/test/subagent-env.test.js` — verify: tests fail (red)
  - evidence red 2026-11-22: `node --test cli/test/subagent-env.test.js` exit 1 — "+   hasSubagent: true, | -   hasSubagent: false, | marker: 'x',"
- [x] T002 [VAL-006] after T001 Export `childEnv()` in `cli/src/core.js` and pass `env: childEnv()` to the three `spawnSync(..., { shell: true })` calls in `cli/src/commands.js` — verify: T001 tests pass (green)
  - evidence green 2026-11-22: `node --test cli/test/subagent-env.test.js` exit 0

## Phase 2: PLUG-011 Isolate test harness CLI helpers from caller MEDRA_SUBAGENT

- [x] T003 [TEST] [PLUG-011] Write test for `PLUG-011.S1` verifying `medra()` and `medraHuman()` in `cli/test/helpers.js` strip inherited `MEDRA_SUBAGENT` in `cli/test/helpers-env.test.js` — verify: tests fail (red)
  - evidence red 2026-11-22: `node --test cli/test/helpers-env.test.js` exit 1 — "expected: 0 | actual: 1 | operator: 'strictEqual'"
- [x] T004 [PLUG-011] after T003 Strip `MEDRA_SUBAGENT` from default child env in `medra()` and `medraHuman()` in `cli/test/helpers.js` — verify: T003 tests pass and `MEDRA_SUBAGENT=1 npm --prefix cli test` passes (green)
  - evidence green 2026-11-22: `MEDRA_SUBAGENT=1 npm --prefix cli test` exit 0 [test-edited: cli/test/helpers.js +8/-2 other (2 line(s) of the red version were removed or edited); reason "cli/test/helpers.js is the implementation target of T004, locked only because T003 cited it"]

## Phase 3: PLUG-012 Document MEDRA_SUBAGENT=1 scope and release 2.0.0-rc.7

- [x] T005 [TEST] [PLUG-012] Write test for `PLUG-012.S1` verifying `plugins/medra/references/gate.md` and `plugins/medra/references/portability.md` document that `MEDRA_SUBAGENT=1` applies only to the `medra` command called by the subagent and is stripped from child test/check processes in `cli/test/plug012-docs.test.js` — verify: tests fail (red)
  - evidence red 2026-11-22: `node --test cli/test/plug012-docs.test.js` exit 1 — "actual: |- | # Reference: Gate Protocol | A gate is a human decision about an inspectable artifact. Run it the same way at every gate:"
- [x] T006 [PLUG-012] after T005 Update `plugins/medra/references/gate.md`, `plugins/medra/references/portability.md`, bump version to `2.0.0-rc.7` in `cli/package.json`, `plugins/medra/.claude-plugin/plugin.json`, and `cli/test/install-misc.test.js`, update `CHANGELOG.md`, and run `npm --prefix cli run bundle-plugin` — verify: T005 tests, `node cli/scripts/check-bundle-drift.js`, `node cli/scripts/check-version.js`, and `npm --prefix cli test` pass (green)
  - evidence green 2026-11-22: `node --test cli/test/plug012-docs.test.js && node cli/scripts/check-bundle-drift.js && node cli/scripts/check-version.js && npm --prefix cli test` exit 0 [test-edited: plugins/medra/references/gate.md +1/-1 other (1 line(s) of the red version were removed or edited); reason "gate.md and portability.md are the implementation targets of T006, locked only because T005 cited them"] [test-edited: plugins/medra/references/portability.md +1/-1 other (1 line(s) of the red version were removed or edited); reason "gate.md and portability.md are the implementation targets of T006, locked only because T005 cited them"]

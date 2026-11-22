# Tasks: close-v2-gaps-rc6

> A `[TEST]` task locks its test files when it is checkpointed red. Write every case of its scenarios before that checkpoint; editing a locked file afterwards needs the user's explicit authorization (`medra task done … --allow-test-edit --reason`).

## Phase 1: Item 1 — Pre-verify suite dispatch (STATE-006, PLUG-008)

- [x] T001 [TEST] [STATE-006] Add tests in `cli/test/step.test.js` covering `verify.suite` structured `reason` (`not-run`, `stale`, `failed`) and `failed` suite returning `action: "gate"` (`STATE-006.S2`) — verify: `node --test cli/test/step.test.js` fails (red)
  - evidence red 2026-11-22: `node --test cli/test/step.test.js` exit 1 — "failureType: 'testCodeFailure' | error: |- | Expected values to be strictly equal:"
- [x] T002 [TEST] [PLUG-008] Add tests in `cli/test/step.test.js` covering pre-verify `not-run`/`stale` suite returning `action: "dispatch"` + `coordinator_steps` (`medra suite`) + `subagents: []` + idempotency + transition to round 1 `reviewer`/`security` after `medra suite`, and no suite step without `testing.command` (`PLUG-008.S2`) — verify: `node --test cli/test/step.test.js` fails (red)
  - evidence red 2026-11-22: `node --test cli/test/step.test.js` exit 1 — "failureType: 'testCodeFailure' | error: |- | Expected values to be strictly equal:"
- [x] T003 [STATE-006] after T001 Add structured `reason` (`not-run` | `stale` | `failed`) to `suiteFindings` in `cli/src/change.js` and pass through `prepareVerifyRound` in `cli/src/handoff.js` (`STATE-006.S2`) — verify: T001 tests in `cli/test/step.test.js` pass (green)
  - evidence green 2026-11-22: `node --test --test-name-pattern 'STATE-006' cli/test/step.test.js` exit 0
- [x] T004 [PLUG-008] after T002, T003 Route `not-run`/`stale`-only `verify.suite` findings in `compileVerifyStep` (`cli/src/step.js`) to `action: "dispatch"` with `coordinator_steps: [{ type: "command", command: "medra suite <change> --json" }]` and `subagents: []` (`PLUG-008.S2`) — verify: T002 tests in `cli/test/step.test.js` pass (green)
  - evidence green 2026-11-22: `node --test cli/test/step.test.js` exit 0

## Phase 2: Item 2 — MEDRA_SUBAGENT=1 envelope prefixing and guard (PLUG-009)

- [x] T005 [TEST] [PLUG-009] Add tests in `cli/test/step.test.js` and `cli/test/guard.test.js` covering `MEDRA_SUBAGENT=1` prefix on all non-`inline` subagent `fetch_command`/`exit_command` and `--md`/`--full` prompts, absence on `coordinator_steps[]` and `inline` `exit_command`, and `guard.mjs` denying `MEDRA_SUBAGENT=1 medra gate|verify-fix` for subagents (`PLUG-009.S1`, `PLUG-009.S2`) — verify: `node --test cli/test/step.test.js cli/test/guard.test.js` fails (red)
  - evidence red 2026-11-22: `node --test cli/test/step-plug009.test.js cli/test/guard.test.js` exit 1 — "name: 'AssertionError' | expected: 'deny' | actual: 'ask'"
- [x] T006 [PLUG-009] after T005 Prefix non-`inline` subagent `fetch_command` and `exit_command` with `MEDRA_SUBAGENT=1 ` and append the prefix instruction to subagent `--md`/`--full` prompts in `cli/src/step.js`, and ensure `plugins/medra/hooks/guard.mjs` matches `MEDRA_SUBAGENT=1 medra ...` (`PLUG-009.S2`) — verify: T005 tests in `cli/test/step.test.js` and `cli/test/guard.test.js` pass (green)
  - evidence green 2026-11-22: `env -u MEDRA_SUBAGENT node --test cli/test/step-plug009.test.js cli/test/guard.test.js` exit 0

## Phase 3: Item 3 & Docs — Skills, references, and done envelope (PLUG-008, PLUG-009, PLUG-010)

- [x] T007 [TEST] [PLUG-010] Add test in `cli/test/step.test.js` verifying `action: "done"` archive envelope returns `author` subagent with `author-archive.md` pointer and `MEDRA_SUBAGENT=1 medra archive <change> --json` `exit_command`, and `plugins/medra/skills/run/SKILL.md` dispatches `subagents[]` without direct `medra archive` shortcut (`PLUG-010.S1`) — verify: `node --test cli/test/step.test.js` fails (red)
  - evidence red 2026-11-22: `env -u MEDRA_SUBAGENT node --test cli/test/step-plug010.test.js` exit 1 — "actual: '**`action === 'done'`:** run `medra archive <change> --json` (or dispatch the archive subagent) and present the final summary.' | operator: 'match' | stack: |-"
- [x] T008 [PLUG-010] after T007 Update `plugins/medra/skills/run/SKILL.md` (`action === "done"` dispatches `subagents[]`; loop back on empty `subagents[]`), confirm `plugins/medra/skills/verify/SKILL.md` and `plugins/medra/skills/archive/SKILL.md` coherence, and update `plugins/medra/references/portability.md` and `plugins/medra/references/gate.md` (`PLUG-008.S2`, `PLUG-009.S2`, `PLUG-010.S1`) — verify: T007 tests pass (green)
  - evidence green 2026-11-22: `env -u MEDRA_SUBAGENT node --test cli/test/step-plug010.test.js` exit 0 [test-edited: plugins/medra/skills/run/SKILL.md +2/-1 other (1 line(s) of the red version were removed or edited); reason "User authorized: run/SKILL.md was mistakenly locked by T007 description and is the implementation target of T008"]

## Phase 4: Release 2.0.0-rc.6, Bundles, External E2E & Changelog

- [x] T009 after T004, T006, T008 Bump version to `2.0.0-rc.6` in `cli/package.json` and `plugins/medra/.claude-plugin/plugin.json`, regenerate bundles (`npm --prefix cli run bundle-plugin` and `node cli/bin/medra.js install --target antigravity --force`), run external-repo `/medra:run` E2E (`propose` -> `archive`) without manual `medra suite` between `apply` and `verify`, and record all items and E2E results in `CHANGELOG.md` — verify: `npm --prefix cli test`, `node cli/scripts/check-bundle-drift.js`, `node cli/scripts/check-version.js`, and `node cli/bin/medra.js validate --project specs --json` all pass
  - evidence green 2026-11-22: `env -u MEDRA_SUBAGENT npm --prefix cli test` exit 0 [test-edited: cli/test/step-compiler.test.js +6/-6 weakening (an assertion was removed or changed); reason "User authorized: update 4 legacy unprefixed exit_command assertions in step-compiler.test.js for MEDRA_SUBAGENT=1"]

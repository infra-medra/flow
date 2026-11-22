# Tasks: fix-v2-step-compiler-regressions

> A `[TEST]` task locks its test files when it is checkpointed red. Write every case of its scenarios before that checkpoint; editing a locked file afterwards needs the user's explicit authorization (`medra task done … --allow-test-edit --reason`).

## Phase 1: CTX-005 Step Compiler Regressions & Untrusted Fencing (P1–P5)

- [x] T001 [TEST] [CTX-005] Write tests for CTX-005.S1, CTX-005.S2 (real temp git repo and > MAX_EMBED_BYTES truncation), CTX-005.S3, CTX-005.S4 (valid empty diff vs nonexistent ref and non-git dir), CTX-005.S5 (pipeline pointers and template.md/guide.md/completion criteria), and CTX-005.S6 (verify exit_command without medra gate and `</untrusted_data>`, `</ untrusted_data >`, `</untrusted-data>` injection) in `cli/test/step-compiler.test.js` — verify: tests fail (red)
  - evidence red 2026-11-21: `node --test cli/test/step-compiler.test.js` exit 1 — "actual: false | operator: '==' | stack: |-"
- [x] T002 [CTX-005] after T001 Unify `safeGitDiff` to return `{ diff, truncated, diff_error }` and surface `diff_error` in verify envelopes and prompt warnings (P1, P2, M-01) in `cli/src/step.js` — verify: T001 CTX-005.S1–CTX-005.S4 tests in `cli/test/step-compiler.test.js` pass (green)
  - evidence green 2026-11-21: `node --test --test-name-pattern="CTX-005\.S[234]" cli/test/step-compiler.test.js` exit 0
- [x] T003 [CTX-005] after T001 Document optional `diff_error` field on the verify step envelope (P2) in `cli/schemas/envelope.schema.json` — verify: `node --prefix cli --test test/step-compiler.test.js` validates envelope schema
  - evidence green 2026-11-21: `node -e "JSON.parse(require('fs').readFileSync('cli/schemas/envelope.schema.json','utf8'))" && node --test --test-name-pattern="CTX-005\.S[234]" cli/test/step-compiler.test.js` exit 0
- [x] T004 [CTX-005] after T001 Add `pipelinePointer(root, stage)` to `compileStep` pointers and include `template.md`, `guide.md`, and completion criteria in `author` prompts (P3) in `cli/src/step.js` — verify: T001 CTX-005.S5 tests in `cli/test/step-compiler.test.js` pass (green)
  - evidence green 2026-11-21: `node --test --test-name-pattern="CTX-005\.S[12345]|S-01" cli/test/step-compiler.test.js` exit 0
- [x] T005 [CTX-005] after T001 Update `review()` to accept `Stage: security` and security severity `Counts:` in `cli/src/commands.js` and set `reviewer`/`security` `exit_command`s to `medra review --report` (P4, M-03) in `cli/src/step.js` — verify: T001 CTX-005.S6 `exit_command` tests in `cli/test/step-compiler.test.js` pass (green)
  - evidence green 2026-11-21: `node --test --test-name-pattern="security:" cli/test/archive-verify.test.js` exit 0
- [x] T006 [CTX-005] after T001 Standardize prompt fencing on `<untrusted_data>` and neutralize `/<\/\s*untrusted[-_]data/gi` in `fenceUntrusted` (P5, M-02) in `cli/src/step.js` — verify: T001 tests in `cli/test/step-compiler.test.js` pass (green)
  - evidence green 2026-11-21: `node --test cli/test/step-compiler.test.js` exit 0

## Phase 2: PLUG-004 Claude Code PreToolUse Guard Hook (P4)

- [x] T007 [TEST] [PLUG-004] Write tests for PLUG-004.S1 (blocking hand-edits to `.medra.yaml` and `docs/changes/archive/`) and PLUG-004.S2 (`ask` on `medra gate ... --approve` and `deny` when `input.agent_id` or `MEDRA_SUBAGENT=1` is set) in `cli/test/hooks.test.js` — verify: tests fail (red)
  - evidence red 2026-11-21: `node --test cli/test/hooks.test.js` exit 1 — "name: 'AssertionError' | expected: 'deny' | actual: 'ask'"
- [x] T008 [PLUG-004] after T007 Enforce `ask` on `medra gate ... --approve` and `deny` when subagent context (`input.agent_id` or `MEDRA_SUBAGENT=1`) is signaled (P4, M-04) in `plugins/medra/hooks/guard.mjs` — verify: T007 tests in `cli/test/hooks.test.js` pass (green)
  - evidence green 2026-11-21: `node --test cli/test/hooks.test.js` exit 0

## Phase 3: PLUG-001, PLUG-003 Coordinator Skills, Pipelines & Bundle Parity (P2, P3, P6)

- [x] T009 [TEST] [PLUG-001, PLUG-003, STATE-005] Write contract and integration tests for PLUG-001.S1, PLUG-001.S2, PLUG-001.S3, PLUG-003.S1 (bundle drift check), and STATE-005.S1 (1.x `docs/` compatibility at `2.0.0-rc.2`) in `cli/test/install-misc.test.js` — verify: tests fail (red)
  - evidence red 2026-11-21: `node --test cli/test/install-misc.test.js` exit 1 — "Object.readFileSync (node:fs:464:35) | read (file:///home/tcava/src/harness/cli/test/helpers.js:28:39) | TestContext.<anonymous> (file:///home/tcava/src/harness/cli/test/install-misc.test.js:39:30)"
- [x] T010 [PLUG-001] after T009 Add `diff_error` warning/pause handling to `plugins/medra/skills/verify/SKILL.md` and `plugins/medra/skills/run/SKILL.md`, remove empty persona header from `plugins/medra/skills/apply/SKILL.md`, and fix `medra review --report` in `plugins/medra/skills/review/SKILL.md` — verify: T009 PLUG-001.S1–PLUG-001.S3 tests pass (green)
  - evidence green 2026-11-21: `bash -c 'cd cli && node --test --test-name-pattern=PLUG-001 test/install-misc.test.js'` exit 0
- [x] T011 [PLUG-001] after T009 Restore 1.x subagent authoring phases, personas, avoid lists, and exit checklists into `plugins/medra/pipelines/author-init.md`, `author-propose.md`, `author-plan.md`, `author-tasks.md`, `implementer-apply.md`, and `author-archive.md` — verify: T009 PLUG-001 pipeline tests pass (green)
  - evidence green 2026-11-21: `bash -c 'cd cli && node --test --test-name-pattern=PLUG-001 test/install-misc.test.js'` exit 0
- [x] T012 [PLUG-003] after T009 Add `cli/scripts/check-bundle-drift.js` and wire it into `.github/workflows/ci.yml` to verify `.agents/plugins/medra/` and `cli/plugin/` parity with `plugins/medra/` (P6) — verify: T009 PLUG-003.S1 test and `node cli/scripts/check-bundle-drift.js` pass (green)
  - evidence green 2026-11-21: `node cli/scripts/check-bundle-drift.js` exit 0

## Phase 4: Step Envelope Refactor & 2.0.0-rc.2 Release-Candidate Bump (P7, STATE-005)

- [x] T013 [CTX-005] after T002, T004, T005, T006 Extract `envelope(root, change, state, config, overrides)` helper in `compileStep` preserving schema and snapshot parity (P7) in `cli/src/step.js` — verify: `node --prefix cli --test test/step-compiler.test.js` passes (green)
  - evidence green 2026-11-21: `node --test cli/test/step-compiler.test.js` exit 0 [test-edited: cli/test/step-compiler.test.js +108/-0 additive; adds "P7: compileStep envelopes conform to envelope.schema.json and preserve exact fields across all branches"; reason "User approved additive P7 schema/snapshot parity test in cli/test/step-compiler.test.js"]
- [x] T014 [STATE-005] after T009, T010, T011, T012, T013 Bump version to `2.0.0-rc.2` in `cli/package.json` and `plugins/medra/.claude-plugin/plugin.json`, regenerate `cli/plugin/` and `.agents/plugins/medra/`, and update `CHANGELOG.md` (explicitly preserving existing local edits in `CHANGELOG.md` and `README.md`) — verify: `npm --prefix cli run check-version && node cli/scripts/check-bundle-drift.js && npm --prefix cli test` passes (green)
  - evidence green 2026-11-21: `npm --prefix cli run check-version && node cli/scripts/check-bundle-drift.js && npm --prefix cli test` exit 0 [test-edited: cli/test/install-misc.test.js +2/-2 weakening (an assertion was removed or changed); reason "User approved updating two stale rc.1 assertions in install-misc.test.js to match P3"]

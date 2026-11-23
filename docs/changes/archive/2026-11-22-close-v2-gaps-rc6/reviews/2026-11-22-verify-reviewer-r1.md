# Review: close-v2-gaps-rc6 — verify

**Stage:** verify
**Verdict:** pass-with-findings
**Counts:** critical 0 · major 0 · minor 2
**Reviewer:** reviewer agent
**Date:** 2026-11-22

## Summary

All four requirements (`PLUG-010`, `PLUG-008`, `PLUG-009`, `STATE-006`) are implemented as specified, covered `7/7` by tests that genuinely exercise their Given/When/Then scenarios, backed by complete TDD red/green evidence and a green suite (`2.0.0-rc.6` bundle parity, version check, and spec validation all pass). Two minor issues remain: an unscoped empty-`subagents[]` loop-back instruction in `/medra:run` that overlaps with `action === "gate"`, and stale test-file paths in `plan.md`'s Test Strategy table.

## Findings

### F-01 [minor] Unscoped `subagents[]` empty-check in `run/SKILL.md` Step 2 overlaps `action === "gate"`

**Where:** `plugins/medra/skills/run/SKILL.md:32` · PLUG-008.S2
**Problem:** Step 2 bullet 3 states unconditionally `If subagents[] is empty after coordinator_steps[], loop back to Step 1.` However, `compileStep` (`cli/src/step.js:607-610`) also emits `subagents: []` and `coordinator_steps: [{ type: 'ask_user', gate, reason }]` when `action === "gate"`. A coordinator following Step 2 literally before Step 3 on a gate envelope could prompt via `ask_user` and loop back to Step 1 instead of executing Step 3 (`action === "gate"` → `medra gate <change> <gate> --approve` / `--request-changes`).
**Fix:** Scope `plugins/medra/skills/run/SKILL.md:32` (and regenerate `.agents/plugins/medra/skills/run/SKILL.md` / `cli/plugin/`) to `If action === "dispatch" and subagents[] is empty after coordinator_steps[], loop back to Step 1.`

### F-02 [minor] `plan.md` Test Strategy table references nonexistent or moved test file paths

**Where:** `docs/changes/close-v2-gaps-rc6/plan.md:28-34` · Article II / Test Strategy
**Problem:** `plan.md` maps `PLUG-009.S1` to `cli/test/commands-misc.test.js` (which does not exist in `cli/test/`) and maps `STATE-006.S1`, `PLUG-008.S1`, `PLUG-009.S2`, and `PLUG-010.S1` to `cli/test/step.test.js`, whereas the actual tests live in `cli/test/step-compiler.test.js`, `cli/test/step-plug009.test.js`, `cli/test/step-plug010.test.js`, `cli/test/guard.test.js`, and `cli/test/hooks.test.js` (as reported by `medra coverage close-v2-gaps-rc6 --json`).
**Fix:** Update the `Test location` column in `docs/changes/close-v2-gaps-rc6/plan.md:28-34` to match the actual test files on disk before archiving.

## Coverage

| Requirement | Evidence | Status |
|---|---|---|
| `PLUG-010` | `cli/src/step.js:655-670`, `plugins/medra/skills/run/SKILL.md:36`, `plugins/medra/skills/archive/SKILL.md:11,28`; `PLUG-010.S1` (`cli/test/step-plug010.test.js:11-63`); `T007` red / `T008` green | met |
| `PLUG-008` | `cli/src/step.js:465-486,510-514,607-610`, `plugins/medra/skills/run/SKILL.md:29-32`, `plugins/medra/skills/verify/SKILL.md:29-32`; `PLUG-008.S1` (`cli/test/step-compiler.test.js:1570-1660`), `PLUG-008.S2` (`cli/test/step-compiler.test.js:1317-1356`, `cli/test/step.test.js:97-163`, `cli/test/step-plug010.test.js:66-80`); `T002` red / `T004`, `T008` green | met |
| `PLUG-009` | `cli/src/commands.js:153-160,464`, `cli/src/step.js:41,558-584`, `plugins/medra/hooks/guard.mjs:28-51`, `plugins/medra/references/portability.md:24-25`, `plugins/medra/references/gate.md:17-19`; `PLUG-009.S1` (`cli/test/guard.test.js:51-85`, `cli/test/hooks.test.js:163-196`), `PLUG-009.S2` (`cli/test/guard.test.js:28-49`, `cli/test/step-plug009.test.js:25-281`, `cli/test/step-plug010.test.js:83-99`); `T005` red / `T006`, `T008` green | met |
| `STATE-006` | `cli/src/change.js:47-57,236-246`, `cli/src/handoff.js:42-119`, `cli/src/step.js:364-482`, `cli/src/validate.js:270-288`; `STATE-006.S1` (`cli/test/step-compiler.test.js:1165-1285`), `STATE-006.S2` (`cli/test/step-compiler.test.js:1287-1369`, `cli/test/step.test.js:35-94`); `T001` red / `T003`, `T004` green | met |

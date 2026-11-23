# Plan: close-v2-gaps-rc6

## Summary

Close the three remaining `2.0.0` readiness gaps on branch `v2` (`2.0.0-rc.6`). First, tag `verify.suite` findings with a structured `reason` (`not-run` | `stale` | `failed`) in `cli/src/change.js` so `compileVerifyStep` in `cli/src/step.js` routes `not-run`/`stale`-only pre-dispatch checks to `action: "dispatch"` with `coordinator_steps: [{ type: "command", command: "medra suite <change> --json" }]` and `subagents: []`, keeping `failed` and `verify.merge` findings as `action: "gate"`. Second, prefix all non-`inline` subagent `fetch_command` and `exit_command` strings in `cli/src/step.js` with `MEDRA_SUBAGENT=1 `, append the prefix rule to compiled subagent prompts (`--md` / `--full`), ensure `plugins/medra/hooks/guard.mjs` recognizes `MEDRA_SUBAGENT=1 medra ...`, and update `plugins/medra/references/{portability,gate}.md`. Third, update `plugins/medra/skills/run/SKILL.md` so `action === "done"` dispatches `subagents[]` (`author-archive.md`) without a direct `medra archive` shortcut, and confirm `verify/SKILL.md` and `archive/SKILL.md` consistency.

## Constitution Check

| Article | Gate | Result | Note |
|---|---|---|---|
| Article I | Does the CLI remain the single owner of state transitions and dispatch decisions? | pass | `compileVerifyStep` decides `coordinator_steps` vs `gate`; `run/SKILL.md` delegates `done` strictly to the compiled envelope's `subagents[]`. |
| Article II | Does every modified/added requirement map to automated tests written first? | pass | All 3 items map to scenarios `STATE-006.S2`, `PLUG-008.S2`, `PLUG-009.S2`, `PLUG-010.S1` with TDD unit/integration tests plus external-repo E2E. |
| Article III | Do skills, references, hooks, and bundled plugin assets stay in sync? | pass | Updates `run`/`verify`/`archive` skills, `portability.md`/`gate.md`, `guard.mjs`, and regenerates bundles checked by `check-bundle-drift.js`. |
| Article IV | Are privilege boundaries enforced without weakening hooks or CLI guards? | pass | Subagent commands carry `MEDRA_SUBAGENT=1`, `guard.mjs` denies `MEDRA_SUBAGENT=1 medra gate|verify-fix`, and `portability.md`/`gate.md` document the remaining Antigravity limits honestly. |
| Article V | Are changes minimal and bounded without inflating skill/envelope size? | pass | Adds only a structured `reason` field on `verify.suite` findings and a helper in `step.js` for subagent command/prompt prefixing. |

## Complexity Tracking

None.

## Test Strategy

- **Command:** `npm --prefix cli test`
- **Framework:** `node --test`

| Scenario | Level | Test location |
|---|---|---|
| `STATE-006.S1` | integration | `cli/test/step.test.js` |
| `STATE-006.S2` | integration | `cli/test/step.test.js` |
| `PLUG-008.S1` | integration | `cli/test/step.test.js` |
| `PLUG-008.S2` | integration | `cli/test/step.test.js` |
| `PLUG-009.S1` | integration | `cli/test/guard.test.js` |
| `PLUG-009.S2` | integration | `cli/test/step-plug009.test.js`, `cli/test/guard.test.js` |
| `PLUG-010.S1` | integration | `cli/test/step-plug010.test.js` |

## Decisions

### D-01: Structured `reason` on `verify.suite` findings
**Choice:** Add `reason: 'not-run' | 'stale' | 'failed'` to `suiteFindings()` in `cli/src/change.js`.
**Alternatives:** Parsing finding `message` strings inside `cli/src/step.js`.
**Rationale:** Keeps `step.js` decoupled from human-readable prose and prevents silent regressions if wording changes.

### D-02: Centralize `MEDRA_SUBAGENT=1` prefixing in `compileStep`'s `envelope()` builder
**Choice:** Prefix `fetch_command` and `exit_command` inside `envelope()` in `cli/src/step.js` whenever `action !== 'inline'`, and inject the one-line prefix instruction in subagent `--md` / `--full` output.
**Alternatives:** Hardcoding `MEDRA_SUBAGENT=1 ` in each stage builder (`buildApplySubagents`, `buildVerifySubagents`, `archive`, `review`).
**Rationale:** Single source of truth guarantees every non-`inline` subagent (task, batch, stage, reviewer, security, fix implementer, archive) gets the prefix while `inline` and `coordinator_steps[]` never do.

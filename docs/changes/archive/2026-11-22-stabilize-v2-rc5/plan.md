# Plan: stabilize-v2-rc5

## Summary

Stabilize `medra` v2 for `2.0.0` (`2.0.0-rc.5`) by wiring incremental `verify` handoffs (`handoff.js` -> `step.js`), adding phase-scoped `batch` granularity in `full`-track `apply`, updating `measure-envelope.js` to account for skill + pipeline + envelope bytes, rewriting the 9 coordinator skills to an agent-oriented lean format, adding deterministic `coordinator_steps[]` to envelopes, enforcing `MEDRA_SUBAGENT=1` inside the CLI itself, cleaning `docs/config-flow.yaml` (`models.plan: inherit`, zero warnings), and running an end-to-end `/medra:run` change in an external repository.

## Constitution Check

| Article | Gate | Result | Note |
|---|---|---|---|
| I | Does every scenario map to a test task ordered before its implementation? | pass | Every item has `[TEST]` reproduction tasks ordered before implementation. |
| II | Are CLI-owned state boundaries, `resolveSafePath`, and subagent privilege limits preserved? | pass | `MEDRA_SUBAGENT=1` refusal is enforced in CLI (`M-01`) alongside `guard.mjs`, and `handoff.js` pre-dispatch checks gate `verify` (`M-02`). |
| III | Are envelope schemas and cross-runtime docs updated alongside code changes? | pass | `cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`, `gate.md`, `portability.md`, and all 9 `SKILL.md` files are updated and bundled. |
| IV | Does coordinator `verify --json` stay `< 4 KB` and do skills stay `<= +10%` of `rc.4`? | pass | `measure-envelope.js` checks full stage cost and skill sizes remain within `+10%` of `rc.4`. |
| V | Are non-obvious design choices documented with alternatives and rationale? | pass | Decisions `D-01`–`D-07` cover every item with explicit alternatives and rationale. |

## Complexity Tracking

None.

## Test Strategy

- **Command:** `npm --prefix cli test`
- **Framework:** `node:test`
- **Benchmark:** `node cli/scripts/measure-envelope.js` (honest skill + pipeline + envelope totals; `task` vs `batch` comparison on `docs/changes/archive/2026-11-21-remodel-deterministic-v2-flow`)
- **External E2E:** Run `/medra:run` end-to-end (`propose` -> `archive`) in a temporary/external repo outside `harness` and record the result in `CHANGELOG.md`.

| Scenario | Level | Test location |
|---|---|---|
| `STATE-006.S1`, `STATE-006.S2` | unit/integration | `cli/test/step-compiler.test.js`, `cli/test/archive-verify.test.js` |
| `STATE-007.S1`, `STATE-005.S1` | integration | `cli/test/install-misc.test.js` |
| `PLUG-006.S1`, `PLUG-006.S2`, `CTX-006.S1` | unit/integration | `cli/test/step-compiler.test.js` |
| `PLUG-007.S1`, `PLUG-003.S1` | content/parity | `cli/test/install-misc.test.js` |
| `PLUG-008.S1` | unit | `cli/test/step-compiler.test.js` |
| `PLUG-009.S1` | CLI/integration | `cli/test/hooks.test.js`, `cli/test/step-compiler.test.js` |
| `CTX-007.S1` | script | `cli/test/step-compiler.test.js` |

## Decisions

### D-01: Reuse `handoff.js` in `compileVerifyStep` / `buildVerifySubagents` (Item 1, `M-02`)

**Choice:** Extract a non-throwing `prepareVerifyRound(root, change, contract, { roundOverride })` helper in `cli/src/handoff.js` (shared with `handoff()`) that runs `suiteFindings` and `mergeFindings`, computes `round`, round-numbered `report` (`reviews/<today>-verify-<role>-r<N>.md`), `previous_report`, `changed_since_previous` (from round 2 onward), and `suite` (`"green"` when `testing.command` is configured). Extend `ROUND_FILE` in `cli/src/handoff.js` to match both `-agent-r<N>.md` and `-(reviewer|security)-r<N>.md` so `latestReport` / `reportFreshness` and `handoff.js` work seamlessly. In `compileVerifyStep` (`cli/src/step.js`), if `suiteFindings` or `mergeFindings` report errors before dispatch, return `action: "gate"` with `findings` instead of dispatching. Update `cli/schemas/envelope.schema.json` and `contracts/step-envelope.schema.json`.
**Alternatives:** Re-implementing snapshot diffing inside `cli/src/step.js` or keeping fixed `reviews/verify-reviewer.md` filenames.
**Rationale:** Reusing `handoff.js` eliminates duplicate snapshot/diff logic, prevents overwriting prior round reports, avoids redundant full-repo re-reviews and re-testing, and gates broken suites before wasting subagent turns.

### D-02: Phase-scoped `batch` granularity in `full`-track `apply` (Item 2)

**Choice:** Add `apply.granularity: 'batch'` (valid `'task' | 'batch'`) and `apply.batch_max_tasks: 4` to `DEFAULT_CONFIG` (`cli/src/core.js`). In `buildApplySubagents` (`cli/src/step.js`), when `track === 'full'`, `legacy_fallback === false`, and `config.apply.granularity === 'batch'`: pick the first phase in `tasks.md` with pending tasks, collect up to `batch_max_tasks` pending tasks in that phase whose `after` dependencies are either already `done` or included earlier in the same batch (so a `[TEST]` task and its dependent implementation task can share a batch), deduplicate REQs/scenarios/decisions/learnings/pointers (`CTX-006.S1`), emit `granularity: "batch"` with `task_id: batch[0].id` (or `task_ids` array on the subagent + schema) and `fetch_command` (`--task <first-id>`), instruct per-task `medra task done` checkpoints and immediate stop (`needs-decision`) on `task.test-tampered` or `blocked`. Keep `apply.granularity: 'task'` and `legacy_fallback` at `granularity: "task"`. Update `skills/{apply,run}/SKILL.md`, `pipelines/implementer-apply.md` (budget per batch), schemas, and benchmark `task` vs `batch` on `2026-11-21-remodel-deterministic-v2-flow` in `CHANGELOG.md`.
**Alternatives:** Keeping `granularity: "task"` as default or batching across phases.
**Rationale:** Same-phase dependency-aware batching preserves TDD ordering and clean phase boundaries while cutting cold-starts by ~3–4x on `full`-track changes.

### D-03: Honest full-stage measurement in `measure-envelope.js` (Item 3)

**Choice:** Extend `cli/scripts/measure-envelope.js` to compute per stage: `skill_bytes` (coordinator `SKILL.md`), `pipeline_bytes` (sum of unique pointed pipeline files), `envelope_bytes` (`cli_json_bytes`), and `total_bytes = skill_bytes + pipeline_bytes + envelope_bytes`, plus a `task` vs `batch` comparison mode on `docs/changes/archive/2026-11-21-remodel-deterministic-v2-flow`. Update `CHANGELOG.md` to correct `rc.1` comparison figures using this honest metric.
**Alternatives:** Measuring only `SKILL.md` or only `cli_json_bytes`.
**Rationale:** Including pointed pipelines and envelopes gives an accurate picture of real token load across v1 vs v2.

### D-04: Agent-oriented lean coordinator skills (Item 4)

**Choice:** Rewrite all 9 skills in `plugins/medra/skills/*/SKILL.md` to a consistent lean structure (`Purpose`, `Input`, `Preconditions`, `Loop/Steps`, `Avoid` with explicit rationale), stripping spec/mitigation IDs (`REQ`, `PLUG-*`, `CTX-*`, `M-*`), removing repeated `"without inferring dispatch from stage names"`, restoring the user-language instruction (`Respond in the user's language`), explicitly requiring structured choice prompts (`AskUserQuestion` / `ask_question`, per `references/portability.md`) whenever presenting a human `gate` (approve vs request changes), and keeping total skill size `<= 110%` of `2.0.0-rc.4` (`PLUG-007.S1`). Regenerate bundles and verify `check-bundle-drift.js`.
**Alternatives:** Leaving spec IDs, duplicated prose, or plain-text gate prompts in `SKILL.md`.
**Rationale:** Coordinator skills are runtime prompts for agents, not spec traceability tables; concise, rationale-backed rules and structured `ask_question`/`AskUserQuestion` gate prompts improve adherence and UX without bloating prompt size.

### D-05: Deterministic `coordinator_steps[]` in step envelopes (Item 5)

**Choice:** Add optional `coordinator_steps: []` to `medra step` envelopes (`cli/src/step.js`, schemas). Each entry is a structured step (`{ type: 'command', command: 'medra verify-fix <change> --json', reason: ... }` before a verify fix implementer; `{ type: 'ask_user', reason: 'git diff unavailable', detail: ... }` when `diff_error` is non-null; `{ type: 'ask_user', reason: 'human gate', gate: <name> }` on `action: "gate"` so coordinators consistently use `AskUserQuestion` / `ask_question`). Update skills (`run`, `verify`, `apply`, `propose`, `plan`, `tasks`) to execute `coordinator_steps[]` in order before `subagents[]`, removing conditional role/diff-error branches from `SKILL.md`.
**Alternatives:** Keeping implicit `if role === implementer` / `if diff_error` heuristics in `SKILL.md`.
**Rationale:** Moving all branching into `compileStep` makes coordinator execution genuinely deterministic.

### D-06: CLI-level `MEDRA_SUBAGENT=1` refusal and Antigravity boundary (Item 6, `M-01`)

**Choice:** Add a `requireCoordinator(commandName)` guard in `cli/src/commands.js` checking `process.env.MEDRA_SUBAGENT === '1'` and throwing `refused([finding('subagent.forbidden', ...)])` (exit code `1`) inside `verifyFix` and `gate` (both `--approve` and `--request-changes`). Document `MEDRA_SUBAGENT=1` propagation for Antigravity `invoke_subagent` calls in `plugins/medra/references/portability.md`, and document the remaining manual file-edit boundary in `plugins/medra/references/gate.md`.
**Alternatives:** Relying solely on `guard.mjs` (which does not run on Antigravity) or prompt instructions.
**Rationale:** CLI-level enforcement closes the `verify-fix` and `gate` privilege gap on runtimes without `PreToolUse` hooks.

### D-07: Clean `docs/config-flow.yaml` and `2.0.0-rc.5` release (Item 7, E2E)

**Choice:** Update `docs/config-flow.yaml` (`models.plan: inherit`, document `apply.granularity: batch` and `apply.batch_max_tasks: 4`) so `medra validate --project specs --json` exits `0` with zero warnings. Bump version to `2.0.0-rc.5` (`cli/package.json`, `plugins/medra/.claude-plugin/plugin.json`, `CHANGELOG.md`), regenerate bundles, verify `check-version`, `check-bundle-drift`, `npm --prefix cli test`, and run an end-to-end `/medra:run` change (`propose` -> `archive`) in an external repository (recording the result in `CHANGELOG.md`).
**Alternatives:** Leaving `models.plan: pro` warning active.
**Rationale:** A clean `validate --project` run and an external-repo e2e pass are explicit release criteria for `2.0.0-rc.5`.

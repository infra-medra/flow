# Proposal: stabilize-v2-rc5

## Why

Before tagging `2.0.0`, a review of `2.0.0-rc.4` (`4cd4247`) identified 1.10.0 regressions in incremental `verify` handoffs, high cold-start overhead from per-task `apply` dispatch on `full`-track changes, incomplete token accounting in `measure-envelope.js`, spec-heavy wording in coordinator skills, implicit coordinator branching in step envelopes, lack of CLI-level subagent enforcement on Antigravity, and a noisy `models.plan: pro` warning in `docs/config-flow.yaml`.

## What Changes

- **Item 1 — Incremental `verify` handoff in envelope:** Reuse `cli/src/handoff.js` in `buildVerifySubagents` (`cli/src/step.js`) to emit per-subagent `round`, round-numbered `report` (`reviews/<date>-verify-<role>-r<N>.md`), `previous_report`, `changed_since_previous` (from round 2+), and `suite` (when `testing.command` exists); enforce handoff pre-dispatch checks (current green suite, `verify.merge`) returning `action: "gate"` with findings on failure; keep `latestReport`/`reportFreshness` accurate across round-numbered files; update `cli/schemas/envelope.schema.json` and `contracts/step-envelope.schema.json`.
- **Item 2 — `apply` `batch` granularity by `phase` on `full` track:** Group pending tasks from the same `tasks.md` phase with satisfied dependencies up to `apply.batch_max_tasks` (default `4`), allowing a `[TEST]` task and its dependent implementation task in the same batch while requiring per-task `medra task done` checkpoints and stopping on `needs-decision` (`task.test-tampered` / `blocked`). Add `apply.granularity: task | batch` (default `batch`; `legacy_fallback` forces `task`), deduplicate batch REQs/decisions/learnings/pointers, update `skills/{apply,run}/SKILL.md`, `pipelines/implementer-apply.md`, and schemas, and benchmark `task` vs `batch` on `docs/changes/archive/2026-11-21-remodel-deterministic-v2-flow` in `CHANGELOG.md`.
- **Item 3 — Honest token/byte measurement:** Update `cli/scripts/measure-envelope.js` to report coordinator skill + pointed pipeline(s) + envelope/prompt per stage, and correct `rc.1` metrics in `CHANGELOG.md`.
- **Item 4 — Agent-oriented coordinator skills:** Rewrite all 9 skills in `plugins/medra/skills/` to a lean structure (`Purpose`, `Input`, `Preconditions`, `Loop/Steps`, `Avoid` with rationale), removing spec IDs (`PLUG-*`, `M-*`) and repeated stage-dispatch phrases, restoring the user-language rule, keeping skill size within `+10%` of `rc.4`, and regenerating bundles (`check-bundle-drift.js`).
- **Item 5 — Deterministic `coordinator_steps[]`:** Emit explicit `coordinator_steps[]` in `medra step` envelopes (e.g., `medra verify-fix` or `ask_user` on `diff_error`) before `subagents[]`, simplifying skills to execute `coordinator_steps[]` in order without conditional branches.
- **Item 6 — CLI-level `MEDRA_SUBAGENT=1` enforcement (Antigravity):** Refuse `medra verify-fix`, `medra gate ... --approve`, and `medra gate ... --request-changes` in the CLI when `MEDRA_SUBAGENT=1`, document `MEDRA_SUBAGENT=1` propagation in `references/portability.md`, and document the remaining manual file-edit boundary in `references/gate.md`.
- **Item 7 — Clean `docs/config-flow.yaml`:** Set `models.plan: inherit` (zero warnings in `medra validate --project`) and document `apply.granularity` and `apply.batch_max_tasks`.
- **Acceptance & Release:** Add tests for Items 1, 2, 5, and 6; run an end-to-end `/medra:run` change (`propose` -> `archive`) in an external repository (not `harness`) and record the result in `CHANGELOG.md`; bump to `2.0.0-rc.5`.

## Scope

### In scope

- Items 1–7, envelope/contract schemas, `plugins/medra/`, `docs/config-flow.yaml`, `cli/scripts/measure-envelope.js`, `2.0.0-rc.5` release bump, `CHANGELOG.md`, and external-repo e2e run verification.

### Out of scope

- Breaking changes to 1.x `docs/` structure or changes outside Items 1–7.

## Track

**Track:** full
**Rationale:** Modifies verify handoff/state machines, batch apply compilation, CLI subagent privilege enforcement, all 9 coordinator skills, schemas, and requires an external-repo end-to-end run.
**Security:** relevant
**Security rationale:** Enforces CLI-level `MEDRA_SUBAGENT=1` refusal on `verify-fix` and `gate` commands and preserves `PreToolUse` / `SAFE_GIT_REF` / `untrusted_data` boundaries.

## Capabilities

| Capability | Operation | Requirements |
|---|---|---|
| `workflow-state` | modified | REQ STATE-005, REQ STATE-006, REQ STATE-007 |
| `runtime-plugin` | modified | REQ PLUG-003, REQ PLUG-006, REQ PLUG-007, REQ PLUG-008, REQ PLUG-009 |
| `context-and-memory` | modified | REQ CTX-006, REQ CTX-007 |

## Impact

- **Code:** `cli/src/step.js`, `cli/src/handoff.js`, `cli/src/commands.js`, `cli/src/core.js`, `cli/src/validate.js`, `cli/bin/medra.js`, `cli/scripts/measure-envelope.js`
- **Interfaces:** `cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`
- **Data:** `docs/config-flow.yaml` (`models.plan`, `apply.granularity`, `apply.batch_max_tasks`)
- **Dependencies:** None.
- **Docs & Plugin:** `plugins/medra/skills/*/SKILL.md`, `plugins/medra/pipelines/implementer-apply.md`, `plugins/medra/references/{gate,portability}.md`, `cli/plugin/`, `.agents/plugins/medra/`, `CHANGELOG.md`

## Open Questions

None.

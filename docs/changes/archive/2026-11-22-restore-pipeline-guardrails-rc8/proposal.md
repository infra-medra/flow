# Proposal: restore-pipeline-guardrails-rc8

## Why

Change `optimize-v2-tokens` (`20d0e22`) reduced `plugins/medra/pipelines/*.md` from `74,369 B` to `35,189 B` in `measure-envelope.js` (`23,300 B` raw) by moving edge-case details into `references/`. However, that cut also removed four everyday guardrails that subagents rely on in every dispatch: scenario-matched `red` failure verification in TDD, inline verdict/critical-finding rules in `reviewer-check.md` (and verdict/counts in `security-audit.md`), short one-sentence rationales ("why") on core rules, and the inline session-budget rule in `implementer-apply.md`. Restoring these guardrails within `< 36,700 B` preserves the optimization while preventing silent subagent drift before tagging `2.0.0-rc.8`.

## What Changes

- **Item 1 — Scenario-matched `red` failure requirement (`REQ VAL-007`):** Require `[TEST]` tasks in `tdd` (`implementer-apply.md`, `batch` prompts, and `fast`-track `inline` prompts) to fail for the reason the scenario predicts (an unsatisfied assertion, fixing import/syntax/fixture/environment errors before `--kind red`), with a one-sentence rationale explaining why a wrong-reason red invalidates the subsequent green.
- **Item 2 — Inline verdict & critical findings in verify pipelines (`REQ PLUG-015`):** Restore the verdict table (`fail` / `pass-with-findings` / `pass`) and critical-findings list inline in `reviewer-check.md` (`Report` phase), restrict `references/verify-checklists.md` §1 to conditional incremental (`changed_since_previous`) and `invalid-dispatch`/`needs-decision` rules, and ensure `security-audit.md` states its per-round verdict/counts contract without conditional reference reads.
- **Item 3 — One-sentence rule rationales across pipelines (`REQ PLUG-016`):** Add a concise one-sentence rationale to each core guardrail across `implementer-apply.md`, `reviewer-check.md`, `security-audit.md`, and all pipelines receiving `<untrusted_data>`, keeping total `plugins/medra/pipelines/*.md` bytes under `36,700 B`.
- **Item 4 — Inline session budget in `implementer-apply.md` & `2.0.0-rc.8` release sync (`REQ PLUG-017`, `REQ PLUG-003`):** Define the `batch` vs `task`/`inline` (new phase after 6+ checkpointed tasks) session budget directly in `implementer-apply.md`, remove the duplicate definition from `references/apply-recovery.md` §4, add content/byte-budget tests, bump to `2.0.0-rc.8`, sync bundles, and promote `[Unreleased]` in `CHANGELOG.md` to `[2.0.0-rc.8]` recording `74,369 B`, `35,189 B`, and the new `total_pipeline_bytes`.

## Scope

### In scope
- `plugins/medra/pipelines/*.md`, `plugins/medra/references/verify-checklists.md`, `plugins/medra/references/apply-recovery.md`
- `cli/src/step.js` (`batch` and `fast`-track `inline` `tdd` red-failure rule)
- `cli/test/` content & byte-budget tests, `cli/scripts/measure-envelope.js` verification
- `2.0.0-rc.8` version bump, `CHANGELOG.md`, `cli/plugin/`, `.agents/plugins/medra/`

### Out of scope
- Changing `measure-envelope.js` measurement formula or relaxing `< 36,700 B` pipeline ceiling
- Altering `medra gate`, `MEDRA_SUBAGENT=1`, or `childEnv()` behavior

## Track

**Track:** fast
**Rationale:** Targeted restoration of pipeline guardrails, `step.js` prompt lines, tests, and `2.0.0-rc.8` release bump without new architectural components.
**Security:** not-relevant
**Security rationale:** Strengthens prompt guardrails (`<untrusted_data>` data-only rationale, evidence-only `remediated` rationale) without changing authn/authz, hooks, or CLI boundaries.

## Capabilities

| Capability | Action | Requirements |
|---|---|---|
| runtime-plugin | modified | PLUG-015, PLUG-016, PLUG-017 |
| validation-and-tdd | modified | VAL-007 |

## Impact

- **Code:** `cli/src/step.js`, `plugins/medra/pipelines/*.md`, `plugins/medra/references/*.md`, `cli/test/`, `cli/package.json`, `plugins/medra/.claude-plugin/plugin.json`, `cli/plugin/`, `.agents/plugins/medra/`
- **Interfaces:** None.
- **Data:** None.
- **Dependencies:** None.

## Open Questions

None.

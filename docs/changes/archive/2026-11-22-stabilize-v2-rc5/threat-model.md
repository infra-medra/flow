# Threat Model: stabilize-v2-rc5

## Scope

CLI-level `MEDRA_SUBAGENT=1` enforcement (`verifyFix`, `gate`), incremental `verify` handoff metadata (`handoff.js` / `step.js`), `batch` apply compilation, and `coordinator_steps[]` execution.

## Assets

- `.medra.yaml` gates, `verify_fix_rounds`, and `handoff_snapshots`.
- `reviews/*-r<N>.md` round reports and `reviews/` integrity.
- `plugins/medra/hooks/guard.mjs` and CLI privilege checks (`cli/src/commands.js`).

## Trust Boundaries

- `B-01`: Coordinator vs. Subagent — subagents must not run `medra verify-fix` or `medra gate --approve` / `--request-changes` even on runtimes without `PreToolUse` hooks (Antigravity).
- `B-02`: Handoff pre-dispatch checks — `verify` subagents must not be dispatched when `suite` is stale/failing or `verify.merge` fails.

## Entry Points

- `medra verify-fix <change>` and `medra gate <change> <stage>` (`cli/bin/medra.js`, `cli/src/commands.js`) (`B-01`)
- `medra step <change>` (`cli/src/step.js`, `cli/src/handoff.js`) (`B-01`, `B-02`)
- `plugins/medra/hooks/guard.mjs` (`B-01`)

## Threats

| ID | STRIDE | Threat | Boundary | Severity | Likelihood | Mitigations |
|---|---|---|---|---|---|---|
| TM-01 | E | Subagent on Antigravity (no `PreToolUse` hook) invokes `medra verify-fix` or `medra gate --approve` / `--request-changes` | B-01 | high | medium | M-01 |
| TM-02 | T | `verify` dispatches reviewers on a stale/failing test suite or unmergeable deltas, or overwrites previous round reports | B-02 | medium | medium | M-02 |

## Mitigations

| ID | Mitigation | Threats | Decision |
|---|---|---|---|
| M-01 | Refuse `verifyFix` and `gate` (`--approve` / `--request-changes`) in `cli/src/commands.js` when `process.env.MEDRA_SUBAGENT === '1'`, propagate `MEDRA_SUBAGENT=1` in `references/portability.md`, and document the remaining manual file-edit boundary in `references/gate.md`. | TM-01 | accepted (D-06) |
| M-02 | Reuse `cli/src/handoff.js` in `compileVerifyStep` to enforce `suiteFindings` and `mergeFindings` before dispatch (returning `action: "gate"` on failure) and write round-numbered report paths (`-r<N>.md`). | TM-02 | accepted (D-01) |

## Residual Risks

- TM-01: On Antigravity (which lacks `PreToolUse` hooks), direct manual file edits to `.medra.yaml` or `tasks.md` remain bounded by prompt instructions and CLI hash/gate checks (documented in `references/gate.md`).

## Sources

- `cli/src/commands.js`, `cli/src/handoff.js`, `cli/src/step.js`
- `plugins/medra/hooks/guard.mjs`, `plugins/medra/references/{gate,portability}.md`

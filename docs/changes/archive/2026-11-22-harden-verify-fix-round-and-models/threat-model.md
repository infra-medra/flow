# Threat Model: harden-verify-fix-round-and-models

## Scope

Coordinator-owned `medra verify-fix` transitions, `guard.mjs` `PreToolUse` enforcement, `compileStep` per-role model resolution, and optional `reviews[].recorded_at` + SHA-256 hash freshness (`Item 5`).

## Assets

- `.medra.yaml` fix-round state (`verify_fix_rounds`, `last_fix_round_at`) and `reviews[]` metadata (`recorded_at`, `hash`).
- `plugins/medra/hooks/guard.mjs` (`PreToolUse` enforcement on Claude Code).
- `cli/src/step.js` (`compileStep` idempotency and per-role model resolution).
- `cli/src/validate.js` (`verifyFindings` freshness and integrity checks).

## Trust Boundaries

- `B-01`: Coordinator vs. Subagent — only the coordinator may run `medra gate ... --approve` and `medra verify-fix`; subagents execute implementation/review tasks and test verification only.
- `B-02`: Project files vs. CLI-owned state — `.medra.yaml` is CLI-owned; report files in `reviews/` live on disk and may have `mtime` altered by git operations.

## Entry Points

- `medra verify-fix <change>` (`cli/bin/medra.js`, `cli/src/commands.js`) (`B-01`, `B-02`)
- `medra review <change> --report <path>` (`cli/src/commands.js`) (`B-02`)
- `plugins/medra/hooks/guard.mjs` (`PreToolUse` Bash tool input) (`B-01`)
- `docs/config-flow.yaml` `models:` (`cli/src/core.js`, `cli/src/step.js`) (`B-02`)

## Threats

| ID | STRIDE | Threat | Boundary | Severity | Likelihood | Mitigations |
|---|---|---|---|---|---|---|
| TM-01 | E | Subagent invokes `medra verify-fix` directly to exhaust fix rounds and jump to the `verify` gate without fixing findings | B-01 | high | medium | M-01 |
| TM-02 | T | Repeated or unguarded `medra verify-fix` calls advance `verify_fix_rounds` when no blocking findings exist or while an open fix round awaits review | B-02 | medium | medium | M-02 |
| TM-03 | T | `git clone` / `git checkout` or manual report edits spoof `mtime` so stale review reports appear current | B-02 | medium | medium | M-03 |
| TM-04 | D | An unavailable or invalid `models` tier in `docs/config-flow.yaml` breaks subagent dispatch | B-01 | low | low | M-04 |

## Mitigations

| ID | Mitigation | Threats | Decision |
|---|---|---|---|
| M-01 | `guard.mjs` denies `medra verify-fix` when `input.agent_id` or `MEDRA_SUBAGENT=1` is set; `compileVerifyStep` removes `medra verify-fix` from subagent `exit_command`. Antigravity role-boundary equivalent documented in `gate.md` and `portability.md`. | TM-01 | accepted (D-01) |
| M-02 | `verifyFix` (`cli/src/commands.js`) refuses unless blocking verify findings exist and no unreviewed open fix round (`last_fix_round_at >= latestReport`) is active; `compileStep` remains read-only/idempotent. | TM-02 | accepted (D-01) |
| M-03 | `medra review` records `reviews[].recorded_at` and SHA-256 `hash`; `verifyFindings` checks `recorded_at` and file hash, falling back to `mtime` only for legacy 1.x states without `recorded_at`. | TM-03 | accepted (D-05) |
| M-04 | `MODEL_KEYS` and `modelFor` validate keys/strings and always provide `fallback: "inherit"`. | TM-04 | accepted (D-03) |

## Residual Risks

- TM-01: Antigravity lacks native `PreToolUse` hooks, so subagent `medra verify-fix` protection relies on subagent role boundaries and human confirmation at `medra gate`.

## Sources

- `cli/src/commands.js` (`verifyFix`, `review`, `gate`)
- `cli/src/validate.js` (`verifyFindings`, `latestReport`)
- `plugins/medra/hooks/guard.mjs`
- `plugins/medra/references/gate.md`, `plugins/medra/references/portability.md`

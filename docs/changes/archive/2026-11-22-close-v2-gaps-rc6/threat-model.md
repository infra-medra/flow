# Threat Model: close-v2-gaps-rc6

## Scope

Subagent privilege boundary (`MEDRA_SUBAGENT=1` command prefixing and prompt instruction in `cli/src/step.js`, CLI enforcement in `cli/src/commands.js`, `PreToolUse` hook matching in `plugins/medra/hooks/guard.mjs`), pre-verify `medra suite` dispatch in `coordinator_steps[]`, and `/medra:run` `done` subagent dispatch.

## Assets

- Workflow state (`.medra.yaml`, SHA-256 gate approvals, `verify_fix_rounds`, `suite` status)
- Subagent execution boundary (`MEDRA_SUBAGENT=1`, `hooks/guard.mjs`)

## Trust Boundaries

- **Coordinator <-> Subagent (Claude Code):** enforced via `PreToolUse` hook (`input.agent_id` / `MEDRA_SUBAGENT=1`) and CLI `requireCoordinator`.
- **Coordinator <-> Subagent (Antigravity):** enforced by convention via `MEDRA_SUBAGENT=1` prefix on envelope commands and prompt instruction, plus CLI `requireCoordinator` and gate SHA-256 hashes.

## Entry Points

- `medra step <change> --json` / `--md` / `--full` (`cli/src/step.js`)
- `plugins/medra/hooks/guard.mjs` (`PreToolUse` Bash/Write/Edit evaluation)
- `medra gate` / `medra verify-fix` (`cli/src/commands.js`)

## Threats

- **TM-01 (Elevation of Privilege):** A subagent on Antigravity runs `medra gate` or `medra verify-fix` without the `MEDRA_SUBAGENT=1` prefix.
- **TM-02 (Tampering):** A subagent on Claude Code runs `MEDRA_SUBAGENT=1 medra gate ... --approve` or `MEDRA_SUBAGENT=1 medra verify-fix` to bypass hook regexes.
- **TM-03 (Tampering):** A subagent on Antigravity manually edits `.medra.yaml` or `tasks.md` without `PreToolUse` interception.
- **TM-04 (Denial of Service):** Pre-verify `medra suite` in `coordinator_steps[]` loops endlessly on failing suites.

## Mitigations

- **TM-01:** `compileStep` prefixes every non-`inline` subagent `fetch_command`/`exit_command` with `MEDRA_SUBAGENT=1 ` and adds the prefix rule to `--md`/`--full` prompts; gates remain protected by SHA-256 hashes and human `ask_question` confirmation.
- **TM-02:** `plugins/medra/hooks/guard.mjs` matches `\bmedra(?:\.js)?` after `MEDRA_SUBAGENT=1 ` and checks `input.agent_id` / `MEDRA_SUBAGENT=1`, verified by `cli/test/guard.test.js`.
- **TM-03:** Gate SHA-256 hashes and `medra validate` re-validation detect state/task tampering at gate boundaries.
- **TM-04:** `compileVerifyStep` emits `coordinator_steps` suite dispatch only for `not-run`/`stale` findings; `failed` (`exit !== 0`) immediately returns `action: "gate"`.

## Residual Risks

- On Antigravity (no `PreToolUse` hook and no automatic env injection in `invoke_subagent`), `MEDRA_SUBAGENT=1` is an envelope-enforced convention and manual file edits to `.medra.yaml`/`tasks.md` remain unintercepted at write time (documented in `references/portability.md` and `references/gate.md`).

## Sources

- `cli/src/step.js`, `cli/src/commands.js`, `cli/src/change.js`, `plugins/medra/hooks/guard.mjs`, `plugins/medra/references/portability.md`, `plugins/medra/references/gate.md`

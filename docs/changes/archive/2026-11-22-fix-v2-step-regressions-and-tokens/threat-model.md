# Threat Model: fix-v2-step-regressions-and-tokens

**Author:** author · 2026-11-21
**Stack:** @medra.dev/flow 2.0.0-rc.2 (bumping to 2.0.0-rc.3) · Node.js (engines >=20, observed v18.19.1) · commander ^12.1.0 · yaml ^2.9.1 · fast-glob ^3.3.3 · ignore ^5.3.2 · picomatch ^4.0.7

## Scope

- **In:** `compileStep`, `stepMarkdown`, and `--role ... --md` rendering in `cli/src/step.js` and `cli/bin/medra.js`; `verify` fix-round state (`verify_fix_rounds`, `last_fix_round_at`) and `medra verify-fix` in `cli/src/change.js` and `cli/src/commands.js`; `plugin_pointers` resolution across Claude Code and Antigravity; `guard.mjs` subagent gate-bypass boundary (`agent_id` / `MEDRA_SUBAGENT=1`).
- **Out:** `medra archive`, `medra init`, and `medra learn` — unchanged by this change.

## Assets

- `.medra.yaml` gate & fix-round state — `internal`: tampering lets an agent bypass human gates or infinite-loop/skip verification.
- Human gate approval authority (`medra gate ... --approve`) — `confidential`: subagent execution would bypass human sign-off.
- Coordinator and subagent prompt/instruction integrity — `internal`: prompt injection via git diffs or contract files could hijack tool calls.
- Host filesystem outside project/plugin roots — `secret`: path traversal via pointers or CLI arguments could expose or corrupt files.

## Trust Boundaries

| ID | Boundary | From → To |
|---|---|---|
| B-01 | Untrusted repository data in step output | Git diff / `contracts/*` → `medra step --json --full` / `--role ... --md` prompt |
| B-02 | Subagent-to-CLI gate boundary | Clean-context subagent → `guard.mjs` / `medra gate` / `medra verify-fix` |
| B-03 | Pointer & CLI argument path boundary | `tasks.md` pointers / `--role` / `--task` / `plugin_pointers` → filesystem / plugin root |

## Entry Points

- `medra step <change> [--role <role>] [--task <T-ID>] [--md] [--full] [--diff-base <ref>]` (B-01, B-03) — accepts change name, role/task selectors, and git ref; emits JSON envelope or Markdown prompt with fenced `embedded` blocks.
- `medra verify-fix <change> --json` (B-02) — accepts change name; increments CLI-owned `verify_fix_rounds` and records `last_fix_round_at` in `.medra.yaml`.
- `plugins/medra/hooks/guard.mjs` `PreToolUse` stdin hook (B-02) — accepts Claude Code tool-call JSON (`agent_id`, `tool_name`, `tool_input`) and `MEDRA_SUBAGENT` env var.

## Threats

| ID | STRIDE | Threat | Boundary | Severity | Likelihood | Mitigations |
|---|---|---|---|---|---|---|
| TM-01 | T | Git diff or `contracts/*` embeds closing `</untrusted_data>` variants to break out of data fences in top-level `embedded` or `--role ... --md` output | B-01 | high | medium | M-01 |
| TM-02 | E | A Claude Code or Antigravity subagent attempts `medra gate <change> <stage> --approve` or hand-edits `.medra.yaml` `verify_fix_rounds` to skip verification | B-02 | high | low | M-02, M-03 |
| TM-03 | T | `medra verify-fix` or missing fix-round cap allows unbounded verify/fix loops or bypasses human `verify` gate | B-02 | medium | medium | M-03 |
| TM-04 | I | Path traversal via `plugin_pointers`, `contracts/*`, or `--task` / `--diff-base` arguments reads files outside project or plugin roots | B-03 | medium | low | M-04 |

## Mitigations

| ID | Mitigation | Threats | Decision |
|---|---|---|---|
| M-01 | Store `diff` and `contracts/*` once in top-level `embedded` passed through `fenceUntrusted` (`/<\s*\/\s*untrusted[-_]data/gi` neutralization) and `MAX_EMBED_BYTES` capping; render `--role ... --md` exclusively from those pre-fenced `embedded` blocks | TM-01 | accepted (D-05) |
| M-02 | Keep `guard.mjs` `Boolean(input.agent_id) \|\| process.env.MEDRA_SUBAGENT === '1'` denial on `medra gate ... --approve` and `.medra.yaml` write/edit denial; document verified `agent_id` behavior in `references/gate.md` and Antigravity's coordinator-owned gate boundary in `references/portability.md` | TM-02 | accepted (D-04) |
| M-03 | Track `verify_fix_rounds` and `last_fix_round_at` exclusively in CLI-owned `.medra.yaml` via `medra verify-fix`; cap automatic fix-implementer dispatch at `verify_fix_rounds === 0` and escalate to `action: "gate", gate: "verify"` once `verify_fix_rounds >= 1` | TM-02, TM-03 | accepted (D-02) |
| M-04 | Validate all project paths via `resolveSafePath`, git refs via `SAFE_GIT_REF`, plugin installs via `safeJoin`, and `--role` / `--task` against compiled `subagents[]` entries | TM-04 | accepted (D-03) |

## Residual Risks

- TM-02: Antigravity does not run Claude Code's `PreToolUse` `guard.mjs` hook natively; gate-approval protection on Antigravity relies on subagent isolation (`subagent_reminder`) and `medra gate` human confirmation. Re-evaluate if Antigravity adds `PreToolUse` hooks.

## Sources

- https://code.claude.com/docs/en/hooks — M-02 (confirmed via search: `PreToolUse` JSON stdin payload includes `agent_id` and `agent_type` when triggered by a subagent).
- https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html — M-01 (data-vs-instruction delimiter separation).

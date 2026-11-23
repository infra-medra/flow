# Threat Model: fix-v2-step-compiler-regressions

## Scope

This threat model covers the step-compiler (`cli/src/step.js`), CLI review/gate recording (`cli/src/commands.js`), coordinator skills (`plugins/medra/skills/*/SKILL.md`), and Claude Code `PreToolUse` hook (`plugins/medra/hooks/guard.mjs`) modified by `fix-v2-step-compiler-regressions`.

## Assets

- Change state and gate approvals in `docs/changes/<change>/.medra.yaml`
- Verification integrity (`git diff` and `contracts/*` embedded into `reviewer` and `security` subagent prompts)
- Host filesystem and shell execution environment during `medra step` and `guard.mjs` evaluation

## Trust Boundaries

- **TB-01:** Untrusted repository content (`contracts/*`, `git diff`, `diff_base` in `.medra.yaml`) crossing into LLM subagent prompts (`step.js`).
- **TB-02:** Subagent tool calls crossing into CLI state-mutating commands (`medra gate`, `medra review`) via `PreToolUse` (`guard.mjs`).

## Entry Points

- `medra step <change> [--stage <stage>] --json` (`cli/src/step.js`)
- `medra gate` and `medra review` (`cli/src/commands.js`)
- Claude Code `PreToolUse` stdin JSON (`plugins/medra/hooks/guard.mjs`)

## Threats

| ID | STRIDE | Threat | Boundary | Severity | Likelihood | Mitigations |
|---|---|---|---|---|---|---|
| TM-01 | T, R | Silent empty diff on `git diff` failure causes blind `verify` approval without reviewing actual code changes | TB-01 | high | high | M-01 |
| TM-02 | T, E | Closing-tag variants (`</ untrusted_data >`, `</untrusted-data>`) break out of `<untrusted_data>` fence for prompt injection | TB-01 | high | medium | M-02 |
| TM-03 | E, R | `security` verify subagent `exit_command` targets `medra gate`, risking unintended gate mutation or broken verification | TB-02 | medium | high | M-03 |
| TM-04 | E | Subagent invokes `medra gate ... --approve` directly to bypass human gate approval | TB-02 | high | low | M-04 |

## Mitigations

| ID | Mitigation | Threats | Decision |
|---|---|---|---|
| M-01 | `safeGitDiff` returns `{ diff, truncated, diff_error }` and `run/SKILL.md` + `verify/SKILL.md` warn and pause on `diff_error` instead of dispatching blind verify | TM-01 | accepted (D-01) |
| M-02 | `fenceUntrusted` neutralizes `/<\/\s*untrusted[-_]data/gi` and all `step.js` prompts standardize on `<untrusted_data>` | TM-02 | accepted (D-05) |
| M-03 | `buildVerifySubagents` sets `security` `exit_command` to `medra review --report` and `commands.js` accepts `Stage: security` reports | TM-03 | accepted (D-03) |
| M-04 | `guard.mjs` enforces `ask` on `medra gate ... --approve` and `deny` when subagent context (`input.agent_id` or `MEDRA_SUBAGENT=1`) is signaled | TM-04 | accepted (D-04) |

## Residual Risks

- On Claude Code runtimes that do not pass `agent_id` in `PreToolUse` stdin, `guard.mjs` falls back to `ask`, which still requires explicit human confirmation in the UI before executing `medra gate ... --approve`.
- Existing controls (`SAFE_GIT_REF`, `--` end-of-options, `resolveSafePath`, `MAX_EMBED_BYTES`, `MAX_CONTRACT_BYTES`) remain intact.

## Sources

- `cli/src/step.js`
- `cli/src/commands.js`
- `plugins/medra/hooks/guard.mjs`
- `plugins/medra/skills/run/SKILL.md`
- `plugins/medra/skills/verify/SKILL.md`

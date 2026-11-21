---
description: Starts a medra change from an intent, or revises an existing change — compiles the step via medra step --stage propose --json, dispatches a clean-context author subagent, and runs the proposal gate. Run only when the user explicitly invokes it.
argument-hint: "[intent | change-name]"
disable-model-invocation: true
---

# Command — propose

## Purpose

Thin coordinator for the `propose` stage. It ensures the change exists via `medra new`, compiles the deterministic handoff via `medra step <change> --stage propose --json`, dispatches a clean-context `author` subagent, and runs the human proposal gate.

## Input

`$ARGUMENTS` is either a natural-language intent or an existing change name. If empty, ask the user (`AskUserQuestion` / `ask_question`).

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `2` | Stop and tell the user to install/update `@medra.dev/flow` |
| State | `medra status --json` reports constitution `ratified` | Stop and tell the user to run `/medra:init` first |

## Operating Persona (Author)

Follow `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` and `${CLAUDE_PLUGIN_ROOT}/references/gate.md`.

## Coordinator Steps

### Phase 1 — Intake

1. If `$ARGUMENTS` is an intent (not an existing change), run `medra new <kebab-name> --intent "<intent>" --json` (or resolve the existing change).
2. Run `medra step <change> --stage propose --json` to compile the deterministic prompt, pointers, and `model` policy (`inherit` default, falling back to `inherit` if the runtime rejects a configured tier).
3. When `action === "dispatch"`, spawn a clean-context `author` subagent (`Agent` / `invoke_subagent`) with the compiled `prompt`, `pointers`, and `exit_command`. Never bypass `PreToolUse` hooks (`M-03`).
4. Re-run `medra step <change> --stage propose --json` (`M-06`) and `medra validate <change> --stage proposal --json`.
5. When `action === "gate"` (or validation passes), present the proposal summary and ask the user to approve (`medra gate <change> proposal --approve`) or request changes (`medra gate <change> proposal --request-changes --note "..."`).

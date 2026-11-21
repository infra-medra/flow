---
description: Writes the technical plan for a full-track medra change — compiles the step via medra step --stage plan --json, dispatches clean-context author/security subagents, and runs the plan gate. Run only when the user explicitly invokes it.
argument-hint: "[change-name]"
disable-model-invocation: true
---

# Command — plan

## Purpose

Thin coordinator for the `plan` stage on `full`-track changes. It compiles the deterministic handoff with `medra step <change> --stage plan --json`, dispatches a clean-context `author` subagent (and `security` threat model when relevant), and presents the plan gate.

## Input

`$ARGUMENTS` is the change name. If empty, pick the single change awaiting planning from `medra status --json` or ask the user.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `2` | Stop and tell the user to install/update `@medra.dev/flow` |
| State | `medra status <change> --json` shows `proposal` gate `approved` | Stop and tell the user to run `/medra:propose` first |

## Coordinator Steps

1. Run `medra step <change> --stage plan --json` to obtain `prompt`, `pointers`, `model` (`inherit` default, with automatic fallback to `inherit` if a configured tier is unavailable), and `exit_command`.
2. When `action === "dispatch"`, spawn a clean-context `author` subagent (`Agent` / `invoke_subagent`) with the compiled handoff. Never bypass `PreToolUse` hooks (`M-03`).
3. Re-run `medra step <change> --stage plan --json` and `medra validate <change> --stage plan --json` (`M-06`).
4. If open `[NEEDS CLARIFICATION]` markers remain, ask the user before proceeding.
5. When `action === "gate"`, present the plan summary and ask the user to approve (`medra gate <change> plan --approve`) or request changes (`medra gate <change> plan --request-changes --note "..."`).

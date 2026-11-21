---
name: review
description: Reviews a medra change's documents at their current stage (proposal, plan, tasks, or verify) using a clean-context reviewer subagent compiled via medra step --json. Run only when the user explicitly invokes it.
---

# Command — review

## Purpose

Thin coordinator for independent document or stage review. It compiles the current stage handoff via `medra step <change> --json` and dispatches a clean-context `reviewer` subagent (`medra-reviewer`) to write a structured review report and record the verdict.

## Input

`the text the user typed after the command` is the change name. If empty, pick the single active change from `medra status --json` or ask the user.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `2` | Stop and tell the user to install/update `@medra.dev/flow` |
| State | `medra status <change> --json` shows an active change | Stop and tell the user to run `/medra:propose` first |

## Coordinator Steps

1. Run `medra step <change> --json` to resolve the current `stage`, `pointers`, and `model` (`inherit` default, falling back to `inherit` if a configured tier is unavailable).
2. Dispatch a clean-context `reviewer` subagent (`Agent` / `invoke_subagent`) with the compiled `prompt`, `pointers`, and `medra review <change> --stage <stage> --verdict <approved|changes-requested>` exit command. Never bypass `PreToolUse` hooks (`M-03`).
3. Re-run `medra status <change> --json` and `medra step <change> --json` (`M-06`) to verify the review verdict was recorded.

---
name: init
description: Sets up medra in this project — scaffold, config, ratified constitution and optional living specs from existing code. Run only when the user explicitly invokes it.
---

# Command — init

## Purpose

Thin coordinator for initializing `medra` in a repository. It scaffolds `docs/` via `medra init`, ratifies `docs/constitution.md`, and optionally dispatches clean-context `author` subagents to bootstrap living specs from existing code.

## Input

`the text the user typed after the command` is optional free text (language, integrations, or notes). If omitted, ask the user (`AskUserQuestion` / `ask_question`) for preferred language, integrations (`claude`, `antigravity`), and testing mode (`tdd` / `test-after` / `relaxed`).

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `2` | Stop and tell the user to install/update `@medra.dev/flow` |
| State | Current directory is the project root | Ask the user to confirm the project root |

## Coordinator Steps

1. Run `medra init --language <lang> --integrations <list> --testing-mode <mode> --json` (never hand-edit `.medra.yaml` or bypass `PreToolUse` hooks, `M-03`).
2. Review/customize `docs/constitution.md` with the user and ratify via `medra constitution ratify --note "Initial ratification" --json`.
3. If the project has existing code and the user wants bootstrap living specs, dispatch clean-context `author` subagents (`Agent` / `invoke_subagent`) using `inherit` model policy (with automatic fallback to `inherit` if a configured tier is unavailable) to draft `docs/specs/<cap>/spec.md`.
4. Re-run `medra validate --project constitution --json` and `medra status --json` (`M-06`) to confirm initialization is valid.

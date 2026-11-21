---
description: Closes a verified medra change — compiles the archive handoff via medra step --stage archive --json, merges deltas into living specs, archives the change, and harvests learnings. Run only when the user explicitly invokes it.
argument-hint: "[change-name]"
disable-model-invocation: true
---

# Command — archive

## Purpose

Thin coordinator for the `archive` stage. It compiles the deterministic handoff via `medra step <change> --stage archive --json`, executes `medra archive <change> --json` (or dispatches a clean-context `author` subagent to harvest/compact learnings), and reports the archived state.

## Input

`$ARGUMENTS` is the change name. If empty, pick the single verified change from `medra status --json` or ask the user.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `2` | Stop and tell the user to install/update `@medra.dev/flow` |
| State | `medra status <change> --json` shows `verify` gate `approved` | Stop and tell the user to run `/medra:verify` first |

## Coordinator Steps

1. Run `medra step <change> --stage archive --json` to obtain `prompt`, `pointers`, `model` (`inherit` default, falling back to `inherit` if a configured tier is unavailable), and `exit_command`.
2. Dispatch a clean-context `author` subagent (`Agent` / `invoke_subagent`) or run `medra archive <change> --json` directly, never bypassing `PreToolUse` hooks (`M-03`).
3. Re-run `medra status --json` (`M-06`) to confirm the change is archived and living specs validate cleanly.

---
description: Implements approved tasks using adaptive granularity — compiles each step via medra step --stage apply --json and dispatches clean-context implementer subagents with CLI-checkpointed TDD evidence. Run only when the user explicitly invokes it.
argument-hint: "[change-name]"
disable-model-invocation: true
---

# Command — apply

## Purpose

Thin coordinator for the `apply` stage (`PLUG-001.S3`). It compiles task handoffs via `medra step <change> --stage apply --json` and dispatches clean-context `implementer` subagents: one per pending task on `full` track, or one for all tasks on `fast` track.

## Input

`$ARGUMENTS` is the change name. If empty, pick the single change in `tasked` or `implementing` phase from `medra status --json` or ask the user.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `2` | Stop and tell the user to install/update `@medra.dev/flow` |
| State | `medra status <change> --json` shows `tasks` gate `approved` (or `proposal` on `fast` track) | Stop and tell the user to run `/medra:tasks` or `/medra:propose` first |

## Coordinator Steps

### Phase 1 — Resume

1. Run `medra step <change> --stage apply --json`.
2. Inspect `granularity` and `subagents[]`:
   - `full` track (`granularity === "task"`): dispatch one clean-context `implementer` subagent (`Agent` / `invoke_subagent`) for the next task.
   - `fast` track (`granularity === "stage"`): dispatch a single clean-context `implementer` subagent covering all pending tasks.
3. Pass `model.tier` (default `inherit`); if the runtime rejects or lacks that tier, fall back to `inherit` without failing the step (`PLUG-005`).
4. Pass the compiled `prompt`, `pointers`, and `exit_command` (`medra task done ...`). Never bypass `PreToolUse` hooks (`M-03`) or hand-edit `tasks.md` checkboxes.
5. After each subagent returns, re-run `medra step <change> --stage apply --json` (`M-06`) until all tasks are done (`stage === "verify"`), then invite `/medra:verify`.

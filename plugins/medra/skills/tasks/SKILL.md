---
description: Breaks an approved medra plan into a traceable, test-first task list and runs the tasks gate. Run only when the user explicitly invokes it.
argument-hint: [change-name]
disable-model-invocation: true
---

# Command — tasks

## Purpose

The full-track step after an approved plan. It produces `docs/changes/<change>/tasks.md`, approved at the tasks gate. Implementation comes next.

## Input

`$ARGUMENTS` is the change name. If it is empty, use the only active change in `medra status --json`; with several, ask the user which one.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `1` | Stop and tell the user to run `npm install -g @medra.dev/flow` |
| State | `medra status <change> --json` shows track `full` | Stop: on the fast track, tasks are written by `/medra:propose` |
| State | Gate `plan` is `approved` (not `stale`) | Stop and tell the user to run `/medra:plan` first |

## Route

Read `${CLAUDE_PLUGIN_ROOT}/agents/author.md` in full and adopt it as your operating instructions for the rest of this command. Then load `medra:pipeline-author-tasks` with the Skill tool (or read it from the installed skills where there is no Skill tool) and follow it from Phase 1, using the input and preconditions above.

## Output

The tasks path and the task counts. Next: `/medra:apply`.

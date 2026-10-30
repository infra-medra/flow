---
description: Implements the approved tasks of a medra change one at a time, with red/green test evidence checkpointed by the CLI; also resumes an interrupted apply. Run only when the user explicitly invokes it.
argument-hint: [change-name]
disable-model-invocation: true
---

# Command — apply

## Purpose

The implementation step for both tracks. It turns `tasks.md` into code, recording every finished task with `medra task done`, so any session can resume. Verification comes next.

## Input

`$ARGUMENTS` is the change name. If it is empty, use the only change in phase `tasked` or `implementing`; with several, ask the user which one.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `1` | Stop and tell the user to run `npm install -g @medra.dev/flow` |
| State | Track `full`: gate `tasks` is `approved` (not `stale`). Track `fast`: gate `proposal` is `approved` (not `stale`) | Stop and tell the user to run `/medra:tasks` (full) or `/medra:propose <change>` (fast) first |
| State | `medra status <change> --json` shows tasks remaining | Stop: every task is done; the next step is `/medra:verify` |

## Route

Read `${CLAUDE_PLUGIN_ROOT}/agents/implementer.md` in full and adopt it as your operating instructions for the rest of this command. Then load `medra:pipeline-implementer-apply` with the Skill tool (or read it from the installed skills where there is no Skill tool) and follow it from Phase 1, using the input and preconditions above.

## Output

Tasks done this run, tasks remaining and open blockers. Next: `/medra:verify` when all are done, otherwise `/medra:apply` to resume.

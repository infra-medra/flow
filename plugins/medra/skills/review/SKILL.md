---
description: Reviews a medra change's documents at their current stage (proposal, plan or tasks), writes a review report and records the reviewer's verdict — for authors and teammates alike. Run only when the user explicitly invokes it.
argument-hint: <change-name> [stage]
disable-model-invocation: true
---

# Command — review

## Purpose

An optional step any team member can run at any point before archive. It produces `docs/changes/<change>/reviews/<date>-<stage>-<reviewer>.md` and records the verdict in the change state.

## Input

`$ARGUMENTS` is the change name, optionally followed by a stage (`proposal`, `plan` or `tasks`). If it is empty, list the active changes from `medra status --json` and ask which one to review.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `1` | Stop and tell the user to run `npm install -g @medra.dev/flow` |
| State | `docs/changes/<change>/proposal.md` exists | Stop and tell the user to run `/medra:propose` first |
| State | A named stage's document exists (`plan.md` for plan, `tasks.md` for tasks) | Stop and name the command that produces it |

## Route

Read `${CLAUDE_PLUGIN_ROOT}/agents/reviewer.md` in full and adopt it as your operating instructions for the rest of this command. Then load `medra:pipeline-reviewer-review` with the Skill tool (or read it from the installed skills where there is no Skill tool) and follow it from Phase 1, using the input and preconditions above.

## Output

The report path, the verdict and the counts. Next: the command that revises the stage on `request-changes`, otherwise the command for the change's current stage.

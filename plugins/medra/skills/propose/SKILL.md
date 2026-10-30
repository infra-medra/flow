---
description: Starts a medra change from an intent, or revises an existing change — writes the proposal and delta specs, picks the fast or full track, and runs the proposal gate. Run only when the user explicitly invokes it.
argument-hint: [intent | change-name]
disable-model-invocation: true
---

# Command — propose

## Purpose

The entry point of every change. It produces `medra/changes/<change>/proposal.md` and its delta specs (plus `tasks.md` on the fast track), approved at the proposal gate. Planning or implementation comes next, depending on the track.

## Input

`$ARGUMENTS` is either a natural-language intent ("let locked-out users reset their password") or the name of an existing change to revise. If it is empty, ask the user for the intent.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `1` | Stop and tell the user to run `npm install -g @medra.dev/flow` |
| State | `medra status --json` reports the constitution `ratified` | Stop and tell the user to run `/medra:init` first |
| State | When the input names an existing change: `medra status <change> --json` shows a phase before `verified` | Stop: a verified or archived change is closed — propose a new change instead |

## Route

Read `${CLAUDE_PLUGIN_ROOT}/agents/author.md` in full and adopt it as your operating instructions for the rest of this command. Then load `medra:pipeline-author-propose` with the Skill tool (or read it from the installed skills where there is no Skill tool) and follow it from Phase 1, using the input and preconditions above.

## Output

The change path, the track and the gate result. Next: `/medra:plan` on the full track, `/medra:apply` on the fast track.

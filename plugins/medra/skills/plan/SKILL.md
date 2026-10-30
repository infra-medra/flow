---
description: Writes the technical plan for a full-track medra change — design, Constitution Check, test strategy and decisions — and runs the plan gate. Run only when the user explicitly invokes it.
argument-hint: [change-name]
disable-model-invocation: true
---

# Command — plan

## Purpose

The full-track step after an approved proposal. It produces `medra/changes/<change>/plan.md` (plus `contracts/` when interfaces change), approved at the plan gate. Tasks come next.

## Input

`$ARGUMENTS` is the change name. If it is empty, use the only active change in `medra status --json`; with several, ask the user which one.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `1` | Stop and tell the user to run `npm install -g @medra.dev/flow` |
| State | `medra status <change> --json` shows track `full` | Stop: fast-track changes have no plan; the next step is `/medra:apply` |
| State | Gate `proposal` is `approved` (not `stale`) | Stop and tell the user to run `/medra:propose <change>` first |

## Route

Read `${CLAUDE_PLUGIN_ROOT}/agents/author.md` in full and adopt it as your operating instructions for the rest of this command. Then load `medra:pipeline-author-plan` with the Skill tool (or read it from the installed skills where there is no Skill tool) and follow it from Phase 1, using the input and preconditions above.

## Output

The plan path and the Constitution Check counts. Next: `/medra:tasks`.

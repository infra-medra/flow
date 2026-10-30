---
description: Closes a verified medra change — merges its deltas into living specs, archives it, harvests and compacts lessons, and proposes constitution amendments for recurring ones. Run only when the user explicitly invokes it.
argument-hint: [change-name]
disable-model-invocation: true
---

# Command — archive

## Purpose

The last step of every change. It updates `medra/specs/`, moves the change to `medra/changes/archive/`, updates `medra/learnings.md`, and may amend `medra/constitution.md` behind a gate.

## Input

`$ARGUMENTS` is the change name. If it is empty, use the only change in phase `verified`; with several, ask the user which one.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `1` | Stop and tell the user to run `npm install -g @medra.dev/flow` |
| State | `medra status <change> --json` shows gate `verify` `approved` (not `stale`) | Stop and tell the user to run `/medra:verify` first |

## Route

Read `${CLAUDE_PLUGIN_ROOT}/agents/author.md` in full and adopt it as your operating instructions for the rest of this command. Then load `medra:pipeline-author-archive` with the Skill tool (or read it from the installed skills where there is no Skill tool) and follow it from Phase 1, using the input and preconditions above.

## Output

The archived path, spec counts, learnings counts and constitution version. Next: `/medra:propose`.

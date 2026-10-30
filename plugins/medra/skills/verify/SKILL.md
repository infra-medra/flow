---
description: Verifies a finished medra change against its specs through an independent reviewer check, fixes findings, and runs the verify gate. Run only when the user explicitly invokes it.
argument-hint: "[change-name]"
disable-model-invocation: true
---

# Command — verify

## Purpose

The step after apply. It produces a verification report under `reviews/` and an approved verify gate, which archive requires.

## Input

`$ARGUMENTS` is the change name. If it is empty, use the only change in phase `implementing`; with several, ask the user which one.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `1` | Stop and tell the user to run `npm install -g @medra.dev/flow` |
| State | `medra status <change> --json` reports every task done | Stop and tell the user to finish with `/medra:apply` first |

## Route

Read `${CLAUDE_PLUGIN_ROOT}/agents/implementer.md` in full and adopt it as your operating instructions for the rest of this command. Then load `medra:pipeline-implementer-verify` with the Skill tool (or read it from the installed skills where there is no Skill tool) and follow it from Phase 1, using the input and preconditions above.

## Output

The report path, the verdict and the coverage ratio. Next: `/medra:archive`.

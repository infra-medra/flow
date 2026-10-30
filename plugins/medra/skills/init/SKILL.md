---
description: Sets up medra in this project — scaffold, config, ratified constitution and optional living specs from existing code. Run only when the user explicitly invokes it.
argument-hint: [language] [notes]
disable-model-invocation: true
---

# Command — init

## Purpose

The first step of the medra workflow. It creates `docs/` through the CLI, records language, integrations and testing mode, ratifies `docs/constitution.md`, and can bootstrap living specs from existing code. Every other command requires it.

## Input

`$ARGUMENTS` is optional free text: a preferred language, integrations, or notes about the project. If it is empty, the pipeline asks for each setting.

## Preconditions

| Requires | Check | If missing |
|---|---|---|
| CLI | `medra --version` prints major version `1` | Stop and tell the user to run `npm install -g @medra.dev/flow` |
| State | The current directory is the project root (a git repository root, or the directory the user names) | Ask the user to confirm the project root before continuing |

## Route

Read `${CLAUDE_PLUGIN_ROOT}/agents/author.md` in full and adopt it as your operating instructions for the rest of this command. Then load `medra:pipeline-author-init` with the Skill tool (or read it from the installed skills where there is no Skill tool) and follow it from Phase 1, using the input and preconditions above.

## Output

The config settings, constitution version and capability count, as the pipeline's Delivery reports them. Next: `/medra:propose "<intent>"`.

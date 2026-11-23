# Proposal: remodel-deterministic-v2-flow

## Why

In medra 1.x, command skills carry 8–14 KB of multi-phase instructions and run inline, accumulating conversation history across turns and causing quadratic token growth during `apply`. Remodeling the flow so the `medra` CLI deterministically compiles minimal step prompts and thin coordinator skills dispatch clean-context subagents cuts token waste while keeping every step focused on only what it needs.

## What Changes

- Add deterministic step-state and prompt/handoff compilation to the `medra` CLI, resolving only the touched requirements, scoped decisions, scoped learnings, and hybrid code references (`paths` in `plan`/`apply`; embedded `contracts/*` and `diff` in `verify`).
- Refactor `plugins/medra/` command skills into thin coordinators that keep per-stage commands (`/medra:propose`, etc.) and add `/medra:run` to advance deterministically until the next human gate or clarification.
- Run heavy execution and verification steps in disposable, clean-context subagents with adaptive granularity (per-task in `full-track`, single-subagent `apply` in `fast-track`, isolated `reviewer`/`security` and fix rounds in `verify`).
- Support optional per-role/stage model overrides in `docs/config-flow.yaml` defaulting to `inherit` with automatic fallback to `inherit` when a runtime lacks the configured tier.
- Prepare the `v2` branch as a `2.0.0-rc.x` release candidate while preserving full compatibility with 1.x `docs/` layouts.

## Scope

### In scope

- Deterministic prompt/handoff compiler command in `medra` CLI with schema/snapshot tests and graceful fallback for legacy 1.x `tasks.md`.
- Task-traceability validation (`task -> REQ/scenario -> paths`) at the `tasks` stage.
- Thin coordinator skills, `/medra:run`, and clean-context subagent execution across Claude Code and Antigravity (`bundle-plugin` + `check-version` synced).
- Optional `models:` configuration in `docs/config-flow.yaml` with `inherit` default and runtime fallback.
- Release candidate versioning (`2.0.0-rc.1`) on branch `v2`.

### Out of scope

- Breaking changes to the 1.x `docs/` file layout — existing projects must work without manual migration.
- External headless daemon/SDK runner outside chat — interactive gates and clarifications remain in the coordinator session.
- Publishing final `2.0.0` or modifying `1.x` maintenance on `main` — `v2` targets an RC release first.

## Track

**Track:** full
**Rationale:** Fires Breadth (touches 4 capabilities), Interface (new CLI prompt-compiler command, `/medra:run` skill, `config-flow.yaml` `models:` key, and `2.0.0-rc` semver), and Size (> 8 tasks expected).
**Security:** relevant
**Security rationale:** Prompt compilation assembles file paths from `tasks.md`/`plan.md` and embeds `contracts/*` and diffs into subagent prompts, requiring path-traversal validation and untrusted-content boundaries.

## Capabilities

| Capability | Operation | Requirements |
|---|---|---|
| `context-and-memory` | modified | CTX-005 |
| `runtime-plugin` | modified | PLUG-001, PLUG-005 |
| `validation-and-tdd` | modified | VAL-005 |
| `workflow-state` | modified | STATE-005 |

## Impact

- **Code:** `cli/src/context.js`, `cli/src/commands.js`, `cli/src/validate.js`, `cli/src/core.js`, `plugins/medra/skills/**`, `plugins/medra/agents/**`, `cli/package.json`.
- **Interfaces:** New CLI step/prompt compiler command, `/medra:run` skill, optional `models:` key in `docs/config-flow.yaml`, `2.0.0-rc.1` version.
- **Data:** None (1.x `docs/` layout preserved; additive optional fields only).
- **Dependencies:** None.

## Open Questions

None.

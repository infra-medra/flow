# Proposal: fix-v2-step-regressions-and-tokens

## Why

Coordinators running `/medra:run`, `/medra:verify`, and `/medra:apply` on `2.0.0-rc.2` hit broken validation commands, verify loops, ambiguous plugin pointers in external projects, and multi-kilobyte prompt duplication that inflates coordinator output tokens. Fixing these step-compiler regressions and deduplicating step envelopes makes the v2 workflow reliable outside `harness` while cutting coordinator token usage per step.

## What Changes

- Map flow stage `propose` to validation stage `proposal` in generated `exit_command` and completion criteria without changing `medra validate`'s stage vocabulary, and audit all skill/pipeline commands.
- Align `resolveStage` and `compileStep` with `verifyFindings` and CLI-tracked fix-round state so `verify` transitions deterministically between `dispatch` (fix implementer) and `gate` (pass or escalated blockers), and update `run`/`verify` skills to follow envelope `action`.
- Disambiguate plugin-relative pointers from project-relative pointers across Claude Code and Antigravity without preferring `.agents/plugins/medra/` over `plugins/medra/`, and verify/document subagent detection (`agent_id` / `MEDRA_SUBAGENT=1`) in `guard.mjs` and `references/gate.md`.
- Deduplicate large `verify` payloads (diffs and contracts) into top-level `embedded` blocks, add `medra step <change> --role <role> [--task <T-ID>] --md` with compact default `--json` envelopes (`--full` preserved), support `action: "inline"` for small `fast`-track `apply` (configurable `apply.inline_max_tasks`, default 3), and evaluate `action: "inline"` for `propose`/`plan`/`tasks` at the plan gate.
- Bump release-candidate version to `2.0.0-rc.3`, regenerate plugin bundles, update schemas, and add `cli/scripts/measure-envelope.js` to verify coordinator `--json` size (< 4 KB at verify).

## Scope

### In scope

- Reproduction-first tests for each bug and token-economy item (skipping code changes with recorded evidence if an item does not reproduce).
- Part A bug fixes: stage mapping in `compileStep` (A1), verify state transitions and CLI-owned fix-round tracking + `run`/`verify` skill updates (A2), unambiguous plugin pointers across runtimes (A3), and `guard.mjs` subagent detection verification/documentation (A4).
- Part B token economy: top-level `embedded` deduplication (B1), `--role ... --md` fetch command + compact default `--json` envelope + skill updates (B2), `plan.md` design decision for inline `propose`/`plan`/`tasks` (B3, implemented only if approved at plan gate), and `apply.inline_max_tasks` inline fast-track (B4).
- Schema updates (`cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`), `cli/scripts/measure-envelope.js`, `2.0.0-rc.3` version bump, `CHANGELOG.md`, and bundle regeneration.

### Out of scope

- Changing `medra validate`'s public `--stage` vocabulary (`proposal`, `plan`, `tasks`, `verify`) — keeping one canonical validation vocabulary avoids breaking existing scripts and docs.
- Breaking changes to 1.x `docs/` layouts or hand-editing `.medra.yaml` / `tasks.md` checkboxes — backward compatibility and CLI state ownership are preserved.
- Implementing B3 (`propose`/`plan`/`tasks` inline execution) if the design decision is rejected at the plan gate — B3 is gated on explicit plan approval.

## Track

**Track:** full
**Rationale:** Fires `Breadth` (> 2 capabilities touched: `context-and-memory`, `runtime-plugin`, `workflow-state`), `Interface` (CLI `medra step` flags/envelope schema and `docs/config-flow.yaml` options change), `Security` (`guard.mjs` subagent detection and `<untrusted_data>` fencing), and `Size` (> 8 tasks expected across Parts A and B).
**Security:** relevant
**Security rationale:** Touches `hooks/guard.mjs` subagent gate-bypass detection (`agent_id` / `MEDRA_SUBAGENT=1`), `safeGitDiff` / `resolveSafePath` / `<untrusted_data>` fencing during envelope deduplication and `--role ... --md` rendering, and `fetch_command` handoff instructions.

## Capabilities

| Capability | Operation | Requirements |
|---|---|---|
| `context-and-memory` | modified | REQ CTX-005 |
| `runtime-plugin` | modified | REQ PLUG-001, REQ PLUG-002, REQ PLUG-003, REQ PLUG-004 |
| `workflow-state` | modified | REQ STATE-005 |

## Impact

- **Code:** `cli/src/context.js`, `cli/src/change.js`, `cli/src/commands.js`, `cli/bin/medra.js`, `cli/scripts/measure-envelope.js`, `plugins/medra/hooks/guard.mjs`, `plugins/medra/skills/*/SKILL.md`, `plugins/medra/pipelines/*.md`, `plugins/medra/references/*.md`, `cli/plugin/`, `.agents/plugins/medra/`
- **Interfaces:** `medra step` (`--role`, `--task`, `--md`, `--full`), `cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`, `docs/config-flow.yaml` (`apply.inline_max_tasks`)
- **Data:** Optional CLI-managed fix-round state field in `.medra.yaml` (backward-compatible default `0`)
- **Dependencies:** None.

## Open Questions

None.

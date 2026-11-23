# Proposal: optimize-v2-tokens

## Why

Measured `2.0.0-rc.7` step envelopes via `cli/scripts/measure-envelope.js` show that compiled CLI JSON envelopes account for only ~5.5% (`5,058 B`) of total stage bytes (`92,355 B`), while pointed `plugins/medra/pipelines/*.md` files account for ~80.5% (`74,369 B`). Additionally, dispatched subagents still spend 3–5 cold-start file reads orienting themselves, per-task `--run` commands can re-run the full `testing.command` suite repeatedly before `medra suite`, `apply` batching stops at phase boundaries even when dependencies are satisfied, and `compileStep` performs avoidable checks on non-verify iterations. Optimizing these five areas will substantially reduce token usage and end-to-end latency on `v2` without sacrificing determinism or safety.

## What Changes

- **Item 1 — Lean core pipelines with on-demand references (`REQ PLUG-013`):** Refactor all 9 `plugins/medra/pipelines/*.md` files into compact core workflows (~45–60% smaller in total `pipeline_bytes`), moving verbose edge-case, fallback, and recovery procedures into `plugins/medra/references/*.md` loaded only when triggered.
- **Item 2 — Self-contained compact task pack in `medra step --md` (`REQ CTX-008`):** Enrich `medra step <change> --role <role> [--task <T-ID>] --md` (the subagent `fetch_command`) with compact, deduplicated ratified `constitution.md` summaries, referenced `REQ` / scenario blocks from the change's `specs/`, and matching `tasks.md` lines / `verify:` hints while keeping default `medra step --json` coordinator output compact.
- **Item 3 — Scoped per-task test commands during `apply` (`REQ PLUG-014`):** Update `implementer-apply.md`, `author-tasks.md`, and `step.js` `apply` prompt hints so `[TEST]` and implementation tasks prefer targeted test-file `--run` commands (e.g., `node --test <file>`) when `testing.command` is configured, reserving full-suite execution for `medra suite` at the `apply -> verify` transition.
- **Item 4 — Cross-phase `apply` batching across satisfied dependencies (`MODIFIED REQ PLUG-006`):** Add `apply.batch_scope: phase | cross-phase` (default `cross-phase`) in `DEFAULT_CONFIG` and `buildApplySubagents` (`cli/src/step.js`) so `batch` groups pending tasks with satisfied dependencies across phases up to `apply.batch_max_tasks`, while preserving `apply.batch_scope: phase`, `apply.granularity: task`, and `legacy_fallback`.
- **Item 5 — Fast-path `medra step` compilation (`REQ STATE-008`):** Avoid redundant project-wide spec/suite/diff work during `compileStep` when compiling stages that do not need it (e.g. `propose`, `plan`, `tasks`, `apply`, `done`).

## Scope

### In scope
- `plugins/medra/pipelines/*.md` refactoring and on-demand reference files in `plugins/medra/references/`
- `cli/src/step.js`, `cli/src/core.js`, `docs/config-flow.yaml`
- `cli/scripts/measure-envelope.js` and unit/integration tests in `cli/test/`
- Plugin bundle sync (`cli/plugin/`, `.agents/plugins/medra/`) and `CHANGELOG.md`

### Out of scope
- Changing `medra gate` / `MEDRA_SUBAGENT=1` security boundaries or 1.x compatibility semantics
- Modifying the `medra` CLI public JSON envelope contract in breaking ways

## Track

**Track:** full
**Rationale:** Spans 5 coordinated optimizations across `runtime-plugin`, `context-and-memory`, and `workflow-state`, modifying `cli/src/step.js`, config defaults, and all 9 plugin pipelines.
**Security:** not-relevant
**Security rationale:** No trust boundary, authentication, hook guard, or `MEDRA_SUBAGENT=1` enforcement logic is relaxed; `<untrusted_data>` fencing and subagent restrictions remain unchanged.

## Capabilities

| Capability | Action | Requirements |
|---|---|---|
| runtime-plugin | modified | PLUG-006, PLUG-013, PLUG-014 |
| context-and-memory | modified | CTX-008 |
| workflow-state | modified | STATE-008 |

## Impact

- **Code:** `cli/src/step.js`, `cli/src/core.js`, `cli/scripts/measure-envelope.js`, `plugins/medra/pipelines/*.md`, `plugins/medra/references/*.md`, `cli/plugin/`, `.agents/plugins/medra/`
- **Interfaces:** `docs/config-flow.yaml` (`apply.batch_scope: phase | cross-phase`), `medra step --role ... --md` task pack output
- **Data:** None.
- **Dependencies:** None.

## Open Questions

None.

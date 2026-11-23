# Proposal: harden-verify-fix-round-and-models

## Why

A review of commit `7496b85` (`2.0.0-rc.3`) identified five remaining reliability, security, and consistency issues in the v2 coordinator and step-compiler workflow:
1. Verify fix-round tracking (`medra verify-fix`) is currently an `exit_command` delegated to the fix `implementer` subagent, allowing a subagent to skip it (infinite loop) or abuse it (skipping fixes straight to the gate).
2. `verify_fix_rounds` is never reset after `medra gate <change> verify --request-changes` and subsequent work, permanently disabling automatic fix rounds on that change.
3. Per-role model overrides (`models.reviewer`, `models.implementer`, `models.security`, `models.author`) pass `MODEL_KEYS` validation in `cli/src/core.js` but are ignored by `compileStep` (`cli/src/step.js`).
4. `plugins/medra/skills/run/SKILL.md` contradicts itself by listing `propose`, `plan`, and `tasks` under `action === "dispatch"` even though they return `action: "inline"`.
5. Report freshness in `latestReport` / `verifyFindings` relies solely on file `mtime`, which breaks after `git clone` or `git checkout` (optional Item 5, to be decided at the `plan` gate).

## What Changes

- **Item 1 (Coordinator-owned `verify-fix` & hook protection):** Move `medra verify-fix` execution from the fix `implementer`'s `exit_command` to the coordinator (once before dispatching the fix implementer); set fix implementer `exit_command` to test verification (e.g. `medra suite <change> --json`); ensure `compileStep` is idempotent across repeated calls without `verify-fix`; evaluate and decide `verify-fix` refusal guards in the plan; block `medra verify-fix` for subagents in `plugins/medra/hooks/guard.mjs` and document Antigravity equivalent in `references/gate.md` and `references/portability.md`; update `run/SKILL.md` and `verify/SKILL.md`.
- **Item 2 (`verify_fix_rounds` reset rule):** Define, decide in `plan.md`, and test when `verify_fix_rounds` resets (e.g., on `medra gate <change> verify --request-changes` or new task completion after the last fix round).
- **Item 3 (Per-role model resolution):** Resolve each `subagents[]` entry's `model` in order `role -> stage -> default -> inherit` while keeping top-level envelope `model` at the stage tier; document/warn for `inline` stages where `models.<stage>` / `models.author` do not apply; update `cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`, and `references/portability.md` (including Antigravity `invoke_subagent` tier support note).
- **Item 4 (Skill & pipeline `inline` consistency):** Remove the contradictory `propose`/`plan`/`tasks` dispatch line in `run/SKILL.md` and ensure all skills (`propose`, `plan`, `tasks`, `apply`, `verify`, `run`) and affected pipelines follow `action` without inferring from stage names, backed by a content test.
- **Item 5 (Optional, plan-gated — report freshness beyond `mtime`):** Record `reviews[].recorded_at` and file hash via `medra review`, using `recorded_at` + hash verification with `mtime` fallback for 1.x changes; if rejected at the `plan` gate, document as a post-2.0.0 known issue in `CHANGELOG.md`.
- **Release & Bundles:** Preserve 1.x `docs/` compatibility, keep all existing security defenses (`SAFE_GIT_REF`, `resolveSafePath`, `<untrusted_data>` fencing, compact coordinator envelopes < 4 KB without >10% growth over `rc.3`), regenerate bundles (`npm run bundle-plugin`), and bump version to `2.0.0-rc.4` with `CHANGELOG.md` entry.
- **Test-First Rule:** Before fixing each item, write a failing reproduction test; if an item does not reproduce, record evidence in `plan.md` and do not alter code for that item.

## Scope

### In scope

- Items 1–5 above, schemas (`cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`), `plugins/medra/` skills, hooks, references, pipelines, bundle regeneration, `2.0.0-rc.4` version bump, and `CHANGELOG.md`.

### Out of scope

- Any unrelated refactors, phase/batch grouping in `apply`, or breaking changes to 1.x `docs/` layouts.

## Track

**Track:** full
**Rationale:** Spans CLI state-machine/gate transitions, `PreToolUse` hook boundaries, schema updates, cross-runtime docs, and a plan-gated design decision (Item 5).
**Security:** relevant
**Security rationale:** Modifies `guard.mjs` subagent command blocking (`medra verify-fix`), coordinator-vs-subagent privilege separation, and optional report integrity (`recorded_at` / hash).

## Capabilities

| Capability | Operation | Requirements |
|---|---|---|
| `context-and-memory` | modified | REQ CTX-005 |
| `runtime-plugin` | modified | REQ PLUG-001, REQ PLUG-002, REQ PLUG-003, REQ PLUG-004, REQ PLUG-005 |
| `workflow-state` | modified | REQ STATE-005 |

## Impact

- **Code:** `cli/src/step.js`, `cli/src/commands.js`, `cli/src/validate.js`, `cli/src/core.js`, `cli/bin/medra.js`, `plugins/medra/hooks/guard.mjs`
- **Interfaces:** `cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`
- **Data:** Optional `.medra.yaml` review/fix-round fields (`verify_fix_rounds` reset, optional `reviews[].recorded_at` & hash)
- **Dependencies:** None.
- **Docs & Plugin:** `plugins/medra/skills/*/SKILL.md`, `plugins/medra/references/{gate,portability}.md`, `cli/plugin/`, `.agents/plugins/medra/`, `CHANGELOG.md`

## Open Questions

None.

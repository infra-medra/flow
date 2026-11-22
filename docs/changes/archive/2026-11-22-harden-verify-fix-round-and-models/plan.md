# Plan: harden-verify-fix-round-and-models

## Summary

Harden the `medra` v2 `verify` fix-round loop so `medra verify-fix` is coordinator-only (and blocked for subagents in `guard.mjs`), reset `verify_fix_rounds` on `verify --request-changes`, resolve subagent `model` overrides in `role -> stage -> default -> inherit` order, remove the `run/SKILL.md` `inline`-vs-`dispatch` contradiction, optionally switch report freshness from `mtime` to `recorded_at` + SHA-256 hash (Item 5, plan-gated), and ship `2.0.0-rc.4` with synced bundles.

## Constitution Check

| Article | Gate | Result | Note |
|---|---|---|---|
| I | Does every scenario map to a test task ordered before its implementation? | pass | Every item (Items 1–5) has a `[TEST]` reproduction task ordered before implementation. |
| II | Are CLI-owned state boundaries, `resolveSafePath`, and subagent gate/fix-round limits preserved? | pass | `guard.mjs` blocks `medra verify-fix` for subagents (`M-01`), `verifyFix` guards invalid calls (`M-02`), and 1.x `docs/` compatibility is kept. |
| III | Are envelope schemas and cross-runtime docs updated alongside code changes? | pass | Both `cli/schemas/envelope.schema.json` and `contracts/step-envelope.schema.json` plus `gate.md` / `portability.md` are updated. |
| IV | Does coordinator `verify --json` stay `< 4 KB` with `<= 10%` stage growth vs `rc.3`? | pass | `measure-envelope.js` benchmark gate verifies `< 4096 B` and `<= 10%` growth over `rc.3`. |
| V | Are plan-gated design decisions explicitly documented with alternatives? | pass | Decision `D-05` (Item 5: `recorded_at` + hash freshness vs Known Issue) is presented for plan gate approval. |

## Complexity Tracking

None.

## Test Strategy

- **Command:** `npm --prefix cli test`
- **Framework:** `node:test`
- **Benchmark:** `node cli/scripts/measure-envelope.js` (`verify < 4096 B`, no stage > 10% over `2.0.0-rc.3`)

| Scenario | Level | Test location |
|---|---|---|
| `CTX-005.S8`, `CTX-005.S15` | unit/integration | `cli/test/step-compiler.test.js` |
| `CTX-005.S14` | script/schema | `cli/test/step-compiler.test.js` |
| `CTX-005.S16`, `PLUG-005.S2` | unit | `cli/test/step-compiler.test.js`, `cli/test/install-misc.test.js` |
| `CTX-005.S17` | unit/integration | `cli/test/step-compiler.test.js`, `cli/test/archive-verify.test.js` |
| `PLUG-001.S4`, `PLUG-002.S2`, `PLUG-003.S1`, `STATE-005.S1` | unit/content | `cli/test/install-misc.test.js` |
| `PLUG-004.S4` | hook unit | `cli/test/hooks.test.js` |
| `STATE-005.S2` | unit/integration | `cli/test/step-compiler.test.js` |

## Decisions

### D-01: Coordinator-owned `medra verify-fix` and refusal guards

**Choice:** Move `medra verify-fix` out of the fix `implementer`'s `exit_command` (which becomes `medra suite <change> --json`) into the coordinator (`run/SKILL.md` and `verify/SKILL.md`), which runs `medra verify-fix <change> --json` once before dispatching the fix `implementer`. `compileStep` remains pure/idempotent, `verifyFix(root, change)` refuses calls when no blocking verify errors exist or when an open fix round (`last_fix_round_at >= latestReport`) is still unreviewed (`M-02`), and `plugins/medra/hooks/guard.mjs` denies `medra verify-fix` for subagents (`M-01`).
**Alternatives:** Keeping `medra verify-fix` in subagent `exit_command` (vulnerable to skipped execution causing infinite loops or premature execution skipping fixes) or allowing `verifyFix` unconditionally without refusal guards.
**Rationale:** Separating coordinator state transitions from subagent work ensures deterministic 1-round limits, idempotent `medra step` calls, and clean privilege separation documented in `references/gate.md` and `references/portability.md`.

### D-02: Reset `verify_fix_rounds` on `medra gate verify --request-changes`

**Choice:** In `gate(root, change, 'verify', { requestChanges: true })` (`cli/src/commands.js`), reset `state.verify_fix_rounds = 0` and `state.last_fix_round_at = null`.
**Alternatives:** Never resetting `verify_fix_rounds` (permanently locking out automatic fix rounds after `--request-changes`) or resetting inside `taskDone`.
**Rationale:** `--request-changes` is the explicit human gate decision reopening work on the change; resetting at that gate keeps the rule simple, explicit, and predictable when the change returns to `verify`.

### D-03: Per-subagent model resolution (`role -> stage -> default -> inherit`)

**Choice:** Resolve each `subagents[]` item's `model` in `compileStep` (`cli/src/step.js`) via `modelFor(config, s.role, targetStage)` checking `config.models?.[role] ?? config.models?.[stage] ?? config.models?.default ?? 'inherit'` (always `fallback: 'inherit'`), while keeping top-level envelope `model` at the stage tier. Emit a `warning` in `medra validate --project` (or config validation) if `models.propose`, `models.plan`, `models.tasks`, or `models.author` is configured away from `inherit` since `inline` stages run in the main session, and update `cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`, and `references/portability.md`.
**Alternatives:** Leaving `modelFor` stage-only (ignoring `models.reviewer`, `models.implementer`, `models.security`, `models.author`) or changing top-level `model`.
**Rationale:** Matches `MODEL_KEYS` in `cli/src/core.js`, preserves backwards compatibility for top-level `envelope.model`, and clearly documents Antigravity `invoke_subagent` tier behavior.

### D-04: Remove `run/SKILL.md` dispatch contradiction

**Choice:** Remove `"Other stages (propose, plan, tasks): dispatch the single author clean-context subagent."` from `plugins/medra/skills/run/SKILL.md` and ensure `propose`, `plan`, `tasks`, `apply`, `verify`, `run` (`SKILL.md`), and affected pipelines follow `action` strictly without inferring dispatch from stage names, backed by a content test in `cli/test/install-misc.test.js`.
**Alternatives:** Leaving stage-name heuristics in coordinator skills.
**Rationale:** Prevents coordinators from ignoring `action: "inline"` and reintroducing unnecessary subagent dispatches.

### D-05: Report freshness via `reviews[].recorded_at` and SHA-256 hash (Item 5, plan-gate decision)

**Choice:** In `medra review` (`cli/src/commands.js`), record `recorded_at` (ISO timestamp) and `hash` (SHA-256 of the report file) on `state.reviews[]`. In `latestReport` / `verifyFindings` (`cli/src/validate.js`), use `recorded_at` and verify the file hash matches (treating mismatched hashes as stale), falling back to `mtime` only for legacy 1.x states lacking `recorded_at` (`M-03`).
**Alternatives:** Reject Item 5 at the plan gate, keep `mtime`-based freshness, and document the `git clone`/`checkout` `mtime` limitation under `## Known issues` in `CHANGELOG.md`.
**Rationale:** `recorded_at` + SHA-256 hash eliminates false freshness after `git clone` / `git checkout` or manual edits while remaining 100% backwards-compatible with 1.x changes.

### D-06: Release `2.0.0-rc.4`, bundle parity, and envelope size budget

**Choice:** Bump `cli/package.json`, `plugins/medra/.claude-plugin/plugin.json`, `CHANGELOG.md`, and regenerated bundles (`cli/plugin/`, `.agents/plugins/medra/`) to `2.0.0-rc.4`; verify `check-version`, `check-bundle-drift`, `measure-envelope.js` (`verify < 4 KB`, `<= 10%` stage growth over `rc.3`), `medra coverage`, and `medra suite`.
**Alternatives:** Deferring bundle sync or size checks to CI only.
**Rationale:** Guarantees packaged plugin parity and ensures per-subagent `model` / `verify-fix` changes stay within the coordinator token budget.

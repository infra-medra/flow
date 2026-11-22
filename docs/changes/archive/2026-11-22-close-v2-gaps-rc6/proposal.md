# Proposal: close-v2-gaps-rc6

## Why

Before tagging `2.0.0`, three concrete gaps remain in `2.0.0-rc.5`: the first `verify` step fails into an unapprovable `gate` when `medra suite` has not run yet, `MEDRA_SUBAGENT=1` is checked by the CLI but never emitted into subagent commands or prompts, and `/medra:run` still allows skipping `author-archive.md` on `action === "done"`. Closing these three gaps eliminates manual `medra suite` workarounds, closes the envelope-level subagent boundary, and makes `/medra:run` strictly follow the compiled envelope end-to-end.

## What Changes

- Automatic pre-verify suite dispatch: when `verify` pre-dispatch findings are strictly `verify.suite` with reason `not-run` or `stale`, `medra step` returns `action: "dispatch"` with `coordinator_steps: [{ type: "command", command: "medra suite <change> --json" }]` and `subagents: []` instead of blocking on `action: "gate"`, keeping `failed` suites and `verify.merge` findings as `action: "gate"`.
- Envelope-level `MEDRA_SUBAGENT=1` propagation: `medra step` prefixes subagent `fetch_command` and `exit_command` entries with `MEDRA_SUBAGENT=1` and adds a short rule to compiled subagent prompts (`--md` / `--full`), while keeping `coordinator_steps[]` and `inline` `exit_command` unprefixed; `hooks/guard.mjs` and `references/{portability,gate}.md` are updated to match.
- Envelope-only `done` handling in `/medra:run`: `plugins/medra/skills/run/SKILL.md` dispatches `subagents[]` (`author-archive.md`) on `action === "done"` instead of offering a direct `medra archive` shortcut.
- Release `2.0.0-rc.6`: update versions, bundles, `CHANGELOG.md`, and re-run the external-repo `/medra:run` E2E test without any manual CLI command between `apply` and `verify`.

## Scope

### In scope

- Structured `reason` (`not-run` | `stale` | `failed`) on `verify.suite` findings in `cli/src/change.js` / `cli/src/handoff.js` and `coordinator_steps` suite dispatch in `cli/src/step.js`.
- `MEDRA_SUBAGENT=1` prefixing for subagent `fetch_command` / `exit_command` and prompt instruction in `cli/src/step.js`, plus `plugins/medra/hooks/guard.mjs` regex support.
- Updates to `plugins/medra/skills/run/SKILL.md`, `plugins/medra/skills/verify/SKILL.md`, `plugins/medra/skills/archive/SKILL.md` (coherence check), `plugins/medra/references/portability.md`, `plugins/medra/references/gate.md`, and regenerated bundles.
- Unit/integration tests for all three items, external-repo E2E verification, `2.0.0-rc.6` version bump, and `CHANGELOG.md`.

### Out of scope

- Runtime changes inside Antigravity itself (such as native `PreToolUse` hooks or automatic env injection into `invoke_subagent`).
- Changes to `main` (`1.x`) or unrelated capabilities.

## Track

**Track:** full
**Rationale:** Interface (step envelope `coordinator_steps` suite command, `verify.suite` structured reason, `MEDRA_SUBAGENT=1` command prefixing), Security (subagent privilege boundary in `cli/src/step.js` and `plugins/medra/hooks/guard.mjs`), and Size (> 8 tasks including tests, docs, bundle sync, external E2E, and release).
**Security:** relevant
**Security rationale:** Modifies subagent command prefixing (`MEDRA_SUBAGENT=1`) and `plugins/medra/hooks/guard.mjs` regex matching that enforce `medra gate` and `medra verify-fix` boundaries.

## Capabilities

| Capability | Operation | Requirements |
|---|---|---|
| `workflow-state` | modified | STATE-006 |
| `runtime-plugin` | modified | PLUG-008, PLUG-009, PLUG-010 |

## Impact

- **Code:** `cli/src/change.js`, `cli/src/handoff.js`, `cli/src/step.js`, `plugins/medra/hooks/guard.mjs`
- **Interfaces:** `medra step` subagent `fetch_command`/`exit_command` prefixing, `verify` pre-dispatch `coordinator_steps[]` for `not-run`/`stale` suite, `verify.suite` finding `reason` field
- **Data:** None.
- **Dependencies:** None.

## Open Questions

None.

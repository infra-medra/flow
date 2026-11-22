# Plan: fix-v2-step-regressions-and-tokens

## Summary

This plan resolves the `2.0.0-rc.2` step-compiler regressions (`A1`–`A4`) and coordinator token-economy bottlenecks (`B1`–`B4`) across `cli/src/step.js`, `cli/src/validate.js`, `cli/src/change.js`, `cli/src/commands.js`, `cli/src/core.js`, `cli/bin/medra.js`, and `plugins/medra/`. Every item (`A1`–`A4`, `B1`–`B4`) starts with a failing reproduction test in `cli/test/` before any code fix, or documented non-reproduction evidence (`A4`). It maps flow stages to valid `medra validate` stages (`CTX-005.S7`), tracks `verify` fix rounds in CLI-owned `.medra.yaml` (`CTX-005.S8`), disambiguates `plugin_pointers` across Claude Code and Antigravity (`CTX-005.S9`, `PLUG-002.S2`), deduplicates `embedded` verify blocks and adds compact default `--json` with `--role ... --md` fetch (`CTX-005.S10`, `CTX-005.S11`), adds `apply.inline_max_tasks` (`CTX-005.S12`, `STATE-005.S1`), and submits the `propose`/`plan`/`tasks` inline decision (`B3`, `CTX-005.S13`) for user approval at the plan gate before shipping `2.0.0-rc.3` (`PLUG-003.S1`).

## Constitution Check

| Article | Gate | Result | Note |
|---|---|---|---|
| I | Does every deterministic operation in this change run through the `medra` CLI without agents mutating CLI-owned state directly? | pass | `verify_fix_rounds` and `last_fix_round_at` in `.medra.yaml` are mutated only by `medra verify-fix`; `medra step` owns stage resolution, pointer disambiguation, and `--role ... --md` rendering. |
| II | Does every added or modified scenario map to a `[TEST]` task ordered before its implementation task and verified by `npm --prefix cli test`? | pass | Test Strategy maps all 21 delta scenarios to `cli/test/*.test.js` and `cli/scripts/measure-envelope.js`, with failing reproduction `[TEST]` tasks ordered before implementation. |
| III | Does this change preserve parity across Claude Code and Antigravity and keep `cli/plugin/` and package versions synchronized? | pass | `plugin_pointers` and `references/portability.md` cover both runtimes; `check-version`, `bundle-plugin`, `install --target antigravity --force`, and `check-bundle-drift.js` enforce `2.0.0-rc.3` parity. |
| IV | Are all path inputs validated against traversal and are all claims, test evidences, and security findings backed by direct tool execution or authoritative sources? | pass | `resolveSafePath`, `safeJoin`, `SAFE_GIT_REF`, and `fenceUntrusted` cover all path/ref/diff inputs; `A4` (`agent_id` in `PreToolUse`) is backed by official Claude Code docs (`threat-model.md` Sources). |
| V | Does the design keep prompts/context bounded to touched artifacts and avoid abstractions or scope beyond the approved deltas? | pass | Default `medra step --json` strips inline `prompt`/`embedded` (< 4 KB at `verify`), `embedded` deduplicates diffs/contracts to 1x, and `B3` is gated on plan approval. |

## Complexity Tracking

None.

## Test Strategy

- **Command:** `npm --prefix cli test` (plus `node cli/scripts/measure-envelope.js`, `npm --prefix cli run check-version`, and `node cli/scripts/check-bundle-drift.js`)
- **Framework:** `node --test`

| Scenario | Level | Test location |
|---|---|---|
| `CTX-005.S1` | unit | `cli/test/step-compiler.test.js` |
| `CTX-005.S2` | integration | `cli/test/step-compiler.test.js` |
| `CTX-005.S3` | unit | `cli/test/step-compiler.test.js` |
| `CTX-005.S4` | integration | `cli/test/step-compiler.test.js` |
| `CTX-005.S5` | unit | `cli/test/step-compiler.test.js` |
| `CTX-005.S6` | integration | `cli/test/step-compiler.test.js` |
| `CTX-005.S7` | integration | `cli/test/step-compiler.test.js` |
| `CTX-005.S8` | integration | `cli/test/step-compiler.test.js` |
| `CTX-005.S9` | unit | `cli/test/step-compiler.test.js` |
| `CTX-005.S10` | integration | `cli/test/step-compiler.test.js` |
| `CTX-005.S11` | integration | `cli/test/step-compiler.test.js` |
| `CTX-005.S12` | unit | `cli/test/step-compiler.test.js` |
| `CTX-005.S13` | unit | `cli/test/step-compiler.test.js` (implemented only if D-07 approved at plan gate) |
| `CTX-005.S14` | contract | `cli/test/step-compiler.test.js`, `cli/scripts/measure-envelope.js` |
| `PLUG-001.S1` | integration | `cli/test/install-misc.test.js` |
| `PLUG-001.S2` | integration | `cli/test/install-misc.test.js` |
| `PLUG-001.S3` | integration | `cli/test/install-misc.test.js` |
| `PLUG-002.S1` | integration | `cli/test/install-misc.test.js` |
| `PLUG-002.S2` | unit | `cli/test/install-misc.test.js` |
| `PLUG-003.S1` | integration | `cli/test/install-misc.test.js`, `cli/scripts/check-bundle-drift.js` |
| `PLUG-004.S1` | unit | `cli/test/hooks.test.js` |
| `PLUG-004.S2` | unit | `cli/test/hooks.test.js` |
| `PLUG-004.S3` | unit | `cli/test/hooks.test.js` |
| `STATE-005.S1` | integration | `cli/test/step-compiler.test.js` |

## Architecture & Interfaces

- **Contract:** [step-envelope.schema.json](docs/changes/fix-v2-step-regressions-and-tokens/contracts/step-envelope.schema.json) defines the updated `medra step --json` envelope (`fetch_command`, `embedded`, `embedded_keys`, `plugin_pointers`, `findings`, `action: "inline"`). During `apply`, sync this contract to `contracts/step-envelope.schema.json` and update `cli/schemas/envelope.schema.json`.
- **Reproduction-first workflow:** Every item (`A1`–`A3`, `B1`–`B4`) begins with a failing test in `cli/test/step-compiler.test.js` or `cli/test/hooks.test.js`. Item `A4` is verified via official Claude Code `PreToolUse` documentation (`code.claude.com/docs/en/hooks`) confirming `agent_id` is sent to hooks in subagents; `guard.mjs` line 28 already checks `Boolean(input.agent_id) || process.env.MEDRA_SUBAGENT === '1'`, so `A4` adds/confirms unit tests and updates `plugins/medra/references/gate.md` and `plugins/medra/references/portability.md` without modifying `guard.mjs`.
- **Verify state machine (`A2`):** `cli/src/change.js` initializes `state.verify_fix_rounds ??= 0` and `state.last_fix_round_at ??= null`. `cli/src/commands.js` exports `verifyFix(root, change)` wired to `medra verify-fix <change> --json` in `cli/bin/medra.js`, incrementing `verify_fix_rounds` and setting `last_fix_round_at`. `cli/src/validate.js` `verifyFindings` compares report `mtime` against `Math.max(lastDone, lastFix)` so stale reports trigger re-verification. `compileStep` dispatches reviewers when reports are missing/stale, returns `action: "gate", gate: "verify"` when `verifyFindings` has 0 errors, dispatches one fix `implementer` (`exit_command: medra verify-fix <change> --json`) when errors exist and `verify_fix_rounds === 0`, and escalates to `action: "gate", gate: "verify"` with `findings` when errors persist and `verify_fix_rounds >= 1`.
- **CLI flags & compact envelope (`B1`, `B2`):** `cli/bin/medra.js` adds `--role <role>`, `--task <T-ID>`, and `--full` to `step <change>`. Default `--json` omits `subagents[].prompt` and top-level `embedded`, adding `fetch_command: "medra step <change> --role <role>[ --task <T-ID>] --md"`. `cli/scripts/measure-envelope.js` verifies compact `verify` JSON < 4 KB against a ~64 KB diff fixture.
- **Release `2.0.0-rc.3`:** Bump `cli/package.json`, `plugins/medra/.claude-plugin/plugin.json`, and `CHANGELOG.md` to `2.0.0-rc.3`, then run `npm --prefix cli run check-version`, `npm --prefix cli run bundle-plugin`, `node cli/bin/medra.js install --target antigravity --force`, and `node cli/scripts/check-bundle-drift.js`.

## Decisions

### D-01: Explicit `FLOW_TO_VALIDATE_STAGE` map in `step.js` (A1)

**Choice:** Add `FLOW_TO_VALIDATE_STAGE = { propose: 'proposal', plan: 'plan', tasks: 'tasks', verify: 'verify' }` in `cli/src/step.js` for `exit_command` and completion criteria, leaving `cli/src/validate.js` `STAGES` unchanged.
**Alternatives:** Add `propose` as an alias in `cli/src/validate.js` `STAGES`.
**Rationale:** `proposal.md` Out of scope forbids changing `medra validate`'s public `--stage` vocabulary; keeping one canonical validation vocabulary avoids breaking scripts and docs (`CTX-005.S7`).

### D-02: CLI-tracked `verify_fix_rounds` via `medra verify-fix` (A2, M-03)

**Choice:** Implement `M-03` by adding `verify_fix_rounds` (default `0`) and `last_fix_round_at` to `.medra.yaml`, updated only by `medra verify-fix <change> --json`, and driving `compileStep` verify transitions from `verifyFindings` + `verify_fix_rounds`.
**Alternatives:** Infer fix rounds from review file count in `reviews/`, or have the fix subagent edit `.medra.yaml`.
**Rationale:** Hand-editing `.medra.yaml` violates `Article I` and `guard.mjs`; file-count heuristics break if reports are overwritten or renamed (`CTX-005.S8`).

### D-03: Separate `plugin_pointers` and prefer `plugins/medra/` over `.agents/plugins/medra/` (A3, M-04)

**Choice:** Implement `M-04` by checking `plugins/medra/pipelines/` before `.agents/plugins/medra/pipelines/` in `pipelinePointer`, emitting `${CLAUDE_PLUGIN_ROOT}/...` in prompt text when outside the plugin repo, and adding `plugin_pointers` (resolved under `cli/plugin/` / `${CLAUDE_PLUGIN_ROOT}`) alongside project-relative `pointers`.
**Alternatives:** Keep a single `pointers` array with bare `pipelines/...` strings.
**Rationale:** Bare `pipelines/...` strings are indistinguishable from project paths in external repositories and fail `resolveSafePath` checks (`CTX-005.S9`, `PLUG-002.S2`).

### D-04: Retain `guard.mjs` `agent_id` + `MEDRA_SUBAGENT=1` and document parity (A4, M-02)

**Choice:** Implement `M-02` with no code change to `plugins/medra/hooks/guard.mjs` (official Claude Code docs confirm `PreToolUse` stdin includes `agent_id` for subagents), add/verify `hooks.test.js` coverage, and document the mechanism and Antigravity parity in `references/gate.md` and `references/portability.md`.
**Alternatives:** Unconditionally deny `medra gate ... --approve` in `guard.mjs`.
**Rationale:** Reaffirms `2026-11-21-fix-v2-step-compiler-regressions` `D-04`; unconditional `deny` would block the human-approved coordinator (`PLUG-004.S3`).

### D-05: Top-level `embedded` deduplication and `--role ... --md` fetch (B1, B2, M-01)

**Choice:** Implement `M-01` by storing `diff` and `contracts/*` once in top-level `embedded` (pre-fenced via `fenceUntrusted`), referencing them via `embedded_keys` on subagents, stripping `prompt` and `embedded` from default `medra step --json` (exposing `fetch_command`), and preserving `--full` for tests/debugging.
**Alternatives:** Keep inline prompts in default `--json` or split `step` into a separate `medra fetch` command.
**Rationale:** Eliminates 3–4x diff duplication in `verify`, drops coordinator `--json` below 4 KB, and reuses `medra step` without adding a new top-level command (`CTX-005.S10`, `CTX-005.S11`).

### D-06: `apply.inline_max_tasks` config threshold for fast-track apply (B4)

**Choice:** Add `apply: { inline_max_tasks: 3 }` to `DEFAULT_CONFIG` in `cli/src/core.js` and return `action: "inline"` in `compileStep` when `track === "fast"` and pending tasks `<= apply.inline_max_tasks` (and `action: "dispatch"` above).
**Alternatives:** Hardcode threshold `3` without config, or always dispatch a subagent on `fast` track.
**Rationale:** Preserves 1.x `docs/config-flow.yaml` compatibility with a safe default while letting projects tune inline vs subagent execution (`CTX-005.S12`, `STATE-005.S1`).

### D-07: Plan-gate decision for inline `propose`, `plan`, and `tasks` (B3)

**Choice:** Recommend `action: "inline"` for `propose`, `plan`, and `tasks` in `compileStep` using the CLI context slice and `plugin_pointers`, while keeping `apply` (`full` track and `fast` > threshold) and `verify` as `action: "dispatch"`.
**Alternatives:** Keep `action: "dispatch"` (clean-context `author` subagent) for `propose`, `plan`, and `tasks`.
**Rationale:** *Pros of inline:* eliminates 3 subagent cold-starts per `full`-track change and keeps interactive clarification markers and design trade-offs directly in the user-facing session. *Cons of inline:* increases coordinator context size during authoring and requires strict adherence to `author-*.md` pipeline boundaries. *Rejected alternative pros/cons:* `dispatch` isolates authoring context cleanly, at the cost of extra token overhead and indirection for interactive user questions (`CTX-005.S13`). **Gated on explicit approval at the `plan` gate.**

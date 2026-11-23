# Proposal: fix-v2-step-compiler-regressions

## Why

The v2 step compiler and thin coordinator skills ship with regressions that silently drop git diffs during verification, strip authoring instructions from subagent prompts, and allow security subagents to target a human gate command. Left unfixed, `/medra:verify` can review an empty diff without warning and subagents can produce lower-quality artifacts or bypass review boundaries. Fixing these regressions (P1–P7) restores deterministic verification, subagent authoring guidance, and release-candidate packaging parity for `2.0.0-rc.2`.

## What Changes

- Unify `safeGitDiff` output and error handling so `/medra:verify` embeds the real change diff or surfaces git diff failures to the coordinator before dispatching blind reviews.
- Restore lost 1.x authoring rules, personas, phases, avoid-items, and exit criteria into subagent-readable pipeline/reference files referenced in `compileStep` pointers and `author` prompts, and remove or fill empty skill headers.
- Replace the `security` verify subagent's `medra gate` exit command with a review-recording command, and evaluate/enforce blocking `medra gate ... --approve` in `guard.mjs`.
- Standardize untrusted-data fencing on `<untrusted_data>` across `step.js`, skills, handoffs, and pipelines while neutralizing both hyphen/underscore and whitespace/case closing-tag variants.
- Resolve `.agents/plugins/medra/` bundle duplication and `cli/plugin/` divergence, extract an `envelope()` helper in `compileStep`, and bump the release-candidate version to `2.0.0-rc.2`.

## Scope

### In scope

- **P1:** Unify `safeGitDiff` return shape to `{ diff, truncated }` in `cli/src/step.js` and update `CTX-005.S2` tests in `cli/test/step-compiler.test.js` with a real temp git repo and > `MAX_EMBED_BYTES` truncation check.
- **P2:** Distinguish legitimate empty diffs from git failures in `safeGitDiff`, surface errors in the step envelope and `cli/schemas/envelope.schema.json` (plus `contracts/step-envelope.schema.json` if applicable), handle them in `run/SKILL.md` and `verify/SKILL.md`, and add tests.
- **P3:** Inventory lost 1.x skill instructions, place subagent-facing guidance in `plugins/medra/pipelines/` or `references/`, include pipeline pointers and template/guide/completion instructions in `compileStep`, fill/remove empty headers (e.g. `apply/SKILL.md`), and add pointer tests.
- **P4:** Investigate `medra gate` without `--approve`, change `security` verify `exit_command` to record a review instead of calling `medra gate`, evaluate/implement blocking `medra gate ... --approve` in `plugins/medra/hooks/guard.mjs`, and add tests.
- **P5:** Standardize on `<untrusted_data>` across `step.js`, skills, handoffs, and pipelines while neutralizing both `<untrusted-data>` and `<untrusted_data>` (including whitespace/case variants), with closing-tag injection tests.
- **P6:** Resolve versioned `.agents/plugins/medra/` bundle drift (CI drift check or build-time generation) and eliminate `cli/plugin/` divergence.
- **P7:** Extract `envelope(base, overrides)` helper in `compileStep` with schema/snapshot parity verified after P1–P5 pass.
- Bump version to `2.0.0-rc.2` (`cli/package.json`, `plugin.json`, bundle) and update `CHANGELOG.md` while preserving existing local edits in `CHANGELOG.md` and `README.md`.

### Out of scope

- Redesigning the v2 state machine, gate hashing, or 1.x `docs/` layout — existing `docs/` structure and CLI commands remain compatible.
- Adding new workflow stages or changing `medra` subagent roles beyond `author`, `implementer`, `reviewer`, and `security`.
- Rewriting unrelated tests or refactoring CLI modules outside `step.js`, `guard.mjs`, bundling scripts, and skills/pipelines.

## Track

**Track:** full
**Rationale:** Modifies multiple capabilities (`context-and-memory`, `runtime-plugin`, `workflow-state`), alters step-envelope contracts and security boundaries, and requires a cross-module plan including a 1.x-to-v2 content mapping table.
**Security:** relevant
**Security rationale:** Modifies untrusted-data fencing (`fenceUntrusted` in `cli/src/step.js`), subagent gate-approval guardrails (`plugins/medra/hooks/guard.mjs` and `buildVerifySubagents` `exit_command`), and `safeGitDiff` ref/error handling.

## Capabilities

| Capability | Operation | Requirements |
|---|---|---|
| `context-and-memory` | modified | `REQ CTX-005` |
| `runtime-plugin` | modified | `REQ PLUG-001, REQ PLUG-003, REQ PLUG-004` |
| `workflow-state` | modified | `REQ STATE-005` |

## Impact

- **Code:** `cli/src/step.js`, `cli/src/commands.js`, `cli/src/change.js`, `cli/scripts/bundle-plugin.js`, `cli/src/install.js`, `plugins/medra/hooks/guard.mjs`, `plugins/medra/skills/**`, `plugins/medra/pipelines/**`, `plugins/medra/handoffs/**`, `plugins/medra/references/**`, `cli/plugin/**`, `.agents/plugins/medra/**`, `.github/workflows/ci.yml`, `cli/test/**`.
- **Interfaces:** `cli/schemas/envelope.schema.json` (optional `diff_error` / error signaling fields on `compileStep` verify envelope), `medra step --json`, `security` verify `exit_command`.
- **Data:** None.
- **Dependencies:** None.

## Open Questions

None.

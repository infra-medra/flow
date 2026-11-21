# Plan: remodel-deterministic-v2-flow

## Summary

This plan implements the `medra` 2.0-rc architecture across the Node.js CLI (`cli/src/`) and the cross-runtime plugin (`plugins/medra/`). A new deterministic `medra step <change>` command compiles minimal, self-contained step prompts and handoff envelopes (`contracts/step-envelope.schema.json`) by resolving task-to-requirement and path dependencies from disk, keeping `plan`/`apply` pointer-only while embedding `contracts/*` and diffs for `verify`, and falling back gracefully for legacy 1.x `tasks.md`. Thin coordinator skills (retaining per-stage commands plus `/medra:run`) dispatch disposable clean-context subagents with adaptive granularity and `inherit`-default model routing, packaged as `2.0.0-rc.1` on branch `v2`.

## Constitution Check

| Article | Gate | Result | Note |
|---|---|---|---|
| I | Does every deterministic operation in this change run through the `medra` CLI without agents mutating CLI-owned state directly? | pass | `medra step` in `cli/src/step.js` owns state resolution and prompt compilation; skills only orchestrate subagents and human gates. |
| II | Does every added or modified scenario map to a `[TEST]` task ordered before its implementation task and verified by `npm --prefix cli test`? | pass | Test Strategy maps all 7 delta scenarios (`CTX-005.S1–S3`, `PLUG-001.S1–S3`, `PLUG-005.S1`, `VAL-005.S1`, `STATE-005.S1`) to `cli/test/` before implementation. |
| III | Does this change preserve parity across Claude Code and Antigravity and keep `cli/plugin/` and package versions synchronized? | pass | Portability rules and `bundle-plugin` + `check-version` remain enforced across `plugins/medra/` and `cli/plugin/`. |
| IV | Are all path inputs validated against traversal and are all claims, test evidences, and security findings backed by direct tool execution or authoritative sources? | pass | `resolveSafePath` in `cli/src/core.js` validates backticked task paths and `contracts/*` reads; untrusted content is fenced as data. |
| V | Does the design keep prompts/context bounded to touched artifacts and avoid abstractions or scope beyond the approved deltas? | pass | Prompts slice only cited REQs, scoped learnings, and pointers; no external daemon or 1.x `docs/` breaking changes are introduced. |

## Complexity Tracking

None.

## Test Strategy

- **Command:** `npm --prefix cli test` (focused: `node --test cli/test/<file>.test.js`)
- **Framework:** `node:test` + `node:assert/strict`

| Scenario | Level | Test location |
|---|---|---|
| `CTX-005.S1` | integration | `cli/test/step-compiler.test.js` |
| `CTX-005.S2` | integration | `cli/test/step-compiler.test.js` |
| `CTX-005.S3` | integration | `cli/test/step-compiler.test.js` |
| `VAL-005.S1` | integration | `cli/test/tasks-context.test.js` |
| `PLUG-001.S1` | contract | `cli/test/install-misc.test.js` |
| `PLUG-001.S2` | contract | `cli/test/install-misc.test.js` |
| `PLUG-001.S3` | contract | `cli/test/step-compiler.test.js` |
| `PLUG-005.S1` | unit | `cli/test/step-compiler.test.js` |
| `STATE-005.S1` | integration | `cli/test/install-misc.test.js` |

## Architecture & Interfaces

- **CLI Step Compiler (`cli/src/step.js`, wired in `cli/bin/medra.js`):**
  - `medra step <change> [--stage <stage>] [--json]` inspects `.medra.yaml`, gates, `tasks.md`, `plan.md`, `contracts/`, and `docs/config-flow.yaml` to emit the `contracts/step-envelope.schema.json` payload.
  - Resolves `T-NN` -> cited `REQ-NNN`/`Scenario` -> delta text -> scoped `Decisions` (`D-NN`) and scoped `learnings` (via `cli/src/context.js` helpers).
  - Applies hybrid code inclusion: file paths only in `plan`/`apply`; embedded `contracts/*` and bounded `git diff` in `verify`.
  - Falls back to stage-scoped `context()` (`legacy_fallback: true`) when a 1.x `tasks.md` lacks explicit `REQ` or path citations.
- **Path & Prompt Safety (`cli/src/core.js`, `cli/src/step.js`):**
  - `resolveSafePath(root, relPath)` canonicalizes `root` and target with `fs.realpathSync` (or nearest existing ancestor), rejects absolute paths, null bytes, and `..` escapes, and enforces `realTarget === realRoot || realTarget.startsWith(realRoot + path.sep)` (`M-01`).
  - `medra step` invokes `git` only via `execFileSync` (`shell: false`), validates `diff_base` against a strict ref/SHA allowlist rejecting leading `-` with `--` before path operands (`M-04`), wraps embedded `contracts/*` and diffs in neutralized untrusted-data fences (`M-02`), and caps embedded `contracts/*`/`git diff` size with explicit truncation notices and `pointers` fallback (`M-05`).
- **Task Traceability Validation (`cli/src/validate.js`):**
  - Enforces at `--stage tasks` that every task cites at least one `REQ` / scenario ID or backticked file path (`tasks.traceability`).
- **Config & Versioning (`cli/src/core.js`, `cli/package.json`, `plugins/medra/.claude-plugin/plugin.json`):**
  - `loadConfig` validates optional `models:` entries (non-empty strings, known role/stage keys, `inherit` default) with `configWarnings` and `inherit` fallback metadata (`M-07`).
  - Version set to `2.0.0-rc.1` (synchronized via `check-version` and `bundle-plugin`).
- **Thin Coordinator Skills (`plugins/medra/skills/*/SKILL.md` + `skills/run/SKILL.md`):**
  - Replace inline multi-phase prose with thin coordinator loops calling `medra step <change> --json`, re-running `medra step --json` after every subagent return (`M-06`), keeping `PreToolUse` guards and human gates active (`M-03`), and dispatching clean-context subagents (`Agent` on Claude Code, `invoke_subagent` on Antigravity) with `inherit` fallback if a configured model tier is rejected.

## Decisions

### D-01: Dedicated `medra step` command instead of overloading `medra context`

**Choice:** Add `medra step <change>` in `cli/src/step.js` returning the typed envelope in `contracts/step-envelope.schema.json`.
**Alternatives:** Modifying `medra context` output directly; putting prompt assembly inside `SKILL.md`.
**Rationale:** Preserves 100% backward compatibility for existing 1.x `medra context` callers while keeping prompt assembly deterministic and testable in the CLI (Article I, `STATE-005`).

### D-02: Adaptive subagent granularity driven by `track`

**Choice:** `full` track dispatches one clean-context subagent per pending task in `apply`; `fast` track dispatches a single clean-context subagent for `apply`; `verify` dispatches isolated `reviewer` and `security` subagents plus isolated fix-loop subagents.
**Alternatives:** Always 1 subagent per task; always 1 subagent per stage.
**Rationale:** Eliminates quadratic token growth on `full` changes without paying subagent cold-start overhead on tiny `fast` fixes (`PLUG-001.S3`).

### D-03: Hybrid code references (pointers in `plan`/`apply`, embedded `contracts/*` + diff in `verify`)

**Choice:** Emit verified path pointers in `plan`/`apply` and embed `contracts/*` and the change diff in `verify`.
**Alternatives:** Always pointers only; always embed full referenced files.
**Rationale:** Avoids bloating `apply` prompts with full source files while giving `reviewer`/`security` immediate contract and diff visibility (`CTX-005.S2`).

### D-04: Default `inherit` model policy with optional `config-flow.yaml` overrides and `inherit` fallback

**Choice:** Default every subagent to `inherit`, read optional `models:` overrides from `docs/config-flow.yaml`, and instruct coordinators to retry with `inherit` if the runtime rejects a configured tier.
**Alternatives:** Hardcoded `fast`/`strong` auto-tiering in the CLI; forbidding model config.
**Rationale:** Runtime model availability varies (e.g., Antigravity tier changes), so `inherit` fallback prevents broken workflows (`PLUG-005.S1`).

### D-05: Strict task traceability on `tasks` gate with legacy `step` fallback

**Choice:** Enforce `tasks.traceability` in `medra validate --stage tasks`, while allowing `medra step` to fall back to stage context on pre-existing 1.x `tasks.md`.
**Alternatives:** Rejecting legacy `tasks.md` at `apply`; skipping traceability validation altogether.
**Rationale:** Guarantees exact dependency slicing for new 2.0 changes without breaking 1.x projects (`VAL-005.S1`, `CTX-005.S3`).

### D-06: Canonical path containment and safe git invocation (`M-01`, `M-04`)

**Choice:** Implement `resolveSafePath` using `fs.realpathSync` and `path.sep` prefix containment (`M-01`), and invoke `git` exclusively via `execFileSync` with `diff_base` ref/SHA allowlisting and `--` end-of-options markers (`M-04`).
**Alternatives:** Lexical `path.resolve` checks without symlink resolution; shell-interpolated `git diff`.
**Rationale:** Prevents symlink escapes outside project `root` and git argument injection from crafted branch names or `-`-prefixed filenames.

### D-07: Untrusted-data fencing and external execution boundaries (`M-02`, `M-03`, `M-06`)

**Choice:** Wrap all embedded repo markdown, `contracts/*`, and `git diff` in neutralized data fences (`M-02`), keep `PreToolUse` guards and human gates external to subagents (`M-03`), and require coordinators to re-run `medra step --json` after every subagent return (`M-06`).
**Alternatives:** Unfenced inline context; trusting subagent return summaries for next-step state.
**Rationale:** Defense-in-depth against indirect prompt injection and guarantees deterministic state progression.

### D-08: Bounded embedded diff and contracts cap in `verify` (`M-05`)

**Choice:** Cap embedded `contracts/*` and `git diff` bytes/lines in `medra step` (`M-05`), excluding binary diffs and emitting a truncation notice with `pointers` fallback when exceeded.
**Alternatives:** Unbounded diff embedding.
**Rationale:** Prevents `maxBuffer` crashes and context exhaustion on large changes while preserving pointer-based inspection.

### D-09: Validated `models:` config with `inherit` fallback (`M-07`)

**Choice:** Validate `models:` entries in `loadConfig` / `configWarnings` (`M-07`) and fall back to `inherit` on invalid or runtime-rejected tiers.
**Alternatives:** Silent pass-through of arbitrary config values.
**Rationale:** Catches typos early without blocking workflows across heterogeneous runtimes.

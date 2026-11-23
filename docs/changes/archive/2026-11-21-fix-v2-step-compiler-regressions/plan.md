# Plan: fix-v2-step-compiler-regressions

## Summary

This plan resolves regressions P1–P7 in the `medra` v2 step compiler, thin coordinator skills, and plugin packaging for `2.0.0-rc.2`. In `cli/src/step.js`, `safeGitDiff` is unified to return `{ diff, truncated, diff_error }`, `fenceUntrusted` standardizes on `<untrusted_data>` while neutralizing whitespace/case/hyphen closing-tag variants, `compileStep` injects stage pipeline pointers and `template.md`/`guide.md`/completion guidance, `buildVerifySubagents` replaces the invalid `medra gate` security `exit_command` with `medra review --report`, and an `envelope()` helper deduplicates envelope construction. Coordinator skills (`plugins/medra/skills/*/SKILL.md`) are updated to warn and pause on `diff_error`, remove empty persona headers, and align with `medra review --report`, while subagent-facing guidance from 1.x is restored in `plugins/medra/pipelines/`. Finally, `plugins/medra/hooks/guard.mjs` enforces the gate-approval boundary, a CI drift check keeps `.agents/plugins/medra/` and `cli/plugin/` synchronized with `plugins/medra/`, and the package/plugin version is bumped to `2.0.0-rc.2`.

## Constitution Check

| Article | Gate | Result | Note |
|---|---|---|---|
| I | Does every deterministic operation in this change run through the `medra` CLI without agents mutating CLI-owned state directly? | pass | Step compilation (`medra step`), diff/contract fencing, review recording (`medra review`), bundle generation, and drift checks all execute via CLI/scripts; `security` no longer targets `medra gate` and `guard.mjs` enforces `--approve` and CLI-owned file boundaries. |
| II | Does every added or modified scenario map to a `[TEST]` task ordered before its implementation task and verified by `npm --prefix cli test`? | pass | Test Strategy maps all 13 delta scenarios (`CTX-005.S1–S6`, `PLUG-001.S1–S3`, `PLUG-003.S1`, `PLUG-004.S1–S2`, `STATE-005.S1`) to `node --test` suites in `cli/test/` with `[TEST]` tasks ordered first. |
| III | Does this change preserve parity across Claude Code and Antigravity and keep `cli/plugin/` and package versions synchronized? | pass | `plugins/medra/` remains the single source of truth; `bundle-plugin` syncs `cli/plugin/`, `medra install --target antigravity` refreshes `.agents/plugins/medra/`, and a new CI drift check + `check-version` enforce parity. |
| IV | Are all path inputs validated against traversal and are all claims, test evidences, and security findings backed by direct tool execution or authoritative sources? | pass | `SAFE_GIT_REF`, `--`, `resolveSafePath`, and `safeJoin` remain enforced; `fenceUntrusted` neutralizes all closing-tag variants; `safeGitDiff` surfaces errors via `diff_error` instead of silent empty diffs. |
| V | Does the design keep prompts/context bounded to touched artifacts and avoid abstractions or scope beyond the approved deltas? | pass | Subagent-facing 1.x rules live in on-demand `plugins/medra/pipelines/` pointers rather than bloating coordinator skills; `envelope()` is a local helper in `compileStep` with no speculative abstractions. |

## Complexity Tracking

None.

## Test Strategy

- **Command:** `npm --prefix cli test` (focused: `node --prefix cli --test test/step-compiler.test.js test/install-misc.test.js test/hooks.test.js`)
- **Framework:** Node.js built-in test runner (`node:test` + `node:assert/strict`)

| Scenario | Level | Test location |
|---|---|---|
| `CTX-005.S1` | unit | `cli/test/step-compiler.test.js` |
| `CTX-005.S2` | integration | `cli/test/step-compiler.test.js` (real temp git repo + `> MAX_EMBED_BYTES` truncation) |
| `CTX-005.S3` | unit | `cli/test/step-compiler.test.js` |
| `CTX-005.S4` | integration | `cli/test/step-compiler.test.js` (valid empty diff vs nonexistent ref / non-git dir) |
| `CTX-005.S5` | unit | `cli/test/step-compiler.test.js` |
| `CTX-005.S6` | unit | `cli/test/step-compiler.test.js` (verify `exit_command` + closing-tag injection variants) |
| `PLUG-001.S1` | contract | `cli/test/install-misc.test.js` |
| `PLUG-001.S2` | contract | `cli/test/install-misc.test.js` |
| `PLUG-001.S3` | contract | `cli/test/install-misc.test.js` |
| `PLUG-003.S1` | integration | `cli/test/install-misc.test.js` + `cli/scripts/check-bundle-drift.js` |
| `PLUG-004.S1` | unit | `cli/test/hooks.test.js` |
| `PLUG-004.S2` | unit | `cli/test/hooks.test.js` |
| `STATE-005.S1` | integration | `cli/test/install-misc.test.js` |

## 1.x-to-v2 Skill Content Inventory & Mapping (P3)

Comparing `main:plugins/medra/skills/*/SKILL.md` against `v2:plugins/medra/skills/*/SKILL.md` shows that thinning coordinator skills removed subagent authoring phases, persona disciplines, "Avoid" lists, "Exit when" checklists, and domain tables:

| 1.x Content (`main`) | Status on `v2` | Target Location in `v2` |
|---|---|---|
| `init`: Author persona, Phases 1–4, Avoid/Exit checklists | Stripped from `init/SKILL.md` | Coordinator steps stay in `init/SKILL.md`; bootstrap `author` subagent guidance in `plugins/medra/pipelines/author-init.md` |
| `propose`: Author persona, Phases 1–8, Track Criteria table, Security Relevance criteria, Avoid/Exit | Stripped from `propose/SKILL.md` | `plugins/medra/pipelines/author-propose.md` (referenced in `compileStep` `pointers` for `propose`) |
| `plan`: Author persona, Phases 1–6 (Grounding, Drafting, Threat Model, Self-review), Avoid/Exit | Stripped from `plan/SKILL.md` | `plugins/medra/pipelines/author-plan.md` (referenced in `compileStep` `pointers` for `plan`, alongside `security-threat-model.md`) |
| `tasks`: Author persona, Phases 1–5 (Grounding, `[TEST]`-first Drafting, Self-review), Avoid/Exit | Stripped from `tasks/SKILL.md` | `plugins/medra/pipelines/author-tasks.md` (referenced in `compileStep` `pointers` for `tasks`) |
| `apply`: Empty `## Operating Persona (Implementer)` header; Phases 1–4 (TDD red/green, Escalation), Avoid/Exit | Empty header in `apply/SKILL.md`; phases stripped | Remove empty header from `apply/SKILL.md`; move TDD/escalation/avoid rules to `plugins/medra/pipelines/implementer-apply.md` |
| `review`: Reviewer persona, Phases 1–5, Review Lens table, Avoid/Exit | Stripped; `review/SKILL.md` L27 uses invalid `--stage`/`--verdict` flags | Fix `review/SKILL.md` to `medra review <change> --report <path>`; subagent rules already in `plugins/medra/pipelines/reviewer-check.md` |
| `verify`: Implementer persona, Phases 1–5 (Readiness, Check, Fix, Gate), Avoid/Exit | Stripped; `verify/SKILL.md` lacks `diff_error` handling | Coordinator `diff_error` warning in `verify/SKILL.md` & `run/SKILL.md`; subagent rules in `pipelines/reviewer-check.md`, `pipelines/security-audit.md`, `pipelines/implementer-apply.md` |
| `archive`: Author persona, Phases 1–5 (Merge, Harvest, Compact, Promote), Conflict Resolution table, Avoid/Exit | Stripped from `archive/SKILL.md` | `plugins/medra/pipelines/author-archive.md` (referenced in `compileStep` `pointers` for `archive`) |

## Architecture & Regression Fixes (P1–P7)

### P1 & P2: `safeGitDiff` Return Shape, Error Signaling, and Coordinator Warnings

- **`cli/src/step.js`:** `safeGitDiff(root, diffBase)` returns `{ diff, truncated, diff_error }`.
  - When `!diffBase || diffBase === 'none'`: returns `{ diff: '', truncated: false, diff_error: null }`.
  - Unsafe `diffBase` (starts with `-` or fails `SAFE_GIT_REF`): continues to throw `usageError(...)`.
  - Successful `execFileSync('git', ['diff', '--no-ext-diff', `${diffBase}..HEAD`, '--'], ...)`: calls `capText(raw, MAX_EMBED_BYTES)` and returns `{ diff: capped.text, truncated: capped.truncated, diff_error: null }` (fixing the `text` vs `diff` property mismatch).
  - Caught git failure (non-git dir, nonexistent `diffBase`): returns `{ diff: '', truncated: false, diff_error: err.message }`.
- **Envelope & Prompt:** `compileStep` sets `diff_error` (string or `null`) on `verify` envelopes (documented as optional property in `cli/schemas/envelope.schema.json`). When `diff_error` is non-null, `buildVerifySubagents` prepends a clear warning in `prompt` (`WARNING: git diff failed (${diff_error}); inspect files via pointers.`).
- **Coordinator Skills (`run/SKILL.md`, `verify/SKILL.md`):** Before dispatching `verify` subagents, check `step.diff_error`. If non-null, warn the user with the error details and pause/ask how to proceed instead of dispatching a blind verification round.

### P3: Pipeline Pointers & Author Prompt Guidance

- **`compileStep` (`cli/src/step.js`):** Add a `pipelinePointer(root, stage)` helper that maps each stage (`propose` → `author-propose.md`, `plan` → `author-plan.md`, `tasks` → `author-tasks.md`, `apply` → `implementer-apply.md`, `verify` → `reviewer-check.md`, `archive` → `author-archive.md`) to `.agents/plugins/medra/pipelines/<file>` if present in `root`, else `plugins/medra/pipelines/<file>` if present in `root`, else `pipelines/<file>` (plugin-relative). Prepend it to `pointers` and instruct the subagent in `prompt` to read the pipeline file first.
- **Author Prompts:** For `propose`, `plan`, and `tasks`, `compileStep` explicitly names the target document's `templates/<doc>/template.md`, `templates/<doc>/guide.md`, and completion criteria (`medra validate <change> --stage <stage> --json` exiting `0` with zero unresolved clarification markers).

### P4: Security Verify `exit_command` and `guard.mjs`

- **Root Cause:** `cli/src/commands.js` (`gate()`) requires exactly one of `--approve` or `--request-changes`, so `medra gate <change> verify --note "..."` always fails with `usageError`. Meanwhile, `medra review <change> --report <path> [--by <name>]` is the CLI command for recording review verdicts.
- **Fix:**
  - Update `review()` in `cli/src/commands.js` to accept `Stage: security` (in addition to `proposal`, `plan`, `tasks`, `verify`) and security-report severity counts (`critical <n> · high <n> · medium <n> · low <n> · info <n>`).
  - In `buildVerifySubagents` (`cli/src/step.js`), set `reviewer` `exit_command` to `medra review ${change} --report docs/changes/${change}/reviews/verify-reviewer.md --by reviewer` and `security` `exit_command` to `medra review ${change} --report docs/changes/${change}/reviews/verify-security.md --by security`. Neither subagent invokes `medra gate`.
  - In `plugins/medra/hooks/guard.mjs`, preserve `decide('ask', ...)` for `medra gate ... --approve` in interactive coordinator sessions, and add `decide('deny', ...)` when a subagent context signal is present (`input.agent_id` or `process.env.MEDRA_SUBAGENT === '1'`).

### P5: Standardized `<untrusted_data>` Fencing

- Standardize all prompt instructions in `cli/src/step.js` (lines 144, 169, 195) on `<untrusted_data>` (matching `run/SKILL.md`, `verify/SKILL.md`, and `fenceUntrusted`).
- Update `fenceUntrusted(label, text)` in `cli/src/step.js` to neutralize `/<\/\s*untrusted[-_]data\s*>/gi` (and `/<\/\s*untrusted[-_]data/gi`) to `<\\/untrusted_data` so `</untrusted_data>`, `</ untrusted_data >`, and `</untrusted-data>` cannot break out of the `<untrusted_data source="...">...</untrusted_data>` fence.

### P6 & P7: Bundle Parity, `envelope()` Helper, and `2.0.0-rc.2` Bump

- **P6:** Keep `plugins/medra/` authoritative, `cli/plugin/` `.gitignore`d and generated by `npm --prefix cli run bundle-plugin`, and `.agents/plugins/medra/` versioned for Antigravity workspace discovery. Add `cli/scripts/check-bundle-drift.js` (run in `.github/workflows/ci.yml`) to verify `.agents/plugins/medra/` matches a fresh `medra install --target antigravity` output from `plugins/medra/`.
- **P7:** Extract `envelope(root, change, state, config, overrides)` in `cli/src/step.js` after P1–P5 pass, then bump `cli/package.json`, `plugins/medra/.claude-plugin/plugin.json`, `.agents/plugins/medra/`, and `CHANGELOG.md` to `2.0.0-rc.2` (preserving existing local edits in `CHANGELOG.md` and `README.md`).

## Security Considerations & Threat Model

| Control / Threat | Mitigation |
|---|---|
| Git argument injection & path traversal (`M-01`, `M-04`) | Preserved: `SAFE_GIT_REF` allowlist + leading-`-` rejection + `--` end-of-options in `safeGitDiff`; `resolveSafePath` in `readContracts` and `isSafePointer`; `safeJoin` in `install.js`. |
| Silent verification bypass on git failure (P2) | `safeGitDiff` surfaces `diff_error` in the envelope and prompt warning; `run/SKILL.md` and `verify/SKILL.md` warn and pause rather than dispatching a blind verify. |
| Prompt injection via closing-tag breakout (P5, `M-02`) | `fenceUntrusted` neutralizes case, whitespace, and hyphen/underscore variants (`</\s*untrusted[-_]data`) so embedded `contracts/*` and `git diff` contain exactly one opening and one closing `<untrusted_data>` tag. |
| Subagent gate-approval bypass (P4, `M-03`) | `security` verify `exit_command` uses `medra review --report` instead of `medra gate`; `guard.mjs` enforces `ask` on `medra gate ... --approve` and `deny` when subagent context is signaled. |
| Context/memory exhaustion (`M-05`) | Preserved: `MAX_CONTRACT_BYTES` (16 KiB) and `MAX_EMBED_BYTES` (64 KiB) cap embedded payloads with `truncated: true`. |

## Decisions

### D-01: Surface `diff_error` on the verify envelope instead of throwing `usageError`

**Choice:** Implement `M-01` by returning `{ diff, truncated, diff_error }` from `safeGitDiff` and exposing `diff_error` on the `verify` envelope and prompt warning, while `run/SKILL.md` and `verify/SKILL.md` warn and pause when `diff_error` is present.
**Alternatives:** Throw `usageError` inside `safeGitDiff` whenever `git diff` exits non-zero.
**Rationale:** Throwing would abort `compileStep` before `contracts/*` or `pointers` are emitted and break non-git test fixtures; surfacing `diff_error` preserves deterministic envelope output while preventing silent blind verifications (`CTX-005.S4`, `PLUG-001.S1`).

### D-02: Restore 1.x authoring guidance in `plugins/medra/pipelines/` rather than coordinator skills

**Choice:** Place subagent authoring phases, persona rules, avoid lists, and exit criteria in `plugins/medra/pipelines/*.md` and add them to `compileStep` `pointers` with explicit `template.md`/`guide.md` instructions.
**Alternatives:** Inline the 150–230 line 1.x instructions back into `plugins/medra/skills/*/SKILL.md`.
**Rationale:** Keeping coordinator skills thin preserves bounded coordinator context (`Article V`) while giving each clean-context subagent full authoring guidance on demand (`CTX-005.S5`).

### D-03: Use `medra review --report` for both `reviewer` and `security` verify subagents

**Choice:** Implement `M-03` by extending `commands.js` `review()` to accept `Stage: security` and security-report `Counts:` (`critical/high/medium/low/info`), and setting both `reviewer` and `security` `exit_command`s to `medra review <change> --report ...`.
**Alternatives:** Have `security` run `medra validate` with no review record, or add a new `medra security-review` subcommand.
**Rationale:** `medra gate ... --note` without `--approve` always fails `usageError`; reusing `medra review --report` records both verdicts in `.medra.yaml` `reviews[]` without adding new CLI surface or letting subagents touch `medra gate` (`CTX-005.S6`).

### D-04: Enforce `ask` on `medra gate ... --approve` in `guard.mjs` with subagent `deny` when signaled

**Choice:** Implement `M-04` by keeping `guard.mjs` returning `ask` for `medra gate ... --approve` and returning `deny` when `input.agent_id` or `MEDRA_SUBAGENT=1` is present.
**Alternatives:** Unconditionally `deny` all `medra gate ... --approve` calls in `guard.mjs`.
**Rationale:** Unconditional `deny` would block the top-level coordinator when executing a user-approved gate; `ask` already enforces human confirmation in Claude Code, and `deny` blocks signaled subagents (`PLUG-004.S2`).

### D-05: Standardize on `<untrusted_data>` and neutralize whitespace/case/hyphen variants

**Choice:** Implement `M-02` by updating all `step.js` prompts to `<untrusted_data>` and neutralizing `/<\/\s*untrusted[-_]data/gi` in `fenceUntrusted`.
**Alternatives:** Switch `fenceUntrusted` to `<untrusted-data>` or keep separate regexes.
**Rationale:** Skills, `CHANGELOG.md`, and `fenceUntrusted` output already use `<untrusted_data>`; a single regex closes the whitespace/case/hyphen bypass (`CTX-005.S6`).

### D-06: Version `.agents/plugins/medra/` with a CI drift check and keep `cli/plugin/` `.gitignore`d

**Choice:** Keep `.agents/plugins/medra/` committed for Antigravity workspace discovery, keep `cli/plugin/` `.gitignore`d and generated by `bundle-plugin`, and add `cli/scripts/check-bundle-drift.js` to CI.
**Alternatives:** `.gitignore` `.agents/plugins/medra/` or commit `cli/plugin/`.
**Rationale:** Antigravity reads `.agents/plugins/medra/` directly on clone (`README.md`), whereas `cli/plugin/` is only needed in the npm tarball; a CI drift check prevents silent divergence (`PLUG-003.S1`).

# Security Report: remodel-deterministic-v2-flow — round 1

**Stage:** security
**Verdict:** pass-with-findings
**Counts:** critical 0 · high 0 · medium 1 · low 1 · info 1
**Origin mix:** tool 0 · verified 0 · manual 3 · hypothesis 0
**Reviewer:** security agent
**Date:** 2026-11-21

## Summary

`pass-with-findings`: no critical or high findings were identified, with one medium finding (`S-01`: backticked task `pointers` in `cli/src/step.js:80` are not validated with `resolveSafePath`), one low finding (`S-02`: repo-derived markdown outside `contracts/*` and `git diff` is not wrapped in `fenceUntrusted`), and one informational hardening note (`S-03`). Mitigations M-03 through M-07 are implemented as designed, while M-01 and M-02 are partially implemented. Dynamic runtime behavior of `PreToolUse` hook enforcement across Claude Code / Antigravity and `npm --prefix cli test` completion were not awaited/verified in this audit (see Limitations).

## Scope and Method

- **Examined:** `diff_base: 1930e56`, 15 modified files plus untracked `cli/src/step.js`, `cli/test/step-compiler.test.js`, `plugins/medra/skills/run/SKILL.md`, and `plugins/medra/hooks/hooks.json`; 4 entry points (`medra step`, `resolveSafePath`, `medra validate --stage tasks`, thin coordinator skills); 0 dependency changes in `cli/package.json`.
- **Method:** code · configuration · dependencies · threat-model conformance
- **Tools:** `npm --prefix cli audit --json` (npm `9.2.0`, exit `0`, 0 vulnerabilities across 23 prod / 22 total dependencies).

## Findings

### S-01 [medium] Backticked task `pointers` in `medra step` are not validated with `resolveSafePath`

**Status:** open
**Confidence:** high · **Origin:** manual
**CWE:** CWE-22 · **CVE:** n/a · **CVSS:** n/a
**Location:** `cli/src/step.js:80` · M-01, TM-01
**Evidence:** `const pointers = [...new Set([...text.matchAll(BACKTICK_PATH)].map((m) => m[1]))];` extracts any `/`-containing backticked token from `tasks.md` directly into `subagents[0].pointers` (`cli/src/step.js:125, 150, 173`) and `## Code Pointers` (`cli/src/step.js:167`) without calling `resolveSafePath(root, p)` (`cli/src/core.js:167-190`).
**Attack scenario:** A crafted `tasks.md` in an untrusted repository contains a backticked traversal or absolute path (such as `` `../../.env` `` or `` `/etc/passwd` ``), causing `medra step` to emit it as a trusted code pointer for the `implementer` subagent to read.
**Impact:** Potential exposure of host files outside project `root` when a clean-context `implementer` subagent follows `Code Pointers`.
**Fix:** Filter or validate extracted `pointers` in `extractTaskRefs` (`cli/src/step.js:76-82`) through `resolveSafePath(root, p)` (dropping or rejecting any path that fails containment), while preserving safe project-relative paths.
**Validation:** Add a unit test in `cli/test/step-compiler.test.js` with `../` and `/etc/passwd` backticked in `tasks.md` asserting they are rejected or excluded from `subagents[0].pointers` and `prompt`.
**References:** https://cwe.mitre.org/data/definitions/22.html
**Residual risk:** Subagents with general file-read tools can still be instructed semantically unless OS/sandbox tool-scope restrictions are enforced.

### S-02 [low] Repo-derived markdown in `apply` and `verify` prompts is not wrapped in `fenceUntrusted`

**Status:** open
**Confidence:** high · **Origin:** manual
**CWE:** CWE-77 · **CVE:** n/a · **CVSS:** n/a
**Location:** `cli/src/step.js:136-166, 189` · M-02, TM-02
**Evidence:** `fenceUntrusted` (`cli/src/step.js:19-24`) is called for `contracts/*` (`cli/src/step.js:66`) and `git-diff` (`cli/src/step.js:180`), but `pack.requirements[].delta` in `buildVerifySubagents` (`cli/src/step.js:189`) and `tasks.md`, `specs/*/spec.md`, `plan.md` decisions, and `learnings.md` in `buildApplySubagents` (`cli/src/step.js:136-140, 161-166`) are interpolated raw. Additionally, `fenceUntrusted` emits `<untrusted_data>` (underscore) while prompt instructions (`cli/src/step.js:134, 159, 185`) refer to `<untrusted-data>` (hyphen).
**Attack scenario:** Malicious instructions in `tasks.md`, `specs/*/spec.md`, or `plan.md` appear outside any `<untrusted_data>` delimiter, making it easier for an LLM subagent to treat them as authoritative directives.
**Impact:** Weakened defense-in-depth against indirect prompt injection (OWASP LLM01).
**Fix:** Wrap repo-derived requirement deltas, task lines, decisions, and learnings in `fenceUntrusted(...)` and align the tag name (`<untrusted_data>` vs `<untrusted-data>`) between `fenceUntrusted` and prompt instructions.
**Validation:** Assert in `cli/test/step-compiler.test.js` that embedded requirement deltas and task blocks in `apply` and `verify` prompts are enclosed in neutralized untrusted-data fences.
**References:** https://genai.owasp.org/llmrisk/llm01-prompt-injection/
**Residual risk:** Delimiters remain defense-in-depth only and cannot eliminate semantic prompt injection without external privilege separation (M-03).

### S-03 [info] `resolveSafePath` ancestor walk skips dangling symlinks via `fs.existsSync`

**Status:** open
**Confidence:** high · **Origin:** manual
**CWE:** CWE-59 · **CVE:** n/a · **CVSS:** n/a
**Location:** `cli/src/core.js:180-189` · M-01, TM-01
**Evidence:** `while (!fs.existsSync(probe))` walks up past a dangling symlink because `fs.existsSync` returns `false` when the symlink target does not exist, so `fs.realpathSync(probe)` resolves only the parent directory inside `root`.
**Attack scenario:** If `resolveSafePath` were later reused for file writes, writing through a dangling symlink inside `root` pointing to a new file outside `root` would bypass the containment check.
**Impact:** None in current code (`readContracts` at `cli/src/step.js:60-61` only reads existing files and calls `fs.statSync(safeFile).isFile()`), but latent risk if reused for writes.
**Fix:** Check `fs.lstatSync` during the ancestor walk and resolve any symlink with `fs.readlinkSync` / `fs.realpathSync` before allowing a path.
**Validation:** Add a dangling-symlink test case to `M-01` in `cli/test/step-compiler.test.js`.
**References:** https://nodejs.org/en/learn/getting-started/security-best-practices
**Residual risk:** None once `lstatSync` is checked.

## Previous Findings

None.

## Threat Model Conformance

| Mitigation | Status | Evidence |
|---|---|---|
| M-01 | partial | `resolveSafePath` (`cli/src/core.js:167-190`) enforces canonical containment for `readContracts` (`cli/src/step.js:60`, tested in `cli/test/step-compiler.test.js:11-42`), but is not applied to `extractTaskRefs` pointers (`cli/src/step.js:80`; see `S-01`). |
| M-02 | partial | `fenceUntrusted` (`cli/src/step.js:19-24`) fences `contracts/*` and `git diff` (`cli/src/step.js:66, 180`), but omits delta requirements and `apply` markdown slices (`cli/src/step.js:136-166, 189`; see `S-02`). |
| M-03 | implemented | `plugins/medra/hooks/hooks.json:4-11` configures `PreToolUse` (`guard.mjs`), `compileStep` (`cli/src/step.js:226-234`) returns `action: 'gate'` with `subagents: []`, and skills require human gate approval. |
| M-04 | implemented | `safeGitDiff` (`cli/src/step.js:33-49`) uses `execFileSync('git', ['diff', '--no-ext-diff', ..., '--'], ...)` with `SAFE_GIT_REF` allowlist and leading `-` rejection (`cli/test/step-compiler.test.js:103`). |
| M-05 | implemented | `MAX_CONTRACT_BYTES` (16 KiB) and `MAX_EMBED_BYTES` (64 KiB) with `capText` truncation notice and `pointers` fallback (`cli/src/step.js:12-13, 26-30, 45, 63-66, 186`); `maxBuffer` is 2 MiB (`cli/src/step.js:43`). |
| M-06 | implemented | `compileStep` (`cli/src/step.js:100-108, 220-284`) derives `stage`, `action`, and `exit_command` from `.medra.yaml` and `tasks.md`; coordinator skills re-run `medra step` after subagent return (`plugins/medra/skills/run/SKILL.md:33, 46`). |
| M-07 | implemented | `loadConfig` and `configWarnings` (`cli/src/core.js:40-44, 73-109`) validate `models:` entries with `inherit` default (`cli/src/step.js:110-113`), tested in `cli/test/install-misc.test.js:288-306`. |

## Limitations

- `npm --prefix cli test` and the focused `node --test` run were still executing in the background at report time, so test pass status was not directly observed in this audit.
- `PreToolUse` hook runtime execution (`plugins/medra/hooks/guard.mjs`) was not modified in this change and was not dynamically tested here.
- External NVD / GitHub Advisory Database / CISA KEV web lookups were not required because `cli/package.json` added or upgraded zero dependencies (`npm audit` ran instead).

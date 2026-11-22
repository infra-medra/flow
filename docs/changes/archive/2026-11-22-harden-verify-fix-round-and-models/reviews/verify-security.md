# Security Report: harden-verify-fix-round-and-models — round 1

**Stage:** security
**Verdict:** pass-with-findings
**Counts:** critical 0 · high 0 · medium 2 · low 3 · info 0
**Origin mix:** tool 0 · verified 0 · manual 5 · hypothesis 0
**Reviewer:** security agent
**Date:** 2026-11-22

## Summary

`pass-with-findings`: zero critical or high findings were observed, while two medium findings (`S-01`: subagents can invoke `medra gate <change> verify --request-changes` past `guard.mjs` to reset `verify_fix_rounds` and `last_fix_round_at`; `S-02`: `reportFreshness` falls back to filesystem `mtime` for unrecorded report files in `reviews/`) and three low findings (`S-03`–`S-05`) remain open. Threat-model mitigation `M-04` is implemented; `M-01`, `M-02`, and `M-03` are partial due to the findings above. Dedicated SAST/secret scanners (`semgrep`, `trivy`, `gitleaks`) were unavailable in this environment, so code analysis rested on manual audit, targeted `guard.mjs` stdin checks, and `npm audit`.

## Scope and Method

- **Examined:** 39 modified files plus `docs/changes/harden-verify-fix-round-and-models/` since `diff_base` `7334ebc` (covering `cli/src/{commands,step,validate}.js`, `plugins/medra/hooks/guard.mjs`, schemas, skills, references, bundles, and tests; 4 CLI entry points/commands altered (`gate`, `review`, `verifyFix`, `compileStep`/`guard.mjs`), 0 dependency additions or lockfile changes).
- **Method:** code · configuration · dependencies · threat-model conformance
- **Tools:** `npm --prefix cli audit --json` (npm `9.2.0`, exit `0`: 0 vulnerabilities across 22 locked dependencies) · `npm --prefix cli test` (Node `v18.19.1`, exit `0`: 81/81 passed) · `node cli/scripts/check-version.js` (exit `0`) · `node cli/scripts/check-bundle-drift.js` (exit `0`) · `node cli/scripts/measure-envelope.js` (exit `0`: `verify` 1525 B) · `node plugins/medra/hooks/guard.mjs` (Node `v18.19.1`, exit `0` on read-only stdin probes) · `semgrep`/`trivy`/`gitleaks`: not installed.

## Findings

### S-01 [medium] Subagents can invoke `medra gate ... --request-changes` past `guard.mjs`, resetting `verify_fix_rounds` and `last_fix_round_at`

**Status:** open
**Confidence:** confirmed · **Origin:** manual
**CWE:** CWE-863 · **CVE:** n/a · **CVSS:** n/a
**Location:** `plugins/medra/hooks/guard.mjs:32-42`, `cli/src/commands.js:158-169` · M-01, TM-01, PLUG-004.S4, STATE-005.S2
**Evidence:** `plugins/medra/hooks/guard.mjs:32` only inspects `medra gate ... --approve` and line 40 only inspects `\bmedra(?:\.js)?\s+verify-fix\b`; invoking `node plugins/medra/hooks/guard.mjs` with `agent_id: "sub-1"` and `command: "medra gate harden-verify-fix-round-and-models verify --request-changes --note x"` outputs nothing and exits `0`, while `cli/src/commands.js:163-166` executes `if (name === 'verify') { state.verify_fix_rounds = 0; state.last_fix_round_at = null; }`.
**Attack scenario:** A compromised or prompt-injected subagent running under Claude Code (for example after processing `<untrusted_data>` in `verify`) executes `medra gate <change> verify --request-changes --note "reopen"`, bypassing `PreToolUse` denial and resetting `verify_fix_rounds` to `0` and `last_fix_round_at` to `null`.
**Impact:** Breaks coordinator-only gate and fix-round privilege separation (`B-01`), allows subagents to forge `changes-requested` gate state and `gate_notes`, erases the post-fix freshness floor (`last_fix_round_at`), and resets `verify_fix_rounds` so automatic fix rounds can bypass the 1-round limit.
**Fix:** In `plugins/medra/hooks/guard.mjs`, deny any `medra gate` command when `isSubagent` is true (keeping coordinator `--request-changes` silent and coordinator `--approve` prompting with `ask`), then re-bundle `cli/plugin/` and `.agents/plugins/medra/`.
**Validation:** Add tests in `cli/test/hooks.test.js` asserting `medra gate <change> verify --request-changes --note "x"` is denied when `agent_id` or `MEDRA_SUBAGENT=1` is set and returns `null` in coordinator context.
**References:** https://cwe.mitre.org/data/definitions/863.html · https://owasp.org/Top10/A01_2021-Broken_Access_Control/
**Residual risk:** Antigravity lacks native `PreToolUse` hooks (`threat-model.md` Residual Risks), so subagent enforcement there remains prompt/role-boundary only.

### S-02 [medium] `reportFreshness` falls back to filesystem `mtime` for unrecorded files in `reviews/`, bypassing `recorded_at` and SHA-256 verification

**Status:** open
**Confidence:** high · **Origin:** manual
**CWE:** CWE-345 · **CVE:** n/a · **CVSS:** n/a
**Location:** `cli/src/validate.js:270-288`, `cli/src/change.js:47-57` · M-03, TM-03, CTX-005.S17
**Evidence:** `reportFreshness` (`cli/src/validate.js:274-287`) matches `reviews[i]?.report === reportRel`; when no entry matches (`entry === null`), line 287 returns `{ fresh: report.mtime >= freshFloor, hashMismatch: false, timestampMs: report.mtime, source: 'mtime' }` even if `state.reviews` already contains `recorded_at` entries. Meanwhile `latestReport` (`cli/src/change.js:51-56`) ranks any `-r<N>.md` file in `reviews/` ahead of unsuffixed reports (`verify-reviewer.md`), and `guard.mjs` permits `Write`/`Edit` in `reviews/`.
**Attack scenario:** On a change whose `reviews/verify-reviewer.md` failed and was recorded via `medra review`, writing or `git checkout`-restoring an unrecorded file `reviews/2026-11-22-verify-r1.md` (`**Stage:** verify`, `**Verdict:** pass`) causes `latestReport` to pick `-r1.md`, `reportFreshness` to find no matching entry, and freshness to pass solely on current filesystem `mtime >= freshFloor` without any `medra review` record or hash check.
**Impact:** Defeats `M-03` authenticity and `mtime`-spoofing protection (`TM-03`) via unrecorded `-r<N>.md` files in `reviews/`.
**Fix:** Disallow `mtime` fallback whenever `state.reviews` already contains any `recorded_at` entry (and distinguish 2.0 changes from legacy 1.x changes lacking `recorded_at`), requiring unrecorded report files to be registered via `medra review`.
**Validation:** Add a test in `cli/test/step-compiler.test.js` where `state.reviews` holds a recorded `verify-reviewer.md` entry and an unrecorded `bypass-r1.md` is created with a future `mtime`, asserting `reportFreshness` returns `fresh: false` and `compileStep` does not advance to `gate: verify`.
**References:** https://cwe.mitre.org/data/definitions/345.html · https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/
**Residual risk:** While empty `reviews: []` falls back to `mtime` for 1.x backwards compatibility (as tested in `cli/test/step-compiler.test.js:1126`), a new 2.0 change with zero `medra review` records can still accept an unrecorded report based on `mtime` unless 1.x state is explicitly flagged.

### S-03 [low] Sub-second timestamp truncation in `last_task_done_at` (`nowIso()`) allows pre-task reviews to stay fresh

**Status:** open
**Confidence:** confirmed · **Origin:** manual
**CWE:** CWE-840 · **CVE:** n/a · **CVSS:** n/a
**Location:** `cli/src/commands.js:207, 415`, `cli/src/core.js:147`, `cli/src/validate.js:278, 304-306` · M-03, TM-03, CTX-005.S17
**Evidence:** `review` (`cli/src/commands.js:207`) records `recorded_at = new Date().toISOString()` with milliseconds, whereas `taskDone` (`cli/src/commands.js:415`) records `state.last_task_done_at = nowIso()`, which strips milliseconds (`replace(/\.\d{3}Z$/, 'Z')` in `cli/src/core.js:147`). `verifyFindings` sets `freshFloor = Math.max(lastDoneMs || 0, lastFixMs || 0)` and checks `recordedMs >= freshFloor`; `cli/test/step-compiler.test.js:1045-1050` had to insert a `tickSecond()` sleep so `task done` would not run in the same UTC second as `review`.
**Attack scenario:** An automated pipeline runs `medra review` at `10:00:00.200Z` (`recordedMs = ...200`) and completes a task via `medra task done` at `10:00:00.800Z`, truncating `last_task_done_at` to `10:00:00Z` (`...000`). Because `...200 >= ...000`, `reportFreshness` treats the pre-task report as `fresh: true`.
**Impact:** Tasks completed within the same UTC second after a `medra review` fail to stale existing review and security reports.
**Fix:** Store `state.last_task_done_at` using `new Date().toISOString()` (millisecond precision) in `taskDone`.
**Validation:** Add a test in `cli/test/step-compiler.test.js` invoking `medra review` then `medra task done` back-to-back without `tickSecond()`, asserting the review becomes stale (`action: "dispatch"`).
**References:** https://cwe.mitre.org/data/definitions/840.html
**Residual risk:** Historical 1.x `.medra.yaml` files with second-precision `last_task_done_at` retain 1-second rounding on existing entries.

### S-04 [low] `verifyFix` does not enforce the 1-fix-round cap (`verify_fix_rounds >= 1`), allowing duplicate calls to stale fresh re-review reports

**Status:** open
**Confidence:** high · **Origin:** manual
**CWE:** CWE-840 · **CVE:** n/a · **CVSS:** n/a
**Location:** `cli/src/commands.js:456-487` · M-02, TM-02, CTX-005.S8
**Evidence:** `verifyFix` (`cli/src/commands.js:456-487`) validates `verify.fix-open`, `verify.report`, and `verify.no-blockers`, then increments `state.verify_fix_rounds` and overwrites `state.last_fix_round_at = new Date().toISOString()` (`lines 478-479`) without refusing when `Number(state.verify_fix_rounds || 0) >= 1`.
**Attack scenario:** After 1 fix round and fresh round-2 re-review (`recorded_at > last_fix_round_at`) with remaining blockers, calling `medra verify-fix <change>` again (by a buggy coordinator or an Antigravity subagent) succeeds, increments `verify_fix_rounds` to `2`, and sets `last_fix_round_at = now`, invalidating the round-2 reports and pushing `compileStep` back into `dispatch` (`reviewer`/`security`) instead of `gate: verify`.
**Impact:** Corrupts `verify_fix_rounds` above the single allowed fix round and forces unnecessary re-verification rounds (`TM-02`).
**Fix:** Add a guard at the top of `verifyFix` refusing when `Number(state.verify_fix_rounds || 0) >= 1` (directing the caller to the `verify` gate).
**Validation:** Add a test in `cli/test/step-compiler.test.js` calling `medra verify-fix` after `verify_fix_rounds === 1` and fresh failing re-review reports, asserting exit `1` and unchanged `verify_fix_rounds === 1`.
**References:** https://cwe.mitre.org/data/definitions/840.html
**Residual risk:** On Antigravity, before the first fix round (`verify_fix_rounds === 0`), a subagent can still invoke `medra verify-fix` once due to the lack of `PreToolUse` hooks.

### S-05 [low] Regex-based `guard.mjs` `verify-fix` matching can be evaded via shell quoting or package-runner invocation

**Status:** open
**Confidence:** confirmed · **Origin:** manual
**CWE:** CWE-184 · **CVE:** n/a · **CVSS:** n/a
**Location:** `plugins/medra/hooks/guard.mjs:40-42` · M-01, TM-01, PLUG-004.S4
**Evidence:** `plugins/medra/hooks/guard.mjs:40` checks `/\bmedra(?:\.js)?\s+verify-fix\b/.test(cmd) && isSubagent`. Probing `node plugins/medra/hooks/guard.mjs` with `agent_id: "sub-1"` and `command: "medra 'verify-fix' harden-verify-fix-round-and-models"` produces empty stdout and exits `0` (permitted); `npx @medra.dev/flow verify-fix` or `node -e` likewise bypasses the regex.
**Attack scenario:** A prompt-injected or misbehaving Claude Code subagent invokes `medra 'verify-fix' <change>`, `npx @medra.dev/flow verify-fix <change>`, or inline `node -e`, bypassing the `PreToolUse` guard and prematurely recording `verify_fix_rounds = 1` (`TM-01`).
**Impact:** Lets a Claude Code subagent exhaust the single fix round without fixing findings, jumping to the `verify` gate after re-review (`TM-01`).
**Fix:** Strip shell quotes/backslash escapes per command segment and include `@medra.dev/flow` / `medra-cli` invocations when checking `verify-fix` and `gate` commands in `guard.mjs`.
**Validation:** Add `cli/test/hooks.test.js` cases asserting `medra 'verify-fix' ...`, `medra "verify-fix" ...`, and `npx @medra.dev/flow verify-fix ...` return `'deny'` when `agent_id` or `MEDRA_SUBAGENT=1` is set.
**References:** https://cwe.mitre.org/data/definitions/184.html
**Residual risk:** Unboxed `Bash` tool access permits arbitrary scripting (`node -e`) that cannot be completely closed by command-line string matching alone.

## Previous Findings

None.

## Threat Model Conformance

| Mitigation | Status | Evidence |
|---|---|---|
| M-01 | partial | `plugins/medra/hooks/guard.mjs:40-42` denies direct `medra verify-fix` for subagents, `cli/src/step.js:355` sets fix implementer `exit_command` to `medra suite <change> --json`, and `plugins/medra/references/{gate,portability}.md` document Antigravity limits; however `guard.mjs` allows subagent `medra gate ... --request-changes` (S-01) and quoted/aliased `verify-fix` (S-05). |
| M-02 | partial | `cli/src/commands.js:464-476` refuses `verify.fix-open`, `verify.report`, and `verify.no-blockers`, and `cli/src/step.js:312-361` is read-only/idempotent; however `verifyFix` lacks a `verify_fix_rounds >= 1` cap check (S-04). |
| M-03 | partial | `cli/src/commands.js:207-217` stores `recorded_at` and SHA-256 `hash`, and `cli/src/validate.js:274-286` validates them when matching `reviews[]` entries exist; however unrecorded files in `reviews/` fall back to `mtime` (S-02) and `last_task_done_at` truncates sub-second precision (S-03). |
| M-04 | implemented | `cli/src/core.js:40-44, 79-81` restrict `models` keys via `MODEL_KEYS`, `cli/src/step.js:184-188, 396` resolve `role -> stage -> default -> inherit` with `fallback: 'inherit'`, and `cli/src/validate.js:220-231` warns on non-`inherit` inline overrides. |

## Limitations

- Dedicated SAST and secret scanners (`semgrep`, `trivy`, `gitleaks`) were not installed on the host; code analysis relied on manual inspection, `git diff 7334ebc` regex secret checks (0 matches), and read-only CLI/hook execution.
- Local execution ran on Node `v18.19.1`, whereas `cli/package.json` declares `engines.node: ">=20"` and `.github/workflows/ci.yml` targets Node `20` and `22`.
- Live Claude Code `PreToolUse` runtime integration and Antigravity `invoke_subagent` dispatch were not executed end-to-end; `guard.mjs` was verified via piped stdin JSON.
- This audit was dispatched via the v2 `medra step` protocol (`docs/changes/harden-verify-fix-round-and-models/reviews/verify-security.md`) rather than the v1 `implementer-security.md` `-security-agent-r<round>.md` path format.
- Files outside the `7334ebc..HEAD` and working-tree diff were read only along call paths relevant to changed controls (`cli/src/{change,core,documents,install,context,archive,handoff}.js`, `cli/bin/medra.js`, `cli/scripts/*`).
- Dependency advisory checks combined local `npm audit` with web search queries against NVD, GitHub Advisory Database, and CISA KEV (`picomatch@4.0.7` / `2.3.2` are patched for `CVE-2026-33671` and `CVE-2026-33672`, and `GHSA-fc5q-39xc-vjpf` / `CVE-2026-112366` is withdrawn; `yaml@2.9.1` is patched for `CVE-2026-33532` and `CVE-2023-2251`; no locked dependency appears in CISA KEV).

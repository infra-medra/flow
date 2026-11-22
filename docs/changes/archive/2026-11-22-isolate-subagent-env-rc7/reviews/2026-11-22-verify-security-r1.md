# Security Report: isolate-subagent-env-rc7 — round 1

**Stage:** security
**Verdict:** pass-with-findings
**Counts:** critical 0 · high 0 · medium 1 · low 0 · info 1
**Origin mix:** tool 0 · verified 0 · manual 2 · hypothesis 0
**Reviewer:** security agent
**Date:** 2026-11-22

## Summary

pass-with-findings: one medium finding remains (`S-01`, `childEnv()` in `medra task done --run` and `medra suite` strips `MEDRA_SUBAGENT` on the active project root while `hooks/guard.mjs` skips quoted `--run` arguments and `docs/config-flow.yaml`) alongside one informational portability hardening note (`S-02`, case-sensitive `MEDRA_SUBAGENT` deletion on Windows). No secrets, dependency vulnerabilities, or critical/high weaknesses were identified in the diff, and all 102 CLI tests pass under `MEDRA_SUBAGENT=1`. External SAST and secret scanners (`trivy`, `semgrep`, `gitleaks`) were not installed; dependency auditing relied on `npm audit` and NVD/GHSA/KEV lookups.

## Scope and Method

- **Examined:** `diff_base` `92f24a7` (16 modified files across `cli/`, `plugins/medra/`, `.agents/plugins/medra/`, and `CHANGELOG.md`, plus 3 new test files in `cli/test/`), 1 entry point surface (`childEnv()` / `spawnSync` / `requireCoordinator` / `hooks/guard.mjs`), 0 dependency package additions or upgrades (`cli/package.json` version bump to `2.0.0-rc.7` only; 5 pinned direct dependencies in `cli/package-lock.json` verified).
- **Method:** code · configuration · dependencies · boundary verification (fast-track change, no threat model).
- **Tools:** `npm audit --json` (npm `9.2.0`, exit `0`, 0 vulnerabilities across 23 prod / 22 total dependencies); `MEDRA_SUBAGENT=1 npm --prefix cli test` (Node `v18.19.1`, exit `0`, 102/102 tests passed); `node cli/scripts/check-bundle-drift.js` (exit `0`); `node cli/scripts/check-version.js` (exit `0`); `node plugins/medra/hooks/guard.mjs` stdin verification (exit `0`). Unavailable: `trivy`, `semgrep`, `gitleaks`.

## Findings

### S-01 [medium] Unconditional MEDRA_SUBAGENT stripping enables confused-deputy gate bypass via task done --run and suite

**Status:** open
**Confidence:** confirmed · **Origin:** manual
**CWE:** CWE-269 · **CVE:** n/a · **CVSS:** n/a
**Location:** `cli/src/core.js:158` · VAL-006
**Evidence:** `childEnv()` in `cli/src/core.js:158-162` returns `{ ...process.env }` with `delete env.MEDRA_SUBAGENT`, and `cli/src/commands.js:365,376,442` passes `env: childEnv()` to `spawnSync(..., { cwd: root, shell: true })` for `medra task done --run`, `testing.checks`, and `medra suite`. Piping `{"hook_event_name":"PreToolUse","agent_id":"sub-1","tool_name":"Bash","tool_input":{"command":"MEDRA_SUBAGENT=1 medra task done my-change T001 --run \"medra gate my-change verify --approve\""}}` to `node plugins/medra/hooks/guard.mjs` exited `0` with empty stdout (silent allow) because `guard.mjs:33-38` runs `stripQuoted(cmd)` before matching `medra gate`, and `guard.mjs:76-94` also returned silent allow (`exit 0`) for `Write` to `docs/config-flow.yaml`.
**Attack scenario:** On Claude Code (or any runtime exporting `MEDRA_SUBAGENT=1` in the subagent shell), a subagent invokes `MEDRA_SUBAGENT=1 medra task done <change> <T-ID> --run "medra gate <change> verify --approve"` (or `--request-changes --note "..."`), or modifies `testing.command` / `testing.checks` in `docs/config-flow.yaml` before running its compiled `exit_command` (`MEDRA_SUBAGENT=1 medra suite <change> --json`). `guard.mjs` permits the quoted `--run` payload (and `docs/config-flow.yaml` edit), and `childEnv()` strips `MEDRA_SUBAGENT` before executing the child command in `cwd: root`, bypassing `requireCoordinator` (`cli/src/commands.js:153-157`).
**Impact:** A subagent operating under `MEDRA_SUBAGENT=1` or Claude Code `PreToolUse` isolation can approve human-only gates (`medra gate ... --approve`) or reset `verify_fix_rounds` (`medra gate ... --request-changes`). Conditional on subagent execution of `--run` or `docs/config-flow.yaml` tampering; on Antigravity without hooks, `plugins/medra/references/portability.md:25` already notes `MEDRA_SUBAGENT=1` is not a hard runtime boundary.
**Fix:** Harden `plugins/medra/hooks/guard.mjs` so subagent `Bash` calls cannot smuggle `medra gate` / `medra verify-fix` inside quoted `--run` or `sh -c` payloads (do not rely solely on `stripQuoted` for subagent `Bash` enforcement) and deny subagent `Write`/`Edit`/shell writes to `docs/config-flow.yaml`; in `plugins/medra/references/gate.md` and `plugins/medra/references/portability.md`, document that `--run` and `docs/config-flow.yaml` commands run with `MEDRA_SUBAGENT` cleared; and optionally pass a separate project-root scope check in `childEnv(root)` / `requireCoordinator` when `process.env.MEDRA_SUBAGENT === '1'` so child `medra gate`/`verify-fix` calls targeting the active `root` remain refused while `/tmp` fixture tests keep `MEDRA_SUBAGENT` unset.
**Validation:** Add tests in `cli/test/hooks.test.js` asserting `guard.mjs` denies `MEDRA_SUBAGENT=1 medra task done <c> T001 --run "medra gate <c> verify --approve"` and subagent writes to `docs/config-flow.yaml`; re-run this audit on round 2 if fixed.
**References:** https://cwe.mitre.org/data/definitions/269.html · https://cwe.mitre.org/data/definitions/284.html · https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html
**Residual risk:** On runtimes without `PreToolUse` hooks (Antigravity), a subagent with shell access can still invoke `medra` directly without `MEDRA_SUBAGENT=1`, as documented in `plugins/medra/references/portability.md:25`.

### S-02 [info] Case-sensitive delete in childEnv() leaves mixed-case MEDRA_SUBAGENT keys on Windows

**Status:** open
**Confidence:** high · **Origin:** manual
**CWE:** CWE-178 · **CVE:** n/a · **CVSS:** n/a
**Location:** `cli/src/core.js:158` · VAL-006
**Evidence:** `export function childEnv() { const env = { ...process.env }; delete env.MEDRA_SUBAGENT; return env; }` (same pattern in `cli/test/helpers.js:10-14` and `cli/test/hooks.test.js:12-16`).
**Attack scenario:** No privilege escalation occurs (fails closed): on Windows, `process.env` is a case-insensitive proxy, whereas `{ ...process.env }` produces a plain case-sensitive object. If a parent process on Windows supplies `medra_subagent=1` in lowercase or mixed case, `delete env.MEDRA_SUBAGENT` leaves that entry intact, and child Node.js processes observe `process.env.MEDRA_SUBAGENT === '1'` in `requireCoordinator`.
**Impact:** None for security (fails closed by refusing privileged commands); minor cross-platform test-isolation inconsistency if non-uppercase `MEDRA_SUBAGENT` is present on Windows.
**Fix:** Iterate `Object.keys(env)` in `childEnv()` (and `cleanEnv()` test helpers, or import `childEnv()`) and delete every key where `k.toUpperCase() === 'MEDRA_SUBAGENT'`.
**Validation:** Unit test confirming `childEnv()` strips mixed-case `medra_subagent` keys while preserving unrelated variables.
**References:** https://cwe.mitre.org/data/definitions/178.html
**Residual risk:** None once fixed.

## Previous Findings

None.

## Threat Model Conformance

No threat model (fast track).

## Limitations

- `trivy`, `semgrep`, and `gitleaks` are not installed in this environment, so external SAST and secret scanning did not run; secret and code review relied on manual inspection of the full `92f24a7` diff and added files.
- Windows runtime behavior (`process.env` case-insensitivity in `S-02`) was verified by code inspection and Node.js documentation on a Linux host (`node v18.19.1`), not executed on Windows.
- Note on runtime engine mismatch: `cli/package.json` specifies `"engines": { "node": ">=20" }`, whereas verification commands executed on host `node v18.19.1`.
- Repository files unrelated to the diff were not audited in full; inspection outside the diff focused on the `requireCoordinator`, `guard.mjs`, `step.js`, `validate.js`, `change.js`, `handoff.js`, `documents.js`, `install.js`, and test harness call paths.

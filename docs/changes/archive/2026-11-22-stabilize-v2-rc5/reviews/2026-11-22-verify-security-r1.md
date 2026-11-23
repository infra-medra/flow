# Security Report: stabilize-v2-rc5 — round 1

**Stage:** security
**Verdict:** pass-with-findings
**Counts:** critical 0 · high 0 · medium 1 · low 0 · info 0
**Origin mix:** tool 0 · verified 0 · manual 1 · hypothesis 0
**Reviewer:** security agent
**Date:** 2026-11-22

## Summary

pass-with-findings: one medium finding remains (`S-01`, `MEDRA_SUBAGENT=1` is not propagated to Antigravity subagents at runtime, leaving `M-01` partial). `M-02` (`handoff.js` pre-dispatch `suite`/`merge` gating and non-overwriting `-r<N>.md` report paths) and path/git-ref safety controls in `cli/src/step.js` are implemented. Dependency vulnerabilities were checked locally with `npm --prefix cli audit` (0 vulnerabilities); external NVD/CISA KEV/GitHub Advisory web lookups were not performed because no dependencies were added or upgraded in `cli/package.json`.

## Scope and Method

- **Examined:** 41 files changed since `4cd4247` (`diff_base`), 3 entry points (`medra gate`, `medra verify-fix`, `medra step`), 0 dependency changes in `cli/package.json`.
- **Method:** code · configuration · dependencies · threat-model conformance
- **Tools:** `npm --prefix cli audit` (npm 9.2.0, exit code 0, 0 vulnerabilities); `gitleaks`, `semgrep`, `trivy` not installed.

## Findings

### S-01 [medium] `MEDRA_SUBAGENT=1` is not propagated to Antigravity subagents at runtime

**Status:** open
**Confidence:** confirmed · **Origin:** manual
**CWE:** CWE-284 · **CVE:** n/a · **CVSS:** n/a
**Location:** `plugins/medra/references/portability.md:25` · M-01, TM-01, REQ PLUG-009
**Evidence:** `cli/src/commands.js:153-160` and `:464` enforce `process.env.MEDRA_SUBAGENT === '1'` in `gate` and `verifyFix`, and `plugins/medra/references/portability.md:25` states that "dispatched Antigravity subagents receive `MEDRA_SUBAGENT=1` in their environment". However, in this Antigravity subagent session `MEDRA_SUBAGENT=unset` was directly observed, and neither `plugins/medra/skills/*/SKILL.md` nor `cli/src/install.js` sets `MEDRA_SUBAGENT=1` when dispatching subagents.
**Attack scenario:** A misbehaving or prompt-injected subagent on Antigravity (which lacks `PreToolUse` hooks) invokes `medra verify-fix <change>` or `medra gate <change> <stage> --approve` / `--request-changes`; because `MEDRA_SUBAGENT` is unset in the subagent's process environment, `requireCoordinator` allows the command to execute.
**Impact:** The coordinator-vs-subagent privilege boundary (`B-01`) is not enforced at runtime on Antigravity, allowing a subagent to record gate approvals/rejections or increment `verify_fix_rounds`.
**Fix:** Configure the Antigravity subagent dispatcher/runtime to inject `MEDRA_SUBAGENT=1` into dispatched subagent environments, or update `plugins/medra/references/portability.md` and `plugins/medra/references/gate.md` to state accurately that `MEDRA_SUBAGENT=1` enforcement on Antigravity requires the host runtime to set `MEDRA_SUBAGENT=1` rather than claiming it is automatically received.
**Validation:** Dispatch an Antigravity subagent and verify `MEDRA_SUBAGENT=1` is set in its environment (or verify the updated documentation accurately states the host-runtime prerequisite); re-run this audit on round 2.
**References:** https://cwe.mitre.org/data/definitions/284.html, https://owasp.org/Top10/A01_2021-Broken_Access_Control/
**Residual risk:** On runtimes without `PreToolUse` hooks, a subagent with shell access could still unset `MEDRA_SUBAGENT` or directly edit `.medra.yaml` (already documented as a residual risk in `threat-model.md` and `references/gate.md`).

## Previous Findings

None.

## Threat Model Conformance

| Mitigation | Status | Evidence |
|---|---|---|
| M-01 | partial | `cli/src/commands.js:153-160`, `:464` and `cli/test/hooks.test.js:163-196` enforce `MEDRA_SUBAGENT=1` when set, but `MEDRA_SUBAGENT=unset` in Antigravity subagent runtime (`plugins/medra/references/portability.md:25`) |
| M-02 | implemented | `cli/src/handoff.js:42-89`, `cli/src/step.js:396-406`, `:463-465`, `cli/test/step-compiler.test.js:1165-1340` |

## Limitations

- `gitleaks`, `semgrep`, and `trivy` are not installed in this environment, so automated SAST and secret-scanning tools did not run (a regex diff scan for common secret prefixes found no matches).
- External NVD, GitHub Advisory Database, and CISA KEV lookups were not performed because `cli/package.json` had no dependency changes in this diff and `npm --prefix cli audit` exited `0` with 0 vulnerabilities.
- `node --version` in this environment is `v18.19.1` while `cli/package.json` specifies `engines.node: ">=20"`; the test suite (`90/90` passed) was already reported green by the coordinator and was not re-executed here.

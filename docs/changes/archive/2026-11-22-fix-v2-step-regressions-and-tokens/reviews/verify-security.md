# Security Report: fix-v2-step-regressions-and-tokens — round 2

**Stage:** security
**Verdict:** pass
**Counts:** critical 0 · high 0 · medium 0 · low 0 · info 0
**Origin mix:** tool 0 · verified 0 · manual 0 · hypothesis 0
**Reviewer:** security agent
**Date:** 2026-11-22

## Summary

pass: re-verification after the test-only fix at `cli/test/step-compiler.test.js:858` (`CTX-005.S14` array lookup) found no open security findings in the changed code, configuration, or dependencies, and all four accepted threat-model mitigations (M-01 through M-04) remain implemented with passing test coverage (`npm --prefix cli test`: 75/75 passed). The biggest limitation is that external SAST/secret scanners (`gitleaks`, `trivy`, `semgrep`) were not installed, and Antigravity's lack of native `PreToolUse` hooks means M-02 relies on subagent role isolation on that runtime.

## Scope and Method

- **Examined:** 34 files changed since `0a9277c` plus untracked `cli/scripts/measure-envelope.js` and `contracts/step-envelope.schema.json` (re-confirmed `cli/test/step-compiler.test.js:840-863` since round 1), covering 3 entry points (`medra step`, `medra verify-fix`, `plugins/medra/hooks/guard.mjs`), 0 dependency additions/upgrades in `cli/package.json`, and 0 secrets touched.
- **Method:** code · configuration · dependencies · threat-model conformance
- **Tools:** `npm --prefix cli test` (exit 0, 75/75 passed); `npm --prefix cli audit --omit=dev` (exit 0, 0 vulnerabilities); `node cli/scripts/measure-envelope.js` (exit 0, verify `cli_json_bytes` 1525 < 4096); `npm --prefix cli run check-version` (exit 0, `2.0.0-rc.3`); `node cli/scripts/check-bundle-drift.js` (exit 0).

## Findings

None.

## Previous Findings

None.

## Threat Model Conformance

| Mitigation | Status | Evidence |
|---|---|---|
| M-01 | implemented | `cli/src/step.js:76-80` (`fenceUntrusted` neutralizes `</untrusted_data>` variants), `cli/src/step.js:109-126` (`readContracts` caps at 16 KB / 64 KB total), `cli/src/step.js:263-267` & `529-532` (top-level `embedded` rendered in `stepMarkdown`), `cli/test/step-compiler.test.js:268-305` (`CTX-005.S6`), `cli/test/step-compiler.test.js:623-640` (`CTX-005.S10`). |
| M-02 | implemented | `plugins/medra/hooks/guard.mjs:28-39` (denies `medra gate ... --approve` when `agent_id` or `MEDRA_SUBAGENT=1` is set) & `46-48, 64-66` (denies `.medra.yaml` edits), `plugins/medra/references/gate.md:15-19`, `plugins/medra/references/portability.md:22-25`, `cli/test/hooks.test.js:99-128` (`PLUG-004.S1..S3`). |
| M-03 | implemented | `cli/src/change.js:28-29` (`verify_fix_rounds`, `last_fix_round_at`), `cli/src/commands.js:436-447` (`verifyFix`), `cli/src/step.js:329-357` (dispatches fix implementer only when `verify_fix_rounds === 0`, escalates to `gate: verify` at `>= 1`), `cli/src/validate.js:247` (`freshFloor`), `cli/test/step-compiler.test.js:517-567` (`CTX-005.S8`). |
| M-04 | implemented | `cli/src/core.js:169-192` (`resolveSafePath`), `cli/src/step.js:42-53` (`pluginPointer` rejects `\0`, absolute paths, `..`), `cli/src/step.js:89-106` (`safeGitDiff` validates `SAFE_GIT_REF` and uses `--`), `cli/src/step.js:375-377, 405-422` (`VALID_ROLES` / `opts.task` filtering), `cli/test/step-compiler.test.js:570-620` (`CTX-005.S9 & M-04`). |

## Limitations

- `gitleaks`, `trivy`, and `semgrep` are not installed in this environment; secret and static scanning relied on manual diff inspection and `npm --prefix cli audit --omit=dev`.
- NVD, GitHub Advisory Database, and CISA KEV web lookups were not run separately because `cli/package.json` added or upgraded zero dependencies in this change and `npm --prefix cli audit --omit=dev` reported 0 vulnerabilities.
- Runtime environment is Node.js `v18.19.1` while `cli/package.json` declares `engines.node >=20`.
- Antigravity lacks native `PreToolUse` hooks, so M-02 subagent gate-approval protection on Antigravity relies on subagent isolation rather than hook enforcement (as documented in `threat-model.md` Residual Risks).

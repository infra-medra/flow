# Security Report: close-v2-gaps-rc6 — round 1

**Stage:** security
**Verdict:** pass-with-findings
**Counts:** critical 0 · high 0 · medium 1 · low 1 · info 1
**Origin mix:** tool 0 · verified 0 · manual 3 · hypothesis 0
**Reviewer:** security agent
**Date:** 2026-11-22

## Summary

pass-with-findings: one medium finding (`S-01`), one low finding (`S-02`), and one informational finding (`S-03`) remain open. In `plugins/medra/hooks/guard.mjs`, the `SEG` segment pattern stops on quoted shell metacharacters (`;`, `|`, `&`, `\n`), allowing a Claude Code subagent to bypass `PreToolUse` gate matching via `--note "a;b" --approve`, while `cmdIsSubagent` misses quoted, exported, and subshell `MEDRA_SUBAGENT=1` invocations. This audit is limited by the absence of `trivy`, `semgrep`, and `gitleaks` in the environment and by `safeGitDiff` returning an empty diff against `b3d7d06..HEAD` on an uncommitted working tree (mitigated by reading `git diff b3d7d06` and untracked files directly).

## Scope and Method

- **Examined:** diff base `b3d7d06` (`b3d7d0612dff561bb325e35224dc96333b35d2a1`), 21 modified tracked files (104 insertions, 59 deletions) plus 4 new test files (`cli/test/guard.test.js`, `cli/test/step-plug009.test.js`, `cli/test/step-plug010.test.js`, `cli/test/step.test.js`) and `docs/changes/close-v2-gaps-rc6/`; entry points across `cli/src/step.js`, `cli/src/commands.js`, `cli/src/change.js`, `cli/src/handoff.js`, `cli/src/archive.js`, `cli/src/core.js`, `plugins/medra/hooks/guard.mjs`, `plugins/medra/skills/{run,verify,archive}/SKILL.md`, and `plugins/medra/references/{gate,portability}.md`; 0 dependency changes (`cli/package-lock.json` unchanged with 23 production dependency instances / 22 packages; `cli/package.json` version bumped from `2.0.0-rc.5` to `2.0.0-rc.6`).
- **Method:** code · configuration · dependencies · threat-model conformance
- **Tools:** `npm --prefix cli audit --json` (npm `9.2.0`, exit `0`, 0 vulnerabilities); `node plugins/medra/hooks/guard.mjs` (Node `v18.19.1`, exit `0`, read-only stdin test across 8 Bash payloads); `node cli/scripts/check-version.js` (Node `v18.19.1`, exit `0`); `node cli/scripts/check-bundle-drift.js` (Node `v18.19.1`, exit `0`); `trivy`, `semgrep`, and `gitleaks` not installed.

## Findings

### S-01 [medium] Hook gate matcher SEG stops on quoted shell metacharacters, allowing Claude Code subagent gate bypass

**Status:** open
**Confidence:** confirmed · **Origin:** manual
**CWE:** CWE-185, CWE-863 · **CVE:** n/a · **CVSS:** n/a
**Location:** `plugins/medra/hooks/guard.mjs:23,33-48` (synced at `cli/plugin/hooks/guard.mjs`) · TM-02, REQ PLUG-009
**Evidence:** Line 23 defines `const SEG = '[^\\n;|&]*';`, and lines 33-35 define `matchGate = (flag) => cmd.match(new RegExp(\`\\bmedra(?:\\.js)?\\s+gate\\s+(\\S+)\\s+(\\S+)${SEG}--${flag}\\b\`)) ?? cmd.match(new RegExp(\`\\bmedra(?:\\.js)?\\s+gate\\b${SEG}--${flag}\\b\`));`. Direct read-only execution of `node plugins/medra/hooks/guard.mjs` with `MEDRA_SUBAGENT` unset in the environment returned empty stdout (exit `0`, allowing the tool call) for:
- `{"agent_id":"sub-1","tool_name":"Bash","tool_input":{"command":"medra gate my-change verify --note \"a;b\" --approve"}}`
- `{"agent_id":"sub-1","tool_name":"Bash","tool_input":{"command":"medra gate my-change verify --note \"a|b\" --approve"}}`
- `{"agent_id":"sub-1","tool_name":"Bash","tool_input":{"command":"medra gate my-change verify --note \"a;b\" --request-changes"}}`
- `{"tool_name":"Bash","tool_input":{"command":"MEDRA_SUBAGENT=1 medra gate my-change verify --note \"a;b\" --approve"}}`
**Attack scenario:** A Claude Code subagent (which receives `input.agent_id` in `PreToolUse` hook input rather than `MEDRA_SUBAGENT=1` in its process environment unless prefixed), or prompt-injected instructions executed by a subagent, omits the `MEDRA_SUBAGENT=1 ` prefix and passes a semicolon, pipe, ampersand, or newline inside `--note` before `--approve` or `--request-changes` (e.g., `medra gate <change> verify --note "a;b" --approve`). `SEG` terminates at `;`, causing `matchGate` to return `null` so `guard.mjs` exits `0` without denying, and `requireCoordinator` (`cli/src/commands.js:154`) sees `process.env.MEDRA_SUBAGENT` unset and records the gate decision. Even when `MEDRA_SUBAGENT=1 ` is prefixed, `guard.mjs` fails to deny at the hook layer (falling back to CLI `requireCoordinator`). Coordinators passing `;`/`|`/`&`/`\n` in `--note` before `--approve` also bypass the `'ask'` prompt (and `--allow-test-edit` at line 55 shares the same `SEG` issue when `--run` contains `;`).
**Impact:** A Claude Code subagent can approve or reopen (`--request-changes`) any change gate without user confirmation or hook denial, bypassing `PLUG-009` and `TM-02`.
**Fix:** Parse Bash commands with quote-aware segment splitting (splitting only on unquoted `;`, `|`, `&`, `&&`, `||`, `\n`) instead of unquoted `[^\n;|&]*`, and deny any subagent (`cmdIsSubagent`) invoking `\bmedra(?:\.js)?\s+gate\b` unconditionally (since `medra gate` requires either `--approve` or `--request-changes` and has no safe subagent mode). Resync `cli/plugin/` via `npm --prefix cli run bundle-plugin`.
**Validation:** Add tests in `cli/test/guard.test.js` verifying `guard.mjs` returns `deny` for `agent_id` and `MEDRA_SUBAGENT=1` commands with `;`, `|`, `&`, and `\n` in `--note` before `--approve` / `--request-changes`, and `ask` for coordinator `--approve` with `;` in `--note`; re-run this audit on round 2.
**References:** https://cwe.mitre.org/data/definitions/185.html, https://cwe.mitre.org/data/definitions/863.html, https://owasp.org/Top10/
**Residual risk:** On Claude Code, subagents with arbitrary Bash access could still invoke Node directly without calling `medra`; on Antigravity, `PreToolUse` hooks are unavailable by platform design (`plugins/medra/references/portability.md:25`).

### S-02 [low] Hook cmdIsSubagent misses quoted, exported, and subshell MEDRA_SUBAGENT=1 assignments

**Status:** open
**Confidence:** confirmed · **Origin:** manual
**CWE:** CWE-185, CWE-693 · **CVE:** n/a · **CVSS:** n/a
**Location:** `plugins/medra/hooks/guard.mjs:32` (synced at `cli/plugin/hooks/guard.mjs`) · TM-02, REQ PLUG-009
**Evidence:** Line 32 reads `const cmdIsSubagent = isSubagent || new RegExp(\`(?:^|[\\s;|&])MEDRA_SUBAGENT=1\\s+${SEG}\\bmedra(?:\\.js)?\\b\`).test(cmd);`. Direct read-only stdin runs against `node plugins/medra/hooks/guard.mjs` (with `agent_id` and `env.MEDRA_SUBAGENT` unset) exited `0` with empty stdout (allowed) for:
- `export MEDRA_SUBAGENT=1; medra verify-fix my-change`
- `MEDRA_SUBAGENT="1" medra verify-fix my-change`
- `MEDRA_SUBAGENT=1 sh -c "true; medra verify-fix my-change"`
**Attack scenario:** When `input.agent_id` and `process.env.MEDRA_SUBAGENT` are absent in the hook environment, a Bash command setting `MEDRA_SUBAGENT=1` via quotes (`"1"`/`'1'`), a preceding `export` statement separated by `;`, or a wrapper subshell containing `;`/`|`/`&` before `medra` fails the regex at line 32, so `guard.mjs` does not classify the invocation as a subagent.
**Impact:** Weakens hook-layer enforcement in `guard.mjs`; actual execution of `medra gate` and `medra verify-fix` is still refused at CLI runtime by `requireCoordinator` (`cli/src/commands.js:153-160,463-464`) whenever `MEDRA_SUBAGENT=1` reaches the `medra` child process environment.
**Fix:** Use quote-aware Bash command segmentation and match `MEDRA_SUBAGENT=(?:1|"1"|'1')` (plus `export MEDRA_SUBAGENT=...` across prior segments in the same command) before any `medra` invocation.
**Validation:** Add test cases in `cli/test/guard.test.js` verifying `guard.mjs` returns `deny` for `MEDRA_SUBAGENT="1" medra verify-fix x`, `export MEDRA_SUBAGENT=1; medra verify-fix x`, and `MEDRA_SUBAGENT=1 sh -c "true; medra verify-fix x"`.
**References:** https://cwe.mitre.org/data/definitions/185.html, https://cwe.mitre.org/data/definitions/693.html
**Residual risk:** On runtimes without `PreToolUse` hooks (Antigravity), shell-level inspection does not run at all and enforcement depends on `MEDRA_SUBAGENT=1` remaining in the subagent's CLI environment (`plugins/medra/references/portability.md:25`).

### S-03 [info] Subagent prompt bodies embed unprefixed medra command templates alongside footer prefix rule

**Status:** open
**Confidence:** high · **Origin:** manual
**CWE:** CWE-693 · **CVE:** n/a · **CVSS:** n/a
**Location:** `cli/src/step.js:276,315,318,354,500` · TM-01, REQ PLUG-009
**Evidence:** For dispatched subagents, `withSubagentPrompt` (`cli/src/step.js:560-562`) appends `Run every \`medra\` command with the \`MEDRA_SUBAGENT=1\` prefix (e.g. \`MEDRA_SUBAGENT=1 medra ...\`).` and `prefixCmd` (`cli/src/step.js:559,573-574`) prefixes `fetch_command` and `exit_command`, whereas the prompt text itself still embeds unprefixed commands such as `Exit command: \`${exitCmd}\`` (`lines 318, 354`), `medra task done ${change} <T-ID> ...` (`lines 276, 315`), and `run \`medra suite ${change} --json\`` (`line 500`).
**Attack scenario:** An Antigravity subagent following `--md` or `--full` prompt instructions may copy the unprefixed inline `Exit command:` or `medra suite` snippet verbatim instead of prepending `MEDRA_SUBAGENT=1` from the footer rule.
**Impact:** Hardening only: `medra task done` and `medra suite` are permitted for subagents (`requireCoordinator` restricts `gate` and `verify-fix`, and line 500 explicitly states `(do not run \`medra verify-fix\`)`), so omitting `MEDRA_SUBAGENT=1` on those commands does not grant privileged access, though consistent prefixing prevents conditioning subagents to invoke unprefixed `medra` commands.
**Fix:** Prefix inline command snippets inside dispatched subagent prompts with `MEDRA_SUBAGENT=1 ` when `action !== 'inline'`, while keeping `inline` prompts unprefixed.
**Validation:** Extend `cli/test/step-plug009.test.js` to assert that dispatched `--md` and `--full` prompts do not emit unprefixed `Exit command: \`medra ` or `run \`medra suite` examples.
**References:** https://cwe.mitre.org/data/definitions/693.html
**Residual risk:** On Antigravity, subagent compliance with `MEDRA_SUBAGENT=1` remains an envelope-imposed convention rather than a runtime enforcement (`plugins/medra/references/portability.md:25`).

## Previous Findings

None.

## Threat Model Conformance

| Mitigation | Status | Evidence |
|---|---|---|
| TM-01 (`MEDRA_SUBAGENT=1` envelope prefixing + `--md`/`--full` prompt rule + gate SHA-256 hashes) | implemented | `cli/src/step.js:41,558-583`, `cli/src/change.js:89-104`, `cli/src/commands.js:153-160`, `cli/test/step-plug009.test.js` (hardening note `S-03`) |
| TM-02 (`hooks/guard.mjs` `MEDRA_SUBAGENT=1` and `agent_id` gate/`verify-fix` matching) | partial | `plugins/medra/hooks/guard.mjs:23,32-51`, `cli/test/guard.test.js:29-49`; bypassed via `;`/`|`/`&`/`\n` in `--note` (`S-01`) and missed for quoted/exported/subshell `MEDRA_SUBAGENT=1` (`S-02`) |
| TM-03 (Gate SHA-256 hashes and `medra validate` state/task tampering detection) | implemented | `cli/src/change.js:89-97`, `cli/src/validate.js:270-288`, `cli/src/commands.js:187`; Antigravity write-time `.medra.yaml`/`tasks.md` edits remain documented residual risk (`plugins/medra/references/portability.md:25`) |
| TM-04 (Pre-verify `medra suite` only on `not-run`/`stale`; `failed` returns `action: "gate"`) | implemented | `cli/src/change.js:241-245`, `cli/src/step.js:465-481`, `cli/src/commands.js:446-449`, `cli/test/step.test.js:35-150` |

## Limitations

- `trivy`, `semgrep`, and `gitleaks` are not installed in this environment, so no automated SAST or dedicated secret-scanning tool ran; secret and source checks relied on diff/file inspection, `grep`, and `npm --prefix cli audit --json`.
- `compileStep`'s `safeGitDiff` (`diffBase..HEAD`) returned an empty `<untrusted_data source="git-diff">` block because working-tree edits are uncommitted and `HEAD` equals `b3d7d06`; this audit examined `git diff b3d7d06` and untracked files directly.
- Full test suite execution (`npm --prefix cli test`) and live Claude Code / Antigravity runtime dispatch (`agent_id` injection and `invoke_subagent`) were not executed in this read-only audit; `guard.mjs` behaviors were verified directly via read-only stdin invocations of `node plugins/medra/hooks/guard.mjs`.
- The local Node runtime observed is `v18.19.1`, whereas `cli/package.json` declares `engines.node >= 20`.
- Dependency vulnerability verification against NVD, GitHub Advisory Database, and CISA KEV used `npm --prefix cli audit --json` and web search summaries (no direct `WebFetch` tool is available in this runtime; `cli/package-lock.json` had zero changes in this change).

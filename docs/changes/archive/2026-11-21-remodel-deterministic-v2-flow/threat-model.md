# Threat Model: remodel-deterministic-v2-flow

**Author:** security agent · 2026-11-21
**Stack:** Node.js >=20 (ESM) · commander ^12.1.0 · fast-glob ^3.3.3 · ignore ^5.3.2 · picomatch ^4.0.7 · yaml ^2.9.1 · Claude Code & Antigravity plugin runtimes

## Scope

- **In:** `medra step` compiler (`cli/src/step.js`, `cli/bin/medra.js`, `contracts/step-envelope.schema.json`), `resolveSafePath` (`cli/src/core.js`), task traceability validation (`cli/src/validate.js`), `models:` config (`docs/config-flow.yaml`), and thin coordinator skills (`plugins/medra/skills/*/SKILL.md`).
- **Out:** Legacy `medra context` / `medra handoff` behavior (unchanged per D-01), `medra archive` merge logic, `PreToolUse` guard hook implementation (`PLUG-004`), and external headless SDK runners (out of scope in `proposal.md`).

## Assets

- Host filesystem outside project `root` — `secret`: arbitrary read or pointer exposure leaks credentials (`.env`, `~/.ssh`) or host configuration.
- Subagent tool execution privileges — `confidential`: hijacked subagents can alter repo files, run shell commands, or corrupt verification verdicts.
- Workflow state & gate hashes (`.medra.yaml`, `tasks.md`) — `internal`: unauthorized or skipped transitions bypass human gates or TDD evidence.
- CLI process & subagent context availability — `internal`: unbounded diffs or oversized contracts crash `medra step` or truncate security-relevant review context.

## Trust Boundaries

| ID | Boundary | From → To |
|---|---|---|
| B-01 | CLI Input & Repo Filesystem | Untrusted repo markdown, `contracts/*`, `diff_base`, and symlinks → `medra step` / `medra validate` local Node.js process |
| B-02 | Compiled Prompt & Subagent Dispatch | `medra step` envelope (`prompt`, `embedded`, `pointers`) → Coordinator skill → Clean-context LLM subagent |
| B-03 | Runtime Model Configuration | `docs/config-flow.yaml` (`models:`) → Coordinator skill → Runtime subagent dispatcher (`Agent` / `invoke_subagent`) |

## Entry Points

- `medra step <change> [--stage <stage>] [--json]` (`B-01`) — reads `.medra.yaml`, `tasks.md`, `plan.md`, `contracts/*`, `docs/config-flow.yaml`, and `git diff` to emit `step-envelope.schema.json`.
- `resolveSafePath(root, relPath)` (`B-01`) — resolves backticked task paths and `contracts/*` file reads against project `root`.
- `medra validate <change> --stage tasks --json` (`B-01`) — parses `tasks.md` for `REQ`/scenario IDs and backticked file paths.
- Thin coordinator skills (`plugins/medra/skills/*/SKILL.md`, `skills/run/SKILL.md`) (`B-02`, `B-03`) — dispatch subagents with compiled `prompt` and `model.tier` (fallback `inherit`).

## Threats

| ID | STRIDE | Threat | Boundary | Severity | Likelihood | Mitigations |
|---|---|---|---|---|---|---|
| TM-01 | I, T | Path traversal or symlink escape in `resolveSafePath` exposes or reads host files outside `root` via crafted backticked task paths or `contracts/*` symlinks | B-01 | high | medium | M-01 |
| TM-02 | E, T | Indirect prompt injection in repo markdown, `contracts/*`, or `git diff` (including delimiter breakout) hijacks a subagent into running unauthorized tools or falsifying verdicts | B-02 | high | medium | M-02, M-03 |
| TM-03 | T, I | Argument injection via crafted `diff_base` or `-`-prefixed filenames in `git diff` alters git flags or leaks unintended output | B-01 | medium | low | M-04 |
| TM-04 | D | Unbounded `contracts/*` or large/binary `git diff` embedding in `verify` exceeds `maxBuffer` or exhausts subagent context, truncating reviewable changes | B-01 | medium | medium | M-05 |
| TM-05 | R, T | Subagent or coordinator in `fast` track or `legacy_fallback` omits `exit_command` or skips `medra validate`, leaving unverified state transitions | B-02 | medium | low | M-06 |
| TM-06 | D, E | Malformed `models:` config in `docs/config-flow.yaml` breaks subagent dispatch or selects an unintended model tier | B-03 | low | low | M-07 |

## Mitigations

<!-- The security agent writes `pending`; the author replaces it with `accepted (D-NN)` or `declined (D-NN)` before the plan gate. -->

| ID | Mitigation | Threats | Decision |
|---|---|---|---|
| M-01 | Canonicalize `root` and target with `fs.realpathSync` (or nearest existing ancestor for new files), reject absolute paths, null bytes, and `..` escapes, and enforce `realTarget === realRoot \|\| realTarget.startsWith(realRoot + path.sep)` | TM-01 | accepted (D-06) |
| M-02 | Wrap all repo-derived text, `contracts/*`, and `git diff` in explicit data fences with neutralized closing tags and system instructions marking embedded content as untrusted data only | TM-02 | accepted (D-07) |
| M-03 | Enforce execution boundaries outside the LLM: keep `PreToolUse` guards active for CLI-owned files, require human approval at coordinator gates, and compute `exit_command`/`pointers` deterministically in `medra step` | TM-02 | accepted (D-07) |
| M-04 | Invoke `git` only via `execFileSync` (`shell: false`), validate `diff_base` against a strict ref/SHA allowlist rejecting leading `-`, and pass `--` before path operands | TM-03 | accepted (D-06) |
| M-05 | Enforce per-file and total byte/line caps on embedded `contracts/*` and `git diff` in `verify`, exclude binary diffs, and emit an explicit truncation notice with `pointers` fallback | TM-04 | accepted (D-08) |
| M-06 | Derive `action` and `exit_command` strictly from `.medra.yaml` and `tasks.md` in `medra step`, and require coordinators to re-run `medra step --json` after every subagent return | TM-05 | accepted (D-07) |
| M-07 | Validate `models:` entries in `loadConfig` / `configWarnings` (non-empty strings, known role/stage keys, `inherit` default) and fall back to `inherit` if the runtime rejects a tier | TM-06 | accepted (D-09) |

## Residual Risks

- TM-02: Delimiters and prompt instructions (M-02) are defense-in-depth only and cannot prevent all semantic prompt-injection attacks; residual risk remains bounded by M-03 (external `PreToolUse` guards, human gates, and deterministic CLI state) and would drop further only with OS/sandbox tool-scope restrictions per subagent role.
- TM-04: Capping embedded `git diff` and `contracts/*` (M-05) prevents CLI buffer crashes, but very large diffs will require the `reviewer` or `security` subagent to inspect truncated files via `pointers`.

## Sources

- https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html — M-01 (canonicalization, `realpath()` symlink resolution, and trailing directory-separator prefix containment).
- https://nodejs.org/en/learn/getting-started/security-best-practices — M-01 (`fs.realpathSync()` and `path.sep` containment in Node.js).
- https://genai.owasp.org/llmrisk/llm01-prompt-injection/ — M-02, M-03 (OWASP LLM01 indirect prompt injection, delimiter limitations, external privilege separation, and human-in-the-loop gates).
- https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html — M-04 (`execFile` without shell, `--` end-of-options marker, and strict input allowlisting).

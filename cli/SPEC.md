# `medra` CLI — Specification

This is the contract for the `medra` command-line tool. It is written for the engineer who will implement it. The medra skills (`plugins/medra/skills/`) call these commands exactly as specified here. Every command, flag, file format, exit code and JSON shape is load-bearing: a skill depends on it, so changing one means changing the skills in the same release.

## 1. Scope and principles

- **Deterministic, with no model calls.** The CLI owns every operation that has one correct answer: scaffolding, parsing, validation, state, gates, checkpoints, merge, context packing, coverage, the learnings store, and installation. Judgment stays with the agents.
- **Agents never hand-edit CLI-owned data.** These are `.medra.yaml`, `docs/changes/archive/INDEX.md`, the task checkboxes and evidence lines in `tasks.md`, the status and version lines of `constitution.md`, and the store structure of `learnings.md`. The CLI is their only writer.
- **Atomic writes.** Every command that writes several files writes to temporary files first and renames them only once all writes have succeeded. A failed command leaves no partial state.
- **Machine and human output.** Every command takes `--json`. Without it, the CLI prints a short human summary; with it, it prints exactly one JSON object to stdout. Diagnostics go to stderr.
- **Runtime and packaging.**
  - Node.js ≥ 20, ESM, published to npm as `@medra.dev/flow` with the binary name `medra`. npm dependencies are allowed and encouraged: a Markdown AST parser (`unified`/`remark`), `yaml`, `fast-glob`, `commander` or `yargs`, `semver`.
  - The package bundles a copy of `plugins/medra/` (skills and agents) at publish time, for `medra install`.
  - `package.json` `version` equals `plugins/medra/.claude-plugin/plugin.json` `version`, and CI fails when they differ.
- **Supported major.** The skills require major version `1`. `medra --version` prints the bare semver (`1.4.0`).

## 2. Exit codes

| Code | Meaning | Skill reaction |
|---|---|---|
| `0` | Success | Continue |
| `1` | Refused: a validation failure or an unmet precondition. JSON carries `findings` | Fix what the findings name, then retry |
| `2` | Usage error (unknown command or flag, bad argument) | Defect in the skill; stop and report |
| `3` | Merge conflict (`archive` only). JSON carries `conflicts` | Resolve as described in §9 |
| `4` | Environment error: not a medra project, file missing or unreadable, test command not found | Stop and report to the user |

Every failure JSON has the shape `{"ok": false, "code": <n>, "findings": [Finding]}`, where a Finding is:

```json
{ "rule": "tasks.test-before-impl", "severity": "error", "file": "docs/changes/add-reset/tasks.md", "line": 14, "message": "T005 implements AUTH-004 but is not after its [TEST] task T004", "ref": "T005", "remediation": "Add \"after T004\" to task T005 before implementing AUTH-004" }
```

`severity` is `error` or `warning`; only an `error` causes exit `1`. `remediation` is an optional prescriptive hint explaining the exact action or template to satisfy the rule. `rule` IDs are stable and documented in §6.

## 3. Project layout

```
docs/
├── config-flow.yaml
├── constitution.md
├── learnings.md
├── specs/<capability>/spec.md
└── changes/
    ├── <change>/
    │   ├── .medra.yaml
    │   ├── proposal.md
    │   ├── specs/<capability>/spec.md      # delta specs
    │   ├── plan.md                         # full track only
    │   ├── threat-model.md                 # security-relevant full-track changes only
    │   ├── contracts/                      # optional, free-form
    │   ├── tasks.md
    │   └── reviews/<YYYY-MM-DD>-<stage>-<reviewer>.md   # verify: …-verify-agent-r<round>.md; security: …-security-agent-r<round>.md
    └── archive/
        ├── INDEX.md
        └── <YYYY-MM-DD>-<change>/
```

- **Project root:** the nearest ancestor directory containing `docs/config-flow.yaml`. Every command except `init`, `install` and `--version` exits `4` outside a project.
- **Layout migration (from 1.0).** Version 1.0 kept the documents in `medra/`, with the config at `medra/config.yaml`. When the nearest project root has that layout, every command (and `init` run at that root) first migrates it:
  - It moves each entry of `medra/` into `docs/` (renaming `config.yaml` to `config-flow.yaml`) with `git mv` when the entry is tracked, and with a plain rename otherwise.
  - It re-signs every approved gate whose 1.0 hash still matches (§7), so a gate valid before the move stays valid.
  - It regenerates the Antigravity install when that integration is configured.
  - It prints a notice to stderr and adds `"migration": {"from", "to", "moved", "gates_rehashed"}` to the command's JSON.
  - When any target already exists in `docs/`, it refuses with exit `1` and `layout.collision` findings, and moves nothing.
- **Names:**
  - A `<capability>` matches `^[a-z][a-z0-9-]{1,40}$`.
  - A `<change>` matches `^[a-z][a-z0-9]*(-[a-z0-9]+){1,7}$` (kebab-case, at least two words).
- **Identity (`--by`):** defaults to `git config user.name`, then `$USER`.

## 4. File formats

All Markdown is parsed by a block-level tokenizer that finds headings, labelled lines and tables while skipping fenced code; it never matches regular expressions over the whole file. Merges splice requirement blocks byte-for-byte, so prose is never reformatted. Headings and bold labels are matched exactly and case-sensitively. Prose may be in any language; the structural tokens below are always in English.

### 4.1 `docs/config-flow.yaml`

```yaml
version: 1
language: pt-BR                 # BCP-47 tag; the language of document prose
integrations: [claude, antigravity]
testing:
  mode: tdd                     # tdd | test-after | none
  command: "npm test --"        # optional; base command for --run
  checks: ["npm run lint"]      # optional; static checks (lint, typecheck) run on green implementation tasks
  paths: ["test/**", "**/*.test.*", "**/*_test.*", "tests/**"]
learning:
  max_active: 40
  promote_after: 3
  stale_after: 10               # archived changes without a bump
  context_max: 10               # learnings per context pack
```

Missing keys take the defaults shown. Unknown keys produce a warning.

### 4.2 Constitution — `docs/constitution.md`

```markdown
# Constitution

**Status:** draft | ratified
**Version:** 1.0
**Ratified:** 2026-10-29
**Last amended:** 2026-10-29

## Articles

### Article I: Library-first
{principle prose, using MUST / MUST NOT}

**Gate:** {a yes/no question a plan answers}
**Rationale:** {why}

## Amendments

| Version | Date | Change | Source |
|---|---|---|---|
| 1.0 | 2026-10-29 | Ratified | init |
```

- Articles match `### Article <Roman>: <title>`. Roman numerals are sequential and never reused; a retired article stays, with `**Retired:** <version>` in place of its Gate.
- Each live article has exactly one `**Gate:**` line.
- The CLI owns `Status`, `Version`, `Ratified`, `Last amended` and the rows of the Amendments table (§8.9). While Status is `draft`, the Version, Ratified and Last amended lines are absent and validation does not require them.

### 4.3 Living spec — `docs/specs/<capability>/spec.md`

```markdown
# {Capability title}

**Capability:** `auth`
**ID prefix:** `AUTH`

## Purpose

{1–3 sentences}

## Requirements

### REQ AUTH-001: {title}

{Statement containing SHALL (or SHALL NOT). One requirement per block.}

#### Scenario AUTH-001.S1: {title}

- **Given** {precondition}
- **And** {more precondition}
- **When** {action}
- **Then** {observable outcome}
- **But** {negative outcome}
```

- **ID prefix:** `^[A-Z][A-Z0-9]{1,9}$`, unique across capabilities.
- **Requirement ID:** `<PREFIX>-<NNN>` (three or more digits). **Scenario ID:** `<REQ-ID>.S<n>`.
- **Requirement block:** extends from its `### REQ` heading to the next `### REQ` or `##` heading.
- **Scenario steps:** a list whose items begin with a bold keyword from `Given`, `When`, `Then`, `And`, `But`. Each scenario has at least one `When` and one `Then`, and `Given` comes before `When`.
- **Retired IDs:** a requirement or scenario ID that has been removed is recorded in the HTML comment `<!-- retired: AUTH-002, AUTH-001.S3 -->` directly under `## Requirements`, and is never reassigned. The CLI owns that comment.

### 4.4 Delta spec — `docs/changes/<change>/specs/<capability>/spec.md`

```markdown
# Delta: {capability title}

**Capability:** `auth`
**ID prefix:** `AUTH`            <!-- required only when the capability is new -->
**Retire capability:** yes       <!-- optional; only with REMOVED covering every requirement -->

## Purpose                       <!-- required only when the capability is new -->

{1–3 sentences}

## ADDED Requirements

### REQ AUTH-004: {title}
{full block, as in 4.3}

## MODIFIED Requirements

### REQ AUTH-002: {new or same title}
{full replacement block: statement and every scenario that remains}

## REMOVED Requirements

### REQ AUTH-001: {title}

**Reason:** {why}
**Migration:** {what replaces it, or "None"}
```

- Only the three operation headings are allowed, in this order. An empty operation section is omitted, and at least one must be present.
- A **new capability** is a delta whose capability has no living spec. It requires an `ID prefix` and a `Purpose`, and allows only ADDED.
- **Scenarios inside a MODIFIED block:**
  - A scenario ID that exists in the living requirement keeps its ID.
  - A new scenario takes the next free `S<n>`.
  - A living scenario left out of the MODIFIED block is removed, and its ID is retired.

### 4.5 Proposal — `docs/changes/<change>/proposal.md`

Required headings, in order:

- `# Proposal: <change>`
- `## Why`
- `## What Changes`
- `## Scope`, containing `### In scope` and `### Out of scope`
- `## Track`, containing the lines `**Track:** fast|full` and `**Rationale:** …`, then `**Security:** relevant|not-relevant` and `**Security rationale:** …`. A proposal written before 1.4 has no Security line and reads as `not-relevant`
- `## Capabilities`, containing a table with the columns `Capability | Operation | Requirements`. Operation is `new`, `modified` or `removed`. Requirements lists IDs, or `—` for a new capability.
- `## Impact`
- `## Open Questions`

### 4.6 Plan — `docs/changes/<change>/plan.md`

Required anchor headings, in this order: `# Plan: <change>`, `## Summary`, `## Constitution Check`, `## Complexity Tracking`, `## Test Strategy`, `## Decisions`. Any number of free-form `##` sections may sit between `## Test Strategy` and `## Decisions`.

- **`## Constitution Check`** is a table with the columns `Article | Gate | Result | Note`. Result is `pass`, `fail` or `n/a`, and `n/a` requires a Note.
- **`## Complexity Tracking`** is either the single line `None.` or a table with the columns `Article | Violation | Justification | Simpler alternative rejected because`.
- **`## Decisions`** holds `### D-<NN>: <title>` subsections, each with the lines `**Choice:**`, `**Alternatives:**` and `**Rationale:**`.
- **`## Test Strategy`**, when `testing.mode` is `none`, must contain the line `No automated tests.` followed by a reason.

### 4.7 Tasks — `docs/changes/<change>/tasks.md`

```markdown
# Tasks: add-password-reset

## Phase 1: Setup

- [ ] T001 [P] Add the reset-token table migration in `db/migrations/` — verify: migration applies and rolls back

## Phase 2: AUTH-004 Password reset request

- [ ] T002 [TEST] [AUTH-004] Write tests for AUTH-004.S1, AUTH-004.S2 in `test/auth/reset.test.ts` — verify: tests fail (red)
- [ ] T003 [AUTH-004] after T002, T001 Implement the reset request handler in `src/auth/reset.ts` — verify: T002 tests pass (green)
```

**Task line grammar** (one list item, a single line):

```
- [ ] T<NNN> [P]? [TEST]? [<REQ-ID>(, <REQ-ID>)*]? (after T<NNN>(, T<NNN>)*)? <description> — verify: <verification>
```

- Tokens appear in the order shown. The em dash `—` before `verify:` is required.
- `T<NNN>` IDs are unique and never renumbered.
- `[P]` marks a task with no dependencies inside its phase.
- **Evidence lines** are owned by the CLI and written as nested list items directly under the task:

```
  - evidence red 2026-10-29: `npm test -- reset` exit 1 — "Expected 202, received 404"
  - evidence green 2026-10-29: `npm test -- reset` exit 0
```

The CLI flips `[ ]` to `[x]` only through `task done`.

### 4.8 Review report — `docs/changes/<change>/reviews/<YYYY-MM-DD>-<stage>-<reviewer>.md`

A verify report written by the check carries its round as a suffix: `<YYYY-MM-DD>-verify-agent-r<round>.md`. The **latest** `verify` report is the one with the highest round; a file without the suffix ranks below every suffixed one, and the modification time breaks ties.

The required lines are `**Stage:** proposal|plan|tasks|verify`, `**Verdict:** approve|request-changes|comment|pass|pass-with-findings|fail`, and `**Counts:** critical <n> · major <n> · minor <n>`. The rest follows `medra:template-review`. The CLI reads only these three lines.

### 4.8a Security report — `docs/changes/<change>/reviews/<YYYY-MM-DD>-security-agent-r<round>.md`

Written by the security agent's audit; the round suffix and the "latest" rule are those of §4.8. The required lines are `**Stage:** security`, `**Verdict:** pass|pass-with-findings|fail`, and `**Counts:** critical <n> · high <n> · medium <n> · low <n> · info <n>`. The rest follows `medra:template-security-report`. The CLI reads only these three lines, and a `security` report never counts as a `verify` report.

### 4.8b Threat model — `docs/changes/<change>/threat-model.md`

Required anchor headings, in this order: `# Threat Model: <change>`, `## Scope`, `## Assets`, `## Trust Boundaries`, `## Entry Points`, `## Threats`, `## Mitigations`, `## Residual Risks`, `## Sources`.

- **`## Threats`** is a table with the columns `ID | STRIDE | Threat | Boundary | Severity | Likelihood | Mitigations`. ID is `TM-<NN>`; STRIDE is one or more of `S T R I D E`; Severity is `critical|high|medium|low|info`; Likelihood is `high|medium|low`; Mitigations lists `M-<NN>` IDs or `—`.
- **`## Mitigations`** is a table with the columns `ID | Mitigation | Threats | Decision`. ID is `M-<NN>`; Threats lists `TM-<NN>` IDs; Decision is `pending`, `accepted (D-<NN>)` or `declined (D-<NN>)`, where `D-<NN>` is a Decision in plan.md.
- IDs are unique and never renumbered.

### 4.9 Learnings — `docs/learnings.md`

```markdown
# Learnings

## Active

### L-007 [lesson] Token expiry must be tested at the boundary

**Statement:** {one or two sentences, imperative}
**Scope:** capabilities: auth · paths: src/auth/** · stages: plan, tasks, apply
**Evidence:** add-password-reset, fix-token-expiry
**Occurrences:** 2
**Last seen:** 14

## Promoted

### L-003 [lesson] … 
**Promoted:** Article VII (v1.2)

## Retired

### L-002 [preference] …
**Retired:** merged into L-007 | stale | {reason}
```

- Type is `lesson` or `preference`. Stages are a subset of `propose, plan, tasks, apply, verify, review`.
- `Last seen` is the archive sequence number: the INDEX row count at the time of the bump.
- The CLI owns every field and line. Agents supply only the content, through §8.10.

### 4.10 Change state — `.medra.yaml`

```yaml
change: add-password-reset
created: 2026-10-29
track: fast                       # fast | full
phase: proposed                   # proposed | planned | tasked | implementing | verified | archived
diff_base: 3f2a9c1                # git HEAD at `medra new`, or none
gates:
  proposal: { status: approved, by: Tiago, at: 2026-10-29T14:02:11Z, hash: <sha256>, note: null }
  plan:     { status: pending }
  tasks:    { status: pending }
  verify:   { status: pending }
gate_notes:                       # every request-changes note, kept for harvest
  - { gate: proposal, by: Tiago, at: …, note: "split the email template into its own task" }
reviews:
  - { stage: plan, by: Ana, at: …, verdict: request-changes, report: reviews/2026-10-30-plan-ana.md }
track_history:
  - { from: fast, to: full, at: …, reason: "touches the session contract" }
blockers:
  - { task: T005, at: …, note: "SMTP sandbox unavailable", resolved: false }
last_task_done_at: 2026-10-30T10:12:44Z   # set by `task done`; `verify.report` compares the report against it
handoff_snapshots:                # set by `medra handoff` (§8.16); never part of a gate hash
  check: { 1: { src/auth/reset.js: <sha256> }, 2: { … } }
  audit: { 1: { … } }
```

- **Gate `hash`:** the SHA-256 over the stage's documents (see §7), taken at approval.
- **Stale gates:** `status` reports a gate as `stale` when the current hash differs from the stored one. A stale gate counts as not approved.

### 4.11 Archive index — `docs/changes/archive/INDEX.md`

```markdown
# Archive

| # | Date | Change | Capabilities | Requirements | Why |
|---|---|---|---|---|---|
| 14 | 2026-10-29 | add-password-reset | auth | +AUTH-004 ~AUTH-002 -AUTH-001 | Users locked out had no self-service path |
```

The Requirements cell uses the prefixes `+` (added), `~` (modified) and `-` (removed). The Why cell holds the first sentence of the proposal's `## Why`, truncated to 120 characters.

## 5. Stage documents and gates

| Gate | Stage documents (hashed) | Prerequisite | Sets phase |
|---|---|---|---|
| `proposal` | proposal.md and every delta; on the fast track also tasks.md | — | `proposed` (full) or `tasked` (fast) |
| `plan` | plan.md, `contracts/**`, and threat-model.md when present | `proposal` approved; track `full` | `planned` |
| `tasks` | tasks.md, ignoring checkboxes and evidence lines | `plan` approved | `tasked` |
| `verify` | every stage document, plus the latest `verify` review report (§4.8) and, when present, the latest `security` report (§4.8a) | every task done; `tasks` approved (full) or `proposal` approved (fast) | `verified` |

On the fast track there are no `plan` or `tasks` gates, and `status` reports them as `skipped`.

## 6. Validation rules

`medra validate <change> --stage <stage>` runs the rules of that stage and of every earlier stage. `medra validate --project <constitution|specs|learnings>` runs project-level rules. Each rule ID below is the `rule` field of a Finding.

| Rule ID | Stage | Check |
|---|---|---|
| `constitution.structure` | constitution | Headings, status lines and article grammar as in §4.2 |
| `constitution.gate` | constitution | Every live article has exactly one `**Gate:**` line |
| `spec.structure` | specs | §4.3 grammar; ID prefix unique across capabilities |
| `spec.shall` | specs | Every requirement statement contains `SHALL` |
| `spec.scenario` | specs | Every requirement has ≥ 1 scenario; each scenario has a When and a Then, with Given before When |
| `spec.ids` | specs | IDs carry the capability's prefix, are unique, and none is retired |
| `proposal.structure` | proposal | §4.5 headings; the Track value equals the `.medra.yaml` track |
| `proposal.security` | proposal | When a `**Security:**` line is present, its value is `relevant` or `not-relevant` and a `**Security rationale:**` line follows it |
| `proposal.markers` | proposal | Zero occurrences of `[NEEDS CLARIFICATION` in proposal.md and the deltas |
| `proposal.capabilities` | proposal | Every Capabilities row has a delta file, every delta file has a row, and the operations match |
| `proposal.impact` | proposal | The Impact section has a `**Code:**`, `**Interfaces:**`, `**Data:**` and `**Dependencies:**` line, each with a value that is not a template placeholder |
| `proposal.open-questions` | proposal | With no marker left, the body of Open Questions is exactly `None.` |
| `delta.structure` | proposal | §4.4 grammar, plus the `spec.shall` and `spec.scenario` rules applied to delta blocks |
| `delta.targets` | proposal | ADDED IDs are absent from the living spec and not retired; MODIFIED and REMOVED IDs exist in the living spec |
| `delta.new-capability` | proposal | A new capability has an ID prefix and a Purpose, and contains only ADDED |
| `plan.structure` | plan | §4.6 anchors, in order |
| `plan.markers` | plan | Zero occurrences of `[NEEDS CLARIFICATION` in plan.md |
| `plan.constitution` | plan | The Constitution Check has exactly one row per live article; every `pass` has a Note, and every `fail` has a Complexity Tracking row |
| `plan.threat-model` | plan | Proposal `**Security:** relevant`: threat-model.md exists and follows §4.8b, every Threat names a Mitigation or `—`, every Mitigation names an existing Threat, and no Decision is `pending`; every `accepted`/`declined` `D-<NN>` exists in plan.md |
| `plan.test-strategy` | plan | Present; when the mode is `none`, the `No automated tests.` line is present with a reason; otherwise every scenario ID of the ADDED and MODIFIED requirements appears in the section, where a range such as `AUTH-004.S1–S3` counts for each ID inside it |
| `tasks.structure` | tasks | Every task line parses per §4.7; IDs are unique |
| `tasks.after` | tasks | Every `after` reference exists and points to a task listed earlier |
| `tasks.coverage` | tasks | Every ADDED or MODIFIED requirement is referenced by ≥ 1 task |
| `tasks.mitigations` | tasks | Every Mitigation `accepted` in threat-model.md is cited (`M-<NN>`) in ≥ 1 task line |
| `tasks.test-task` | tasks | Mode `tdd` or `test-after`: every ADDED or MODIFIED requirement has ≥ 1 `[TEST]` task |
| `tasks.test-before-impl` | tasks | Mode `tdd`: every non-test task that references requirement R is `after` (directly or transitively) a `[TEST]` task referencing R |
| `verify.tasks-done` | verify | Every task is `[x]` with at least one evidence line |
| `verify.coverage` | verify | Mode `tdd` or `test-after`: `coverage` reports no uncovered scenario among the change's ADDED and MODIFIED requirements |
| `verify.report` | verify | The latest `verify` review report (§4.8) exists, is newer than the last task done, and has Verdict `pass` or `pass-with-findings` |
| `verify.security-report` | verify | Proposal `**Security:** relevant`: the latest `security` report (§4.8a) exists and is newer than the last task done. Its verdict is not checked: security findings inform the gate and never block it |
| `learnings.structure` | learnings | §4.9 grammar; IDs unique |

## 7. Hashing

A stage's hash is the SHA-256 over the stage documents' content, each prefixed by its path relative to the change folder, concatenated in sorted path order, with line endings normalized to `\n`. Change-relative paths keep gates valid when the documents directory moves; 1.0 used root-relative paths (`medra/changes/<change>/…`), which the layout migration recognizes once. For tasks.md, the CLI strips the checkbox state and the evidence lines before hashing, so ticking tasks does not make the `tasks` gate stale.

## 8. Commands

All commands accept `--json`. The JSON in this section shows the success payload; every success payload also carries `"ok": true`.

### 8.1 `medra init`

```
medra init [--language <tag>] [--integrations claude,antigravity] [--testing-mode tdd|test-after|none] [--testing-command "<cmd>"]
```

- Creates any of these that are missing, and never overwrites existing files: `docs/config-flow.yaml`, `docs/specs/`, `docs/changes/archive/INDEX.md` (header only), `docs/learnings.md` (headings only), and `docs/constitution.md` holding the single line `**Status:** draft`.
- When `integrations` includes `antigravity`, runs §8.13 with `--scope workspace`.
- Result: `{"created": [paths], "existing": [paths], "config": {…}}`. Exit `0` even when everything already exists.

### 8.2 `medra new <change>`

```
medra new <change> [--track fast|full]
```

- Validates the name, then creates the change folder with `specs/` and `reviews/`, and writes `.medra.yaml` with `diff_base` set to the git HEAD (`none` outside git) and the track defaulting to `fast`.
- Refuses with exit `1` when the change exists, when the name is invalid, or when the constitution is not `ratified`.
- Adds a warning when the archive INDEX holds a change with the same name.
- Result: `{"change", "path", "track"}`.

### 8.3 `medra status [<change>]` · `medra drift`

- **Without a change:** returns `{"project": {"constitution": {status, version}, "capabilities": n, "learnings": {active, over_budget}}, "changes": [{name, track, phase}], "drift"?: [{capability, paths, changed_files, since_commit}]}`. The changes list is bounded by the number of active changes. `drift` lists capabilities with `**Paths:**` whose matching code files were modified in git (since the living spec's last commit, or in the working tree) without an active change covering that capability. `medra drift` returns `{"drifted": [...]}` directly.
- **With a change:** returns `{"change", "track", "phase", "security": "relevant"|"not-relevant", "gates": {name: {status: pending|approved|changes-requested|stale|skipped, by, at}}, "tasks": {"total", "done", "next": "T004"|null}, "blockers_open": n, "reviews": n, "last_review": {stage, verdict}|null, "last_security": {path, round, verdict}|null}`. `security` comes from the proposal's `**Security:**` line, `not-relevant` when the line is absent.

### 8.4 `medra validate <change> --stage <stage>` · `medra validate --project <scope>`

Runs the rules in §6. Exit `0` with `{"findings": [warnings]}`, or exit `1`.

### 8.4a `medra fix [change] [--file <path>]`

Deterministically auto-remediates mechanical validation errors in change documents without requiring LLM generation turns. It repairs structure and never supplies judgment: whatever it cannot derive from disk it writes as a `[NEEDS CLARIFICATION: …]` marker, which `proposal.markers` and `plan.markers` report, so a fixed document cannot pass a gate on content nobody decided.
- **`plan.md`:** Corrects the title; ensures required anchors (`Summary`, `Constitution Check`, `Complexity Tracking`, `Test Strategy`, `Decisions`) exist in canonical sequence, a missing `Summary` or `Test Strategy` holding a marker; adds a row for each live article missing from the `Constitution Check` table with result `pending` and a marker note, which `plan.constitution` refuses until the author sets `pass`, `fail` or `n/a`.
- **`proposal.md`:** Corrects the title; reconciles the `## Capabilities` table against actual spec deltas on disk; aligns `**Track:**` with `.medra.yaml`; adds missing required sections and a missing `**Rationale:**` as markers. It never adds or changes `**Security:**`, because that line decides whether the security agent runs.
- Returns `{"change", "fixed": ["<doc>: <action>", …]}`. Exit `0` always.

### 8.5 `medra index [--learnings <capability,…>] [--md]`

- Returns a bounded project overview for agents that do not yet have a change: `{"constitution": [{article, title}], "capabilities": [{name, prefix, paths?, purpose, next_id, requirements: [{id, title}]}], "active_changes": [{name, phase, capabilities}], "learnings": {"active": n}}`. `next_id` is the first requirement ID above every living and retired ID in that capability.
- `--learnings <capability,…>` adds `"matching_learnings"`: active entries scoped to any listed capability or its declared `**Paths:**`, or unscoped, capped at `learning.context_max`, as `{id, type, title, statement}`.
- `purpose` holds only the first sentence. Requirement and scenario bodies are never included. With `--md` (or without `--json`), prints a compact Markdown summary.

### 8.6 `medra context <change> --stage <stage>`

```
medra context <change> --stage propose|plan|tasks|apply|verify|review|archive [--json|--md]
```

The CLI's main token-saving tool. It returns only what the stage needs:

| Field | Stages | Content |
|---|---|---|
| `constitution` | plan, tasks, review, verify | Every live article: `{article, title, gate}` |
| `requirements` | propose, plan, tasks, review, verify, archive | For each requirement the change touches: the `delta` block in full and the `living` block (for MODIFIED, scenarios byte-identical to the delta are collapsed to a one-line `*(unchanged in delta)*` marker; for REMOVED, in full), plus `last_changed_by` (the archive folder path from INDEX, or `null`). Omitted in `apply`, where `next_task.requirements` carries only the current task's requirements |
| `siblings` | propose, plan, review | The `{id, title}` of the other requirements in the touched capabilities |
| `learnings` | all | Active entries whose scope matches the change (§8.10 matching, including capability `**Paths:**`), most occurrences first, capped at `learning.context_max`: `{id, type, title, statement}` |
| `gate_notes` | all | Open request-changes notes for the stage's own gate |
| `documents` | all | The paths of the change documents that exist |
| `test_strategy` | apply, verify | The plan's `## Test Strategy` section text (full track), or `null` |
| `next_task` | apply | The first unticked task whose `after` dependencies are all done: `{id, line, requirements: [full blocks of the requirements it references], phase_title}` |
| `parallel_batch` | apply | Present when `next_task` is marked `[P]` and ≥ 2 `[P]` tasks of the same phase and kind (`[TEST]` vs implementation) have all `after` dependencies done (up to 3 tasks) |
| `remaining` | apply | Count of unticked tasks |
| `coverage` | verify | The output of §8.11 for the change |

With `--md`, the CLI prints the same content as Markdown, for runtimes where an agent reads stdout as text.

### 8.7 `medra gate <change> <gate> --approve|--request-changes`

```
medra gate <change> proposal|plan|tasks|verify (--approve [--note "<text>"] | --request-changes --note "<text>") [--by <name>]
```

- **`--approve`:** runs `validate --stage <gate>` and checks the prerequisite in §5. When either fails, exits `1` with findings and records nothing. When both pass, records `approved` with by, at, hash and the optional note, and sets the phase. The verify pipeline uses the note to record each security finding accepted as residual risk (`accepted-risk: S-03 — <reason>`), which archive harvests.
- **`--request-changes`:** requires `--note`. Records the gate as `changes-requested` and appends the note to `gate_notes`.
- Result: `{"gate", "status", "phase"}`.

### 8.8 `medra track <change> fast|full --reason "<text>"`

- **Fast → full:** keeps the `proposal` gate when it is approved, sets the `plan` and `tasks` gates to `pending`, and sets the phase to `proposed`. Existing tasks.md is kept, and it is re-gated at `tasks`.
- **Full → fast:** allowed only before the `plan` gate is approved.
- Records the switch in `track_history`. Result: `{"track", "phase"}`.

### 8.9 `medra constitution ratify`

```
medra constitution ratify [--bump major|minor] --note "<text>" [--source <init|L-NNN>] [--by <name>]
```

- **Validation:** runs `validate --project constitution` and refuses on failure.
- **First ratification:** sets Status `ratified`, Version `1.0`, and the Ratified and Last amended dates.
- **Later ratifications:** require `--bump`. They increment the version, set Last amended, and append an Amendments row.
- Result: `{"version"}`.

### 8.10 `medra learn …`

```
medra learn add --type lesson|preference --title "<t>" --statement "<s>" --change <c> [--capabilities a,b] [--paths "<glob>,<glob>"] [--stages plan,apply]
medra learn bump <L-NNN> --change <c>
medra learn merge <L-src> --into <L-dst>
medra learn retire <L-NNN> --reason "<text>"
medra learn promote <L-NNN> --article <Roman>
medra learn status
medra learn candidates
```

- **`add`:** assigns the next `L-NNN` and sets Occurrences to 1, Last seen to the current archive sequence, and Evidence to the change. A scope with no capabilities, paths or stages matches everything.
- **`bump`:** increments Occurrences, appends the change to Evidence (without duplicates), and updates Last seen.
- **`merge`:** adds the source's occurrences and evidence to the destination, then retires the source with `merged into <dst>`.
- **`retire` / `promote`:** move the entry to its section, adding a reason (retire) or the article and constitution version (promote).
- **`status`:** returns `{"active": n, "max_active": n, "over_budget": bool, "stale": [ids where current_sequence - last_seen ≥ stale_after], "candidates": n}`. The `stale` list is bounded by `max_active`.
- **`candidates`:** returns `[{id, title, occurrences}]` for active lessons with occurrences ≥ `promote_after`. Preferences are never candidates.
- **Scope matching (used by `context`):** an entry matches when any of its capabilities is touched by the change, or any of its path globs matches a path named in the change's tasks.md or plan.md, and (when stages are set) the requested stage is listed.

### 8.11 `medra coverage <change> | --all`

- Scans files matching `testing.paths` (respecting `.gitignore`) for scenario IDs matching `\b[A-Z][A-Z0-9]{1,9}-\d{3,}\.S\d+\b`.
- **For a change:** reports every scenario in its ADDED and MODIFIED blocks. **With `--all`:** reports every scenario in the living specs.
- Result: `{"scenarios": n, "covered": n, "uncovered": [ids], "locations": {id: ["file:line"]}}`. `locations` is capped at 3 per ID. Always exits `0`; validation consumes the result.

### 8.12 `medra task …`

```
medra task context <change> [task] [--json|--md]
medra task done <change> <T-NNN> (--run "<command>" | --evidence "<text>") [--kind red|green|manual] [--allow-test-edit]
medra task block <change> <T-NNN> --note "<text>"
medra task unblock <change> <T-NNN>
```

`context` returns a smart-sliced, bounded context pack for the target task (or the next runnable task when `[task]` is omitted):
- `task`: `{id, line, phase, description, verify, test, parallel, done, after, reqs, evidence}`
- `anchor`: `{summary, test_strategy}` from `plan.md` (or `proposal.md`'s `why` on the fast track)
- `dependencies`: array of tasks in `after`, their done status, and their recorded evidence lines
- `requirements`: array of requirement delta blocks and living spec blocks cited by the task
- `learnings`: scoped learnings matching the touched capability or file paths
- `remaining`: count of unticked tasks remaining

`done` checks the following, and on any failure exits `1` and writes nothing:

1. The task exists and is unticked.
2. Every `after` dependency is done.
3. The kind is allowed for the task and mode:

| Mode | `[TEST]` task | Other task |
|---|---|---|
| `tdd` | `red` | `green` |
| `test-after` | `green` | `green` or `manual` |
| `none` | not applicable | `manual` |

   In `tdd`, a non-`[TEST]` task that names no requirement and cites no mitigation (`M-<NN>`), such as setup or documentation, also accepts `manual`.

   When `--kind` is omitted, the CLI uses the first allowed kind, or `manual` when `--evidence` is passed and `manual` is allowed for the task.
4. **Test-tampering guard (`tdd` mode):** when a `[TEST]` task completes with `red`, the CLI records the SHA-256 of its test files in `.medra.yaml` (`test_hashes`). When a subsequent implementation task completes with `green`, the CLI verifies that none of those locked test files were modified or deleted (`task.test-tampered`), unless `--allow-test-edit` is explicitly passed (which stamps `[test-edited]` on the evidence line for the reviewer).
5. **With `--run`:** the CLI runs the command (in the project root, with a 10-minute timeout) and records its exit code and sanitized output tail (stripping ANSI escapes and framework noise while highlighting assertion lines to prevent context bloat). `red` requires a non-zero exit, and `green` requires exit `0`. On a `green` non-`[TEST]` task, the CLI also runs each command in `testing.checks` (if configured), failing with `task.check` on a non-zero exit. A mismatch exits `1` with the sanitized failure output. Exit `4` when the command is not found.
6. **With `--evidence`:** the CLI records the text as given, and only as `manual` evidence. `red` and `green` state the result of a run, so with `--evidence` they are refused (`task.evidence`): the CLI records them only from a command it ran itself. In `tdd`, every `[TEST]` task and every task tied to a requirement or a mitigation therefore needs `--run`.

On success the CLI ticks the task, appends the evidence line, sets the phase to `implementing` on the first done task, and returns `{"task", "kind", "remaining", "next", "next_task"}` (where `next_task` has the same shape as in `context --stage apply`, so agents do not need to re-invoke `context` after each task).

`block` records an open blocker, and `unblock` resolves it; both also return `remaining`, `next` and `next_task`.

### 8.13 `medra install --target antigravity`

```
medra install --target antigravity [--scope workspace|global] [--force]
medra update
```

Generates the bundled plugin as a native Antigravity plugin named `medra`. Antigravity namespaces plugin skills, so the commands are `/medra:<command>` on both runtimes. The plugin directory `<plugin>` is `.agents/plugins/medra/` in workspace scope and `~/.gemini/config/plugins/medra/` in global scope. Paths written into Markdown use the display form `.agents/plugins/medra` or `~/.gemini/config/plugins/medra`. The rewrite table:

| Source | Generated |
|---|---|
| `.claude-plugin/plugin.json` | `<plugin>/plugin.json` with `$schema` (`https://antigravity.google/schemas/v1/plugin.json`), `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, copying only the keys the source has |
| `skills/<name>/` | `<plugin>/skills/<name>/` (only the 8 user commands: `init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `archive`, `review`) |
| Skill frontmatter | `name: <name>` and `description` only |
| `pipelines/<name>.md` | `<plugin>/pipelines/<name>.md` |
| `templates/<name>/` | `<plugin>/templates/<name>/` |
| `handoffs/<name>.md` | `<plugin>/handoffs/<name>.md` |
| `references/<name>.md` | `<plugin>/references/<name>.md` |
| `agents/<name>.md` | `<plugin>/agents/<name>.md` |
| Agent frontmatter | `name: medra-<name>`, `description`, `tools` as a YAML list mapped by the tool table below (the source list is split on commas outside parentheses, so `Agent(reviewer, security)` is one entry), `mainAgent: true`, and `subagent: true` for agents some skill dispatches with `subagent_type: medra:<agent>` (`reviewer`), `subagent: false` for the rest (Antigravity offers every plugin agent as a subagent unless told otherwise). `model`, `effort` and `color` are dropped: Antigravity rejects Claude model names, and the session's model applies |
| `medra:<agent>` for an agent name, in Markdown | `medra-<agent>` (Antigravity lists plugin subagents without the plugin prefix) |
| `medra:<skill>` in Markdown | unchanged |
| `${CLAUDE_PLUGIN_ROOT}` | the plugin's display path |
| `${CLAUDE_SKILL_DIR}` | `<display path>/skills/<name>` |
| `$ARGUMENTS` | `the text the user typed after the command` |

Tool table (Claude Code → Antigravity); duplicates collapse, and the order follows the source list:

| Claude Code | Antigravity |
|---|---|
| `Read`, `Grep`, `Glob`, `Skill` | `read_file` |
| `Write` | `write_file` |
| `Edit` | `edit_file` |
| `Bash` | `run_command` |
| `AskUserQuestion` | `ask_question` |
| `Agent(...)` | `invoke_subagent` |
| `WebFetch`, `WebSearch` | `search_web` |

An unknown Claude tool name is an environment error (exit `4`) at install time, because Antigravity refuses to start an agent that names a tool it does not have.

- **`--force`:** without it, `install` refuses (exit `1`) when files exist that it did not write. The CLI records every file it writes, with its SHA-256, in `<plugin>/MANIFEST.json`. A file listed there whose content still matches is always replaceable; a file that is absent from the manifest or was edited since counts as foreign. Files a previous version generated and this version no longer ships are removed. No marker is written into the files, because agents copy `template.md` files into user documents.
- **Version stamp:** writes `<plugin>/VERSION`.
- **Legacy install (1.1 and earlier):** loose skills under `.agents/skills/medra-*/` (or `~/.gemini/config/skills/medra-*/`) and agents under `.agents/medra/`. When `.agents/medra/MANIFEST.json` (or its global counterpart) exists, `install` deletes every file it lists whose content still matches, then that manifest, its `VERSION`, and the directories left empty. Edited files stay, each reported as a `install.legacy-edited` warning finding, so the user decides. Without a legacy manifest nothing is touched.
- **`update`:** re-runs `install` for every integration in the config, and is a no-op for `claude` (the Claude Code plugin updates through `/plugin update`).
- Result: `{"installed": n, "scope", "version", "plugin": "<display path>", "legacy_removed": n}`, plus `findings` when there are warnings.

### 8.14 `medra archive <change>`

```
medra archive <change> [--dry-run]
```

1. Requires the `verify` gate approved and not stale; otherwise exits `1`.
2. For each delta, applies the operations to the living spec in the order REMOVED → MODIFIED → ADDED. ADDED blocks are inserted in ID order.
   - A **new capability** creates the living spec from the delta's title, capability, ID prefix and Purpose.
   - **Retire capability: yes** deletes the living spec when it has no requirements left.
   - Removed and dropped scenario IDs are appended to the `retired` comment.
3. Validates the resulting living specs with `--project specs` rules.
4. Moves the change folder to `archive/<YYYY-MM-DD>-<change>/`, then writes the merged living specs, the INDEX row and the phase `archived` atomically. If the move fails, nothing is written; if the writes fail, the folder is moved back. `<YYYY-MM-DD>` is the local calendar date, as are all CLI-written dates; timestamps are UTC.

- **`--dry-run`:** performs steps 1–3 in memory and writes nothing.
- **Conflicts:** any target missing, an ADDED collision, or post-merge validation failing causes exit `3` with `{"conflicts": [{capability, id, operation, problem}]}`. Nothing is written.
- Result: `{"archived_path", "sequence", "specs": {added: n, modified: n, removed: n}, "capabilities_touched": n}`.

### 8.15 `medra review <change>`

```
medra review <change> --report <path> [--by <name>]
```

- Reads Stage, Verdict and Counts from the report (§4.8) and appends an entry to `reviews`.
- A `request-changes` verdict also appends the report path to `gate_notes` for that stage.
- Result: `{"stage", "verdict"}`.

### 8.16 `medra handoff <change> <contract>`

```
medra handoff <change> check        [--fixed <F-NN,…>]
medra handoff <change> audit        [--fixed <S-NN,…>]
medra handoff <change> threat-model [--focus "<text>"]
```

Prints the dispatch payload of a handoff contract, so the sending agent passes it on without composing it. `check` is the reviewer's verification, `audit` the security agent's audit, and `threat-model` the security agent's threat model. Without `--json`, stdout is the payload alone, as the YAML block the contract defines.

- **Refusals (exit `1`):** `handoff.tasks` (a task is open; `check` and `audit`), any `error` of the `tasks` stage (`check`) or of the `proposal` stage (`threat-model`), `handoff.security` (the proposal is not `**Security:** relevant`; `audit` and `threat-model`), `handoff.track` (the track is not `full`) and `handoff.plan` (no `plan.md`) for `threat-model`, and `handoff.fixed` (a `--fixed` ID that is not an `F-NN`/`S-NN` finding of the previous report, or `--fixed` with no previous report). An unknown contract, `--fixed` on `threat-model` or `--focus` on a round contract exits `2`.
- **`round`:** one above the highest `-verify-agent-r<N>.md` or `-security-agent-r<N>.md` in `reviews/`, so both dispatches of one Check share it. `report_path` is `reviews/<today>-<verify|security>-agent-r<round>.md`.
- **`previous_report`, `fixed_findings`:** present from the receiver's second report on. `previous_report` is that receiver's latest report, which for `audit` may carry an earlier round; `fixed_findings` is the `--fixed` list, or `[]`.
- **`changed_since_previous`:** the command hashes every file changed since `diff_base` (tracked edits plus untracked files, outside `docs/` and `.agents/`) and stores the result in `handoff_snapshots.<contract>.<round>`. On a later round it lists the paths whose hash differs from the snapshot of the previous report's round: edited, added, deleted or reverted. The field is absent when `diff_base` is `none`, when git is unavailable, when no snapshot of that round is stored, when the change touches more than 300 files (no snapshot is stored then, because `.medra.yaml` is committed), or when more than 100 paths differ; the receiver then inspects everything. Only the snapshots of the previous and the current round are kept. A repeated call for the same round overwrites that round's snapshot and compares against the same previous one.
- **`threat-model`:** the payload is `change`, `change_path`, `plan_path`, `threat_model_path`, `focus` when given, and `revision: true` when `threat-model.md` already exists.
- Result (`--json`): `{"contract", "agent", "handoff", "payload"}`, where `agent` is `reviewer` or `security` and `handoff` is the contract file's path inside the plugin.

## 9. Conflict resolution contract (`archive` exit 3)

The CLI never guesses how to resolve a conflict. Each `problem` value tells the agent what to do:

| `problem` | Agent action |
|---|---|
| `missing-target` | The requirement was removed or renamed in the living spec after the change was approved. Rewrite the delta against the current living spec, then re-run `gate verify --approve` (the hash changed) |
| `added-collision` | The ID was taken by another change. Pick the next free ID, update its references in tasks.md and the tests, then re-gate |
| `post-merge-invalid` | Fix the delta block that produced the invalid result |

## 10. Acceptance tests for the implementation

The implementation is done when a test suite covers at least the following:

- [ ] Every rule in §6 has a passing fixture and a failing fixture.
- [ ] `archive` round-trip: fixtures with a new capability, ADDED, MODIFIED with kept, new and dropped scenarios, REMOVED, Retire capability, and each conflict type. Merged output is byte-stable across runs.
- [ ] `task done --run` enforces red/green exit codes and `after` ordering.
- [ ] A gate goes `stale` after a document edit, and does not go stale after `task done`.
- [ ] `context --stage apply` returns the correct `next_task` with only its requirements.
- [ ] A `security` report never satisfies `verify.report`, and the latest `verify` report is chosen correctly with security reports present in `reviews/`.
- [ ] The plan gate goes `stale` after a threat-model.md edit; the verify gate goes `stale` after a new security report.
- [ ] `learn` add / bump / merge / retire / promote, plus the `status` budget and staleness arithmetic.
- [ ] `install --target antigravity` output matches the rewrite table, verified on the bundled plugin, is idempotent, removes an unedited legacy install, and passes `agy plugin validate --strict` when `agy` is on `PATH`.
- [ ] `handoff`: each refusal, a shared round for `check` and `audit`, `--fixed` checked against the previous report, and `changed_since_previous` listing an edited and an added file and omitting an unchanged one.
- [ ] `--json` output of every command validates against the envelope schema in `cli/schemas/envelope.schema.json`.

# medra — Spec-Driven AI Engineering for Claude Code & Antigravity

**Stop babysitting coding agents that forget constraints, weaken failing tests, and burn tokens re-reading your repo.**

`medra` is a deterministic spec-driven development harness for **Claude Code** and **Google Antigravity**. It turns one feature or bugfix at a time into an approved specification, technical plan, test-first task list, isolated implementation, independent spec + security verification, and finally merges it into **living specs** that always match your running code.

> **Why teams switch to `medra` v2:**
> - **Deterministic CLI, not prompt luck:** The `medra` CLI owns state transitions, SHA-256 gate hashes, TDD red/green locks, delta merges, and `medra step` prompt compilation. Agents never hand-edit state or checklists.
> - **71% lower `apply` overhead & cheaper model routing:** `medra step` compiles minimal, clean-context batches (`apply.batch_scope: cross-phase`, cutting a 14-task benchmark from `89,725 B` to `26,039 B`) and lets you route `apply` to `flash` / `haiku` while keeping `verify` on `pro` / `opus`.
> - **Autonomous end-to-end loop (`/medra:run`):** One command drives `propose → plan → tasks → apply → verify → archive`, pausing only at human approval gates or real ambiguity.
> - **Zero greenwashing, zero self-grading:** Tests are SHA-256 locked at `red`, and independent `reviewer` + `security` (Sentinel) subagents audit every change in fresh contexts.

---

## Why Use This Workflow?

Coding agents are fast at emitting code, but in real-world brownfield codebases and team repositories, unstructured prompting — and even static spec templates — break down fast:

- **Context Drift & Hallucinated Scope:** Agents forget architectural rules mid-session, silently alter unrelated behavior, or invent unrequested features.
- **Weakened Tests ("Greenwashing"):** When a test fails, agents routinely delete assertions, add `.skip`, or mock out the behavior under test just to make the run green.
- **Dead Documentation:** Per-PR spec files (`specs/001-feature.md`) rot the moment the next PR touches the same module.
- **Token & Latency Explosion:** Long single-session runs accumulate 30–100+ KB of dead tool output, forcing compactions and repeated full-repo reads.
- **Rubber-Stamp Reviews:** An agent reviewing its own code in the same context window grades its own homework and misses security flaws.

### Without `medra` vs. With `medra` v2

| Without `medra` (Ad-hoc AI Coding) | With `medra` v2 (Spec-Driven Harness) |
|---|---|
| Loose prompts; requirements vanish into chat history | Explicit `ADDED`/`MODIFIED`/`REMOVED` deltas approved at a SHA-256 human gate before coding |
| Docs rot in per-feature folders | Deltas merge byte-for-byte into **Living Specs** (`docs/specs/<cap>/spec.md`) + `medra drift` catches out-of-band edits |
| Agents skip red tests or weaken assertions to pass | CLI enforces `[TEST]` (`red` for the scenario's predicted reason) before `green` and SHA-256 locks test files (`task.test-tampered`) |
| Agents hand-edit checklists and hallucinate progress | Only `medra task done --run` can tick a task, recording exit codes and running `testing.checks` |
| One bloated context grows across 10+ tasks | `medra step` dispatches clean-context `batch` subagents with compact `--md` task packs and routes `apply` to `flash` |
| Same agent writes and approves its own code | Isolated `reviewer` + `security` (Sentinel) subagents audit against specs, constitution, OWASP, NVD, and CISA KEV |
| Mistakes repeat in every new session | `medra archive` distills review/gate/blocker lessons into bounded `docs/learnings.md` and promotes recurring rules to the Constitution |

---

## How `medra` v2 Works

```text
/medra:run "add password reset"
   │
   ├─► propose  (inline)   ──► [Human Gate: proposal]
   ├─► plan     (inline)   ──► [Human Gate: plan]        (+ Sentinel threat model if security-relevant)
   ├─► tasks    (inline)   ──► [Human Gate: tasks]       (traceable REQ + file pointers)
   ├─► apply    (batch)    ──► clean-context subagents   (flash, cross-phase batches, red→green locks)
   ├─► verify   (round)    ──► medra suite → parallel reviewer + security (incremental on r2+) ──► [Human Gate: verify]
   └─► archive  (done)     ──► merges deltas into docs/specs/ + harvests learnings into docs/learnings.md
```

## Key Benefits in Detail

- **Living Specifications that Never Go Stale:** `docs/specs/<capability>/spec.md` always describes how the system behaves today. Changes are authored as reviewable deltas keyed by stable IDs (`AUTH-004`) and merged atomically by `medra archive`. Capabilities can declare `**Paths:**` globs so `medra drift` and `medra status` flag code modified outside an active change.
- **Deterministic CLI Harness (`medra step`) vs. Agent Judgment:** LLMs never hand-edit `.medra.yaml`, task checkboxes, evidence lines, archive indices, or living specs. The CLI enforces 25+ structural and cross-document rules, atomic writes, `MEDRA_SUBAGENT=1` role isolation (refusing `gate` and `verify-fix` from subagents while stripping the env var from child test processes via `childEnv()`), and deterministic exit codes.
- **SHA-256 Cryptographic Human Gates & Constitution Governance:** `docs/constitution.md` defines non-negotiable project principles, each with a yes/no Gate question answered by every technical plan. Human approvals at `proposal`, `plan`, `tasks`, and `verify` hash the stage's documents; any post-approval edit automatically marks the gate `stale`.
- **Enforced TDD, Anti-Tampering & Static Guardrails:**
  - **Scenario-to-Test Traceability:** Every Gherkin scenario (`Given`/`When`/`Then`) has a stable ID (`AUTH-004.S1`). Automated tests cite those IDs, and `medra coverage` verifies 100% scenario coverage before `verify` can pass.
  - **Scenario-Matched Red & Test-Tampering Lock:** In `tdd` mode, `[TEST]` tasks must fail for the missing behavior the scenario predicts (not import/syntax/fixture errors) before `--kind red`. The CLI SHA-256 hashes locked test files at `red` and blocks `green` (`task.test-tampered`) on `additive`, `weakening`, or `other` edits unless the user explicitly authorizes `--allow-test-edit --reason "<why>"`.
  - **Scoped Per-Task Runs + Full `medra suite`:** During `apply`, tasks run focused test files (`--run "<targeted cmd>"`); before `verify`, `coordinator_steps[]` automatically runs `medra suite` (full `testing.command` + `testing.checks`) and records a code fingerprint.
- **Token-Engineered Context & Cross-Phase Batching:**
  - **Compact `--json` + Self-Contained `--md` Task Packs:** `medra step --json` stays ~800 B for the coordinator while `medra step --role ... --md` packs only the ratified constitution summary, referenced `REQ` excerpts, task lines, and code pointers.
  - **Cross-Phase `batch` Execution & Model Routing:** On `full`-track changes, `apply` groups satisfied tasks across phases (`apply.batch_scope: cross-phase`, `batch_max_tasks: 4`) — cutting a 14-task benchmark from `89,725 B` (14 dispatches) down to **`26,039 B` (4 dispatches, -71.0%)**. Configure `models.claude` (`haiku`/`opus`) and `models.antigravity` (`flash`/`pro`) to pay frontier-model cost only where reasoning matters.
  - **Lean Core Pipelines with On-Demand References:** All 9 subagent pipelines fit in `24,872 B` raw (`36,575 B` measured across 5 stages in `measure-envelope.js`, down from `74,369 B`), loading edge-case and recovery references only when triggered.
- **Adversarial Verification & Dedicated Security Agent (Sentinel):**
  - **Independent `reviewer`:** Audits code and tests against deltas, plan, and constitution in an isolated context, never editing code. On round 2+, `changed_since_previous` limits re-inspection to changed files and open findings.
  - **Security Specialist (`security` / Sentinel):** On `**Security:** relevant` changes, runs STRIDE threat modeling (`threat-model.md`) during `plan` and a parallel code/config/dependency audit during `verify`, verifying claims against OWASP, ASVS, NVD, GitHub Advisory Database, and CISA KEV.
- **Self-Improving Project Memory (`docs/learnings.md`):** At `archive`, review findings, gate change requests, and apply blockers are distilled into scoped lessons (`capabilities`, `paths`, `stages`) with an active budget (`max_active`), staleness retirement, and automatic constitution amendment proposals (`promote_after`).
- **Fast & Full Tracks Across Runtimes:** Bugfixes and small changes take the **fast track** (single `proposal` gate + inline `apply` up to `inline_max_tasks`); architectural changes take the **full track** (`proposal`, `plan`, `threat-model`, `tasks`, `verify`). Identical `/medra:*` commands run natively on **Claude Code** and **Google Antigravity**.

---

## Install

### 1. The CLI (required on every runtime)

```bash
npm install -g @medra.dev/flow
medra --version   # 2.1.0
```

### 2a. Claude Code

```
/plugin marketplace add https://github.com/infra-medra/flow.git
/plugin install medra@flow
```

### 2b. Antigravity

Run `medra init` in your project and choose `antigravity` as an integration, or install directly:

```bash
medra install --target antigravity                  # workspace: .agents/plugins/medra/
medra install --target antigravity --scope global   # global: ~/.gemini/config/plugins/medra/
medra update                                        # refresh configured integrations
```

Commit `.agents/plugins/medra/` when using workspace scope so everyone who clones the project gets the commands. `medra update` refreshes it whenever `antigravity` is listed under `integrations` in `docs/config-flow.yaml`.

Upgrading from 1.1 or earlier: the next install removes the old loose skills in `.agents/skills/medra-*` and `.agents/medra/`, keeping any file you edited.

## First run

```
/medra:init                                  # config, constitution, optional specs from existing code
/medra:run "let locked-out users reset their password"   # runs propose → plan → tasks → apply → verify → archive
```

Or run each stage manually:

```
/medra:propose "let locked-out users reset their password"
/medra:apply                                 # fast track; on the full track: /medra:plan, then /medra:tasks
/medra:verify
/medra:archive
```

The commands are the same on Claude Code and Antigravity.

## Agent Commands (`/medra:*`)

| Command | What it does | Gate |
|---|---|---|
| `/medra:init` | Scaffolds `docs/`, sets the language and testing mode, writes the constitution, and can bootstrap specs from existing code | constitution · bootstrap specs |
| `/medra:run` | Runs the deterministic v2 workflow loop via `medra step --json`, dispatching clean-context subagents and pausing only at human gates or open clarifications | all stage gates |
| `/medra:propose` | Writes the proposal and delta specs (`ADDED/MODIFIED/REMOVED`), picks the fast or full track, and marks whether the change is security-relevant. On the fast track it also writes the tasks | proposal (+ tasks) |
| `/medra:plan` | Full track: writes the design, the Constitution Check, the test strategy and the decisions. On a security-relevant change, the security agent threat-models the design first | plan |
| `/medra:tasks` | Full track: writes a traceable, test-first task list | tasks |
| `/medra:apply` | Implements tasks in `batch`, `task`, or `inline` mode with red/green evidence, test-tampering protection, and static checks. Resumable | — |
| `/medra:verify` | Runs `medra suite` if needed, dispatches an independent reviewer check against the specs (plus a parallel security audit on a security-relevant change), and runs incremental fix rounds | verify |
| `/medra:review` | Lets anyone review a change's documents and record a verdict | reviewer's verdict |
| `/medra:archive` | Merges deltas into living specs, harvests lessons, compacts them, and proposes constitution amendments | amendment |

## CLI Reference (`medra`)

Every CLI command accepts `--json` for structured machine output (`{"ok": true, ...}` or `{"ok": false, "code": <n>, "findings": [...]}`).

```bash
# Project & change lifecycle
medra init [--language <tag>] [--integrations claude,antigravity] [--testing-mode tdd|test-after|none] [--testing-command "<cmd>"]
medra new <change> [--track fast|full]
medra status [<change>] [--json]
medra drift [--json]
medra track <change> fast|full --reason "<text>"

# Deterministic step compiler & token-bounded context packs (v2)
medra step <change> [--stage propose|plan|tasks|apply|verify|archive] [--role <role>] [--task <T-ID>] [--runtime claude|antigravity] [--md|--json|--full]
medra index [--learnings <capability,…>] [--md|--json]
medra context <change> --stage propose|plan|tasks|apply|verify|review|archive [--md|--json]
medra task context <change> [<T-ID>] [--md|--json]

# Validation, gates, and reviews
medra validate <change> --stage proposal|plan|tasks|verify [--json]
medra validate --project constitution|specs|learnings [--json]
medra fix [<change>] [--json]
medra gate <change> proposal|plan|tasks|verify --approve [--note "<text>"] [--by <name>]
medra gate <change> proposal|plan|tasks|verify --request-changes --note "<text>" [--by <name>]
medra review <change> --report <path> [--by <name>]
medra verify-fix <change> [--json]
medra handoff <change> check|audit|threat-model [--fixed <ids>] [--focus "<text>"]

# Task execution, red/green checkpoints & test-tampering guard
medra task done <change> <T-NNN> (--run "<command>" | --evidence "<text>") [--kind red|green|manual] [--allow-test-edit --reason "<text>"]
medra task block <change> <T-NNN> --note "<text>"
medra task unblock <change> <T-NNN>
medra coverage <change> | --all [--json]
medra suite <change> [--json]                # whole test suite + testing.checks, recorded for verify

# Archive, constitution & learnings
medra archive <change> [--dry-run] [--json]
medra constitution ratify [--bump major|minor] --note "<text>" [--source <init|L-NNN>]
medra learn add|bump|merge|retire|promote|status|candidates

# Runtime installer
medra install --target antigravity [--scope workspace|global] [--force]
medra update
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Refused — validation failure or unmet precondition (`findings` in `--json`) |
| `2` | Usage error (bad command, flag, or argument) |
| `3` | Merge conflict on `medra archive` (`conflicts` in `--json`) |
| `4` | Environment error (outside a medra project, missing file, or test command not found) |

## Configuration (`docs/config-flow.yaml`)

```yaml
version: 1
language: pt-BR                 # BCP-47 tag for document prose (headings/keywords stay in English)
integrations: [claude, antigravity]
testing:
  mode: tdd                     # tdd | test-after | none
  command: "npm test --"        # optional base test command (run via medra suite)
  checks: ["npm run lint"]      # optional static checks run on green implementation tasks
  allow-additive-test-edits: false  # optional; accept purely additive edits of a locked test, with a warning
  paths: ["test/**", "**/*.test.*", "**/*_test.*", "tests/**"]
apply:
  granularity: batch            # batch | task
  batch_scope: cross-phase      # cross-phase | phase
  batch_max_tasks: 4
  inline_max_tasks: 3           # fast-track inline apply threshold
models:                         # optional per-runtime or flat model tiers (default: inherit)
  default: inherit
  claude:
    apply: haiku
    verify: opus
    archive: haiku
  antigravity:
    apply: flash
    verify: pro
    archive: flash
learning:
  max_active: 40
  promote_after: 3              # occurrences before proposing a constitution amendment
  stale_after: 10               # archived changes without a bump before retirement
  context_max: 10               # max learnings injected per context pack
```

## Project layout

```text
docs/
├── config-flow.yaml     language · integrations · testing · apply · models · learning
├── constitution.md      principles, each with a gate question
├── learnings.md         lessons and team preferences
├── specs/<capability>/spec.md
└── changes/<change>/    proposal · delta specs · plan · threat model · tasks · reviews
    └── archive/
```

On Claude Code the plugin installs a guard hook (`plugins/medra/hooks/guard.mjs`). It asks you to confirm `medra gate … --approve`, `medra constitution ratify` and `--allow-test-edit` when the agent runs them, denies hand edits of `.medra.yaml`, the archive and task checkboxes, and asks before an existing living spec is edited outside a change. Across all runtimes (including Antigravity), the CLI also enforces `MEDRA_SUBAGENT=1` on `medra gate` and `medra verify-fix` while stripping `MEDRA_SUBAGENT` from child test/check processes via `childEnv()`.

The security agent (Sentinel) runs only on security-relevant changes. It audits but never edits code, checks its claims against OWASP, NVD, CISA KEV and vendor documentation over the network, and informs the gate without blocking it.

Commit `docs/` with your code. `medra` never commits or creates branches for you; it suggests a commit message at the end of every step.

## Design

[plugins/medra/BLUEPRINT.md](plugins/medra/BLUEPRINT.md) covers the topology, contracts and decisions. [cli/SPEC.md](cli/SPEC.md) is the CLI contract.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full details.

- **2.1.0 (2026-11-22):** Added per-runtime `models.claude` and `models.antigravity` configuration in `docs/config-flow.yaml`, `--runtime <claude|antigravity>` / `MEDRA_RUNTIME` / environment auto-detection in `medra step`, automatic `--runtime antigravity` skill rewriting in `medra install --target antigravity`, and updated `README.md` with v2 positioning and usage.
- **2.0.1 (2026-11-22):** Updated bundled `README.md` changelog and `2.0.0` resource metrics for the npm package.
- **2.0.0 (2026-11-22):** Introduced the deterministic `medra step` compiler, thin coordinator skills, and `/medra:run` loop with clean-context subagent isolation (`inline` for `propose`/`plan`/`tasks` and small `fast`-track `apply`, `cross-phase` `batch` for `full`-track `apply`, and parallel `reviewer` + `security` `verify` rounds). Added `coordinator_steps[]` (auto-running `medra suite` before `verify`), incremental `verify` handoffs (`round`, `previous_report`, `changed_since_previous`), `MEDRA_SUBAGENT=1` CLI enforcement with `childEnv()` subprocess isolation, compact `medra step --md` task packs, and lean core pipelines (`24,872 B` raw / `36,575 B` in `measure-envelope.js` vs `74,369 B` baseline) with inline guardrails and rule rationales.
- **1.10.0 (2026-11-20):** Classified locked-test edits in `task.test-tampered` (`additive`, `weakening`, or `other`) with a diff summary, required `--reason` with `--allow-test-edit` (recording it in evidence and re-locking the snapshot), added `testing.allow-additive-test-edits` (default `false`), and updated `/medra:apply` and `/medra:tasks` so overrides always ask the user and `[TEST]` tasks list all cases before the red checkpoint.
- **1.9.0 (2026-11-16):** Removed the `model` and `effort` pins from every command skill and from the `reviewer` and `security` agents, so commands and subagents use the model and effort the user configured in their session. Added `medra handoff`, which emits each subagent's dispatch payload and the files changed since its previous round, so later verify rounds re-inspect only what the fixes touched. Added the `proposal.impact`, `proposal.open-questions` and scenario-mapping `plan.test-strategy` rules, and trimmed the template checklists and command skills accordingly. Added `medra suite` with the `verify.suite` rule (the verify gate and every reviewer dispatch need a green full-suite run on the current code) and `verify.merge` (deltas must still merge into the living specs), a Claude Code hook that makes gate approvals, constitution ratification and `--allow-test-edit` ask the user and blocks hand edits of CLI-owned files, and a CI workflow.
- **1.8.0 (2026-11-12):** Made command skills the single source for each command (removing mirrored `author`/`implementer` agent files and 8 `pipelines/*.md` files), split `conventions.md` into `gate.md` and `portability.md`, declared `model` and `effort` per command, made `medra fix` use `pending` / `[NEEDS CLARIFICATION: …]` markers instead of guessing judgment, added the `plan.markers` validation rule, reduced `specDrift` git spawns, and split the test suite for parallel execution.
- **1.7.6 (2026-11-12):** Hardened plugin installation and cleanup against path traversal attacks (`safeJoin` guard in `cli/src/install.js`) when processing existing manifests.
- **1.7.5 (2026-11-12):** Added Smart Slicing (`medra task context <change> [task]`) for high-efficiency bounded task packs, deterministic auto-remediation (`medra fix [change]`), and test output noise trimming / sanitization (`sanitizeTestOutput`).
- **1.7.4 (2026-11-12):** Added prescriptive validation remediations (`remediation` in findings) across all validation stages, schema support in JSON envelope, and `↳ fix:` CLI stderr formatting.
- **1.7.3 (2026-11-11):** Updated README changelog summary to include releases 1.7.0 through 1.7.2 in bundled package documentation.
- **1.7.2 (2026-11-11):** Deduplicated requirements in `parallel_batch` and `next_task`, added markdown checkpointing for `medra task done` and `medra task block`, and compacted green task evidence lines in `tasks.md`.
- **1.7.1 (2026-11-11):** Flattened user-facing command skills with inlined persona principles and pipeline specifications, eliminating multi-hop startup file reads.
- **1.7.0 (2026-11-11):** Token optimization via progressive disclosure of plugin resources (decoupled templates, pipelines, and handoffs from top-level skills into dedicated resource directories, reducing system prompt footprint by ~76%).
- **1.6.1 (2026-11-10):** Fixed `medra task done --kind red` crashing with EISDIR when a `[TEST]` task description backticks a directory token.
- **1.6.0 (2026-11-06):** Added reverse spec drift detection (`medra drift`, `status`, and `index`), same-session `[P]` task batching (`parallel_batch` in `context` and `task done`), and expanded documentation (benefits, comparison table, upgrade & release checklists).
- **1.5.1 (2026-11-06):** Bundled `README.md` (with full CLI reference and configuration guide), `CHANGELOG.md`, and repository metadata into the published `@medra.dev/flow` npm package.
- **1.5.0 (2026-11-06):** Token-optimized context packs (`task done` returns `next_task`, `MODIFIED` living specs collapse unchanged scenarios, default Markdown output on `index` and `context`, slimmer `conventions`), optional capability `**Paths:**` globs, test-tampering guard (`task.test-tampered` + `--allow-test-edit`), and static checks on green tasks (`testing.checks` / `task.check`).
- **1.4.1 (2026-11-04):** Fixed documentation drift and hardened `medra archive` atomicity.
- **1.4.0 (2026-11-04):** Added the `security` agent (Sentinel) for STRIDE threat modeling in `plan` (`threat-model.md`) and parallel security auditing in `verify` (`*-security-agent-r<round>.md`).
- **1.3.0 (2026-11-04):** Preserved every verify round as its own `-r<round>.md` report for archive learning harvest.
- **1.2.0 (2026-10-30):** Native Google Antigravity plugin generation (`medra install --target antigravity`) and automatic 1.1 cleanup.
- **1.1.0 (2026-10-30):** Moved project layout from `medra/` to `docs/` (`docs/config-flow.yaml`) with automatic `git mv` migration and gate hash preservation.
- **1.0.0 (2026-10-29):** Initial release of the `medra` spec-driven workflow and CLI.

## Upgrading `medra`

1. **Update the global CLI:**
   ```bash
   npm install -g @medra.dev/flow@latest
   medra --version
   ```
2. **Update the runtime integration:**
   - **Claude Code:** run `/plugin update medra@flow`
   - **Antigravity (workspace):** run `medra update` inside your project root (refreshes `.agents/plugins/medra/`)
   - **Antigravity (global):** run `medra install --target antigravity --scope global` (refreshes `~/.gemini/config/plugins/medra/`)

## Developing & Releasing a New Version

Every push to `main` and every pull request runs `check-version`, the plugin bundle and the test suite on Node 20 and 22 (`.github/workflows/ci.yml`).

```bash
cd cli
npm install
npm test                 # node:test suite (end-to-end through the binary)
npm link                 # puts `medra` on your PATH from this checkout
```

### Release checklist (for maintainers)

`cli/package.json` and `plugins/medra/.claude-plugin/plugin.json` **must** carry the exact same semver version (`npm run check-version` enforces this). Because npm versions are immutable, every publish requires bumping the version first:

1. **Bump the version** in both files:
   - `cli/package.json` (`"version": "2.x.y"`)
   - `plugins/medra/.claude-plugin/plugin.json` (`"version": "2.x.y"`)
2. **Document the release** in `CHANGELOG.md` and the `## Changelog` summary in `README.md`.
3. **Validate, bundle, and test** from `cli/`:
   ```bash
   cd cli
   npm run prepack       # runs check-version and copies plugins/medra, README.md, and CHANGELOG.md into cli/
   npm test              # run the full test suite
   ```
4. **Update your local global install (optional):**
   ```bash
   node bin/medra.js install --target antigravity --scope global
   ```
5. **Commit, tag, push, and publish to npm:**
   ```bash
   git add -A
   git commit -m "chore(release): 2.x.y"
   git tag -a v2.x.y -m "Release 2.x.y"
   git push origin <branch> v2.x.y
   cd cli && npm publish --access public
   ```

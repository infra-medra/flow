# medra — spec-driven development for Claude Code and Antigravity

medra takes one change at a time from intent to approved specification, technical plan, test-first tasks, implementation, verification, and finally archives it into **living specs** that always describe how the system behaves today. Each archived change also leaves behind **lessons** that make the next change cheaper. The workflow combines ideas from [OpenSpec](https://github.com/Fission-AI/OpenSpec) (living specs, deltas, archive) and [GitHub Spec Kit](https://github.com/github/spec-kit) (constitution, plan gates, clarification markers, traceable tasks).

The `medra` CLI handles every deterministic step: validation, gate records, task checkpoints, delta merge, context packing, test coverage and the learnings store. The agents handle judgment and writing.

## Why Use This Workflow?

Coding agents are fast at generating code, but in real-world projects (especially brownfield codebases and team environments) unstructured prompting — and even basic spec templates — quickly break down:
- **Context Drift & Hallucinated Scope:** Agents forget earlier architectural constraints, silently alter existing behavior, or invent unrequested features halfway through implementation.
- **Weakened Tests ("Greenwashing"):** When a test fails, agents routinely modify or delete the assertion in the test rather than fixing the bug in the implementation.
- **Dead Documentation:** Per-feature spec files (`specs/001-feature.md`) go stale the moment the next PR touches the same module, leaving the team with no single source of truth.
- **Token Explosion:** As a project grows, agents burn thousands of tokens globbing old specs, re-reading unchanged files, or repeating the same mistakes across sessions.
- **Rubber-Stamp Reviews:** When the same agent that wrote the code also "reviews" it in the same context window, it grades its own homework and misses critical flaws and security risks.

**`medra` solves this by separating deterministic enforcement (the `medra` CLI) from reasoning (specialized agents) around a single living source of truth:**

| Without `medra` (Ad-hoc AI Coding) | With `medra` (Spec-Driven Harness) |
|---|---|
| Loose prompts; requirements live only in chat history | Explicit `ADDED`/`MODIFIED`/`REMOVED` deltas approved at a human gate before code is written |
| Specs rot in per-PR folders | Deltas merge into **Living Specs** (`docs/specs/<capability>/spec.md`) + `medra drift` detects out-of-band code edits |
| Agents skip red tests or weaken assertions to pass | CLI enforces `[TEST]` (`red`) before implementation (`green`) and SHA-256 locks test files (`task.test-tampered`) |
| Agents hand-edit checklists and hallucinate progress | Only `medra task done --run` can tick a task, recording command exit codes and running `testing.checks` |
| Token cost grows with repository history | `medra index` and `medra context --md` pack only touched requirements, collapsing unchanged scenarios |
| Same agent writes and reviews its own code | Isolated `reviewer` and `security` (Sentinel) subagents audit against specs, constitution, OWASP, NVD, and CISA KEV |
| Mistakes are repeated in every new session | `medra archive` harvests mistakes into a bounded `docs/learnings.md` store and promotes recurring rules to the Constitution |

## Key Benefits in Detail

- **Living Specifications that Never Go Stale:** Instead of per-feature spec folders that rot after merge, `docs/specs/<capability>/spec.md` always holds the current behavior of the system. Changes are proposed as reviewable deltas (`ADDED`, `MODIFIED`, `REMOVED`) keyed by stable IDs (`AUTH-004`) and merged byte-for-byte into living specs by `medra archive`. Capabilities can declare `**Paths:**` globs so `medra drift` and `medra status` detect when production code is modified outside an active change.
- **Deterministic CLI Harness vs. Agent Judgment:** LLMs never hand-edit `.medra.yaml` state, task checkboxes, evidence lines, archive indices, or living specs. The `medra` CLI enforces 25+ structural and cross-document validation rules, atomic file writes, and exit codes — eliminating hallucinated state and broken merges.
- **SHA-256 Cryptographic Human Gates & Constitution Governance:** `docs/constitution.md` defines non-negotiable project principles, each with a yes/no Gate question answered by every technical plan. Human approvals at `proposal`, `plan`, `tasks`, and `verify` record a SHA-256 hash over the stage's documents; any post-approval edit automatically marks the gate `stale`.
- **Enforced TDD, Anti-Tampering & Static Guardrails:**
  - **Scenario-to-Test Traceability:** Every Gherkin scenario (`Given`/`When`/`Then`) gets a stable ID (`AUTH-004.S1`). Automated tests cite those IDs, and `medra coverage` deterministically verifies that every added or modified scenario is covered before `verify` can pass.
  - **Red/Green Evidence & Test-Tampering Lock:** In `tdd` mode, `medra task done --run` requires `[TEST]` tasks to fail (`red`) before implementation tasks can run (`green`), hashes the test files at `red`, and blocks `green` (`task.test-tampered`) if an agent weakens, skips, or deletes a locked test during implementation.
  - **Continuous Static Checks:** Configured `testing.checks` (such as `lint` and `typecheck`) run automatically on every `green` implementation checkpoint (`task.check`).
- **Token-Engineered Context & Same-Session `[P]` Batching:**
  - **Read Cost Scales with the Change, Not Repo History:** Agents never glob `docs/specs/` or browse `docs/changes/archive/`. They read compact Markdown packs from `medra index` and `medra context --stage <stage> --md`.
  - **Zero Redundant Context Reloads:** `MODIFIED` requirements collapse unchanged scenarios to one-line markers, `medra task done` returns `next_task` directly so `/medra:apply` never reloads context between tasks, and archived decisions are read only via `last_changed_by` pointers when modifying or removing a requirement.
  - **Zero-Overhead `[P]` Batching:** Independent `[P]` tasks in the same phase are grouped into a `parallel_batch` (up to 3 tasks) so the agent can edit their files in parallel tool calls within the same warm session — saving LLM round-trips without paying the 2x–3x token boot cost of spawning subagents.
  - **Zero Prompt Pollution via Progressive Resource Disclosure:** Only the 8 user commands (`init`, `propose`, `plan`, `tasks`, `apply`, `verify`, `archive`, `review`) are registered as system skills. Supporting templates, handoffs, and pipeline specs are maintained as on-demand resources, saving ~1,650 tokens of static prompt overhead on every turn.
- **Adversarial Verification & Dedicated Security Agent (Sentinel):**
  - **Independent `reviewer`:** Audits the implementation against the deltas, plan, and constitution in an isolated context, never editing code.
  - **Security Specialist (`security` / Sentinel):** On changes marked `**Security:** relevant`, runs STRIDE threat modeling (`threat-model.md`) during `plan` and a parallel code/config/dependency audit during `verify`, verifying claims against OWASP, ASVS, NVD, GitHub Advisory Database, and CISA KEV over the network.
- **Self-Improving Project Memory (`docs/learnings.md`):** At `archive`, findings from review/verify/security rounds, gate change requests, and apply blockers are distilled into scoped lessons and preferences (`capabilities`, `paths`, `stages`). The CLI enforces an active budget (`max_active`), retires stale entries, and proposes constitution amendments when a lesson recurs (`promote_after`).
- **Fast & Full Tracks Across Runtimes:** Bugfixes and small changes take the **fast track** (proposal + deltas + regression-first tasks approved at a single gate); architectural changes take the **full track** (adding `plan`, `threat-model`, and `tasks` gates). The exact same `/medra:*` commands run natively on **Claude Code** and **Google Antigravity**.

## Install

### 1. The CLI (required on every runtime)

```bash
npm install -g @medra.dev/flow
medra --version   # 1.x
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
| `/medra:propose` | Writes the proposal and delta specs (`ADDED/MODIFIED/REMOVED`), picks the fast or full track, and marks whether the change is security-relevant. On the fast track it also writes the tasks | proposal (+ tasks) |
| `/medra:plan` | Full track: writes the design, the Constitution Check, the test strategy and the decisions. On a security-relevant change, the security agent threat-models the design first | plan |
| `/medra:tasks` | Full track: writes a traceable, test-first task list | tasks |
| `/medra:apply` | Implements tasks one at a time, with red/green evidence, test-tampering protection, and static checks. Resumable | — |
| `/medra:verify` | Runs an independent reviewer check against the specs (plus a parallel security audit on a security-relevant change), then a fix loop | verify |
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

# Token-bounded context packs for agents
medra index [--learnings <capability,…>] [--md|--json]
medra context <change> --stage propose|plan|tasks|apply|verify|review|archive [--md|--json]

# Validation, gates, and reviews
medra validate <change> --stage proposal|plan|tasks|verify [--json]
medra validate --project constitution|specs|learnings [--json]
medra gate <change> proposal|plan|tasks|verify --approve [--note "<text>"] [--by <name>]
medra gate <change> proposal|plan|tasks|verify --request-changes --note "<text>" [--by <name>]
medra review <change> --report <path> [--by <name>]

# Task execution, red/green checkpoints & test-tampering guard
medra task done <change> <T-NNN> (--run "<command>" | --evidence "<text>") [--kind red|green|manual] [--allow-test-edit]
medra task block <change> <T-NNN> --note "<text>"
medra task unblock <change> <T-NNN>
medra coverage <change> | --all [--json]

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
  command: "npm test --"        # optional base test command
  checks: ["npm run lint"]      # optional static checks run on green implementation tasks
  paths: ["test/**", "**/*.test.*", "**/*_test.*", "tests/**"]
learning:
  max_active: 40
  promote_after: 3              # occurrences before proposing a constitution amendment
  stale_after: 10               # archived changes without a bump before retirement
  context_max: 10               # max learnings injected per context pack
```

## Project layout

```
docs/
├── config-flow.yaml     language · integrations · testing mode · learning budget
├── constitution.md      principles, each with a gate question
├── learnings.md         lessons and team preferences
├── specs/<capability>/spec.md
└── changes/<change>/    proposal · delta specs · plan · threat model · tasks · reviews
    └── archive/
```

The security agent (Sentinel) runs only on security-relevant changes. It audits but never edits code, checks its claims against OWASP, NVD, CISA KEV and vendor documentation over the network, and informs the gate without blocking it.

Commit `docs/` with your code. medra never commits or creates branches for you; it suggests a commit message at the end of every step.

## Design

[plugins/medra/BLUEPRINT.md](plugins/medra/BLUEPRINT.md) covers the topology, contracts and decisions. [cli/SPEC.md](cli/SPEC.md) is the CLI contract.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full details.

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

```bash
cd cli
npm install
npm test                 # node:test suite (end-to-end through the binary)
npm link                 # puts `medra` on your PATH from this checkout
```

### Release checklist (for maintainers)

`cli/package.json` and `plugins/medra/.claude-plugin/plugin.json` **must** carry the exact same semver version (`npm run check-version` enforces this). Because npm versions are immutable, every publish requires bumping the version first:

1. **Bump the version** in both files:
   - `cli/package.json` (`"version": "1.x.y"`)
   - `plugins/medra/.claude-plugin/plugin.json` (`"version": "1.x.y"`)
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
5. **Commit, push, and publish to npm:**
   ```bash
   git add -A
   git commit -m "Release 1.x.y: <summary>"
   git push
   cd cli && npm publish
   ```

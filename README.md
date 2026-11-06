# medra — spec-driven development for Claude Code and Antigravity

medra takes one change at a time from intent to approved specification, technical plan, test-first tasks, implementation, verification, and finally archives it into **living specs** that always describe how the system behaves today. Each archived change also leaves behind **lessons** that make the next change cheaper. The workflow combines ideas from [OpenSpec](https://github.com/Fission-AI/OpenSpec) (living specs, deltas, archive) and [GitHub Spec Kit](https://github.com/github/spec-kit) (constitution, plan gates, clarification markers, traceable tasks).

The `medra` CLI handles every deterministic step: validation, gate records, task checkpoints, delta merge, context packing, test coverage and the learnings store. The agents handle judgment and writing.

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

## Developing the CLI

```bash
cd cli
npm install
npm test                 # node:test suite (end-to-end through the binary)
npm link                 # puts `medra` on your PATH from this checkout
npm publish              # prepack checks versions and bundles plugins/medra into the package
```

`cli/package.json` and `plugins/medra/.claude-plugin/plugin.json` must carry the same version. `npm run check-version` enforces this.

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
/plugin marketplace add <path-or-git-url-of-this-repo>
/plugin install medra@flow
```

### 2b. Antigravity

Run `medra init` in your project and choose `antigravity` as an integration. To add or refresh it later, run `medra install --target antigravity`, or `medra update`. medra is installed as the Antigravity plugin `medra` in `.agents/plugins/medra/` (add `--scope global` for `~/.gemini/config/plugins/medra/`). Commit that folder so everyone who clones the project gets the commands. `medra update` refreshes it only when `antigravity` is listed under `integrations` in `docs/config-flow.yaml`.

Upgrading from 1.1 or earlier: the next install removes the old loose skills in `.agents/skills/medra-*` and `.agents/medra/`, keeping any file you edited.

## First run

```
/medra:init                                  # config, constitution, optional specs from existing code
/medra:propose "let locked-out users reset their password"
/medra:apply                                 # fast track; on the full track: /medra:plan, then /medra:tasks
/medra:verify
/medra:archive
```

The commands are the same on Antigravity.

## Commands

| Command | What it does | Gate |
|---|---|---|
| `init` | Scaffolds `docs/`, sets the language and testing mode, writes the constitution, and can bootstrap specs from existing code | constitution · bootstrap specs |
| `propose` | Writes the proposal and delta specs (`ADDED/MODIFIED/REMOVED`) picks the fast or full track, and marks whether the change is security-relevant. On the fast track it also writes the tasks | proposal (+ tasks) |
| `plan` | Full track: writes the design, the Constitution Check, the test strategy and the decisions. On a security-relevant change, the security agent threat-models the design first | plan |
| `tasks` | Full track: writes a traceable, test-first task list | tasks |
| `apply` | Implements tasks one at a time, with red/green evidence. Resumable | — |
| `verify` | Runs an independent reviewer check against the specs (plus a parallel security audit on a security-relevant change), then a fix loop | verify |
| `review` | Lets anyone review a change's documents and record a verdict | reviewer's verdict |
| `archive` | Merges deltas into living specs, harvests lessons, compacts them, and proposes constitution amendments | amendment |

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

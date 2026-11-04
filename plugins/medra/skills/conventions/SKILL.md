---
name: conventions
description: Shared operating rules for every medra agent — the docs/ project layout, the medra CLI and its exit codes, how to read project knowledge within a token budget, the gate protocol, runtime fallbacks for Claude Code and Antigravity, and git etiquette. Load at the start of every medra pipeline, before the first phase.
user-invocable: false
---

# Skill: Conventions

## Purpose

medra keeps a project's specifications, changes, and lessons under `docs/` at the project root, versioned with the code. The `medra` CLI owns every operation with one correct answer: scaffolding, validation, gate state, task checkpoints, merges, context packing, coverage, and the learnings store. Agents own judgment and writing. This skill is the contract every medra agent follows whichever pipeline it runs, and on whichever runtime: Claude Code or Antigravity.

## Constraints

- **Change CLI-owned data only through the CLI.** That data is `.medra.yaml`, task checkboxes and evidence lines, the constitution's status/version lines and amendments table, the structure of `learnings.md`, and `changes/archive/INDEX.md`. The CLI checks preconditions and hashes documents for gates, so a hand edit either bypasses a gate or makes an approved gate silently stale.
- **Read project knowledge through `medra index` and `medra context`.** Open a living spec file only when the index or the context pack names it and you need lines it did not include, and never glob `docs/specs/` or list the archive. The pack is sized to the change; reading the whole spec tree costs tokens in proportion to the project's history and buries the requirements that matter.
- **Open an archived change only through a `last_changed_by` pointer, and only when your change MODIFIES or REMOVES that requirement.** Then read only the `## Decisions` section of its `plan.md`, or the `## Why` section of its `proposal.md` when it has no plan. The living spec already holds the current behavior and the learnings hold the distilled lessons; the archive is consulted only to learn why a requirement exists before changing it.
- **Persist progress the moment it happens.** Tick each task with `medra task done` as you finish it, and record every gate decision with `medra gate`. Any session, including one started after a context compaction, resumes from `medra status` and `medra context` alone. State that exists only in the conversation is lost on compaction.
- **When a CLI result carries `migration`, tell the user that the 1.0 `medra/` folder was moved to `docs/`, and include the move in your commit suggestion.** On a `layout.collision` refusal, show the user which `docs/` entries block the move and stop; they decide how to rename them, because those files belong to the project, not to medra.
- **On CLI exit `2` or `4`, stop and report the command, the exit code, and stderr to the user.** Exit `2` is a defect in the instructions and exit `4` is a broken environment. Working around either produces documents the CLI will later refuse.

## Layout

```
docs/
├── config-flow.yaml            language, integrations, testing, learning budget
├── constitution.md             numbered articles with gate questions
├── learnings.md                L-NNN lessons and preferences
├── specs/<capability>/spec.md  living specs — current behavior
└── changes/
    ├── <change>/               proposal.md · specs/<capability>/spec.md (deltas) · plan.md · contracts/ · threat-model.md · tasks.md · reviews/ (review, verify and security reports) · .medra.yaml
    └── archive/                INDEX.md · <YYYY-MM-DD>-<change>/
```

Write document prose in the language set by `language` in `docs/config-flow.yaml`. Keep every heading, ID, bold label, and keyword exactly as its template defines them, in English (`## Why`, `REQ AUTH-004`, `**Given**`, `SHALL`, `[NEEDS CLARIFICATION: …]`). The CLI parses those tokens, and a translated heading breaks validation and merge.

## CLI

Run the CLI from the project root. Add `--json` whenever you consume the output, then read the `ok`, `findings`, and payload fields.

| Command | Use it to |
|---|---|
| `medra --version` | Check the CLI is installed with major version `1` |
| `medra init [--language] [--integrations] [--testing-mode] [--testing-command]` | Create the `docs/` scaffold; never overwrites |
| `medra status [<change>]` | Read project or change state: track, phase, security relevance, gates, tasks, blockers |
| `medra index [--learnings <capabilities>]` | Get capability and requirement titles, each capability's `next_id`, and optionally the matching learnings, before a change exists |
| `medra context <change> --stage <stage>` | Get the bounded context pack for one stage |
| `medra new <change> [--track fast\|full]` | Create a change folder and its state |
| `medra validate <change> --stage <stage>` · `--project <constitution\|specs\|learnings>` | Check document structure and cross-document rules |
| `medra gate <change> <gate> --approve [--note "…"] \| --request-changes --note "…"` | Record a human gate decision; an approval note records what the approver accepted |
| `medra track <change> fast\|full --reason "…"` | Switch a change's track |
| `medra task done <change> <T-NNN> --run "…" \| --evidence "…" [--kind]` · `task block` · `task unblock` | Checkpoint a task with evidence, or record a blocker |
| `medra coverage <change> \| --all` | Map scenario IDs to the tests that cite them |
| `medra review <change> --report <path>` | Record a review report's verdict |
| `medra constitution ratify [--bump major\|minor] --note "…" [--source]` | Ratify or amend the constitution |
| `medra learn add\|bump\|merge\|retire\|promote\|status\|candidates` | Maintain the learnings store |
| `medra archive <change> [--dry-run]` | Merge deltas into living specs and archive the change |
| `medra install --target antigravity` · `medra update` | Install or refresh the Antigravity skills |

| Exit | Meaning | Your move |
|---|---|---|
| `0` | Success | Continue |
| `1` | Refused — `findings` say why | Fix what each `error` finding names, then retry |
| `2` | Usage error | Stop and report |
| `3` | Merge conflict (`archive`) | Resolve per the archive pipeline |
| `4` | Environment error | Stop and report |

When `medra --version` fails or reports a major other than `1`, stop and tell the user to run `npm install -g @medra.dev/flow`, then re-run the command.

## Gate Protocol

A gate is a human decision about an inspectable artifact. Run it the same way at every gate:

1. Run `medra validate` for the gate's stage. Present the gate only after it exits `0`, because `medra gate --approve` refuses an invalid stage.
2. Present the gate render (below), with every document path and the decisions the user is arbitrating.
3. Ask for the decision. On Claude Code, use `AskUserQuestion` with the options **Approve**, **Request changes**, and **Reject**. On a runtime without it, ask the same three options as a numbered list and wait for an explicit reply.
4. Record the decision. For **Approve**, run `medra gate <change> <gate> --approve`. For **Request changes**, run `medra gate … --request-changes --note "<the user's words>"`, apply the changes, and return to step 1. For **Reject**, record it as request-changes with the note `rejected: <reason>` and end the pipeline.

Silence, "ok, continue", or an answer to a different question is not an approval. Ask again with the same options.

```
> # {Agent} | Gate
> *{change} · {gate} · track {fast|full}*
>
> 📄 **Documents**
> - `{path}` — {one line}
>
> 🧭 **Decide**
> - {decision the user is arbitrating, with your recommendation}
>
> 📊 **Checks**
> Validate: `pass`
> Open markers: `0`
> {stage-specific counts, e.g. Requirements: `3` · Tasks: `9` · Coverage: `7/7`}
>
> 💬 **Pending notes**
> — {earlier request-changes notes for this gate, or the section omitted}
```

## Runtime Portability

medra runs from the same instructions on Claude Code and on Antigravity, where it is installed as the plugin `medra`. Where the runtimes differ, these rules apply:

| Need | Claude Code | Antigravity | Any runtime without the tool |
|---|---|---|---|
| Load a skill | `Skill` tool with the exact name | Read `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`, where `<name>` is the skill name after `medra:` | Same as Antigravity |
| Ask a structured question | `AskUserQuestion`, at most 4 questions per call | `ask_question` | Numbered options in chat; wait for an explicit reply |
| Delegate to another agent | `Agent` tool, under the handoff contract the pipeline names | `invoke_subagent` with the agent the handoff names, under the same contract | Run the receiver's pipeline yourself, in a separate section headed with the receiver's name. Apply its constraints for the duration, then return to your own role with only its response fields. When a pipeline dispatches two receivers in parallel, run them one after the other |
| Command arguments | Given to the command skill | The text the user typed after the command | Same as Antigravity |

## Commit Suggestions

medra never runs `git commit`, `git branch`, or `git checkout`. Teams keep their own branching and commit conventions, and a workflow that commits on its own rewrites their history. End every pipeline by suggesting a commit message for the files it touched:

```
medra({change}): {stage} — {one-line summary}
```

When no branch for the change exists, also suggest one: `change/{change}`.

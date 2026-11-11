
# Reference: Conventions

## Purpose

medra keeps a project's specifications, changes, and lessons under `docs/` at the project root, versioned with the code. The `medra` CLI owns every operation with one correct answer: scaffolding, validation, gate state, task checkpoints, merges, context packing, coverage, and the learnings store. Agents own judgment and writing. This skill is the contract every medra agent follows whichever pipeline it runs, and on whichever runtime: Claude Code or Antigravity.

## Constraints

- **Change CLI-owned data only through the CLI:** `.medra.yaml`, task checkboxes and evidence lines, the constitution's status/version lines and amendments table, the structure of `learnings.md`, and `changes/archive/INDEX.md`.
- **Read project knowledge through `medra index` and `medra context <change> --stage <stage> --md`.** Open a living spec file only when the index or context pack names it and you need lines it did not include; never glob `docs/specs/` or list the archive.
- **Open an archived change only through a `last_changed_by` pointer, and only when your change MODIFIES or REMOVES that requirement.** Read only the `## Decisions` section of its `plan.md`, or `## Why` of its `proposal.md` when it has no plan.
- **Persist progress immediately.** Tick each task with `medra task done` as you finish it, and record every gate decision with `medra gate`. Any session resumes from `medra status` and `medra context` alone.
- **When a CLI result carries `migration`, tell the user that the 1.0 `medra/` folder was moved to `docs/`, and include the move in your commit suggestion.** On `layout.collision`, show the colliding `docs/` entries and stop.
- **On CLI exit `2` or `4`, stop and report the command, exit code, and stderr to the user.**

## Layout

`docs/` holds `config-flow.yaml`, `constitution.md`, `learnings.md`, `specs/<capability>/spec.md`, `changes/<change>/` (`proposal.md`, `specs/<capability>/spec.md`, `plan.md`, `contracts/`, `threat-model.md`, `tasks.md`, `reviews/`, `.medra.yaml`), and `changes/archive/` (`INDEX.md`, `<YYYY-MM-DD>-<change>/`).

Write document prose in the `language` from `docs/config-flow.yaml`. Keep every heading, ID, bold label, and keyword in English (`## Why`, `REQ AUTH-004`, `**Given**`, `SHALL`, `[NEEDS CLARIFICATION: …]`).

## CLI

Run from the project root. Omit `--json` on `medra index` and pass `--md` on `medra context` (compact Markdown without JSON string-escaping overhead). Use `--json` on state and mutation commands (`status`, `validate`, `new`, `gate`, `track`, `task`, `coverage`, `review`, `constitution`, `learn`, `archive`), then read `ok`, `findings`, and payload fields.

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
| Invocable command | `/medra:<command>` slash command | `/medra:<command>` slash command | Read `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` |
| Read templates, handoffs, pipelines | Read `${CLAUDE_PLUGIN_ROOT}/...` | `read_file` on `${CLAUDE_PLUGIN_ROOT}/...` | Read file directly |
| Ask a structured question | `AskUserQuestion`, at most 4 questions per call | `ask_question` | Numbered options in chat; wait for an explicit reply |
| Delegate to another agent | `Agent` tool, under the handoff contract the pipeline names | `invoke_subagent` with the agent the handoff names, under the same contract | Run the receiver's pipeline yourself, in a separate section headed with the receiver's name. Apply its constraints for the duration, then return to your own role with only its response fields. When a pipeline dispatches two receivers in parallel, run them one after the other |
| Command arguments | Given to the command skill | The text the user typed after the command | Same as Antigravity |

## Commit Suggestions

medra never runs `git commit`, `git branch`, or `git checkout`. Teams keep their own branching and commit conventions, and a workflow that commits on its own rewrites their history. End every pipeline by suggesting a commit message for the files it touched:

```
medra({change}): {stage} — {one-line summary}
```

When no branch for the change exists, also suggest one: `change/{change}`.

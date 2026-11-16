
# Reference: Gate Protocol

A gate is a human decision about an inspectable artifact. Run it the same way at every gate:

1. Run `medra validate` for the gate's stage. Present the gate only after it exits `0`, because `medra gate --approve` refuses an invalid stage.
2. Present the gate render (below), with every document path and the decisions the user is arbitrating.
3. Ask for the decision. On Claude Code, use `AskUserQuestion`; on Antigravity, use `ask_question`; with the options **Approve**, **Request changes**, and **Reject**. On a runtime without either, ask the same three options as a numbered list and wait for an explicit reply. Stop after asking: run no `medra gate` command until the user's answer is in the conversation.
4. Record the decision. For **Approve**, run `medra gate <change> <gate> --approve`. For **Request changes**, run `medra gate … --request-changes --note "<the user's words>"`, apply the changes, and return to step 1. For **Reject**, record it as request-changes with the note `rejected: <reason>` and end the pipeline.

A gate is never skipped, and never decided by you. A clean report, a `pass` verdict, a change with no security relevance or an empty **Decide** list does not remove it: the user still approves what is about to be recorded. Antigravity has no guard hook, so this rule is the only control there.

Silence, "ok, continue", or an answer to a different question is not an approval. Ask again with the same options.

On Claude Code the plugin's guard also asks the user to allow `medra gate … --approve`, `medra constitution ratify` and `--allow-test-edit` at the moment the command runs. When the user declines there, the gate is not decided: ask again with the three options, and never reword, split or script the command to get past the prompt.

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

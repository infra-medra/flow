
# Reference: Gate Protocol

A gate is a human decision about an inspectable artifact. Run it the same way at every gate:

1. Run `medra validate` for the gate's stage. Present the gate only after it exits `0`, because `medra gate --approve` refuses an invalid stage.
2. Present the gate render (below), with every document path and the decisions the user is arbitrating.
3. Ask for the decision. On Claude Code, use `AskUserQuestion` with the options **Approve**, **Request changes**, and **Reject**. On a runtime without it, ask the same three options as a numbered list and wait for an explicit reply.
4. Record the decision. For **Approve**, run `medra gate <change> <gate> --approve`. For **Request changes**, run `medra gate … --request-changes --note "<the user's words>"`, apply the changes, and return to step 1. For **Reject**, record it as request-changes with the note `rejected: <reason>` and end the pipeline.

Silence, "ok, continue", or an answer to a different question is not an approval. Ask again with the same options.

On Claude Code the plugin's guard (`hooks/guard.mjs`) also asks the user to allow `medra gate … --approve`, `medra constitution ratify` and `--allow-test-edit` at the moment the command runs. When the user declines there, the gate is not decided: ask again with the three options, and never reword, split or script the command to get past the prompt.

### Subagent Gate Protection

- **Claude Code `PreToolUse` hook:** Official Claude Code `PreToolUse` hook input includes `agent_id` for subagent tool calls. `hooks/guard.mjs` checks `Boolean(input.agent_id) || process.env.MEDRA_SUBAGENT === '1'` and denies `medra gate ... --approve`, `medra gate ... --request-changes`, and `medra verify-fix` when invoked by a subagent (`medra verify-fix` is coordinator-only and passes through when not in a subagent).
- **`MEDRA_SUBAGENT=1` CLI enforcement:** Both `medra verify-fix` and `medra gate` (`--approve` and `--request-changes`) enforce `MEDRA_SUBAGENT=1` directly inside the CLI and refuse execution (`subagent.forbidden`, exit `1`) when `MEDRA_SUBAGENT=1` is set in the subagent environment. Runtimes or dispatchers without `agent_id` in hook input (including Antigravity subagent dispatch) set `MEDRA_SUBAGENT=1` to trigger this refusal.
- **Platform limitation:** On runtimes without `PreToolUse` hooks (such as Antigravity), CLI commands (`verify-fix`, `gate`) are enforced by `MEDRA_SUBAGENT=1`, but direct manual file edits to `.medra.yaml` or `tasks.md` cannot be intercepted by a hook and rely on subagent instructions and CLI hash/gate verification.

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

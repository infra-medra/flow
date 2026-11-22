
# Reference: Runtime Portability

medra runs from the same instructions on Claude Code and on Antigravity, where it is installed as the plugin `medra`. Where the runtimes differ, these rules apply:

| Need | Claude Code | Antigravity | Any runtime without the tool |
|---|---|---|---|
| Invocable command | `/medra:<command>` slash command | `/medra:<command>` slash command | Read `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` |
| Read templates, handoffs, pipelines | Read `${CLAUDE_PLUGIN_ROOT}/...` | `read_file` on `.agents/plugins/medra/...` (workspace install) or `plugins/medra/...` (source repo) | Read file directly |
| Ask a structured question | `AskUserQuestion`, at most 4 questions per call | `ask_question` | Numbered options in chat; wait for an explicit reply |
| Delegate to another agent | `Agent` tool, under the handoff contract the pipeline names | `invoke_subagent` with the agent the handoff names, under the same contract | Run the receiver's pipeline yourself, in a separate section headed with the receiver's name. Apply its constraints for the duration, then return to your own role with only its response fields. When a pipeline dispatches two receivers in parallel, run them one after the other |
| Command arguments | Given to the command skill | The text the user typed after the command | Same as Antigravity |

## `plugin_pointers` Resolution

`medra step --json` separates project-relative `pointers` (change documents, specs, source files) from plugin-relative `plugin_pointers` (pipelines, templates, references):

- **Claude Code:** Resolve `plugin_pointers` under `${CLAUDE_PLUGIN_ROOT}/...`.
- **Antigravity:** Resolve `plugin_pointers` under `.agents/plugins/medra/...` when the plugin is installed locally in the workspace (`medra install --target antigravity`), or `plugins/medra/...` when working inside the medra source repository.
- **Project `pointers`:** Always resolve relative to the project root, independent of `plugin_pointers`.

## Subagent Gate Protection

- **Claude Code:** `PreToolUse` hooks (`hooks/guard.mjs`) enforce gate and fix-round protection automatically by denying `medra gate ... --approve` and `medra verify-fix` when `agent_id` is present or `MEDRA_SUBAGENT=1` is set (`medra verify-fix` is coordinator-only).
- **Antigravity:** Antigravity lacks native `PreToolUse` hooks, so subagent protection is enforced by role boundary: subagent instructions prohibit calling `medra gate ... --approve` and `medra verify-fix`, and human gates and fix-round recording are handled only by the coordinator.

## Subagent Model Selection

- **`inline` stages:** Stages compiled with `action: "inline"` (`propose`, `plan`, `tasks`, and small `fast`-track `apply`) execute in the main session model, ignoring `models.<stage>` and `models.author` overrides.
- **`dispatch` subagents:** `medra step` resolves each subagent's `model` in order `role -> stage -> default -> inherit`.
- **Claude Code:** Pass `subagent.model.tier` to `Agent` when it is not `inherit`, falling back to `inherit` if the tier is unavailable.
- **Antigravity:** A subagent model tier applies only if `invoke_subagent` supports model selection; otherwise, inherit the conversation/session model.

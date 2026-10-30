---
name: handoff-implementer-reviewer
description: Contract between the implementer (verify) and the reviewer (check). The implementer sends a finished change; the reviewer writes a verification report and returns its verdict.
user-invocable: false
---

# Skill: Handoff — Implementer ↔ Reviewer

## Purpose

This handoff gets the implementer an independent verdict on a finished change before the verify gate. A reviewer whose context holds none of the implementation's reasoning checks the code against the deltas, the plan, the tasks and the constitution. The implementer dispatches it from the verify pipeline once every task is done. The reviewer writes a verification report and returns its verdict and counts.

## Participants

| Role | Agent | Responsibility |
|---|---|---|
| Sender | `implementer` (pipeline-implementer-verify) | Confirms the change is ready, dispatches with pointers only, parses the response, and presents the report at the verify gate |
| Receiver | `reviewer` (pipeline-reviewer-check) | Loads the context pack, checks the implementation and the cross-document consistency, writes the report at `report_path`, and returns the verdict |

## Dispatch

On Claude Code, the sender passes this payload to the Agent tool, with `subagent_type: medra:reviewer`, after the line `Contract: medra:handoff-implementer-reviewer`. On a runtime without subagents, the sender runs the receiver's pipeline itself, using this payload as its input (see `medra:conventions` → Runtime Portability).

| Field | Type | Required | Source |
|---|---|---|---|
| change | string | yes | The change name, from `medra status` |
| change_path | path | yes | `medra/changes/<change>` |
| diff_base | string | yes | The `diff_base` value from `.medra.yaml` (a git ref, or `none`) |
| report_path | path | yes | `medra/changes/<change>/reviews/<YYYY-MM-DD>-verify-agent.md`, using today's date |
| round | integer | yes | `1` for the first check. Increment it on every re-check after fixes |
| fixed_findings | list | no | On rounds after the first: the finding IDs from the previous report that the implementer claims are fixed |

```yaml
change: add-password-reset
change_path: medra/changes/add-password-reset
diff_base: 3f2a9c1
report_path: medra/changes/add-password-reset/reviews/2026-10-31-verify-agent.md
round: 1
```

The code, the deltas and the task list never appear in the payload. The receiver reads them from disk through `medra context` and git.

## Response

The receiver's final message ends with this block:

| Field | Type | Description |
|---|---|---|
| status | enum | `done`, `invalid-dispatch` or `needs-decision` |
| verdict | enum | `pass`, `pass-with-findings` or `fail`. Present when `status: done` |
| report_path | path | The report written. It equals the dispatched `report_path` |
| counts | map | `critical`, `major` and `minor` finding counts |
| unverified | integer | The number of requirements whose Coverage status is `unverified` |
| question | string | Present only with `needs-decision`: the decision needed, with the options |

```yaml
status: done
verdict: fail
report_path: medra/changes/add-password-reset/reviews/2026-10-31-verify-agent.md
counts: { critical: 1, major: 2, minor: 1 }
unverified: 0
```

## Validation

**The sender checks before dispatch:**
- `medra status <change> --json` reports `tasks.done == tasks.total`.
- `medra validate <change> --stage tasks` exits `0`.
- The parent directory of `report_path` exists.

**The receiver checks on receipt:**
- `change_path` exists and contains `.medra.yaml`.
- `diff_base` is `none` or resolves with `git rev-parse`.
- On rounds after the first, `fixed_findings` names IDs present in the previous verify report.

**The sender checks the response:**
- The file at `report_path` exists, and its `**Verdict:**` and `**Counts:**` lines equal `verdict` and `counts`.
- `verdict: pass` comes with `counts.critical == 0`, `counts.major == 0` and `unverified == 0`.
- `verdict: fail` comes with `counts.critical > 0` or `unverified > 0`.

## Error Handling

| Failure point | Action |
|---|---|
| The sender's own dispatch check fails | Do not dispatch. Return to apply for the unfinished tasks, or fix the task-list findings first |
| The receiver gets an invalid dispatch | Write no report. Return `status: invalid-dispatch`, naming each failing field |
| The receiver hits a decision it cannot make (for example, a requirement that is ambiguous in the spec) | Finish everything else, mark the affected requirement `unverified` in the report, and return `status: needs-decision` with the question. The sender puts the question to the user |
| The work fails partway (a CLI exit `2` or `4`) | Return `status: needs-decision`, with the command, its exit code and stderr as the question |
| The sender gets an invalid response | Re-dispatch once with the same payload. If the second response is also invalid, read the report file directly when it exists and present it to the user, noting that the response failed validation |

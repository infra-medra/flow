
# Handoff: Implementer ↔ Security

## Purpose

This handoff gets the implementer an independent security audit of a finished security-relevant change before the verify gate. The implementer dispatches it from the verify pipeline in the same Check round as the reviewer's check, in parallel. The security agent audits the diff, the configuration, the dependencies and conformance to the threat model, writes a security report for the round, and returns its verdict and counts. Its findings feed the same fix loop as the reviewer's and never block the gate.

## Participants

| Role | Agent | Responsibility |
|---|---|---|
| Sender | `implementer` (the `/medra:verify` command) | Confirms the change is ready and security-relevant, dispatches with pointers only, parses the response, fixes findings, and presents the report at the verify gate |
| Receiver | `security` (`${CLAUDE_PLUGIN_ROOT}/pipelines/security-audit.md`) | Validates the dispatch, audits the implementation against authoritative sources, writes the report at `report_path`, and returns the verdict. Writes no other file |

## Dispatch

On Claude Code, the sender passes this payload to the Agent tool, with `subagent_type: medra:security`, after the line `Contract: `${CLAUDE_PLUGIN_ROOT}/handoffs/implementer-security.md``, in the same message as the reviewer's dispatch so both run in parallel. On Antigravity, it passes the same text to `invoke_subagent` for that agent. On a runtime without subagents, the sender runs the receiver's pipeline itself after the reviewer's, using this payload as its input (see `${CLAUDE_PLUGIN_ROOT}/references/portability.md`).

| Field | Type | Required | Source |
|---|---|---|---|
| change | string | yes | The change name, from `medra status` |
| change_path | path | yes | `docs/changes/<change>` |
| diff_base | string | yes | The `diff_base` value from `.medra.yaml` (a git ref, or `none`) |
| report_path | path | yes | `docs/changes/<change>/reviews/<YYYY-MM-DD>-security-agent-r<round>.md`, using today's date and this dispatch's `round` |
| round | integer | yes | The round of this Check, shared with the reviewer's dispatch. `1` for the first check |
| previous_report | path | no | Required on rounds after the security agent's first: the `report_path` of its most recent report, which may carry an earlier round and date |
| fixed_findings | list | no | On rounds after the first: the `S-NN` IDs from `previous_report` that the implementer claims are fixed |

```yaml
change: add-password-reset
change_path: docs/changes/add-password-reset
diff_base: 3f2a9c1
report_path: docs/changes/add-password-reset/reviews/2026-11-04-security-agent-r1.md
round: 1
```

A later round points at the report it follows up on:

```yaml
change: add-password-reset
change_path: docs/changes/add-password-reset
diff_base: 3f2a9c1
report_path: docs/changes/add-password-reset/reviews/2026-11-05-security-agent-r2.md
round: 2
previous_report: docs/changes/add-password-reset/reviews/2026-11-04-security-agent-r1.md
fixed_findings: [S-02, S-03]
```

The code, the threat model and the reviewer's report never appear in the payload. The receiver reads the code and the threat model from disk, and does not read the reviewer's report of the same round.

## Response

The receiver's final message ends with this block:

| Field | Type | Description |
|---|---|---|
| status | enum | `done`, `invalid-dispatch` or `needs-decision` |
| verdict | enum | `pass`, `pass-with-findings` or `fail`. Present when `status: done` |
| report_path | path | The report written. It equals the dispatched `report_path` |
| counts | map | Open findings by severity: `critical`, `high`, `medium`, `low`, `info` |
| unverified_sources | integer | The number of sources the report lists as unreachable |
| question | string | Present only with `needs-decision`: the decision needed, with the options |

```yaml
status: done
verdict: fail
report_path: docs/changes/add-password-reset/reviews/2026-11-04-security-agent-r1.md
counts: { critical: 0, high: 1, medium: 1, low: 2, info: 1 }
unverified_sources: 1
```

## Validation

**The sender checks before dispatch:**
- `medra status <change> --json` reports every task done and `security: relevant`.
- The parent directory of `report_path` exists, and no file exists at `report_path` yet (a re-dispatch under Error Handling excepted).
- On rounds after the security agent's first, `previous_report` exists and is a `-security-agent-r<N>.md` file with `N` lower than `round`.

**The receiver checks on receipt:**
- `change_path` exists and contains `.medra.yaml`.
- `diff_base` is `none` or resolves with `git rev-parse`.
- `report_path` ends in `-security-agent-r<round>.md`.
- When `previous_report` is given, it exists, and every ID in `fixed_findings` is a finding in it.

**The sender checks the response:**
- The file at `report_path` exists, and its `**Verdict:**` and `**Counts:**` lines equal `verdict` and `counts`.
- Its `**Stage:**` line is `security`.

## Error Handling

| Failure | Action |
|---|---|
| The sender's own check fails | Do not dispatch. Return to the readiness step that failed; a change that is not `relevant` gets no audit |
| The receiver gets an invalid dispatch | Write no report. Return `status: invalid-dispatch`, naming each failing field |
| The receiver hits a decision it cannot make (for example, whether an endpoint is meant to be public) | Finish everything else, record the finding with Status `unable-to-verify`, and return `status: needs-decision` with the question. The sender puts the question to the user |
| A source or scanner cannot be reached | Not a failure. The receiver records it under Limitations and counts unreachable sources in `unverified_sources`; the sender presents that count at the gate |
| The work fails partway (a CLI exit `2` or `4`) | Return `status: needs-decision`, with the command, its exit code and stderr as the question |
| The sender gets an invalid response | Re-dispatch once with the same payload; the receiver rewrites that same round's report, never an earlier one. If the second response is also invalid, read the report file directly when it exists and present it at the gate, noting that the response failed validation |

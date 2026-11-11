
# Pipeline: Verify

## Purpose

This pipeline produces an approved verify gate: proof that the implementation does what the approved deltas say, backed by a verification report written by the reviewer and, on a security-relevant change, a security report written by the security agent. It runs interactively when the user runs verify, with one human gate. The reviewer's check and the security audit run in parallel in isolated subagents on Claude Code and Antigravity, one after the other inline on runtimes without subagents, and the implementer fixes both reports' findings between rounds. It differs from apply by judging finished work, and from review by checking code rather than documents.

## Presentation

Phase headers for this pipeline:

| Phase | Header |
|---|---|
| Readiness | `Implementer \| Readiness` |
| Check | `Implementer \| Check` |
| Fix | `Implementer \| Fix` |
| Gate | `Implementer \| Gate` |
| Delivery | `Implementer \| Delivery` |

## Flow

```mermaid
flowchart TD
    Start["Start"] --> Readiness["Readiness\nTasks, validate, coverage"]
    Readiness --> Ready{{"Ready?"}}
    Ready -->|"Yes"| Check["Check\nDispatch reviewer ∥ security"]
    Ready -->|"Uncovered or tasks open"| Stop1["Stop\nResume apply"]
    Check --> Verdict{{"Verdict?"}}
    Verdict -->|"Every verdict pass"| Gate["Gate\nVerify gate"]
    Verdict -->|"Findings or fail"| Fix["Fix\nResolve findings"]
    Verdict -->|"Needs decision"| Ask{{"User decides"}}
    Ask -->|"Answered"| Check
    Ask -->|"Behavior change"| Stop3["Stop\nRevise via propose"]
    Fix --> Check
    Fix -->|"Max 2 rounds"| Gate
    Gate --> Decision{{"User decision?"}}
    Decision -->|"Approved"| Delivery["Delivery\nNext command"]
    Decision -->|"Changes: new round"| Fix
    Decision -->|"Rejected"| Stop2["Stop\nChange stays implementing"]
    Delivery --> Done["Done"]
```

## Phases

### Phase 1 — Readiness

**Goal**
Confirmation that the change satisfies the handoff's dispatch preconditions and that every changed scenario has a covering test.

**Actions**
- Load `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` and `${CLAUDE_PLUGIN_ROOT}/handoffs/implementer-reviewer.md`, then run `medra status <change> --json` and confirm that every task is done. When it reports `security: relevant`, also load `${CLAUDE_PLUGIN_ROOT}/handoffs/implementer-security.md`
- Run `medra validate <change> --stage tasks --json` and `medra coverage <change> --json`
- When the mode is `tdd` or `test-after` and coverage lists uncovered scenarios, stop and tell the user to resume `/medra:apply` with a test task for each one

**Avoid**
- Don't write missing tests here outside a task — because a test with no task has no red/green evidence; route it through apply, where it is checkpointed

**Exit when:**
- [ ] `medra status` reports every task done
- [ ] `medra coverage` reports no uncovered scenario, or the mode is `none`

---

### Phase 2 — Check

**Goal**
This round's verification report and, on a security-relevant change, its security report, each at its dispatched `report_path` with a validated response payload.

**Actions**
- Compose the reviewer's payload exactly as its handoff's Dispatch section defines it, using `round: 1` on the first pass. On later rounds, set `round` to one more than the highest `-verify-agent-r<N>` report in `reviews/`, and add `previous_report` (that report) and `fixed_findings`
- When the change is security-relevant, compose the security payload as `${CLAUDE_PLUGIN_ROOT}/handoffs/implementer-security.md` defines it, with the same `round`, its own `-security-agent-r<round>.md` path, and on later rounds `previous_report` (its latest security report) and the `S-NN` IDs in `fixed_findings`. Skip it in a later round when its latest report's verdict is `pass`; that report stays current
- Dispatch both in one message so they run in parallel: on Claude Code, two Agent calls (`subagent_type: medra:reviewer` and `medra:security`); on Antigravity, `invoke_subagent` for each. On a runtime without subagents, run the reviewer's check and then the audit inline, following `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` → Runtime Portability
- Validate each response against its handoff's Validation rules. When one fails, follow that handoff's Error Handling
- When a response is `needs-decision`, put its question to the user with `AskUserQuestion`, then re-dispatch that receiver with the answer recorded in the change's documents (through `/medra:propose <change>` when the answer changes behavior)

**Avoid**
- Don't summarize the code into a payload — because the handoffs pass pointers; inlined code bloats both contexts and drifts from the files the receivers must read
- Don't pass one receiver's report to the other — because each verdict must be independent; a security audit anchored on the reviewer's pass misses what the reviewer was not looking for

**Exit when:**
- [ ] Each dispatched report exists at its `report_path`, and its Verdict and Counts lines equal its response
- [ ] Each response passed its handoff's Validation rules
- [ ] On a security-relevant change, a security report of this round exists, or the latest one has verdict `pass`

---

### Phase 3 — Fix

**Goal**
Every critical and major review finding, and every critical and high security finding, from the latest reports resolved in code, ready for a re-check.

**Actions**
- Read both reports' findings in severity order, and fix each critical and major review finding and each open critical and high security finding in code and tests, re-running the affected tests to green. For a security finding, add the test its Validation field describes when one can be written
- Fix a minor review finding, or a medium, low or info security finding, when the fix is local and safe. Otherwise leave it for the gate, noting why
- Collect the fixed finding IDs per report (`F-NN` for the reviewer, `S-NN` for security) for the next dispatches' `fixed_findings`, then return to Check with `round` incremented. After round 2, go to the gate with whatever remains
- When the gate returns request-changes, fix the gate notes here, then always run one more Check with the next `round`, outside the two-round limit, and go back to the gate with its verdict without further Fix rounds. Each request-changes at the gate opens exactly one such round

**Avoid**
- Don't argue a finding by editing a report — because each report is its author's record; disagreement goes to the user at the gate
- Don't weaken or disable a security control to make a finding go away — because that trades a reported risk for an unreported one; fix the root cause, or leave the finding for the gate
- Don't change behavior beyond what a finding asks — because each fix must stay inside the approved deltas, like any apply work
- Don't go to the gate after a code change without a new Check round — because the current report then describes code that no longer exists, and `verify.report` only detects changes made through `medra task done`

**Exit when:**
- [ ] Every critical and major review finding, and every critical and high security finding, is fixed or explicitly left for the gate
- [ ] The tests affected by the fixes pass

---

### Phase 4 — Gate

**Goal**
A verify-gate decision recorded by `medra gate`.

**Actions**
- Run `medra validate <change> --stage verify --json`. When `verify.report` or `verify.security-report` fails because code changed after the last check, return to Check
- Run the gate as `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` → Gate Protocol describes it, for gate `verify`. Present the current verification report with its verdict and counts, the number of check rounds, the coverage ratio, and any finding left unresolved together with its reason
- On a security-relevant change, present the current security report as well: its verdict, open counts by severity, origin mix and unreachable sources, and put each open critical or high security finding up as its own decision to accept as residual risk or to fix
- Record the decision with `medra gate`. On approval with open security findings, pass `--note` listing each accepted one as `accepted-risk: S-NN — <the user's reason>`

**Avoid**
- Don't present a `fail` verdict as approvable without stating each unresolved critical finding — because approving verify lets archive merge the deltas into living specs as if they were true
- Don't fold open security findings into a single "approve" — because an accepted risk needs a named finding and a reason on the record; the CLI does not block on them, so this gate is the only control

**Exit when:**
- [ ] `medra status <change> --json` shows gate `verify` as `approved` or `changes-requested`, or the user rejected it
- [ ] Every request-changes note was recorded through `medra gate --note`

---

### Phase 5 — Delivery

**Goal**
A bounded summary that names the next command.

**Actions**
- Report the report path, the verdict, the counts, the coverage ratio and the number of check rounds, plus the security report path, its verdict and the number of accepted risks on a security-relevant change
- Suggest a commit as `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` → Commit Suggestions describes it
- Name the next command: `/medra:archive`

**Avoid**
- Don't paste the findings — because they are in the report file

**Exit when:**
- [ ] The summary names the report path and the next command
- [ ] A commit suggestion was given

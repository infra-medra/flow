# Constitution

**Status:** ratified
**Version:** 1.0
**Ratified:** 2026-11-21
**Last amended:** 2026-11-21

## Articles

### Article I: Deterministic CLI Ownership

All deterministic operations—including state transitions, validation, gate hashing, task checkpoints, delta merges, and prompt/context compilation—MUST live in the `medra` CLI, and skills or agents MUST NOT hand-edit CLI-owned state files.

**Gate:** Does every deterministic operation in this change run through the `medra` CLI without agents mutating CLI-owned state directly?
**Rationale:** Separating deterministic enforcement from LLM reasoning prevents hallucinated state, broken merges, and prompt-driven drift.

### Article II: Test-First & Scenario Traceability

Every new or modified behavior MUST be covered by an automated test written and observed failing before implementation, citing its BDD scenario ID (`REQ-NNN.S1`) so `npm --prefix cli test` and `medra coverage` verify it deterministically.

**Gate:** Does every added or modified scenario map to a `[TEST]` task ordered before its implementation task and verified by `npm --prefix cli test`?
**Rationale:** Tests written after implementation assert what the code happens to do rather than what the approved specification requires.

### Article III: Cross-Runtime Parity & Synced Bundles

Every user-facing command, skill, and agent contract MUST support both Claude Code and Antigravity via the portability mapping, and `cli/plugin/` MUST remain synchronized with `plugins/medra/` via `npm --prefix cli run bundle-plugin` and `npm --prefix cli run check-version`.

**Gate:** Does this change preserve parity across Claude Code and Antigravity and keep `cli/plugin/` and package versions synchronized?
**Rationale:** Divergent runtime instructions or stale bundled plugin files break one platform silently at release time.

### Article IV: Security & Evidence Integrity

Code and prompts MUST validate filesystem paths against traversal, treat external content as untrusted data rather than instructions, and MUST NOT fabricate tool outputs, test results, CVEs, or security findings.

**Gate:** Are all path inputs validated against traversal and are all claims, test evidences, and security findings backed by direct tool execution or authoritative sources?
**Rationale:** Path traversal bugs, prompt injection from external artifacts, and fabricated verification claims compromise both user environments and gate trust.

### Article V: Bounded Context & Simplicity

Context packs and compiled prompts MUST stay bounded to the current step's touched requirements, scoped learnings, and code pointers, and implementations MUST NOT introduce speculative abstractions or unrequested features outside the approved delta fence.

**Gate:** Does the design keep prompts/context bounded to touched artifacts and avoid abstractions or scope beyond the approved deltas?
**Rationale:** Unbounded context causes quadratic token growth and degraded agent accuracy, while speculative complexity slows every future change.

## Amendments

| Version | Date | Change | Source |
|---|---|---|---|
| 1.0 | 2026-11-21 | Initial constitution | init |

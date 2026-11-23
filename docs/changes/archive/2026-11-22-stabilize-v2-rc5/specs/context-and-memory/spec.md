# Delta: context-and-memory

**Capability:** `context-and-memory`

## ADDED Requirements

### REQ CTX-006: Deduplicated batch context compilation

The system SHALL deduplicate touched requirements, scenarios, scoped decisions, scoped learnings, and code pointers across all tasks included in an `apply` `batch` prompt, without duplicating shared context per task.

#### Scenario CTX-006.S1: Deduplicating shared REQs and pointers across batch tasks

- **Given** a `batch` of 3 pending tasks in the same phase citing overlapping `REQ`s and file paths
- **When** `compileStep` builds the batch `implementer` prompt
- **Then** each shared requirement, decision, learning, and pointer appears once in the compiled prompt

### REQ CTX-007: Honest full-stage token and byte measurement

The system SHALL measure per-stage byte/token cost in `cli/scripts/measure-envelope.js` as `coordinator skill + pointed pipeline(s) + envelope/prompt` (in addition to `cli_json_bytes`), and record both `task` vs `batch` benchmark figures on `docs/changes/archive/2026-11-21-remodel-deterministic-v2-flow` and corrected `rc.1` numbers in `CHANGELOG.md`.

#### Scenario CTX-007.S1: Measuring skill + pipeline + envelope totals per stage

- **Given** `cli/scripts/measure-envelope.js` run on a benchmark project
- **When** it reports per-stage metrics
- **Then** output includes coordinator skill bytes, pointed pipeline bytes, envelope/prompt bytes, and their combined total per stage

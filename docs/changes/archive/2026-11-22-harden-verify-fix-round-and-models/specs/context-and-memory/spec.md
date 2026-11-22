# Delta: context-and-memory

**Capability:** `context-and-memory`

## MODIFIED Requirements

### REQ CTX-005: Deterministic step and prompt compilation

The system SHALL compile a minimal, self-contained step prompt and handoff envelope from on-disk change state via the `medra` CLI, resolving only the active step's touched requirements, scenarios, scoped decisions, scoped learnings, hybrid code references, and unambiguous runtime-portable plugin pointers, mapping flow stages to valid `medra validate` stages, transitioning `verify` deterministically between `dispatch` and `gate` using coordinator-recorded CLI fix rounds (without delegating `medra verify-fix` to subagent `exit_command`s), resolving per-subagent models (`role -> stage -> default -> inherit`), deduplicating large embedded blocks at the top level, supporting compact default `--json` envelopes with deterministic `--role <role> [--task <T-ID>] --md` subagent fetch output (`--full` preserved), and supporting `action: "inline"` for small `fast`-track `apply` and `propose`/`plan`/`tasks`, while surfacing git diff failures explicitly and fencing untrusted embedded content with `<untrusted_data>`.

#### Scenario CTX-005.S8: Verify action transitions with CLI-tracked fix rounds

- **Given** a change at `verify` with valid current review/security reports
- **When** `resolveStage` and `compileStep` evaluate `verifyFindings`
- **Then** no blockers returns `action: "gate", gate: "verify"`, blocking findings with `0` fix rounds returns `action: "dispatch"` for a fix implementer whose `exit_command` runs test verification (never `medra verify-fix`), repeated `compileStep` calls without `medra verify-fix` are idempotent, coordinator-recorded `medra verify-fix` makes old reports stale for re-verification, and blocking findings after `1` fix round returns `action: "gate", gate: "verify"` with findings in the envelope for human decision

#### Scenario CTX-005.S14: Step envelope schemas and size measurement script

- **Given** the updated optional envelope fields (`fetch_command`, `embedded` keys, `plugin_pointers`, `findings`, per-subagent `model`)
- **When** `cli/schemas/envelope.schema.json`, `contracts/step-envelope.schema.json`, and `cli/scripts/measure-envelope.js` are evaluated
- **Then** both schemas validate the fields without breaking existing 1.x/2.0-rc consumers and `measure-envelope.js` reports coordinator `verify` `--json` size < 4 KB with no stage growing more than 10% over `2.0.0-rc.3`

#### Scenario CTX-005.S15: Coordinator-owned fix round and idempotent compileStep

- **Given** a change at `verify` with blocking review findings and `0` recorded fix rounds
- **When** `medra step` runs twice consecutively without `medra verify-fix` in between
- **Then** both calls return the identical fix-implementer envelope without incrementing `verify_fix_rounds` and no subagent `exit_command` contains `verify-fix`

#### Scenario CTX-005.S16: Per-subagent model resolution precedence and inline warning

- **Given** `docs/config-flow.yaml` with `models` overrides across `role`, `stage`, and `default`
- **When** `compileStep` builds `subagents[]`
- **Then** each subagent resolves `role -> stage -> default -> inherit` while the envelope `model` remains the stage tier, and `medra validate --project` (or documentation) addresses `models.<stage>` / `models.author` on `inline` stages

#### Scenario CTX-005.S17: Recorded review timestamp and hash freshness (plan-gated)

- **Given** a review report recorded via `medra review` with `reviews[].recorded_at` and file hash stored in state
- **When** the file's `mtime` is touched to the future and a new task is completed afterward (or the file hash diverges)
- **Then** if Item 5 is approved at the `plan` gate, the report is treated as stale using `recorded_at` and hash (falling back to `mtime` only for 1.x changes lacking `recorded_at`); if rejected at the `plan` gate, the limitation is recorded under Known issues in `CHANGELOG.md`

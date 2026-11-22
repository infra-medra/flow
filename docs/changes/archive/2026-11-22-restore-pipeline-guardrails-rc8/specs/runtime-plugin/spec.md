# Delta: runtime-plugin

**Capability:** `runtime-plugin`

## ADDED Requirements

### REQ PLUG-015: Inline verdict and critical findings in verify pipelines

The system SHALL keep the `verify` verdict table (`fail`, `pass-with-findings`, `pass`) and critical-findings list inline in `plugins/medra/pipelines/reviewer-check.md` (keeping `references/verify-checklists.md` §1 focused on conditional `changed_since_previous` and `invalid-dispatch`/`needs-decision` rules, and updating the top conditional read instruction accordingly) and keep every-round verdict/counts rules available in `plugins/medra/pipelines/security-audit.md` without conditional reference reads.

#### Scenario PLUG-015.S1: Reviewer and security pipelines carry every-round verdict rules inline

- **Given** `plugins/medra/pipelines/reviewer-check.md` and `plugins/medra/pipelines/security-audit.md`
- **When** inspected for report verdict contracts
- **Then** `reviewer-check.md` includes the verdict table and critical-findings list inline with conditional reading limited to `changed_since_previous` / `invalid-dispatch` / `needs-decision`, and `security-audit.md` states its verdict/counts rules without conditional reference gating

### REQ PLUG-016: Concise rule rationales within lean pipeline byte budget

The system SHALL include a concise one-sentence rationale on core pipeline guardrails—test integrity, post-`red` immutability, and scenario-matched `red` in `implementer-apply.md`; no `pass` with `unverified` requirements and report-only editing in `reviewer-check.md`; no unverified `remediated` from `fixed_findings` in `security-audit.md`; and `<untrusted_data>` data-only treatment across all pipelines receiving external content—while keeping total `plugins/medra/pipelines/*.md` bytes below `36,700 B`.

#### Scenario PLUG-016.S1: Pipeline rationales present under 36,700 B ceiling

- **Given** all 9 files in `plugins/medra/pipelines/*.md`
- **When** tested for rule rationales and total byte size
- **Then** each required rule includes its one-sentence rationale and the combined size of `plugins/medra/pipelines/*.md` is strictly below `36,700 B`

### REQ PLUG-017: Inline session budget in implementer-apply pipeline

The system SHALL define the `implementer-apply.md` session budget inline—completing at the end of the assigned batch in `batch` mode, or transitioning to Delivery in `task`/`inline` mode when the next task opens a new phase and 6+ tasks have been checkpointed—and remove the duplicate definition from `plugins/medra/references/apply-recovery.md` §4.

#### Scenario PLUG-017.S1: Single-source session budget in implementer-apply.md

- **Given** `plugins/medra/pipelines/implementer-apply.md` and `plugins/medra/references/apply-recovery.md`
- **When** checked for session budget rules
- **Then** `implementer-apply.md` defines both `batch` and `task`/`inline` limits directly, and `apply-recovery.md` §4 no longer duplicates the session budget definition

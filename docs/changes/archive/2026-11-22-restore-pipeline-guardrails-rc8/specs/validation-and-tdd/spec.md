# Delta: validation-and-tdd

**Capability:** `validation-and-tdd`

## ADDED Requirements

### REQ VAL-007: Scenario-matched red failure requirement in TDD

The system SHALL require `[TEST]` tasks in `tdd` (across `plugins/medra/pipelines/implementer-apply.md`, compiled `batch` prompts, and compiled `fast`-track `inline` prompts) to confirm that the observed `red` failure matches the missing behavior predicted by the scenario (fixing import, syntax, fixture, or environment errors before `--kind red`), accompanied by a one-sentence rationale explaining that a wrong-reason `red` invalidates the subsequent `green`.

#### Scenario VAL-007.S1: Scenario-matched red rule in apply pipeline and compiled prompts

- **Given** `plugins/medra/pipelines/implementer-apply.md` and `compileStep` outputs for `batch` and `fast`-track `inline` `apply`
- **When** inspected for `tdd` `[TEST]` instructions
- **Then** all three explicitly require the `red` failure to match the scenario's predicted missing behavior (not load/environment errors) and state why

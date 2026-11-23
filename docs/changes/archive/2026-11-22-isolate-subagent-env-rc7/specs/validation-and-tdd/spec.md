# Delta: validation-and-tdd

**Capability:** `validation-and-tdd`

## ADDED Requirements

### REQ VAL-006: Isolate child test and check processes from MEDRA_SUBAGENT

The CLI SHALL strip `MEDRA_SUBAGENT` from the child process environment when executing `medra task done --run`, `testing.checks`, and `medra suite` via a shared `childEnv()` helper in `cli/src/core.js`, preserving all other environment variables while continuing to enforce `process.env.MEDRA_SUBAGENT` in `requireCoordinator` for direct CLI invocations.

#### Scenario VAL-006.S1: Child test and check commands do not inherit MEDRA_SUBAGENT while other env vars pass through

- **Given** a project with `testing.command` and `testing.checks` that read `process.env.MEDRA_SUBAGENT` and a custom variable such as `MEDRA_TEST_MARKER`
- **When** a subagent runs `MEDRA_SUBAGENT=1 medra suite <change> --json` or `MEDRA_SUBAGENT=1 medra task done <change> <T-ID> --run "<cmd>"` with `MEDRA_TEST_MARKER=x`
- **Then** the child commands observe `MEDRA_SUBAGENT` as unset (empty), `MEDRA_TEST_MARKER` as `x`, and exit `0`

#### Scenario VAL-006.S2: Direct privileged CLI commands still refuse MEDRA_SUBAGENT=1

- **Given** `MEDRA_SUBAGENT=1` is set in the CLI process environment
- **When** a subagent invokes `medra gate <change> verify --approve` or `medra verify-fix <change>`
- **Then** the CLI refuses execution with rule `subagent.forbidden` and exit code `1`

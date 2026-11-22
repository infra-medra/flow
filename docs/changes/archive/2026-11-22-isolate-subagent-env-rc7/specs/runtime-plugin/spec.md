# Delta: runtime-plugin

**Capability:** `runtime-plugin`

## ADDED Requirements

### REQ PLUG-011: Isolate test harness CLI helpers from caller MEDRA_SUBAGENT

The test harness helpers `medra()` and `medraHuman()` in `cli/test/helpers.js` SHALL strip `MEDRA_SUBAGENT` from the default child environment so the test suite passes identically whether invoked directly or from a subagent shell with `MEDRA_SUBAGENT=1`, while tests verifying subagent refusal explicitly set `MEDRA_SUBAGENT: '1'` per call.

#### Scenario PLUG-011.S1: Full test suite passes when invoked under MEDRA_SUBAGENT=1

- **Given** the test suite is executed with `MEDRA_SUBAGENT=1` in the parent environment
- **When** `npm --prefix cli test` runs
- **Then** all tests pass, including gate/verify fixture tests and explicit `MEDRA_SUBAGENT=1` refusal tests

### REQ PLUG-012: Document MEDRA_SUBAGENT=1 command scope in plugin references

`plugins/medra/references/gate.md` and `plugins/medra/references/portability.md` SHALL state that `MEDRA_SUBAGENT=1` applies only to the `medra` command invoked by the subagent and that the CLI removes it from the environment of test and check commands it executes, with bundle parity maintained.

#### Scenario PLUG-012.S1: Reference docs and bundled plugin reflect MEDRA_SUBAGENT=1 scope

- **Given** `plugins/medra/references/gate.md` and `plugins/medra/references/portability.md` are updated
- **When** bundles are regenerated and `node cli/scripts/check-bundle-drift.js` runs
- **Then** both reference files state that `MEDRA_SUBAGENT=1` applies only to the `medra` command called by the subagent and is stripped from child test/check processes, and bundle parity passes

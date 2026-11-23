# Proposal: isolate-subagent-env-rc7

## Why

In `2.0.0-rc.6`, `medra step` prefixes every non-`inline` subagent `fetch_command` and `exit_command` with `MEDRA_SUBAGENT=1` so `requireCoordinator` in `cli/src/commands.js` refuses `medra gate` and `medra verify-fix` invoked by subagents (`subagent.forbidden`, exit `1`).

However, `medra task done --run`, `testing.checks`, and `medra suite` execute user test commands via `spawnSync(..., { shell: true })` inheriting `process.env`. When a subagent runs `MEDRA_SUBAGENT=1 medra suite <change> --json` (for example, the verify fix implementer whose `exit_command` is `medra suite`), `MEDRA_SUBAGENT=1` leaks into the child test process. In this repository, `MEDRA_SUBAGENT=1 npm --prefix cli test` breaks 28 of 98 tests because fixture tests call `medra gate` and `medra verify-fix`. Similarly, `cli/test/helpers.js` invokes the CLI without stripping `MEDRA_SUBAGENT`, making the test suite sensitive to the caller's environment.

## What Changes

- `cli/src/core.js` exports `childEnv()` returning a copy of `process.env` without `MEDRA_SUBAGENT`.
- `cli/src/commands.js` passes `env: childEnv()` to `medra task done --run`, `testing.checks`, and `medra suite`.
- `cli/test/helpers.js` strips `MEDRA_SUBAGENT` from default child environments in `medra()` and `medraHuman()`.
- `plugins/medra/references/gate.md` and `plugins/medra/references/portability.md` document `MEDRA_SUBAGENT=1` scope, and bundles/version/`CHANGELOG.md` are updated to `2.0.0-rc.7`.

## Scope

### In scope

1. Add `childEnv()` in `cli/src/core.js` returning a copy of `process.env` without `MEDRA_SUBAGENT`, and pass `env: childEnv()` to the three `spawnSync(..., { shell: true })` calls in `cli/src/commands.js` (`medra task done --run`, `testing.checks`, and `medra suite`), while keeping `requireCoordinator` reading `process.env.MEDRA_SUBAGENT` on the CLI process itself.
2. Update `medra()` and `medraHuman()` in `cli/test/helpers.js` to strip `MEDRA_SUBAGENT` from the default child environment while keeping explicit `MEDRA_SUBAGENT: '1'` in refusal tests (`cli/test/guard.test.js`, `cli/test/step-plug009.test.js`).
3. Document in `plugins/medra/references/gate.md` and `plugins/medra/references/portability.md` that `MEDRA_SUBAGENT=1` applies only to the `medra` command called by the subagent and is stripped by the CLI from child test/check processes, regenerate bundles, bump version to `2.0.0-rc.7`, and update `CHANGELOG.md`.

### Out of scope

- Changing `requireCoordinator` semantics or weakening `MEDRA_SUBAGENT=1` enforcement on `medra gate` or `medra verify-fix`.
- Modifying `medra step` envelope prefixing introduced in `2.0.0-rc.6`.

## Track

**Track:** fast
**Rationale:** Targeted environment-isolation fix across two existing capabilities (`validation-and-tdd`, `runtime-plugin`) with well-defined helper, test, and reference-doc changes.
**Security:** relevant
**Security rationale:** Touches environment-variable isolation (`MEDRA_SUBAGENT=1`) around `spawnSync(..., { shell: true })` and `requireCoordinator` privilege enforcement in `cli/src/core.js` and `cli/src/commands.js`.

## Capabilities

| Capability | Operation | Requirements |
|---|---|---|
| `validation-and-tdd` | modified | VAL-006 |
| `runtime-plugin` | modified | PLUG-011, PLUG-012 |

## Impact

- **Code:** `cli/src/core.js`, `cli/src/commands.js`, `cli/test/helpers.js`, `cli/test/install-misc.test.js`, new/updated tests in `cli/test/`.
- **Interfaces:** `childEnv()` exported from `cli/src/core.js`; `cli/test/helpers.js` `medra()` and `medraHuman()` default child environment; `plugins/medra/references/gate.md` and `portability.md`.
- **Data:** None.
- **Dependencies:** None.

## Open Questions

None.

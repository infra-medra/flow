# Review: per-runtime-models — verify

**Stage:** verify
**Verdict:** pass-with-findings
**Counts:** critical 0 · major 2 · minor 2
**Reviewer:** reviewer agent
**Date:** 2026-11-22

## Summary

Per-runtime model configuration (`models.claude`, `models.antigravity`), runtime detection (`--runtime`, `MEDRA_RUNTIME`, environment markers, single-integration fallback), inline override warnings, Antigravity skill `--runtime antigravity` rewriting, and the `2.1.0` version/bundle sync are implemented and backed by a recorded green `npm --prefix cli test` suite and passing `check-version` / `check-bundle-drift` checks. Two major findings remain before archive: `plugins/medra/references/portability.md` (and synced plugin bundles) still documents the superseded `role -> stage -> default -> inherit` precedence, and `cli/test/per-runtime-models.test.js` omits assertions for several `REQ PLUG-005` branches including the `implementer: fallback-tier` flat fallback it configures. Two minor documentation findings cover stale precedence descriptions in the envelope JSON schemas and mixed benchmark baselines in `README.md`.

## Findings

### F-01 [major] Cross-runtime reference `portability.md` still states the superseded model precedence

**Where:** `plugins/medra/references/portability.md:30` (and synced copies `.agents/plugins/medra/references/portability.md:30`, `cli/plugin/references/portability.md:30`) · `PLUG-005`, Constitution Article III
**Problem:** Under `## Subagent Model Selection`, line 30 still reads `` - **`dispatch` subagents:** `medra step` resolves each subagent's `model` in order `role -> stage -> default -> inherit`. `` and omits `models.claude` / `models.antigravity`, the updated precedence (`models[runtime][role] -> models[runtime][stage] -> models[runtime].default -> models[role] -> models[stage] -> models.default -> inherit`), and runtime selection (`--runtime <claude|antigravity>`, `MEDRA_RUNTIME`, environment detection, single-integration fallback). Because `portability.md` is part of the `runtime-plugin` capability (`plugins/medra/**`), agents and users consulting it receive an outdated contract.
**Fix:** Update `plugins/medra/references/portability.md:30` to document `models.claude` / `models.antigravity`, the 7-step precedence, and runtime resolution (`--runtime`, `MEDRA_RUNTIME`, env detection, single-integration fallback), then re-run `npm --prefix cli run bundle-plugin` and `node cli/bin/medra.js install --target antigravity --force`.

### F-02 [major] `per-runtime-models.test.js` leaves `MEDRA_RUNTIME`, Antigravity env detection, single-integration fallback, `models[runtime].default`, flat fallback, and invalid `models.<runtime>` warnings unasserted

**Where:** `cli/test/per-runtime-models.test.js:41-125` · `PLUG-005`, Constitution Article II (`T001`/`T002`)
**Problem:** `cli/test/per-runtime-models.test.js:77` is titled `compileStep resolves per-runtime models via --runtime, env detection, and flat fallback` and line 81 configures `implementer: fallback-tier`, yet lines 91-125 never assert `fallback-tier` resolving when `models[runtime]` has no override, nor test `models[runtime].default` (`cli/src/step.js:247`), `MEDRA_RUNTIME` (`cli/src/step.js:228`), `ANTIGRAVITY_AGENT` / `GEMINI_CLI` env detection (`cli/src/step.js:230`), single-integration fallback (`cli/src/step.js:232-236`), or `configWarnings` on non-object/unknown/empty `models.<runtime>` entries (`cli/src/core.js:111-122`).
**Fix:** Add assertions in `cli/test/per-runtime-models.test.js` exercising `implementer: fallback-tier` flat fallback alongside `models[runtime]`, `models[runtime].default`, `MEDRA_RUNTIME`, `ANTIGRAVITY_AGENT`/`GEMINI_CLI`, single-integration fallback, and invalid `models.<runtime>` warning cases.

### F-03 [minor] Envelope JSON schemas still describe the pre-2.1.0 model resolution precedence

**Where:** `cli/schemas/envelope.schema.json:69`, `contracts/step-envelope.schema.json:71` · `PLUG-005`
**Problem:** Both schema files retain `"description": "Resolved model tier for this subagent (precedence: role -> stage -> default -> inherit), with fallback."` on `subagents[].model`, which omits the per-runtime precedence steps added in `cli/src/step.js:240-253`.
**Fix:** Update the `description` string in `cli/schemas/envelope.schema.json:69` and `contracts/step-envelope.schema.json:71` to `models[runtime][role] -> models[runtime][stage] -> models[runtime].default -> models[role] -> models[stage] -> models.default -> inherit`.

### F-04 [minor] `README.md` benchmark metrics mix baselines and disagree with `measure-envelope.js` and `CHANGELOG.md`

**Where:** `README.md:9`, `README.md:63` (and bundled `cli/README.md:9`, `cli/README.md:63`) · `T003`, Constitution Article IV
**Problem:** `README.md:9` states `Up to 86% lower apply overhead` and `README.md:63` states `cutting a 14-task benchmark from 190,021 B (14 dispatches) down to 26,039 B (4 dispatches)`. Direct execution of `node cli/scripts/measure-envelope.js` reports `task: 89,725 B` (14 dispatches) vs `batch: 26,039 B` (4 dispatches, `-71.0%`), while `CHANGELOG.md:66` records the pre-lean-pipeline `2.0.0-rc.5` baseline as `189,545 B` (`task`, 14 dispatches) vs `68,113 B` (`batch`, 5 dispatches, `-64.1%`), leaving `190,021 B` unbacked by either tool run or changelog record.
**Fix:** Update `README.md:9` and `README.md:63` to report the consistent `measure-envelope.js` comparison (`89,725 B` -> `26,039 B`, `~71%` reduction) or explicitly cite the `2.0.0-rc.5` pre-lean-pipeline `task` baseline (`189,545 B`), then re-run `npm --prefix cli run bundle-plugin`.

## Coverage

| Requirement | Evidence | Status |
|---|---|---|
| `PLUG-005` (`PLUG-005.S2`) | Implemented in `cli/src/core.js:40-132`, `cli/src/validate.js:13-41`, `cli/src/step.js:227-253,641-648`, `cli/bin/medra.js:97-111`, and `cli/src/install.js:63`; `medra coverage per-runtime-models` reports `1/1` covered (`cli/test/install-misc.test.js:475`, `cli/test/per-runtime-models.test.js:41,77`); `tasks.md` `T001` (`red` exit 1) -> `T002` (`green` exit 0) -> `T003` (`check-version` & `check-bundle-drift` exit 0); recorded `suite` (`npm --prefix cli test`, exit `0`, matching fingerprint `f53ca841...`). | met |

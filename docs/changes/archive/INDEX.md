# Archive

| # | Date | Change | Capabilities | Requirements | Why |
|---|---|---|---|---|---|
| 1 | 2026-11-21 | remodel-deterministic-v2-flow | context-and-memory, runtime-plugin, validation-and-tdd, workflow-state | +CTX-005 +PLUG-005 ~PLUG-001 +VAL-005 +STATE-005 | In medra 1.x, command skills carry 8–14 KB of multi-phase instructions and run inline, accumulating conversation hist... |
| 2 | 2026-11-21 | fix-v2-step-compiler-regressions | context-and-memory, runtime-plugin, workflow-state | ~CTX-005 ~PLUG-001 ~PLUG-003 ~PLUG-004 ~STATE-005 | The v2 step compiler and thin coordinator skills ship with regressions that silently drop git diffs during verificati... |
| 3 | 2026-11-22 | fix-v2-step-regressions-and-tokens | context-and-memory, runtime-plugin, workflow-state | ~CTX-005 ~PLUG-001 ~PLUG-002 ~PLUG-003 ~PLUG-004 ~STATE-005 | Coordinators running `/medra:run`, `/medra:verify`, and `/medra:apply` on `2.0.0-rc.2` hit broken validation commands... |
| 4 | 2026-11-22 | harden-verify-fix-round-and-models | context-and-memory, runtime-plugin, workflow-state | ~CTX-005 ~PLUG-001 ~PLUG-002 ~PLUG-003 ~PLUG-004 ~PLUG-005 ~STATE-005 | A review of commit `7496b85` (`2.0.0-rc.3`) identified five remaining reliability, security, and consistency issues i... |
| 5 | 2026-11-22 | stabilize-v2-rc5 | context-and-memory, runtime-plugin, workflow-state | +CTX-006 +CTX-007 +PLUG-006 +PLUG-007 +PLUG-008 +PLUG-009 ~PLUG-003 +STATE-006 +STATE-007 ~STATE-005 | Before tagging `2.0.0`, a review of `2.0.0-rc.4` (`4cd4247`) identified 1.10.0 regressions in incremental `verify` ha... |
| 6 | 2026-11-22 | close-v2-gaps-rc6 | runtime-plugin, workflow-state | +PLUG-010 ~PLUG-008 ~PLUG-009 ~STATE-006 | Before tagging `2.0.0`, three concrete gaps remain in `2.0.0-rc.5`: the first `verify` step fails into an unapprovabl... |
| 7 | 2026-11-22 | isolate-subagent-env-rc7 | runtime-plugin, validation-and-tdd | +PLUG-011 +PLUG-012 +VAL-006 | In `2.0.0-rc.6`, `medra step` prefixes every non-`inline` subagent `fetch_command` and `exit_command` with `MEDRA_SUB... |
| 8 | 2026-11-22 | optimize-v2-tokens | context-and-memory, runtime-plugin, workflow-state | +CTX-008 +PLUG-013 +PLUG-014 ~PLUG-006 +STATE-008 | Measured `2.0.0-rc.7` step envelopes via `cli/scripts/measure-envelope.js` show that compiled CLI JSON envelopes acco... |

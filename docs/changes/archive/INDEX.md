# Archive

| # | Date | Change | Capabilities | Requirements | Why |
|---|---|---|---|---|---|
| 1 | 2026-11-21 | remodel-deterministic-v2-flow | context-and-memory, runtime-plugin, validation-and-tdd, workflow-state | +CTX-005 +PLUG-005 ~PLUG-001 +VAL-005 +STATE-005 | In medra 1.x, command skills carry 8–14 KB of multi-phase instructions and run inline, accumulating conversation hist... |
| 2 | 2026-11-21 | fix-v2-step-compiler-regressions | context-and-memory, runtime-plugin, workflow-state | ~CTX-005 ~PLUG-001 ~PLUG-003 ~PLUG-004 ~STATE-005 | The v2 step compiler and thin coordinator skills ship with regressions that silently drop git diffs during verificati... |
| 3 | 2026-11-22 | fix-v2-step-regressions-and-tokens | context-and-memory, runtime-plugin, workflow-state | ~CTX-005 ~PLUG-001 ~PLUG-002 ~PLUG-003 ~PLUG-004 ~STATE-005 | Coordinators running `/medra:run`, `/medra:verify`, and `/medra:apply` on `2.0.0-rc.2` hit broken validation commands... |

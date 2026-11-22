# Learnings

## Active

### L-001 [lesson] Match ISO timestamp precision across freshness checks

**Statement:** Use millisecond-precision ISO timestamps (new Date().toISOString()) for state fields compared in freshness checks; never compare second-truncated nowIso() values against millisecond-precision recorded_at timestamps.
**Scope:** capabilities: context-and-memory, workflow-state · paths: cli/src/** · stages: plan, apply, verify
**Evidence:** 2026-11-22-harden-verify-fix-round-and-models
**Occurrences:** 1
**Last seen:** 4

### L-002 [lesson] Strip quoted literals before Bash segment matching in hooks

**Statement:** Strip single- and double-quoted strings before matching Bash command segments in hook guards, and match exported and quoted env-var assignments. Otherwise ';', '|', or '&' inside '--note' or '--run' arguments bypasses gate and subagent checks.
**Scope:** paths: plugins/medra/hooks/** · stages: plan, apply, verify
**Evidence:** 2026-11-22-close-v2-gaps-rc6
**Occurrences:** 1
**Last seen:** 6

## Promoted

## Retired

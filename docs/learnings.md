# Learnings

## Active

### L-001 [lesson] Match ISO timestamp precision across freshness checks

**Statement:** Use millisecond-precision ISO timestamps (new Date().toISOString()) for state fields compared in freshness checks; never compare second-truncated nowIso() values against millisecond-precision recorded_at timestamps.
**Scope:** capabilities: context-and-memory, workflow-state · paths: cli/src/** · stages: plan, apply, verify
**Evidence:** 2026-11-22-harden-verify-fix-round-and-models
**Occurrences:** 1
**Last seen:** 4

## Promoted

## Retired

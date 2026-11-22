# Delta: workflow-state

**Capability:** `workflow-state`

## ADDED Requirements

### REQ STATE-008: Fast-path step compilation without redundant heavy checks

The system SHALL execute `compileStep` (`cli/src/step.js`) using a stage-scoped fast path so that stages which do not consume verify diff or suite/merge readiness (`propose`, `plan`, `tasks`, `apply`, `done`) skip `safeGitDiff`, `suiteFindings`, and `verifyFindings` / `prepareVerifyRound` work, while `verify` retains all pre-dispatch checks, diff computation, and freshness checks.

#### Scenario STATE-008.S1: Non-verify compileStep skips verify-only diff and suite checks

- **Given** a change in `propose`, `plan`, `tasks`, `apply`, or `done`
- **When** `compileStep` compiles the current step
- **Then** `compileStep` does not invoke `safeGitDiff` or `prepareVerifyRound`, while `compileStep` for `verify` still runs pre-dispatch suite/merge checks and diff computation

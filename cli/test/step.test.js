import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import YAML from 'yaml';
import { loadState, suiteFindings } from '../src/change.js';
import { prepareVerifyRound } from '../src/handoff.js';
import { compileStep } from '../src/step.js';
import { medra, project, livingSpec, req, proposal, write, delta, tasks } from './helpers.js';

function setupVerifyChange(change, { command = 'node -e "process.exit(0)"', security = 'relevant' } = {}) {
  const root = project({ mode: 'tdd' });
  const cfgPath = path.join(root, 'docs', 'config-flow.yaml');
  const cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.testing = { ...cfg.testing, mode: 'tdd', command };
  fs.writeFileSync(cfgPath, YAML.stringify(cfg));

  livingSpec(root, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])]);
  assert.equal(medra(root, 'new', change, '--track', 'fast').code, 0);
  proposal(root, change, { track: 'fast', caps: [['auth', 'modified', 'AUTH-001']], security });
  write(root, `docs/changes/${change}/specs/auth/spec.md`, delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])}`));
  tasks(root, change, [
    '- [ ] T001 [TEST] [AUTH-001] Test AUTH-001.S1 in `test/auth.test.js` — verify: red',
    '- [ ] T002 [AUTH-001] after T001 Implement login in `src/auth.js` — verify: green',
  ]);
  assert.equal(medra(root, 'gate', change, 'proposal', '--approve').code, 0);
  write(root, 'test/auth.test.js', '// AUTH-001.S1\n');
  write(root, 'src/auth.js', 'export const login = () => true;\n');
  assert.equal(medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1').code, 0);
  assert.equal(medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0').code, 0);
  return { root, cfgPath };
}

// Covers STATE-006.S2 (T001): structured reason on verify.suite findings and gating on failed suites
test('STATE-006.S2: suiteFindings and prepareVerifyRound emit structured reason (not-run, stale, failed) and failed suite gates verify', () => {
  const change = 'suite-reason-gate';
  const { root, cfgPath } = setupVerifyChange(change);

  // 1. not-run
  const notRunDirect = suiteFindings(root, change, loadState(root, change));
  assert.equal(notRunDirect.length, 1);
  assert.equal(notRunDirect[0].rule, 'verify.suite');
  assert.equal(notRunDirect[0].reason, 'not-run');

  const notRunRound = prepareVerifyRound(root, change, 'check', { forStep: true });
  assert.equal(notRunRound.ok, false);
  assert.equal(notRunRound.findings[0].rule, 'verify.suite');
  assert.equal(notRunRound.findings[0].reason, 'not-run');

  // 2. failed -> reason: 'failed' and compileStep returns action: 'gate'
  const cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.testing.command = 'node -e "process.exit(1)"';
  fs.writeFileSync(cfgPath, YAML.stringify(cfg));
  assert.equal(medra(root, 'suite', change).code, 1);

  const failedDirect = suiteFindings(root, change, loadState(root, change));
  assert.equal(failedDirect.length, 1);
  assert.equal(failedDirect[0].rule, 'verify.suite');
  assert.equal(failedDirect[0].reason, 'failed');

  const failedRound = prepareVerifyRound(root, change, 'check', { forStep: true });
  assert.equal(failedRound.ok, false);
  assert.equal(failedRound.findings[0].reason, 'failed');

  const failedEnv = compileStep(root, change);
  assert.equal(failedEnv.stage, 'verify');
  assert.equal(failedEnv.action, 'gate');
  assert.equal(failedEnv.gate, 'verify');
  assert.deepEqual(failedEnv.subagents, []);
  assert.ok(failedEnv.findings.some((f) => f.rule === 'verify.suite' && f.reason === 'failed'));

  // 3. stale -> reason: 'stale'
  cfg.testing.command = 'node -e "process.exit(0)"';
  fs.writeFileSync(cfgPath, YAML.stringify(cfg));
  assert.equal(medra(root, 'suite', change).code, 0);
  write(root, 'src/auth.js', 'export const login = () => false;\n');

  const staleDirect = suiteFindings(root, change, loadState(root, change));
  assert.equal(staleDirect.length, 1);
  assert.equal(staleDirect[0].rule, 'verify.suite');
  assert.equal(staleDirect[0].reason, 'stale');

  const staleRound = prepareVerifyRound(root, change, 'check', { forStep: true });
  assert.equal(staleRound.ok, false);
  assert.equal(staleRound.findings[0].reason, 'stale');

  // 4. not-run/stale + verify.merge conflict still gates
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-002', 'Other', [['AUTH-002.S1', 'Other']])]);
  const mixedEnv = compileStep(root, change);
  assert.equal(mixedEnv.action, 'gate');
  assert.equal(mixedEnv.gate, 'verify');
  assert.ok(mixedEnv.findings.some((f) => f.rule === 'verify.suite' && f.reason === 'stale'));
  assert.ok(mixedEnv.findings.some((f) => f.rule === 'verify.merge'));
});

// Covers PLUG-008.S2 (T002): pre-verify not-run/stale suite dispatch, idempotency, transition to round 1, and unconfigured command
test('PLUG-008.S2: pre-verify not-run/stale suite dispatches medra suite coordinator_steps without snapshots and transitions to round 1', () => {
  const change = 'pre-verify-suite-dispatch';
  const { root } = setupVerifyChange(change);

  // 1. not-run -> action: dispatch, coordinator_steps: [medra suite], subagents: [], no snapshot written
  const env1 = compileStep(root, change);
  assert.equal(env1.stage, 'verify');
  assert.equal(env1.action, 'dispatch');
  assert.deepEqual(env1.subagents, []);
  assert.ok(Array.isArray(env1.coordinator_steps));
  assert.equal(env1.coordinator_steps.length, 1);
  assert.equal(env1.coordinator_steps[0].type, 'command');
  assert.equal(env1.coordinator_steps[0].command, `medra suite ${change} --json`);
  assert.equal(loadState(root, change).handoff_snapshots, undefined);

  // Idempotent on repeated call
  const env1Again = compileStep(root, change);
  assert.deepEqual(env1Again.coordinator_steps, env1.coordinator_steps);
  assert.deepEqual(env1Again.subagents, []);
  assert.equal(loadState(root, change).handoff_snapshots, undefined);

  // 2. Running medra suite transitions next step to round 1 reviewer + security with suite: "green"
  assert.equal(medra(root, 'suite', change).code, 0);
  const round1Env = compileStep(root, change);
  assert.equal(round1Env.stage, 'verify');
  assert.equal(round1Env.action, 'dispatch');
  assert.deepEqual(round1Env.coordinator_steps, []);
  const rev = round1Env.subagents.find((s) => s.role === 'reviewer');
  const sec = round1Env.subagents.find((s) => s.role === 'security');
  assert.ok(rev && sec, 'PLUG-008.S2: expected round 1 reviewer and security subagents after green suite');
  assert.equal(rev.round, 1);
  assert.equal(rev.suite, 'green');
  assert.equal(sec.round, 1);
  assert.equal(sec.suite, 'green');

  // 3. Modifying code before verify makes suite stale -> emits medra suite coordinator_step again without touching round 1 snapshot
  const snapshotsBeforeStale = loadState(root, change).handoff_snapshots;
  write(root, 'src/auth.js', 'export const login = () => "edited";\n');
  const staleEnv = compileStep(root, change);
  assert.equal(staleEnv.stage, 'verify');
  assert.equal(staleEnv.action, 'dispatch');
  assert.deepEqual(staleEnv.subagents, []);
  assert.equal(staleEnv.coordinator_steps.length, 1);
  assert.equal(staleEnv.coordinator_steps[0].type, 'command');
  assert.equal(staleEnv.coordinator_steps[0].command, `medra suite ${change} --json`);
  assert.deepEqual(loadState(root, change).handoff_snapshots, snapshotsBeforeStale);

  // Re-running medra suite restores round 1 dispatch with suite: "green"
  assert.equal(medra(root, 'suite', change).code, 0);
  const restoredEnv = compileStep(root, change);
  assert.equal(restoredEnv.action, 'dispatch');
  assert.deepEqual(restoredEnv.coordinator_steps, []);
  assert.equal(restoredEnv.subagents.find((s) => s.role === 'reviewer')?.round, 1);
  assert.equal(restoredEnv.subagents.find((s) => s.role === 'reviewer')?.suite, 'green');

  // 4. Without testing.command configured, no suite step is emitted and verify dispatches round 1 directly
  const noSuiteChange = 'no-suite-cmd';
  const { root: noSuiteRoot } = setupVerifyChange(noSuiteChange, { command: null, security: 'not-relevant' });
  const noSuiteEnv = compileStep(noSuiteRoot, noSuiteChange);
  assert.equal(noSuiteEnv.stage, 'verify');
  assert.equal(noSuiteEnv.action, 'dispatch');
  assert.deepEqual(noSuiteEnv.coordinator_steps, []);
  assert.equal(noSuiteEnv.subagents.length, 1);
  assert.equal(noSuiteEnv.subagents[0].role, 'reviewer');
  assert.equal(noSuiteEnv.subagents[0].round, 1);
  assert.equal(noSuiteEnv.subagents[0].suite, undefined);
});

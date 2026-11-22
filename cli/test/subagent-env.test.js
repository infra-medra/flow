import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BIN, project, brownfieldChange, write, read, rules } from './helpers.js';

function runCli(cwd, args, env) {
  const res = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env });
  let json = null;
  try { json = JSON.parse(res.stdout.trim().split('\n').pop()); } catch { /* non-JSON output */ }
  return { code: res.status, json, stdout: res.stdout, stderr: res.stderr };
}

// Covers VAL-006.S1: Child test and check commands do not inherit MEDRA_SUBAGENT while other env vars pass through
test('VAL-006.S1: medra task done --run, testing.checks, and medra suite strip MEDRA_SUBAGENT and preserve other env vars', () => {
  const root = project();
  const change = brownfieldChange(root);
  const subagentEnv = { ...process.env, MEDRA_SUBAGENT: '1', MEDRA_TEST_MARKER: 'x' };
  const coordEnv = { ...process.env };
  delete coordEnv.MEDRA_SUBAGENT;

  // Coordinator approves proposal before apply tasks.
  assert.equal(runCli(root, ['gate', change, 'proposal', '--approve', '--json'], coordEnv).code, 0);

  write(root, 'check-env.mjs', `
import fs from 'node:fs';
const label = process.argv[2];
const shouldFail = process.argv.includes('--fail');
const hasSubagent = Object.prototype.hasOwnProperty.call(process.env, 'MEDRA_SUBAGENT');
const subagent = process.env.MEDRA_SUBAGENT ?? null;
const marker = process.env.MEDRA_TEST_MARKER ?? null;
fs.writeFileSync(\`env-\${label}.json\`, JSON.stringify({ hasSubagent, subagent, marker }));
if (hasSubagent || marker !== 'x' || shouldFail) process.exit(1);
`);

  const cfg = read(root, 'docs/config-flow.yaml')
    .replace('command: npm test', 'command: node check-env.mjs suite-cmd')
    .replace(/command: null/, 'command: node check-env.mjs suite-cmd')
    .replace('checks: []', 'checks:\n    - node check-env.mjs check');
  write(root, 'docs/config-flow.yaml', cfg);

  write(root, 'test/a.test.js', '// AUTH-001.S1 AUTH-001.S3 AUTH-005.S1\nassert(true);\n');

  // Red checkpoint with MEDRA_SUBAGENT=1: child still observes MEDRA_SUBAGENT unset and MEDRA_TEST_MARKER=x.
  const redRes = runCli(root, ['task', 'done', change, 'T001', '--run', 'node check-env.mjs task-red --fail', '--kind', 'red', '--json'], subagentEnv);
  assert.equal(redRes.code, 0, redRes.stdout || redRes.stderr);
  assert.deepEqual(JSON.parse(read(root, 'env-task-red.json')), { hasSubagent: false, subagent: null, marker: 'x' });

  // Green checkpoint on implementation task runs both --run and testing.checks.
  const greenRes = runCli(root, ['task', 'done', change, 'T002', '--run', 'node check-env.mjs task-run', '--kind', 'green', '--json'], subagentEnv);
  assert.equal(greenRes.code, 0, greenRes.stdout || greenRes.stderr);
  assert.deepEqual(JSON.parse(read(root, 'env-task-run.json')), { hasSubagent: false, subagent: null, marker: 'x' });
  assert.deepEqual(JSON.parse(read(root, 'env-check.json')), { hasSubagent: false, subagent: null, marker: 'x' });

  // Clear check output so suite run proves testing.checks also strips MEDRA_SUBAGENT.
  fs.rmSync(path.join(root, 'env-check.json'));

  const suiteRes = runCli(root, ['suite', change, '--json'], subagentEnv);
  assert.equal(suiteRes.code, 0, suiteRes.stdout || suiteRes.stderr);
  assert.deepEqual(JSON.parse(read(root, 'env-suite-cmd.json')), { hasSubagent: false, subagent: null, marker: 'x' });
  assert.deepEqual(JSON.parse(read(root, 'env-check.json')), { hasSubagent: false, subagent: null, marker: 'x' });
});

// Covers VAL-006.S2: Direct privileged CLI commands still refuse MEDRA_SUBAGENT=1
test('VAL-006.S2: direct medra gate and medra verify-fix still refuse with subagent.forbidden when MEDRA_SUBAGENT=1', () => {
  const root = project();
  const change = brownfieldChange(root);
  const subagentEnv = { ...process.env, MEDRA_SUBAGENT: '1' };

  const gateRes = runCli(root, ['gate', change, 'verify', '--approve', '--json'], subagentEnv);
  assert.equal(gateRes.code, 1);
  assert.equal(gateRes.json?.ok, false);
  assert.ok(rules(gateRes).includes('subagent.forbidden'), `expected subagent.forbidden, got: ${gateRes.stdout}`);

  const verifyFixRes = runCli(root, ['verify-fix', change, '--json'], subagentEnv);
  assert.equal(verifyFixRes.code, 1);
  assert.equal(verifyFixRes.json?.ok, false);
  assert.ok(rules(verifyFixRes).includes('subagent.forbidden'), `expected subagent.forbidden, got: ${verifyFixRes.stdout}`);
});

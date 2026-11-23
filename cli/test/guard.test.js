import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BIN, project, brownfieldChange, rules } from './helpers.js';

const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins', 'medra');
const GUARD = path.join(PLUGIN, 'hooks', 'guard.mjs');

/** Runs hooks/guard.mjs on stdin PreToolUse JSON and returns permissionDecision or null. */
function guard(tool_name, tool_input, { extra = {}, env = process.env } = {}) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input, ...extra }),
    encoding: 'utf8',
    env,
  });
  assert.equal(res.status, 0, res.stderr);
  if (!res.stdout) return null;
  const out = JSON.parse(res.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.ok(out.permissionDecisionReason.startsWith('medra: '));
  return out.permissionDecision;
}

const bash = (command, opts) => guard('Bash', { command }, opts);

// Covers PLUG-009.S2: guard.mjs denies MEDRA_SUBAGENT=1 medra gate|verify-fix commands
test('PLUG-009.S2: guard.mjs denies MEDRA_SUBAGENT=1 prefixed gate and verify-fix commands for subagents', () => {
  const cleanEnv = { ...process.env };
  delete cleanEnv.MEDRA_SUBAGENT;

  // Command prefixed with MEDRA_SUBAGENT=1 is denied even without agent_id or hook env MEDRA_SUBAGENT=1
  assert.equal(bash('MEDRA_SUBAGENT=1 medra gate x verify --approve', { env: cleanEnv }), 'deny');
  assert.equal(bash('MEDRA_SUBAGENT=1 medra gate x verify --request-changes --note "reopen"', { env: cleanEnv }), 'deny');
  assert.equal(bash('MEDRA_SUBAGENT=1 medra verify-fix x', { env: cleanEnv }), 'deny');
  assert.equal(bash('cd app && MEDRA_SUBAGENT=1 medra gate x verify --approve', { env: cleanEnv }), 'deny');
  assert.equal(bash('MEDRA_SUBAGENT=1 node cli/bin/medra.js verify-fix x --json', { env: cleanEnv }), 'deny');

  // Also denied when agent_id or env MEDRA_SUBAGENT=1 is present alongside the command prefix
  assert.equal(bash('MEDRA_SUBAGENT=1 medra gate x verify --approve', { extra: { agent_id: 'sub-1' }, env: cleanEnv }), 'deny');
  assert.equal(bash('MEDRA_SUBAGENT=1 medra verify-fix x', { env: { ...cleanEnv, MEDRA_SUBAGENT: '1' } }), 'deny');

  // Quoted/exported/subshell MEDRA_SUBAGENT=1 and quoted semicolons in --note must still be denied (S-01, S-02)
  assert.equal(bash('MEDRA_SUBAGENT="1" medra gate x verify --approve', { env: cleanEnv }), 'deny');
  assert.equal(bash('export MEDRA_SUBAGENT=1; medra verify-fix x', { env: cleanEnv }), 'deny');
  assert.equal(bash('(MEDRA_SUBAGENT=1 medra gate x verify --approve)', { env: cleanEnv }), 'deny');
  assert.equal(bash('medra gate x verify --note "a;b" --approve', { extra: { agent_id: 'sub-1' }, env: cleanEnv }), 'deny');
  assert.equal(bash('medra gate x verify --note "a;b" --request-changes', { extra: { agent_id: 'sub-1' }, env: cleanEnv }), 'deny');

  // Coordinator invocations without MEDRA_SUBAGENT=1 remain ask / allowed
  assert.equal(bash('medra gate x verify --approve', { env: cleanEnv }), 'ask');
  assert.equal(bash('MEDRA_SUBAGENT=0 medra gate x verify --approve', { env: cleanEnv }), 'ask');
  assert.equal(bash('medra verify-fix x', { env: cleanEnv }), null);
  assert.equal(bash('medra gate x verify --request-changes --note "reopen"', { env: cleanEnv }), null);
});

// Covers PLUG-009.S1: CLI requireCoordinator refuses gate and verify-fix when MEDRA_SUBAGENT=1 and allows when unset
test('PLUG-009.S1: CLI requireCoordinator refuses gate and verify-fix with MEDRA_SUBAGENT=1 and allows without it', () => {
  const root = project();
  const change = brownfieldChange(root);
  const cleanEnv = { ...process.env };
  delete cleanEnv.MEDRA_SUBAGENT;
  const subagentEnv = { ...cleanEnv, MEDRA_SUBAGENT: '1' };

  const runCli = (args, env) => {
    const res = spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8', env });
    let json = null;
    try { json = JSON.parse(res.stdout.trim().split('\n').pop()); } catch { /* non-JSON output */ }
    return { code: res.status, json, stdout: res.stdout, stderr: res.stderr };
  };

  const approveDenied = runCli(['gate', change, 'proposal', '--approve', '--json'], subagentEnv);
  assert.equal(approveDenied.code, 1);
  assert.equal(approveDenied.json?.ok, false);
  assert.ok(rules(approveDenied).includes('subagent.forbidden'));

  const reqChangesDenied = runCli(['gate', change, 'proposal', '--request-changes', '--note', 'x', '--json'], subagentEnv);
  assert.equal(reqChangesDenied.code, 1);
  assert.equal(reqChangesDenied.json?.ok, false);
  assert.ok(rules(reqChangesDenied).includes('subagent.forbidden'));

  const verifyFixDenied = runCli(['verify-fix', change, '--json'], subagentEnv);
  assert.equal(verifyFixDenied.code, 1);
  assert.equal(verifyFixDenied.json?.ok, false);
  assert.ok(rules(verifyFixDenied).includes('subagent.forbidden'));

  const approveAllowed = runCli(['gate', change, 'proposal', '--approve', '--json'], cleanEnv);
  assert.equal(approveAllowed.code, 0, approveAllowed.stdout || approveAllowed.stderr);
  assert.equal(approveAllowed.json?.ok, true);
  assert.equal(approveAllowed.json?.status, 'approved');
});

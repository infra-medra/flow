import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { write, project, brownfieldChange, BIN, rules } from './helpers.js';

const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins', 'medra');
const GUARD = path.join(PLUGIN, 'hooks', 'guard.mjs');

function cleanEnv() {
  const env = { ...process.env };
  delete env.MEDRA_SUBAGENT;
  return env;
}

/** Runs the guard as Claude Code does: the tool call as JSON on stdin. Returns its decision, or null when it stays silent. */
function guard(tool_name, tool_input, { extra = {}, env = cleanEnv() } = {}) {
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

test('hooks.json registers the guard for Bash, Write and Edit', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
  const [entry] = cfg.hooks.PreToolUse;
  assert.equal(entry.matcher, 'Bash|Write|Edit');
  assert.deepEqual(entry.hooks[0].args, ['${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs']);
});

test('guard: the human decisions ask the user; other medra commands pass', () => {
  assert.equal(bash('medra gate add-reset plan --approve'), 'ask');
  assert.equal(bash('cd app && medra gate add-reset verify --approve --note "accepted-risk: S-01"'), 'ask');
  assert.equal(bash('medra constitution ratify --bump minor --note "x" --source L-003'), 'ask');
  assert.equal(bash('medra task done add-reset T003 --run "npm test" --allow-test-edit'), 'ask');
  assert.equal(bash('medra gate add-reset plan --request-changes --note "split it"'), null);
  assert.equal(bash('medra task done add-reset T003 --run "npm test"'), null);
  assert.equal(bash('medra status --json ; medra validate add-reset --stage plan --json'), null);
  assert.equal(bash('medra status x --json ; echo --approve'), null, 'the flag must belong to the gate command');
  assert.equal(bash('npm test'), null);
});

test('guard: CLI-owned files are denied to hand edits, in a medra project only', () => {
  const root = project();
  const change = brownfieldChange(root);
  const p = (rel) => path.join(root, rel);
  assert.equal(guard('Write', { file_path: p(`docs/changes/${change}/.medra.yaml`), content: 'phase: verified\n' }), 'deny');
  assert.equal(guard('Edit', { file_path: p(`docs/changes/${change}/.medra.yaml`), old_string: 'pending', new_string: 'approved' }), 'deny');
  assert.equal(guard('Edit', { file_path: p('docs/changes/archive/INDEX.md'), old_string: 'a', new_string: 'b' }), 'deny');
  assert.equal(bash(`sed -i 's/pending/approved/' docs/changes/${change}/.medra.yaml`), 'deny');
  assert.equal(bash(`echo "phase: verified" >> docs/changes/${change}/.medra.yaml`), 'deny');
  assert.equal(bash(`cat docs/changes/${change}/.medra.yaml`), null, 'reading is fine');

  // Authoring documents stays free
  assert.equal(guard('Write', { file_path: p(`docs/changes/${change}/proposal.md`), content: '# Proposal\n' }), null);
  assert.equal(guard('Write', { file_path: p('src/a.js'), content: 'x' }), null);

  // The same paths outside a medra project are none of the guard's business
  const other = fs.mkdtempSync(path.join(path.dirname(root), 'plain-'));
  write(other, 'docs/changes/x/.medra.yaml', 'a: 1\n');
  assert.equal(guard('Write', { file_path: path.join(other, 'docs/changes/x/.medra.yaml'), content: 'a: 2\n' }), null);
});

test('guard: tasks.md can be written and reworded, but not ticked or given evidence by hand', () => {
  const root = project();
  const change = brownfieldChange(root);
  const file = path.join(root, `docs/changes/${change}/tasks.md`);
  const open = '- [ ] T002 [AUTH-001, AUTH-005] after T001 Implement in `src/a.js` — verify: green';
  assert.equal(guard('Edit', { file_path: file, old_string: open, new_string: open.replace('Implement', 'Implement the reset') }), null, 'rewording');
  assert.equal(guard('Edit', { file_path: file, old_string: open, new_string: open.replace('- [ ]', '- [x]') }), 'deny', 'a hand tick');
  assert.equal(guard('Edit', { file_path: file, old_string: open, new_string: `${open}\n  - evidence green 2026-11-13: \`npm test\` exit 0` }), 'deny', 'a forged evidence line');
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(guard('Write', { file_path: file, content: `${text}- [ ] T003 [AUTH-005] after T002 Polish in \`src/a.js\` — verify: green\n` }), null, 'a new open task');
  assert.equal(guard('Write', { file_path: file, content: text.replace('- [ ] T001', '- [x] T001') }), 'deny');

  // A task the CLI already ticked may be reworded (an ID fix after an archive conflict): no new tick, same evidence
  const done = '- [x] T001 [TEST] [AUTH-001] Write tests — verify: red\n  - evidence red 2026-11-13: `npm test` exit 1';
  assert.equal(guard('Edit', { file_path: file, old_string: done, new_string: done.replace('AUTH-001', 'AUTH-006') }), null);
});

test('guard: an existing living spec asks before a hand edit; a new one is written freely', () => {
  const root = project();
  brownfieldChange(root);
  assert.equal(guard('Edit', { file_path: path.join(root, 'docs/specs/auth/spec.md'), old_string: 'Login', new_string: 'Sign in' }), 'ask');
  assert.equal(guard('Write', { file_path: path.join(root, 'docs/specs/billing/spec.md'), content: '# Billing\n' }), null, 'bootstrapping a new spec');
});

test('guard: malformed input and other tools never block a call', () => {
  const res = spawnSync(process.execPath, [GUARD], { input: 'not json', encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
  assert.equal(guard('Read', { file_path: '/x/docs/changes/y/.medra.yaml' }), null);
});

test('guard [PLUG-004.S1]: hand-edits to .medra.yaml and docs/changes/archive/ are denied via Write, Edit, and Bash', () => {
  const root = project();
  const change = brownfieldChange(root);
  const p = (rel) => path.join(root, rel);
  assert.equal(guard('Write', { file_path: p(`docs/changes/${change}/.medra.yaml`), content: 'phase: verified\n' }), 'deny');
  assert.equal(guard('Write', { file_path: p('docs/changes/archive/2026-11-21-x/proposal.md'), content: '# x\n' }), 'deny');
  assert.equal(guard('Edit', { file_path: p('docs/changes/archive/INDEX.md'), old_string: 'a', new_string: 'b' }), 'deny');
  assert.equal(bash(`echo "x" >> docs/changes/archive/INDEX.md`), 'deny');
});

test('guard [PLUG-004.S2, PLUG-004.S3]: medra gate --approve asks in coordinator context and denies when subagent is signaled', () => {
  const cleanEnv = { ...process.env };
  delete cleanEnv.MEDRA_SUBAGENT;

  assert.equal(bash('medra gate add-reset plan --approve', { env: cleanEnv }), 'ask');
  assert.equal(bash('medra gate add-reset plan --approve', { env: { ...cleanEnv, MEDRA_SUBAGENT: '0' } }), 'ask');
  assert.equal(bash('medra gate add-reset plan --approve', { extra: { agent_id: '' }, env: cleanEnv }), 'ask');
  assert.equal(bash('medra gate add-reset plan --approve', { extra: { agent_id: 'subagent-1' }, env: cleanEnv }), 'deny');
  assert.equal(bash('cd app && medra gate add-reset verify --approve --note "x"', { extra: { agent_id: 'subagent-2' }, env: cleanEnv }), 'deny');
  assert.equal(bash('medra gate add-reset plan --approve', { env: { ...cleanEnv, MEDRA_SUBAGENT: '1' } }), 'deny');
  assert.equal(bash('node cli/bin/medra.js gate add-reset verify --approve', { env: cleanEnv }), 'ask');
  assert.equal(bash('node cli/bin/medra.js gate add-reset verify --approve', { extra: { agent_id: 'subagent-3' }, env: cleanEnv }), 'deny');
  assert.equal(bash('node cli/bin/medra.js gate add-reset verify --approve', { env: { ...cleanEnv, MEDRA_SUBAGENT: '1' } }), 'deny');
  assert.equal(bash('medra gate add-reset verify --approve', { extra: { agent_id: 'subagent-4' }, env: { ...cleanEnv, MEDRA_SUBAGENT: '1' } }), 'deny');

  // S-01: subagents cannot invoke medra gate ... --request-changes either (would reset verify_fix_rounds), while coordinator stays allowed
  assert.equal(bash('medra gate add-reset verify --request-changes --note "reopen"', { env: cleanEnv }), null);
  assert.equal(bash('medra gate add-reset verify --request-changes --note "reopen"', { env: { ...cleanEnv, MEDRA_SUBAGENT: '0' } }), null);
  assert.equal(bash('medra gate add-reset verify --request-changes --note "reopen"', { extra: { agent_id: '' }, env: cleanEnv }), null);
  assert.equal(bash('medra gate add-reset verify --request-changes --note "reopen"', { extra: { agent_id: 'subagent-1' }, env: cleanEnv }), 'deny');
  assert.equal(bash('cd app && medra gate add-reset verify --request-changes --note "reopen"', { extra: { agent_id: 'subagent-2' }, env: cleanEnv }), 'deny');
  assert.equal(bash('medra gate add-reset verify --request-changes --note "reopen"', { env: { ...cleanEnv, MEDRA_SUBAGENT: '1' } }), 'deny');
  assert.equal(bash('node cli/bin/medra.js gate add-reset verify --request-changes --note "reopen"', { env: cleanEnv }), null);
  assert.equal(bash('node cli/bin/medra.js gate add-reset verify --request-changes --note "reopen"', { extra: { agent_id: 'subagent-3' }, env: cleanEnv }), 'deny');
  assert.equal(bash('medra status x --json ; echo --request-changes', { extra: { agent_id: 'subagent-1' }, env: cleanEnv }), null);

  const gateDoc = fs.readFileSync(path.join(PLUGIN, 'references', 'gate.md'), 'utf8');
  assert.match(gateDoc, /agent_id/, 'references/gate.md must document Claude Code PreToolUse agent_id detection');
  assert.match(gateDoc, /MEDRA_SUBAGENT=1/, 'references/gate.md must document MEDRA_SUBAGENT=1 fallback');
  assert.match(gateDoc, /Antigravity/i, 'references/gate.md must document platform limitation (e.g. Antigravity)');
});

test('guard [PLUG-004.S4, PLUG-002.S2, M-01]: medra verify-fix allows coordinator context, denies when subagent is signaled, and docs cover verify-fix boundaries', () => {
  const cleanEnv = { ...process.env };
  delete cleanEnv.MEDRA_SUBAGENT;

  assert.equal(bash('medra verify-fix add-reset --json', { env: cleanEnv }), null);
  assert.equal(bash('medra verify-fix add-reset --json', { env: { ...cleanEnv, MEDRA_SUBAGENT: '0' } }), null);
  assert.equal(bash('medra verify-fix add-reset --json', { extra: { agent_id: '' }, env: cleanEnv }), null);
  assert.equal(bash('medra verify-fix add-reset --json', { extra: { agent_id: 'subagent-1' }, env: cleanEnv }), 'deny');
  assert.equal(bash('cd app && medra verify-fix add-reset --json', { extra: { agent_id: 'subagent-2' }, env: cleanEnv }), 'deny');
  assert.equal(bash('medra verify-fix add-reset --json', { env: { ...cleanEnv, MEDRA_SUBAGENT: '1' } }), 'deny');
  assert.equal(bash('node cli/bin/medra.js verify-fix add-reset --json', { env: cleanEnv }), null);
  assert.equal(bash('node cli/bin/medra.js verify-fix add-reset --json', { extra: { agent_id: 'subagent-3' }, env: cleanEnv }), 'deny');
  assert.equal(bash('node cli/bin/medra.js verify-fix add-reset --json', { env: { ...cleanEnv, MEDRA_SUBAGENT: '1' } }), 'deny');
  assert.equal(bash('medra verify-fix add-reset --json', { extra: { agent_id: 'subagent-4' }, env: { ...cleanEnv, MEDRA_SUBAGENT: '1' } }), 'deny');

  const gateDoc = fs.readFileSync(path.join(PLUGIN, 'references', 'gate.md'), 'utf8');
  assert.match(gateDoc, /verify-fix/, 'references/gate.md must document medra verify-fix subagent protection');
  const portabilityDoc = fs.readFileSync(path.join(PLUGIN, 'references', 'portability.md'), 'utf8');
  assert.match(portabilityDoc, /verify-fix/, 'references/portability.md must document medra verify-fix subagent boundary');
  assert.match(portabilityDoc, /Antigravity/i, 'references/portability.md must document Antigravity boundary');
});

test('PLUG-009.S1 & M-01: CLI refuses verify-fix and gate --approve/--request-changes when MEDRA_SUBAGENT=1', () => {
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

  const verifyFixRes = runCli(['verify-fix', change, '--json'], subagentEnv);
  assert.equal(verifyFixRes.code, 1);
  assert.equal(verifyFixRes.json?.ok, false);
  assert.ok(rules(verifyFixRes).includes('subagent.forbidden'), `expected subagent.forbidden, got: ${verifyFixRes.stdout}`);

  const approveRes = runCli(['gate', change, 'proposal', '--approve', '--json'], subagentEnv);
  assert.equal(approveRes.code, 1);
  assert.equal(approveRes.json?.ok, false);
  assert.ok(rules(approveRes).includes('subagent.forbidden'), `expected subagent.forbidden, got: ${approveRes.stdout}`);

  const reqChangesRes = runCli(['gate', change, 'proposal', '--request-changes', '--note', 'x', '--json'], subagentEnv);
  assert.equal(reqChangesRes.code, 1);
  assert.equal(reqChangesRes.json?.ok, false);
  assert.ok(rules(reqChangesRes).includes('subagent.forbidden'), `expected subagent.forbidden, got: ${reqChangesRes.stdout}`);

  const coordApproveRes = runCli(['gate', change, 'proposal', '--approve', '--json'], cleanEnv);
  assert.equal(coordApproveRes.code, 0, coordApproveRes.stdout || coordApproveRes.stderr);
  assert.equal(coordApproveRes.json?.ok, true);
  assert.equal(coordApproveRes.json?.status, 'approved');
});

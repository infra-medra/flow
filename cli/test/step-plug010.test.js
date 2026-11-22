import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileStep } from '../src/step.js';
import { medra, project, livingSpec, req, proposal, write, delta, tasks, verifyReport } from './helpers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Covers PLUG-010.S1: action === "done" returns author archive subagent pointing to author-archive.md with MEDRA_SUBAGENT=1 exit_command, and run/SKILL.md dispatches subagents[] without direct medra archive shortcut
test('PLUG-010.S1: action "done" envelope returns author archive subagent and run/SKILL.md dispatches subagents[] without direct medra archive shortcut', () => {
  const root = project({ mode: 'none' });
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])]);
  const change = 'plug010-done';
  assert.equal(medra(root, 'new', change, '--track', 'fast').code, 0);
  proposal(root, change, { track: 'fast', caps: [['auth', 'modified', 'AUTH-001']] });
  write(root, `docs/changes/${change}/specs/auth/spec.md`, delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])}`));
  tasks(root, change, ['- [ ] T001 [AUTH-001] Implement login in `src/auth.js` — verify: ok']);
  assert.equal(medra(root, 'gate', change, 'proposal', '--approve').code, 0);

  write(root, 'src/auth.js', 'export const login = () => true;\n');
  assert.equal(medra(root, 'task', 'done', change, 'T001', '--evidence', 'ok', '--kind', 'manual').code, 0);

  const preVerify = compileStep(root, change);
  const revSub = preVerify.subagents.find((s) => s.role === 'reviewer');
  assert.ok(revSub, 'expected reviewer subagent before archive');
  const revRel = revSub.report.startsWith('docs/') ? revSub.report : `docs/changes/${change}/${revSub.report}`;
  const future = Date.now() + 5000;
  write(root, revRel, verifyReport('pass'));
  fs.utimesSync(path.join(root, revRel), new Date(future), new Date(future));
  assert.equal(medra(root, 'review', change, '--report', revRel, '--by', 'reviewer').code, 0);
  assert.equal(medra(root, 'gate', change, 'verify', '--approve').code, 0);

  const doneEnv = compileStep(root, change);
  assert.equal(doneEnv.stage, 'archive');
  assert.equal(doneEnv.action, 'done');
  assert.equal(doneEnv.subagents.length, 1);

  const archiveSub = doneEnv.subagents[0];
  assert.equal(archiveSub.role, 'author');
  assert.ok(
    archiveSub.plugin_pointers.some((p) => p.endsWith('author-archive.md')),
    `expected author-archive.md in plugin_pointers, got: ${JSON.stringify(archiveSub.plugin_pointers)}`,
  );
  assert.ok(
    archiveSub.exit_command.startsWith(`MEDRA_SUBAGENT=1 medra archive ${change} --json`),
    `expected exit_command starting with "MEDRA_SUBAGENT=1 medra archive ${change} --json", got: ${archiveSub.exit_command}`,
  );

  const runSkill = fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'medra', 'skills', 'run', 'SKILL.md'), 'utf8');
  const doneLineMatch = runSkill.match(/\*\*`action === "done"`:\*\*[^\n]*/);
  assert.ok(doneLineMatch, 'run/SKILL.md must handle action === "done" in a dedicated step');
  const doneLine = doneLineMatch[0];
  assert.match(doneLine, /subagents\[\]/, 'run/SKILL.md action === "done" must dispatch subagents[]');
  assert.doesNotMatch(doneLine, /run\s+`?medra archive/i, 'run/SKILL.md action === "done" must not offer a direct medra archive coordinator shortcut');
  assert.doesNotMatch(doneLine, /\(or dispatch/i, 'run/SKILL.md action === "done" must not make subagent dispatch an optional fallback');

  const archiveSkill = fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'medra', 'skills', 'archive', 'SKILL.md'), 'utf8');
  assert.match(archiveSkill, /medra step <change> --stage archive --json/);
  assert.match(archiveSkill, /coordinator_steps\[\]/);
  assert.match(archiveSkill, /subagents\[\]/);
});

// Covers PLUG-008.S2: run/SKILL.md and verify/SKILL.md explicitly note looping back to Step 1 after coordinator_steps[] even when subagents[] is empty
test('PLUG-008.S2: run/SKILL.md and verify/SKILL.md loop back to Step 1 after coordinator_steps[] even when subagents[] is empty', () => {
  const runSkill = fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'medra', 'skills', 'run', 'SKILL.md'), 'utf8');
  assert.match(
    runSkill,
    /subagents\[\]\s+is\s+empty[\s\S]{0,120}loop\s+back\s+to\s+Step\s+1|empty\s+`?subagents\[\]`?[\s\S]{0,120}loop\s+back\s+to\s+Step\s+1/i,
    'run/SKILL.md must explicitly note looping back to Step 1 after coordinator_steps[] when subagents[] is empty',
  );

  const verifySkill = fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'medra', 'skills', 'verify', 'SKILL.md'), 'utf8');
  assert.match(
    verifySkill,
    /subagents\[\]\s+is\s+empty[\s\S]{0,120}loop\s+back\s+to\s+Step\s+1|empty\s+`?subagents\[\]`?[\s\S]{0,120}loop\s+back\s+to\s+Step\s+1/i,
    'verify/SKILL.md must explicitly note looping back to Step 1 after coordinator_steps[] when subagents[] is empty',
  );
});

// Covers PLUG-009.S2: portability.md and gate.md accurately document MEDRA_SUBAGENT=1 envelope convention and Antigravity omission/manual-edit limits
test('PLUG-009.S2: portability.md and gate.md document MEDRA_SUBAGENT=1 envelope convention and Antigravity limits', () => {
  const portability = fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'medra', 'references', 'portability.md'), 'utf8');
  const gate = fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'medra', 'references', 'gate.md'), 'utf8');

  for (const [name, doc] of [['portability.md', portability], ['gate.md', gate]]) {
    assert.match(doc, /MEDRA_SUBAGENT=1/, `${name} must document MEDRA_SUBAGENT=1`);
    assert.match(doc, /envelope/i, `${name} must describe MEDRA_SUBAGENT=1 as an envelope-imposed convention`);
    assert.match(doc, /convention|not a hard runtime boundary/i, `${name} must state that MEDRA_SUBAGENT=1 on Antigravity is an envelope convention rather than a hard runtime boundary`);
    assert.match(doc, /omit|omission/i, `${name} must note that a subagent can omit the MEDRA_SUBAGENT=1 prefix`);
    assert.match(doc, /\.medra\.yaml/i, `${name} must mention manual .medra.yaml edit limits`);
    assert.match(doc, /tasks\.md/i, `${name} must mention manual tasks.md edit limits`);
    assert.match(doc, /SHA-256/i, `${name} must mention SHA-256 hash verification as remaining safeguard`);
    assert.match(doc, /re-validation|gate\s+verification/i, `${name} must mention CLI gate verification/re-validation`);
  }

  assert.match(gate, /guard\.mjs/, 'gate.md must reference guard.mjs');
});

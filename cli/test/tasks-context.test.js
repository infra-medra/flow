import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { medra, medraHuman, write, read, project, req, livingSpec, proposal, delta, tasks, verifyReport, securityReport, rules, brownfieldChange } from './helpers.js';

test('gates: prerequisites, stale after edit, not stale after task done', () => {
  const root = project();
  const change = brownfieldChange(root);
  assert.equal(medra(root, 'gate', change, 'verify', '--approve').code, 1, 'verify needs proposal first');
  assert.equal(medra(root, 'gate', change, 'proposal', '--approve', '--by', 'Ana').json.phase, 'tasked');
  write(root, 'test/a.test.js', '// AUTH-001.S1 AUTH-001.S3 AUTH-005.S1\n');
  assert.equal(medra(root, 'task', 'done', change, 'T001', '--evidence', 'failing as expected', '--kind', 'red').code, 0);
  assert.equal(medra(root, 'status', change).json.gates.proposal.status, 'approved', 'ticking does not stale the gate');
  const p = `docs/changes/${change}/proposal.md`;
  write(root, p, read(root, p).replace('- A change.', '- A different change.'));
  assert.equal(medra(root, 'status', change).json.gates.proposal.status, 'stale');
  const rc = medra(root, 'gate', change, 'proposal', '--request-changes', '--note', 'split it');
  assert.equal(rc.json.status, 'changes-requested');
  assert.equal(medra(root, 'context', change, '--stage', 'propose').json.gate_notes[0].note, 'split it');
});

test('task done: red/green exit codes, test-tampering guard, static checks, and after ordering with --run', () => {
  const root = project();
  const change = brownfieldChange(root);
  medra(root, 'gate', change, 'proposal', '--approve');
  write(root, 'test/a.test.js', '// AUTH-001.S1 AUTH-001.S3 AUTH-005.S1\nassert(true);\n');
  assert.equal(medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0').json.findings[0].rule, 'task.after');
  assert.equal(medra(root, 'task', 'done', change, 'T001', '--run', 'exit 0').json.findings[0].rule, 'task.red');
  assert.equal(medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1').code, 0);
  assert.equal(medra(root, 'task', 'done', change, 'T002', '--run', 'exit 2').json.findings[0].rule, 'task.green');
  assert.equal(medra(root, 'task', 'done', change, 'T002', '--run', 'definitely-not-a-command-xyz').code, 4);
  // Tamper with the locked test file during implementation: refused without --allow-test-edit.
  write(root, 'test/a.test.js', '// AUTH-001.S1 AUTH-001.S3 AUTH-005.S1\n// weakened\n');
  const tampered = medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0');
  assert.equal(tampered.code, 1);
  assert.equal(tampered.json.findings[0].rule, 'task.test-tampered');
  // Restore test file and configure a failing static check, then a passing one.
  write(root, 'test/a.test.js', '// AUTH-001.S1 AUTH-001.S3 AUTH-005.S1\nassert(true);\n');
  write(root, 'docs/config-flow.yaml', read(root, 'docs/config-flow.yaml').replace('checks: []', 'checks:\n    - exit 1'));
  const badCheck = medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0');
  assert.equal(badCheck.code, 1);
  assert.equal(badCheck.json.findings[0].rule, 'task.check');
  write(root, 'docs/config-flow.yaml', read(root, 'docs/config-flow.yaml').replace('- exit 1', '- exit 0'));
  const ok = medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0');
  assert.deepEqual([ok.json.remaining, ok.json.next], [0, null]);
  assert.match(read(root, `docs/changes/${change}/tasks.md`), /- \[x\] T002[\s\S]*evidence green .*exit 0/);
});

test('context apply: next task with only its requirements; blockers skip tasks; MODIFIED compacts unchanged scenarios', () => {
  const root = project();
  const change = brownfieldChange(root);
  const c = medra(root, 'context', change, '--stage', 'apply').json;
  assert.equal(c.next_task.id, 'T001');
  assert.equal(c.next_task.requirements.length, 2);
  assert.equal(c.remaining, 2);
  assert.equal(c.requirements, undefined, 'apply stage omits change-wide requirements to save tokens');
  const planCtx = medra(root, 'context', change, '--stage', 'plan').json;
  const auth001 = planCtx.requirements.find((r) => r.id === 'AUTH-001');
  assert.equal(auth001.operation, 'MODIFIED');
  assert.ok(auth001.living.includes('AUTH-001.S2'), 'dropped scenario stays in full');
  assert.match(auth001.living, /Scenario AUTH-001\.S1: Ok \*\(unchanged in delta\)\*/, 'unchanged scenario is collapsed');
  assert.doesNotMatch(auth001.living.split('AUTH-001.S2')[0], /- \*\*Given\*\*/, 'unchanged scenario steps are not duplicated');
  const blockRes = medra(root, 'task', 'block', change, 'T001', '--note', 'no sandbox').json;
  assert.equal(blockRes.next_task, null);
  assert.equal(medra(root, 'context', change, '--stage', 'apply').json.next_task, null);
  assert.equal(medra(root, 'status', change).json.blockers_open, 1);
  medra(root, 'task', 'unblock', change, 'T001');
  medra(root, 'gate', change, 'proposal', '--approve');
  const done1 = medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1').json;
  assert.equal(done1.next_task.id, 'T002', 'task done returns next_task directly');
  assert.equal(done1.next_task.requirements.length, 2);
});

test('task context: smart-sliced task pack with anchor, dependencies, evidence, and requirements', () => {
  const root = project();
  const change = brownfieldChange(root);
  write(root, `docs/changes/${change}/plan.md`, [
    `# Plan: ${change}`, '',
    '## Summary', '', 'Use secure crypto token generation.', '',
    '## Constitution Check', '', '| Article | Gate | Result | Note |', '|---|---|---|---|', '| I | gate | pass | tests first |', '',
    '## Complexity Tracking', '', 'None.', '',
    '## Test Strategy', '', '- **Command:** `npm test`', '',
    '## Decisions', '', '### D-01: Token', '', '**Choice:** crypto\n**Alternatives:** Math.random\n**Rationale:** Secure', '',
  ].join('\n'));

  // 1. Next task context (defaults to T001)
  const ctx1 = medra(root, 'task', 'context', change).json;
  assert.equal(ctx1.task.id, 'T001');
  assert.equal(ctx1.task.done, false);
  assert.equal(ctx1.anchor.summary, 'Use secure crypto token generation.');
  assert.equal(ctx1.anchor.test_strategy, '- **Command:** `npm test`');
  assert.deepEqual(ctx1.dependencies, []);
  assert.equal(ctx1.requirements.length, 2);
  assert.equal(ctx1.remaining, 2);

  // 2. Specific task context for T002 (has T001 as dependency)
  const ctx2 = medra(root, 'task', 'context', change, 'T002').json;
  assert.equal(ctx2.task.id, 'T002');
  assert.equal(ctx2.dependencies.length, 1);
  assert.equal(ctx2.dependencies[0].id, 'T001');
  assert.equal(ctx2.dependencies[0].done, false);
  assert.deepEqual(ctx2.dependencies[0].evidence, []);

  // 3. Mark T001 done with red evidence
  medra(root, 'gate', change, 'proposal', '--approve');
  medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1');

  // 4. Next task context now points to T002 and shows T001's evidence
  const ctx3 = medra(root, 'task', 'context', change).json;
  assert.equal(ctx3.task.id, 'T002');
  assert.equal(ctx3.dependencies.length, 1);
  assert.equal(ctx3.dependencies[0].id, 'T001');
  assert.equal(ctx3.dependencies[0].done, true);
  assert.match(ctx3.dependencies[0].evidence[0], /evidence red .*exit 1/);
  assert.equal(ctx3.remaining, 1);

  // 5. Markdown formatting
  const mdOut = medraHuman(root, 'task', 'context', change, '--md');
  assert.match(mdOut.stdout, /# Task Context: rework-auth-flow · T002/);
  assert.match(mdOut.stdout, /## Architecture Anchor/);
  assert.match(mdOut.stdout, /Use secure crypto token generation/);
  assert.match(mdOut.stdout, /## Dependencies \(1\)/);
  assert.match(mdOut.stdout, /- \[x\] \*\*T001\*\*/);
  assert.match(mdOut.stdout, /↳ - evidence red/);
  assert.match(mdOut.stdout, /## Requirements \(2\)/);

  // 6. Unknown task gives descriptive error with remediation
  const bad = medra(root, 'task', 'context', change, 'T999');
  assert.equal(bad.code, 1);
  assert.equal(bad.json.findings[0].rule, 'task.unknown');
  assert.match(bad.json.findings[0].remediation, /Pick an existing task ID/);
  const badHuman = medraHuman(root, 'task', 'context', change, 'T999');
  assert.match(badHuman.stderr, /↳ fix: Pick an existing task ID/);

  // 7. Complete remaining task and check all_done
  write(root, 'src/a.js', 'export const a = 1;\n');
  medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0');
  const ctxDone = medra(root, 'task', 'context', change).json;
  assert.equal(ctxDone.task, null);
  assert.equal(ctxDone.all_done, true);
  assert.equal(ctxDone.remaining, 0);
  const mdDone = medraHuman(root, 'task', 'context', change, '--md');
  assert.match(mdDone.stdout, /No executable tasks remaining/);
});

test('capability Paths, spec drift detection, parallel [P] batching, and --md output on index and context', () => {
  const root = project();
  write(root, 'docs/specs/auth/spec.md', `# Auth\n\n**Capability:** \`auth\`\n**ID prefix:** \`AUTH\`\n**Paths:** \`src/auth/**\`, \`test/auth/**\`\n\n## Purpose\n\nHandles login.\n\n## Requirements\n\n${req('AUTH-001', 'Login', [['AUTH-001.S1', 'Ok']])}\n${req('AUTH-002', 'Logout', [['AUTH-002.S1', 'Cleared']])}\n`);
  medra(root, 'learn', 'add', '--type', 'lesson', '--title', 'Path rule', '--statement', 'Hash tokens.', '--change', 'c1', '--paths', 'src/auth/**');
  const idx = medra(root, 'index', '--learnings', 'auth').json;
  assert.deepEqual(idx.capabilities[0].paths, ['src/auth/**', 'test/auth/**']);
  assert.equal(idx.matching_learnings.length, 1, 'capability paths match path-scoped learnings in index');
  const idxMd = spawnSync(process.execPath, [path.resolve('bin/medra.js'), 'index', '--learnings', 'auth', '--md'], { cwd: root, encoding: 'utf8' });
  assert.match(idxMd.stdout, /# Project Index[\s\S]*paths `src\/auth\/\*\*`, `test\/auth\/\*\*`[\s\S]*L-001/);

  // Spec drift: modifying a file under src/auth/** without an active change triggers drift.
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'add auth spec'], { cwd: root });
  assert.deepEqual(medra(root, 'drift').json.drifted, []);
  write(root, 'src/auth/login.js', 'export const login = () => true;\n');
  const d = medra(root, 'drift').json.drifted;
  assert.equal(d.length, 1);
  assert.equal(d[0].capability, 'auth');
  assert.deepEqual(d[0].changed_files, ['src/auth/login.js']);
  assert.equal(medra(root, 'status').json.drift[0].capability, 'auth');

  // Once an active change touches `auth`, drift is suppressed for `auth`; also test [P] batching.
  medra(root, 'new', 'update-auth-session');
  proposal(root, 'update-auth-session', { caps: [['auth', 'modified', 'AUTH-001, AUTH-002']] });
  write(root, 'docs/changes/update-auth-session/specs/auth/spec.md', delta('auth', [
    '## MODIFIED Requirements', '',
    req('AUTH-001', 'Login v2', [['AUTH-001.S1', 'Ok']]),
    req('AUTH-002', 'Logout v2', [['AUTH-002.S1', 'Cleared']]),
  ].join('\n')));
  tasks(root, 'update-auth-session', [
    '- [ ] T001 [P] [TEST] [AUTH-001] Write tests in `test/auth/login.test.js` — verify: red',
    '- [ ] T002 [P] [TEST] [AUTH-002] Write tests in `test/auth/logout.test.js` — verify: red',
    '- [ ] T003 [P] [AUTH-001] after T001 Implement in `src/auth/login.js` — verify: green',
    '- [ ] T004 [P] [AUTH-002] after T002 Implement in `src/auth/logout.js` — verify: green',
  ]);
  assert.deepEqual(medra(root, 'drift').json.drifted, [], 'active change covering auth suppresses drift');
  const applyCtx = medra(root, 'context', 'update-auth-session', '--stage', 'apply').json;
  assert.deepEqual(applyCtx.parallel_batch.map((t) => t.id), ['T001', 'T002'], 'ready [P] tasks in the same phase and kind form a parallel_batch');
  const applyMd = spawnSync(process.execPath, [path.resolve('bin/medra.js'), 'context', 'update-auth-session', '--stage', 'apply', '--md'], { cwd: root, encoding: 'utf8' });
  assert.match(applyMd.stdout, /## Parallel batch \(\[P\] — Phase 1: Work\)[\s\S]*T001[\s\S]*T002/);
  medra(root, 'gate', 'update-auth-session', 'proposal', '--approve');
  write(root, 'test/auth/login.test.js', '// AUTH-001.S1\n');
  write(root, 'test/auth/logout.test.js', '// AUTH-002.S1\n');
  const done1Md = spawnSync(process.execPath, [path.resolve('bin/medra.js'), 'task', 'done', 'update-auth-session', 'T001', '--run', 'exit 1', '--md'], { cwd: root, encoding: 'utf8' });
  assert.match(done1Md.stdout, /# Task checkpoint: T001 \(red\)/);
  assert.match(done1Md.stdout, /Remaining: 3/);
  const afterT002 = medra(root, 'task', 'done', 'update-auth-session', 'T002', '--run', 'exit 1').json;
  assert.deepEqual(afterT002.parallel_batch.map((t) => t.id), ['T003', 'T004'], 'completing red [P] batch unlocks green [P] batch');
  assert.deepEqual(afterT002.next_task.requirements, [], 'next_task omits duplicate requirements when parallel_batch is present');
});

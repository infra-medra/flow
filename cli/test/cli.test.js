import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { medra, write, read, project, req, livingSpec, proposal, delta, tasks, verifyReport, securityReport } from './helpers.js';

const rules = (r) => (r.json?.findings ?? []).filter((f) => f.severity === 'error').map((f) => f.rule);

/** A fast-track change modifying AUTH-001 (keeps S1, drops S2, adds S3), adding AUTH-003, removing AUTH-002. */
function brownfieldChange(root, change = 'rework-auth-flow') {
  livingSpec(root, 'auth', 'AUTH', [
    req('AUTH-001', 'Login', [['AUTH-001.S1', 'Ok'], ['AUTH-001.S2', 'Locked']]),
    req('AUTH-002', 'Remember me', [['AUTH-002.S1', 'Cookie']]),
  ], 'AUTH-004');
  assert.equal(medra(root, 'new', change).code, 0);
  proposal(root, change, { caps: [['auth', 'modified', 'AUTH-001, AUTH-002, AUTH-003']] });
  write(root, `docs/changes/${change}/specs/auth/spec.md`, delta('auth', [
    '## ADDED Requirements', '', req('AUTH-005', 'Reset', [['AUTH-005.S1', 'Link']]),
    '## MODIFIED Requirements', '', req('AUTH-001', 'Login v2', [['AUTH-001.S1', 'Ok'], ['AUTH-001.S3', 'MFA']]),
    '## REMOVED Requirements', '', '### REQ AUTH-002: Remember me', '', '**Reason:** Unsafe.', '**Migration:** None', '',
  ].join('\n')));
  tasks(root, change, [
    '- [ ] T001 [TEST] [AUTH-001, AUTH-005] Write tests for AUTH-001.S1, AUTH-001.S3, AUTH-005.S1 in `test/a.test.js` — verify: red',
    '- [ ] T002 [AUTH-001, AUTH-005] after T001 Implement in `src/a.js` — verify: green',
  ]);
  return change;
}

test('version prints bare semver', () => {
  const r = medra(process.cwd(), '--version');
  assert.match(r.stdout.trim(), /^1\.\d+\.\d+$/);
});

test('outside a project, commands exit 4', () => {
  const r = medra(fs.mkdtempSync('/tmp/medra-empty-'), 'status');
  assert.equal(r.code, 4);
  assert.equal(r.json.ok, false);
});

test('init is idempotent and never overwrites', () => {
  const root = project();
  const before = read(root, 'docs/constitution.md');
  const r = medra(root, 'init');
  assert.equal(r.code, 0);
  assert.ok(r.json.existing.includes('docs/config-flow.yaml'));
  assert.equal(read(root, 'docs/constitution.md'), before);
});

test('constitution: draft validates without version lines; ratify bumps; gate rule enforced', () => {
  const root = project();
  assert.match(read(root, 'docs/constitution.md'), /\*\*Version:\*\* 1\.0/);
  write(root, 'docs/constitution.md', read(root, 'docs/constitution.md').replace('**Gate:** Does', '**Gat:** Does'));
  const bad = medra(root, 'validate', '--project', 'constitution');
  assert.equal(bad.code, 1);
  assert.ok(rules(bad).includes('constitution.gate'));
  write(root, 'docs/constitution.md', read(root, 'docs/constitution.md').replace('**Gat:** Does', '**Gate:** Does'));
  assert.equal(medra(root, 'constitution', 'ratify', '--note', 'x').code, 2, 'amendment without --bump is a usage error');
  const r = medra(root, 'constitution', 'ratify', '--bump', 'minor', '--note', 'Add rule', '--source', 'L-001');
  assert.equal(r.json.version, '1.1');
  assert.match(read(root, 'docs/constitution.md'), /\| 1\.1 \| .* \| Add rule \| L-001 \|/);
});

test('new refuses invalid names and duplicates', () => {
  const root = project();
  assert.equal(medra(root, 'new', 'Bad_Name').code, 1);
  assert.equal(medra(root, 'new', 'add-thing').code, 0);
  assert.equal(medra(root, 'new', 'add-thing').code, 1);
});

test('spec rules: SHALL, scenario shape, duplicate and retired IDs', () => {
  const root = project();
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Ok']])]);
  assert.equal(medra(root, 'validate', '--project', 'specs').code, 0);
  livingSpec(root, 'auth', 'AUTH', [
    req('AUTH-001', 'Login', [['AUTH-001.S1', 'Ok']], 'It logs in.'),
    req('AUTH-002', 'Again', []),
    req('AUTH-003', 'Retired reuse', [['AUTH-003.S1', 'x']]),
  ], 'AUTH-003');
  const r = medra(root, 'validate', '--project', 'specs');
  assert.deepEqual([...new Set(rules(r))].sort(), ['spec.ids', 'spec.scenario', 'spec.shall']);
});

test('proposal stage: markers, capabilities table and delta targets', () => {
  const root = project();
  const change = brownfieldChange(root);
  assert.equal(medra(root, 'validate', change, '--stage', 'proposal').code, 0);
  const file = `docs/changes/${change}/specs/auth/spec.md`;
  const good = read(root, file);
  write(root, file, good.replace('### REQ AUTH-002: Remember me', '### REQ AUTH-009: Ghost').replace('Unsafe.', 'Unsafe. [NEEDS CLARIFICATION: why?]'));
  const r = medra(root, 'validate', change, '--stage', 'proposal');
  assert.ok(rules(r).includes('delta.targets'));
  assert.ok(rules(r).includes('proposal.markers'));
  write(root, file, good.replace('AUTH-005', 'AUTH-004').replace('AUTH-005.S1', 'AUTH-004.S1'));
  assert.ok(rules(medra(root, 'validate', change, '--stage', 'proposal')).includes('delta.targets'), 'retired ID cannot be ADDED');
});

test('tasks stage: coverage, after ordering, test-before-impl in tdd', () => {
  const root = project();
  const change = brownfieldChange(root);
  assert.equal(medra(root, 'validate', change, '--stage', 'tasks').code, 0);
  tasks(root, change, [
    '- [ ] T001 [AUTH-001] Implement in `src/a.js` — verify: green',
    '- [ ] T002 [TEST] [AUTH-001] Write tests in `test/a.test.js` — verify: red',
    '- [ ] T003 [AUTH-001] after T009 Polish in `src/a.js` — verify: green',
    '- [ ] not a task line',
  ]);
  const r = rules(medra(root, 'validate', change, '--stage', 'tasks'));
  for (const rule of ['tasks.structure', 'tasks.after', 'tasks.coverage', 'tasks.test-task', 'tasks.test-before-impl']) assert.ok(r.includes(rule), rule);
});

test('plan stage: anchors, one row per article, fail needs complexity row', () => {
  const root = project();
  const change = brownfieldChange(root);
  medra(root, 'track', change, 'full', '--reason', 'needs design');
  write(root, `docs/changes/${change}/proposal.md`, read(root, `docs/changes/${change}/proposal.md`).replace('**Track:** fast', '**Track:** full'));
  const plan = (row, complexity = 'None.') => `# Plan: ${change}\n\n## Summary\n\nDo it.\n\n## Constitution Check\n\n| Article | Gate | Result | Note |\n|---|---|---|---|\n${row}\n\n## Complexity Tracking\n\n${complexity}\n\n## Test Strategy\n\n- **Command:** \`npm test\`\n\n## Architecture\n\nX.\n\n## Decisions\n\n### D-01: Store\n\n**Choice:** A\n**Alternatives:** B\n**Rationale:** C\n`;
  write(root, `docs/changes/${change}/plan.md`, plan('| I | gate | pass | tests first |'));
  assert.equal(medra(root, 'validate', change, '--stage', 'plan').code, 0);
  write(root, `docs/changes/${change}/plan.md`, plan('| I | gate | fail | none |'));
  assert.ok(rules(medra(root, 'validate', change, '--stage', 'plan')).includes('plan.constitution'));
});

test('security: proposal line, threat model rules, accepted mitigations reach tasks, plan gate covers the model', () => {
  const root = project();
  const change = brownfieldChange(root);
  medra(root, 'track', change, 'full', '--reason', 'needs design');
  const p = `docs/changes/${change}/proposal.md`;
  const base = read(root, p).replace('**Track:** fast', '**Track:** full');
  write(root, p, base.replace('**Rationale:** Criteria checked.', '**Rationale:** Criteria checked.\n**Security:** maybe'));
  assert.ok(rules(medra(root, 'validate', change, '--stage', 'proposal')).includes('proposal.security'), 'bad value and missing rationale');
  write(root, p, base.replace('**Rationale:** Criteria checked.', '**Rationale:** Criteria checked.\n**Security:** relevant\n**Security rationale:** External input: new endpoint.'));
  assert.equal(medra(root, 'validate', change, '--stage', 'proposal').code, 0);
  assert.equal(medra(root, 'status', change).json.security, 'relevant');

  const plan = `# Plan: ${change}\n\n## Summary\n\nDo it.\n\n## Constitution Check\n\n| Article | Gate | Result | Note |\n|---|---|---|---|\n| I | gate | pass | tests first |\n\n## Complexity Tracking\n\nNone.\n\n## Test Strategy\n\n- **Command:** \`npm test\`\n\n## Decisions\n\n### D-01: Hash tokens\n\n**Choice:** M-01\n**Alternatives:** Raw\n**Rationale:** Dumps\n`;
  write(root, `docs/changes/${change}/plan.md`, plan);
  assert.ok(rules(medra(root, 'validate', change, '--stage', 'plan')).includes('plan.threat-model'), 'missing threat model');
  const model = (decision, threatMits = 'M-01') => `# Threat Model: ${change}\n\n## Scope\n\n- **In:** reset\n\n## Assets\n\n- Tokens\n\n## Trust Boundaries\n\n| ID | Boundary | From → To |\n|---|---|---|\n| B-01 | API | Internet → API |\n\n## Entry Points\n\n- \`POST /reset\` (B-01)\n\n## Threats\n\n| ID | STRIDE | Threat | Boundary | Severity | Likelihood | Mitigations |\n|---|---|---|---|---|---|---|\n| TM-01 | S, I | Token guessed | B-01 | high | medium | ${threatMits} |\n\n## Mitigations\n\n| ID | Mitigation | Threats | Decision |\n|---|---|---|---|\n| M-01 | Hash and expire tokens | TM-01 | ${decision} |\n\n## Residual Risks\n\nNone.\n\n## Sources\n\n- https://cheatsheetseries.owasp.org — M-01\n`;
  const tm = `docs/changes/${change}/threat-model.md`;
  for (const [decision, mits] of [['pending', 'M-01'], ['accepted (D-09)', 'M-01'], ['accepted (D-01)', 'M-07']]) {
    write(root, tm, model(decision, mits));
    assert.ok(rules(medra(root, 'validate', change, '--stage', 'plan')).includes('plan.threat-model'), `${decision} / ${mits}`);
  }
  write(root, tm, model('accepted (D-01)'));
  assert.equal(medra(root, 'validate', change, '--stage', 'plan').code, 0);

  assert.ok(rules(medra(root, 'validate', change, '--stage', 'tasks')).includes('tasks.mitigations'), 'accepted M-01 has no task');
  const t = `docs/changes/${change}/tasks.md`;
  write(root, t, read(root, t).replace('Implement in `src/a.js`', 'Implement hashed tokens (M-01) in `src/a.js`'));
  assert.equal(medra(root, 'validate', change, '--stage', 'tasks').code, 0);

  assert.equal(medra(root, 'gate', change, 'proposal', '--approve').code, 0);
  assert.equal(medra(root, 'gate', change, 'plan', '--approve').code, 0);
  write(root, tm, model('accepted (D-01)').replace('Token guessed', 'Token guessed or reused'));
  assert.equal(medra(root, 'status', change).json.gates.plan.status, 'stale', 'the plan gate hashes threat-model.md');
});

test('security: verify needs a security report (presence only), which never counts as the verify report', () => {
  const root = project();
  const change = 'add-billing-area';
  medra(root, 'new', change);
  proposal(root, change, { caps: [['billing', 'new', '—']], security: 'relevant' });
  write(root, `docs/changes/${change}/specs/billing/spec.md`, delta('billing', `## Purpose\n\nBills.\n\n## ADDED Requirements\n\n${req('BILL-001', 'Invoice', [['BILL-001.S1', 'Sent']])}`, '**ID prefix:** `BILL`'));
  tasks(root, change, ['- [ ] T001 [TEST] [BILL-001] Test BILL-001.S1 in `test/b.test.js` — verify: red', '- [ ] T002 [BILL-001] after T001 Do in `src/b.js` — verify: green']);
  assert.equal(medra(root, 'gate', change, 'proposal', '--approve').code, 0);
  write(root, 'test/b.test.js', '// BILL-001.S1\n');
  medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1');
  medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0');
  const reviews = `docs/changes/${change}/reviews`;

  write(root, `${reviews}/2026-11-04-security-agent-r1.md`, securityReport('pass'));
  let r = rules(medra(root, 'validate', change, '--stage', 'verify'));
  assert.ok(r.includes('verify.report'), 'a security report is not a verify report');
  assert.ok(!r.includes('verify.security-report'));

  fs.rmSync(path.join(root, `${reviews}/2026-11-04-security-agent-r1.md`));
  write(root, `${reviews}/2026-11-04-verify-agent-r1.md`, verifyReport('pass'));
  assert.ok(rules(medra(root, 'validate', change, '--stage', 'verify')).includes('verify.security-report'), 'missing security report');

  write(root, `${reviews}/2026-11-04-security-agent-r2.md`, securityReport('fail', 'critical 0 · high 1 · medium 0 · low 0 · info 0'));
  assert.equal(medra(root, 'validate', change, '--stage', 'verify').code, 0, 'a fail verdict informs and never blocks');
  assert.deepEqual(medra(root, 'status', change).json.last_security, { path: `${reviews}/2026-11-04-security-agent-r2.md`, round: 2, verdict: 'fail' });

  const g = medra(root, 'gate', change, 'verify', '--approve', '--note', 'accepted-risk: S-01 — internal endpoint only');
  assert.equal(g.code, 0, g.stdout);
  assert.match(read(root, `docs/changes/${change}/.medra.yaml`), /note: "?accepted-risk: S-01/);
  write(root, `${reviews}/2026-11-05-security-agent-r3.md`, securityReport('pass'));
  assert.equal(medra(root, 'status', change).json.gates.verify.status, 'stale', 'the verify gate hashes the latest security report');
});

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

test('archive round-trip: modified/kept/new/dropped scenarios, removed, added, index row, byte-stable', () => {
  const run = () => {
    const root = project();
    const change = brownfieldChange(root);
    medra(root, 'gate', change, 'proposal', '--approve');
    write(root, 'test/a.test.js', '// AUTH-001.S1 AUTH-001.S3 AUTH-005.S1\n');
    medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1');
    medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0');
    write(root, `docs/changes/${change}/reviews/2026-10-30-verify-agent.md`, verifyReport());
    assert.equal(medra(root, 'review', change, '--report', `docs/changes/${change}/reviews/2026-10-30-verify-agent.md`).code, 0);
    const g = medra(root, 'gate', change, 'verify', '--approve');
    assert.equal(g.code, 0, JSON.stringify(g.json));
    const a = medra(root, 'archive', change);
    assert.equal(a.code, 0, JSON.stringify(a.json));
    assert.deepEqual(a.json.specs, { added: 1, modified: 1, removed: 1 });
    return root;
  };
  const root = run();
  const spec = read(root, 'docs/specs/auth/spec.md');
  assert.match(spec, /<!-- retired: AUTH-004, AUTH-002, AUTH-002\.S1, AUTH-001\.S2 -->/);
  assert.match(spec, /### REQ AUTH-001: Login v2[\s\S]*AUTH-001\.S3[\s\S]*### REQ AUTH-005: Reset/);
  assert.doesNotMatch(spec, /AUTH-002: Remember/);
  assert.match(read(root, 'docs/changes/archive/INDEX.md'), /\| 1 \| .* \| rework-auth-flow \| auth \| \+AUTH-005 ~AUTH-001 -AUTH-002 \|/);
  assert.equal(medra(root, 'validate', '--project', 'specs').code, 0);
  assert.equal(read(run(), 'docs/specs/auth/spec.md'), spec, 'merge output is byte-stable');
  // last_changed_by pointer for a later change
  medra(root, 'new', 'tweak-login-copy');
  write(root, 'docs/changes/tweak-login-copy/specs/auth/spec.md', delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login v3', [['AUTH-001.S1', 'Ok']])}`));
  const ctx = medra(root, 'context', 'tweak-login-copy', '--stage', 'plan').json;
  assert.match(ctx.requirements[0].last_changed_by, /^docs\/changes\/archive\/\d{4}-\d{2}-\d{2}-rework-auth-flow$/);
});

test('archive: new capability, retire capability, and conflicts exit 3 without writing', () => {
  const root = project();
  medra(root, 'new', 'add-billing-area');
  proposal(root, 'add-billing-area', { caps: [['billing', 'new', '—']] });
  write(root, 'docs/changes/add-billing-area/specs/billing/spec.md', delta('billing', `## Purpose\n\nBills.\n\n## ADDED Requirements\n\n${req('BILL-001', 'Invoice', [['BILL-001.S1', 'Sent']])}`, '**ID prefix:** `BILL`'));
  tasks(root, 'add-billing-area', ['- [ ] T001 [TEST] [BILL-001] Test BILL-001.S1 in `test/b.test.js` — verify: red', '- [ ] T002 [BILL-001] after T001 Do in `src/b.js` — verify: green']);
  medra(root, 'gate', 'add-billing-area', 'proposal', '--approve');
  write(root, 'test/b.test.js', '// BILL-001.S1\n');
  medra(root, 'task', 'done', 'add-billing-area', 'T001', '--run', 'exit 1');
  medra(root, 'task', 'done', 'add-billing-area', 'T002', '--run', 'exit 0');
  write(root, 'docs/changes/add-billing-area/reviews/2026-10-30-verify-agent.md', verifyReport());
  assert.equal(medra(root, 'gate', 'add-billing-area', 'verify', '--approve').code, 0);
  // Simulate a concurrent change that took BILL-001 first: a living spec now exists with that ID.
  livingSpec(root, 'billing', 'BILL', [req('BILL-001', 'Other', [['BILL-001.S1', 'x']])]);
  const before = read(root, 'docs/specs/billing/spec.md');
  const c = medra(root, 'archive', 'add-billing-area');
  assert.equal(c.code, 3);
  assert.equal(c.json.conflicts[0].problem, 'added-collision');
  assert.equal(read(root, 'docs/specs/billing/spec.md'), before, 'nothing written on conflict');
  fs.rmSync(path.join(root, 'docs/specs/billing'), { recursive: true });
  assert.equal(medra(root, 'archive', 'add-billing-area').code, 0);
  assert.match(read(root, 'docs/specs/billing/spec.md'), /\*\*ID prefix:\*\* `BILL`/);

  // Retire the capability entirely.
  medra(root, 'new', 'drop-billing-area');
  proposal(root, 'drop-billing-area', { caps: [['billing', 'removed', 'BILL-001']] });
  write(root, 'docs/changes/drop-billing-area/specs/billing/spec.md', delta('billing', '## REMOVED Requirements\n\n### REQ BILL-001: Invoice\n\n**Reason:** Gone.\n**Migration:** None', '**Retire capability:** yes'));
  tasks(root, 'drop-billing-area', ['- [ ] T001 Remove billing in `src/b.js` — verify: manual check']);
  medra(root, 'gate', 'drop-billing-area', 'proposal', '--approve');
  medra(root, 'task', 'done', 'drop-billing-area', 'T001', '--run', 'exit 0');
  write(root, 'docs/changes/drop-billing-area/reviews/2026-10-30-verify-agent.md', verifyReport());
  assert.equal(medra(root, 'gate', 'drop-billing-area', 'verify', '--approve').code, 0);
  assert.equal(medra(root, 'archive', 'drop-billing-area').code, 0);
  assert.equal(fs.existsSync(path.join(root, 'docs/specs/billing')), false);

  // missing-target: a MODIFIED against a requirement that no longer exists.
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Ok']])]);
  medra(root, 'new', 'tweak-auth-login');
  proposal(root, 'tweak-auth-login', { caps: [['auth', 'modified', 'AUTH-001']] });
  write(root, 'docs/changes/tweak-auth-login/specs/auth/spec.md', delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login v2', [['AUTH-001.S1', 'Ok']])}`));
  tasks(root, 'tweak-auth-login', ['- [ ] T001 [TEST] [AUTH-001] Test AUTH-001.S1 in `test/c.test.js` — verify: red', '- [ ] T002 [AUTH-001] after T001 Do in `src/c.js` — verify: green']);
  medra(root, 'gate', 'tweak-auth-login', 'proposal', '--approve');
  write(root, 'test/c.test.js', '// AUTH-001.S1\n');
  medra(root, 'task', 'done', 'tweak-auth-login', 'T001', '--run', 'exit 1');
  medra(root, 'task', 'done', 'tweak-auth-login', 'T002', '--run', 'exit 0');
  write(root, 'docs/changes/tweak-auth-login/reviews/2026-10-30-verify-agent.md', verifyReport());
  assert.equal(medra(root, 'gate', 'tweak-auth-login', 'verify', '--approve').code, 0);
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-002', 'Other', [['AUTH-002.S1', 'x']])], 'AUTH-001');
  const m = medra(root, 'archive', 'tweak-auth-login', '--dry-run');
  assert.equal(m.code, 3);
  assert.equal(m.json.conflicts[0].problem, 'missing-target');
});

test('verify stage: uncovered scenarios and missing report block the gate', () => {
  const root = project();
  const change = brownfieldChange(root);
  medra(root, 'gate', change, 'proposal', '--approve');
  medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1');
  medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0');
  const r = medra(root, 'gate', change, 'verify', '--approve');
  assert.equal(r.code, 1);
  assert.ok(rules(r).includes('verify.coverage'));
  assert.ok(rules(r).includes('verify.report'));
  const cov = medra(root, 'coverage', change).json;
  assert.equal(cov.covered, 0);
  assert.equal(cov.scenarios, 3);
});

test('verify stage: the highest -r<N> round is the current report, and every round is archived', () => {
  const root = project();
  const change = 'add-billing-area';
  medra(root, 'new', change);
  proposal(root, change, { caps: [['billing', 'new', '—']] });
  write(root, `docs/changes/${change}/specs/billing/spec.md`, delta('billing', `## Purpose\n\nBills.\n\n## ADDED Requirements\n\n${req('BILL-001', 'Invoice', [['BILL-001.S1', 'Sent']])}`, '**ID prefix:** `BILL`'));
  tasks(root, change, ['- [ ] T001 [TEST] [BILL-001] Test BILL-001.S1 in `test/b.test.js` — verify: red', '- [ ] T002 [BILL-001] after T001 Do in `src/b.js` — verify: green']);
  medra(root, 'gate', change, 'proposal', '--approve');
  write(root, 'test/b.test.js', '// BILL-001.S1\n');
  medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1');
  medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0');
  const reviews = `docs/changes/${change}/reviews`;
  write(root, `${reviews}/2026-10-30-verify-agent-r1.md`, verifyReport('fail'));
  write(root, `${reviews}/2026-10-30-verify-agent-r2.md`, verifyReport('pass-with-findings'));
  write(root, `${reviews}/2026-10-30-verify-agent-r3.md`, verifyReport('pass'));
  // Round 1 and an unsuffixed 1.2 report are touched last: the round, not the mtime, decides.
  write(root, `${reviews}/2026-10-30-verify-agent.md`, verifyReport('fail'));
  const later = new Date(Date.now() + 60_000);
  for (const f of ['2026-10-30-verify-agent-r1.md', '2026-10-30-verify-agent.md']) fs.utimesSync(path.join(root, reviews, f), later, later);
  assert.equal(medra(root, 'validate', change, '--stage', 'verify').code, 0);
  assert.equal(medra(root, 'gate', change, 'verify', '--approve').code, 0);
  const archived = medra(root, 'archive', change).json.archived_path;
  const kept = fs.readdirSync(path.join(root, archived, 'reviews')).filter((f) => /-r\d+\.md$/.test(f)).sort();
  assert.deepEqual(kept, ['2026-10-30-verify-agent-r1.md', '2026-10-30-verify-agent-r2.md', '2026-10-30-verify-agent-r3.md']);
});

test('learnings: add, bump, merge, retire, promote, status budget and staleness', () => {
  const root = project();
  write(root, 'docs/config-flow.yaml', read(root, 'docs/config-flow.yaml').replace('max_active: 40', 'max_active: 1').replace('promote_after: 3', 'promote_after: 2').replace('stale_after: 10', 'stale_after: 0'));
  const a = medra(root, 'learn', 'add', '--type', 'lesson', '--title', 'A', '--statement', 'Do A.', '--change', 'c1', '--capabilities', 'auth', '--stages', 'plan').json.id;
  const b = medra(root, 'learn', 'add', '--type', 'preference', '--title', 'B', '--statement', 'Do B.', '--change', 'c1').json.id;
  assert.deepEqual([a, b], ['L-001', 'L-002']);
  assert.equal(medra(root, 'learn', 'add', '--type', 'lesson', '--title', 'X', '--statement', 'x', '--change', 'c', '--stages', 'bogus').code, 2);
  assert.equal(medra(root, 'learn', 'bump', a, '--change', 'c2').json.occurrences, 2);
  let s = medra(root, 'learn', 'status').json;
  assert.equal(s.over_budget, true);
  assert.equal(s.candidates, 1);
  assert.deepEqual(s.stale, ['L-001', 'L-002'].slice(0, 1));
  assert.deepEqual(medra(root, 'learn', 'candidates').json.candidates.map((c) => c.id), ['L-001']);
  assert.equal(medra(root, 'index', '--learnings', 'billing').json.matching_learnings.map((l) => l.id).join(), 'L-002', 'unscoped matches everything; scoped auth does not match billing');
  medra(root, 'learn', 'merge', b, '--into', a);
  s = medra(root, 'learn', 'status').json;
  assert.equal(s.active, 1);
  assert.equal(s.over_budget, false);
  assert.equal(medra(root, 'learn', 'promote', a, '--article', 'I').code, 0);
  assert.match(read(root, 'docs/learnings.md'), /## Promoted\n\n### L-001 \[lesson\] A[\s\S]*\*\*Promoted:\*\* Article I \(v1\.0\)/);
  assert.match(read(root, 'docs/learnings.md'), /\*\*Retired:\*\* merged into L-001/);
  assert.equal(medra(root, 'validate', '--project', 'learnings').code, 0);
});

test('install --target antigravity: plugin rewrite table, manifest, idempotent, refuses foreign files', () => {
  const root = project();
  const r = medra(root, 'install', '--target', 'antigravity');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.plugin, '.agents/plugins/medra');
  const P = '.agents/plugins/medra';
  const version = JSON.parse(read(path.resolve('.'), 'package.json')).version;
  const manifest = JSON.parse(read(root, `${P}/plugin.json`));
  assert.equal(manifest.$schema, 'https://antigravity.google/schemas/v1/plugin.json');
  assert.equal(manifest.name, 'medra');
  assert.equal(manifest.version, version);
  const cmd = read(root, `${P}/skills/propose/SKILL.md`);
  assert.match(cmd, /^---\nname: propose\ndescription: [^\n]+\n---\n/);
  assert.doesNotMatch(cmd, /disable-model-invocation|argument-hint|\$ARGUMENTS|\$\{CLAUDE_/);
  assert.match(cmd, /\.agents\/plugins\/medra\/agents\/author\.md/);
  assert.match(cmd, /\.agents\/plugins\/medra\/pipelines\/author-propose\.md/);
  assert.match(cmd, /## Operating Persona \(Author\)/);
  assert.match(cmd, /### Phase 1 — Intake/);
  const applyCmd = read(root, `${P}/skills/apply/SKILL.md`);
  assert.match(applyCmd, /## Operating Persona \(Implementer\)/);
  assert.match(applyCmd, /### Phase 1 — Resume/);
  assert.equal(fs.readdirSync(path.join(root, P, 'skills')).length, 8, 'only 8 user commands installed as skills');
  assert.match(read(root, `${P}/templates/spec/guide.md`), /`\.agents\/plugins\/medra\/templates\/spec\/template\.md`/);
  const reviewer = read(root, `${P}/agents/reviewer.md`);
  assert.match(reviewer, /^---\nname: medra-reviewer\ndescription: [^\n]+\ntools: \[read_file, write_file, run_command, ask_question\]\nmainAgent: true\nsubagent: true\n---\n/);
  assert.match(read(root, `${P}/agents/implementer.md`), /tools: \[read_file, write_file, edit_file, run_command, ask_question, invoke_subagent\]\nmainAgent: true\nsubagent: false\n---/);
  assert.match(read(root, `${P}/handoffs/implementer-reviewer.md`), /subagent_type: medra-reviewer/);
  assert.match(read(root, `${P}/agents/security.md`), /tools: \[read_file, write_file, run_command, search_web\]\nmainAgent: true\nsubagent: true\n---/, 'a dispatched agent is a subagent');
  assert.match(read(root, `${P}/agents/author.md`), /tools: \[[^\]]*invoke_subagent\]/, 'Agent(Explore, security) is one entry');
  assert.equal(read(root, `${P}/VERSION`).trim(), version);
  assert.equal(medra(root, 'install', '--target', 'antigravity').code, 0, 'idempotent');
  write(root, `${P}/skills/propose/SKILL.md`, 'hand edited');
  assert.equal(medra(root, 'install', '--target', 'antigravity').code, 1);
  assert.equal(medra(root, 'install', '--target', 'antigravity', '--force').code, 0);
  const agy = spawnSync('agy', ['plugin', 'validate', path.join(root, P), '--strict'], { encoding: 'utf8' });
  if (agy.error?.code !== 'ENOENT') assert.equal(agy.status, 0, agy.stdout + agy.stderr);
});

test('install --target antigravity removes an unedited 1.1 install and keeps edited files', () => {
  const root = project();
  const files = { 'skills/medra-init/SKILL.md': 'init', 'skills/medra-plan/SKILL.md': 'plan', 'medra/agents/author.md': 'author' };
  for (const [f, t] of Object.entries(files)) write(root, `.agents/${f}`, t);
  write(root, '.agents/skills/mine/SKILL.md', 'user skill');
  const hashes = Object.fromEntries(Object.entries(files).map(([f, t]) => [f, crypto.createHash('sha256').update(t).digest('hex')]));
  write(root, '.agents/medra/MANIFEST.json', JSON.stringify({ version: '1.1.0', files: hashes }));
  write(root, '.agents/medra/VERSION', '1.1.0\n');
  write(root, '.agents/skills/medra-plan/SKILL.md', 'plan, edited');
  const r = medra(root, 'install', '--target', 'antigravity');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.legacy_removed, 2);
  assert.deepEqual(r.json.findings.map((f) => f.rule), ['install.legacy-edited']);
  assert.ok(!fs.existsSync(path.join(root, '.agents/skills/medra-init')));
  assert.ok(!fs.existsSync(path.join(root, '.agents/medra')));
  assert.equal(read(root, '.agents/skills/medra-plan/SKILL.md'), 'plan, edited');
  assert.equal(read(root, '.agents/skills/mine/SKILL.md'), 'user skill');
});

test('usage errors exit 2 with a JSON envelope', () => {
  const root = project();
  const r = medra(root, 'gate', 'x-y', 'proposal');
  assert.equal(r.code, 2);
  const u = medra(root, 'frobnicate');
  assert.equal(u.code, 2);
  assert.equal(u.json.ok, false);
});

test('a 1.0 project in medra/ migrates to docs/ automatically, keeping valid gates and git history', () => {
  const root = project();
  const change = brownfieldChange(root);
  medra(root, 'gate', change, 'proposal', '--approve');
  // Rebuild the 1.0 layout: medra/config.yaml and root-relative gate hashes.
  fs.renameSync(path.join(root, 'docs'), path.join(root, 'medra'));
  fs.renameSync(path.join(root, 'medra/config-flow.yaml'), path.join(root, 'medra/config.yaml'));
  const stateFile = path.join(root, `medra/changes/${change}/.medra.yaml`);
  const proposalDocs = [`proposal.md`, `specs/auth/spec.md`, `tasks.md`].sort();
  const basis = (f) => { const t = fs.readFileSync(path.join(root, `medra/changes/${change}`, f), 'utf8'); return f === 'tasks.md' ? t.split('\n').filter((l) => !/^ {2}- evidence /.test(l)).map((l) => l.replace(/^- \[x\]/, '- [ ]')).join('\n') : t; };
  const oldHash = crypto.createHash('sha256').update(proposalDocs.map((f) => `medra/changes/${change}/${f}\n${basis(f)}`).join('\n\0\n')).digest('hex');
  fs.writeFileSync(stateFile, fs.readFileSync(stateFile, 'utf8').replace(/hash: \w+/, `hash: ${oldHash}`));
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'v1 layout'], { cwd: root });

  const r = medra(root, 'status', change);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual([r.json.migration.moved, r.json.migration.gates_rehashed], [5, 1]);
  assert.match(r.stderr, /migrated medra\/ to docs\//);
  assert.equal(r.json.gates.proposal.status, 'approved', 'a gate valid before the move stays valid');
  assert.ok(fs.existsSync(path.join(root, 'docs/config-flow.yaml')));
  assert.equal(fs.existsSync(path.join(root, 'medra')), false);
  const staged = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout;
  assert.match(staged, /^R {2}medra\/constitution\.md -> docs\/constitution\.md$/m, 'tracked files are moved with git mv');
  assert.equal(medra(root, 'status').json.migration, undefined, 'migration runs once');
});

test('migration refuses when docs/ already holds a colliding entry', () => {
  const root = project();
  fs.renameSync(path.join(root, 'docs'), path.join(root, 'medra'));
  fs.renameSync(path.join(root, 'medra/config-flow.yaml'), path.join(root, 'medra/config.yaml'));
  write(root, 'docs/specs/README.md', 'project docs');
  const r = medra(root, 'status');
  assert.equal(r.code, 1);
  assert.equal(r.json.findings[0].rule, 'layout.collision');
  assert.ok(fs.existsSync(path.join(root, 'medra/config.yaml')), 'nothing moved');
});

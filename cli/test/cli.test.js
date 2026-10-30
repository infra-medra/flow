import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { medra, write, read, project, req, livingSpec, proposal, delta, tasks, verifyReport } from './helpers.js';

const rules = (r) => (r.json?.findings ?? []).filter((f) => f.severity === 'error').map((f) => f.rule);

/** A fast-track change modifying AUTH-001 (keeps S1, drops S2, adds S3), adding AUTH-003, removing AUTH-002. */
function brownfieldChange(root, change = 'rework-auth-flow') {
  livingSpec(root, 'auth', 'AUTH', [
    req('AUTH-001', 'Login', [['AUTH-001.S1', 'Ok'], ['AUTH-001.S2', 'Locked']]),
    req('AUTH-002', 'Remember me', [['AUTH-002.S1', 'Cookie']]),
  ], 'AUTH-004');
  assert.equal(medra(root, 'new', change).code, 0);
  proposal(root, change, { caps: [['auth', 'modified', 'AUTH-001, AUTH-002, AUTH-003']] });
  write(root, `medra/changes/${change}/specs/auth/spec.md`, delta('auth', [
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
  const before = read(root, 'medra/constitution.md');
  const r = medra(root, 'init');
  assert.equal(r.code, 0);
  assert.ok(r.json.existing.includes('medra/config.yaml'));
  assert.equal(read(root, 'medra/constitution.md'), before);
});

test('constitution: draft validates without version lines; ratify bumps; gate rule enforced', () => {
  const root = project();
  assert.match(read(root, 'medra/constitution.md'), /\*\*Version:\*\* 1\.0/);
  write(root, 'medra/constitution.md', read(root, 'medra/constitution.md').replace('**Gate:** Does', '**Gat:** Does'));
  const bad = medra(root, 'validate', '--project', 'constitution');
  assert.equal(bad.code, 1);
  assert.ok(rules(bad).includes('constitution.gate'));
  write(root, 'medra/constitution.md', read(root, 'medra/constitution.md').replace('**Gat:** Does', '**Gate:** Does'));
  assert.equal(medra(root, 'constitution', 'ratify', '--note', 'x').code, 2, 'amendment without --bump is a usage error');
  const r = medra(root, 'constitution', 'ratify', '--bump', 'minor', '--note', 'Add rule', '--source', 'L-001');
  assert.equal(r.json.version, '1.1');
  assert.match(read(root, 'medra/constitution.md'), /\| 1\.1 \| .* \| Add rule \| L-001 \|/);
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
  const file = `medra/changes/${change}/specs/auth/spec.md`;
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
  write(root, `medra/changes/${change}/proposal.md`, read(root, `medra/changes/${change}/proposal.md`).replace('**Track:** fast', '**Track:** full'));
  const plan = (row, complexity = 'None.') => `# Plan: ${change}\n\n## Summary\n\nDo it.\n\n## Constitution Check\n\n| Article | Gate | Result | Note |\n|---|---|---|---|\n${row}\n\n## Complexity Tracking\n\n${complexity}\n\n## Test Strategy\n\n- **Command:** \`npm test\`\n\n## Architecture\n\nX.\n\n## Decisions\n\n### D-01: Store\n\n**Choice:** A\n**Alternatives:** B\n**Rationale:** C\n`;
  write(root, `medra/changes/${change}/plan.md`, plan('| I | gate | pass | tests first |'));
  assert.equal(medra(root, 'validate', change, '--stage', 'plan').code, 0);
  write(root, `medra/changes/${change}/plan.md`, plan('| I | gate | fail | none |'));
  assert.ok(rules(medra(root, 'validate', change, '--stage', 'plan')).includes('plan.constitution'));
});

test('gates: prerequisites, stale after edit, not stale after task done', () => {
  const root = project();
  const change = brownfieldChange(root);
  assert.equal(medra(root, 'gate', change, 'verify', '--approve').code, 1, 'verify needs proposal first');
  assert.equal(medra(root, 'gate', change, 'proposal', '--approve', '--by', 'Ana').json.phase, 'tasked');
  write(root, 'test/a.test.js', '// AUTH-001.S1 AUTH-001.S3 AUTH-005.S1\n');
  assert.equal(medra(root, 'task', 'done', change, 'T001', '--evidence', 'failing as expected', '--kind', 'red').code, 0);
  assert.equal(medra(root, 'status', change).json.gates.proposal.status, 'approved', 'ticking does not stale the gate');
  const p = `medra/changes/${change}/proposal.md`;
  write(root, p, read(root, p).replace('- A change.', '- A different change.'));
  assert.equal(medra(root, 'status', change).json.gates.proposal.status, 'stale');
  const rc = medra(root, 'gate', change, 'proposal', '--request-changes', '--note', 'split it');
  assert.equal(rc.json.status, 'changes-requested');
  assert.equal(medra(root, 'context', change, '--stage', 'propose').json.gate_notes[0].note, 'split it');
});

test('task done: red/green exit codes and after ordering with --run', () => {
  const root = project();
  const change = brownfieldChange(root);
  medra(root, 'gate', change, 'proposal', '--approve');
  assert.equal(medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0').json.findings[0].rule, 'task.after');
  assert.equal(medra(root, 'task', 'done', change, 'T001', '--run', 'exit 0').json.findings[0].rule, 'task.red');
  assert.equal(medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1').code, 0);
  assert.equal(medra(root, 'task', 'done', change, 'T002', '--run', 'exit 2').json.findings[0].rule, 'task.green');
  assert.equal(medra(root, 'task', 'done', change, 'T002', '--run', 'definitely-not-a-command-xyz').code, 4);
  const ok = medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0');
  assert.deepEqual([ok.json.remaining, ok.json.next], [0, null]);
  assert.match(read(root, `medra/changes/${change}/tasks.md`), /- \[x\] T002[\s\S]*evidence green .*exit 0/);
});

test('context apply: next task with only its requirements; blockers skip tasks', () => {
  const root = project();
  const change = brownfieldChange(root);
  const c = medra(root, 'context', change, '--stage', 'apply').json;
  assert.equal(c.next_task.id, 'T001');
  assert.equal(c.next_task.requirements.length, 2);
  assert.equal(c.remaining, 2);
  assert.equal(c.requirements.find((r) => r.id === 'AUTH-001').operation, 'MODIFIED');
  assert.ok(c.requirements.find((r) => r.id === 'AUTH-001').living.includes('AUTH-001.S2'));
  medra(root, 'task', 'block', change, 'T001', '--note', 'no sandbox');
  assert.equal(medra(root, 'context', change, '--stage', 'apply').json.next_task, null);
  assert.equal(medra(root, 'status', change).json.blockers_open, 1);
});

test('archive round-trip: modified/kept/new/dropped scenarios, removed, added, index row, byte-stable', () => {
  const run = () => {
    const root = project();
    const change = brownfieldChange(root);
    medra(root, 'gate', change, 'proposal', '--approve');
    write(root, 'test/a.test.js', '// AUTH-001.S1 AUTH-001.S3 AUTH-005.S1\n');
    medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1');
    medra(root, 'task', 'done', change, 'T002', '--run', 'exit 0');
    write(root, `medra/changes/${change}/reviews/2026-10-30-verify-agent.md`, verifyReport());
    assert.equal(medra(root, 'review', change, '--report', `medra/changes/${change}/reviews/2026-10-30-verify-agent.md`).code, 0);
    const g = medra(root, 'gate', change, 'verify', '--approve');
    assert.equal(g.code, 0, JSON.stringify(g.json));
    const a = medra(root, 'archive', change);
    assert.equal(a.code, 0, JSON.stringify(a.json));
    assert.deepEqual(a.json.specs, { added: 1, modified: 1, removed: 1 });
    return root;
  };
  const root = run();
  const spec = read(root, 'medra/specs/auth/spec.md');
  assert.match(spec, /<!-- retired: AUTH-004, AUTH-002, AUTH-002\.S1, AUTH-001\.S2 -->/);
  assert.match(spec, /### REQ AUTH-001: Login v2[\s\S]*AUTH-001\.S3[\s\S]*### REQ AUTH-005: Reset/);
  assert.doesNotMatch(spec, /AUTH-002: Remember/);
  assert.match(read(root, 'medra/changes/archive/INDEX.md'), /\| 1 \| .* \| rework-auth-flow \| auth \| \+AUTH-005 ~AUTH-001 -AUTH-002 \|/);
  assert.equal(medra(root, 'validate', '--project', 'specs').code, 0);
  assert.equal(read(run(), 'medra/specs/auth/spec.md'), spec, 'merge output is byte-stable');
  // last_changed_by pointer for a later change
  medra(root, 'new', 'tweak-login-copy');
  write(root, 'medra/changes/tweak-login-copy/specs/auth/spec.md', delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login v3', [['AUTH-001.S1', 'Ok']])}`));
  const ctx = medra(root, 'context', 'tweak-login-copy', '--stage', 'plan').json;
  assert.match(ctx.requirements[0].last_changed_by, /^medra\/changes\/archive\/\d{4}-\d{2}-\d{2}-rework-auth-flow$/);
});

test('archive: new capability, retire capability, and conflicts exit 3 without writing', () => {
  const root = project();
  medra(root, 'new', 'add-billing-area');
  proposal(root, 'add-billing-area', { caps: [['billing', 'new', '—']] });
  write(root, 'medra/changes/add-billing-area/specs/billing/spec.md', delta('billing', `## Purpose\n\nBills.\n\n## ADDED Requirements\n\n${req('BILL-001', 'Invoice', [['BILL-001.S1', 'Sent']])}`, '**ID prefix:** `BILL`'));
  tasks(root, 'add-billing-area', ['- [ ] T001 [TEST] [BILL-001] Test BILL-001.S1 in `test/b.test.js` — verify: red', '- [ ] T002 [BILL-001] after T001 Do in `src/b.js` — verify: green']);
  medra(root, 'gate', 'add-billing-area', 'proposal', '--approve');
  write(root, 'test/b.test.js', '// BILL-001.S1\n');
  medra(root, 'task', 'done', 'add-billing-area', 'T001', '--run', 'exit 1');
  medra(root, 'task', 'done', 'add-billing-area', 'T002', '--run', 'exit 0');
  write(root, 'medra/changes/add-billing-area/reviews/2026-10-30-verify-agent.md', verifyReport());
  assert.equal(medra(root, 'gate', 'add-billing-area', 'verify', '--approve').code, 0);
  // Simulate a concurrent change that took BILL-001 first: a living spec now exists with that ID.
  livingSpec(root, 'billing', 'BILL', [req('BILL-001', 'Other', [['BILL-001.S1', 'x']])]);
  const before = read(root, 'medra/specs/billing/spec.md');
  const c = medra(root, 'archive', 'add-billing-area');
  assert.equal(c.code, 3);
  assert.equal(c.json.conflicts[0].problem, 'added-collision');
  assert.equal(read(root, 'medra/specs/billing/spec.md'), before, 'nothing written on conflict');
  fs.rmSync(path.join(root, 'medra/specs/billing'), { recursive: true });
  assert.equal(medra(root, 'archive', 'add-billing-area').code, 0);
  assert.match(read(root, 'medra/specs/billing/spec.md'), /\*\*ID prefix:\*\* `BILL`/);

  // Retire the capability entirely.
  medra(root, 'new', 'drop-billing-area');
  proposal(root, 'drop-billing-area', { caps: [['billing', 'removed', 'BILL-001']] });
  write(root, 'medra/changes/drop-billing-area/specs/billing/spec.md', delta('billing', '## REMOVED Requirements\n\n### REQ BILL-001: Invoice\n\n**Reason:** Gone.\n**Migration:** None', '**Retire capability:** yes'));
  tasks(root, 'drop-billing-area', ['- [ ] T001 Remove billing in `src/b.js` — verify: manual check']);
  medra(root, 'gate', 'drop-billing-area', 'proposal', '--approve');
  medra(root, 'task', 'done', 'drop-billing-area', 'T001', '--run', 'exit 0');
  write(root, 'medra/changes/drop-billing-area/reviews/2026-10-30-verify-agent.md', verifyReport());
  assert.equal(medra(root, 'gate', 'drop-billing-area', 'verify', '--approve').code, 0);
  assert.equal(medra(root, 'archive', 'drop-billing-area').code, 0);
  assert.equal(fs.existsSync(path.join(root, 'medra/specs/billing')), false);

  // missing-target: a MODIFIED against a requirement that no longer exists.
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Ok']])]);
  medra(root, 'new', 'tweak-auth-login');
  proposal(root, 'tweak-auth-login', { caps: [['auth', 'modified', 'AUTH-001']] });
  write(root, 'medra/changes/tweak-auth-login/specs/auth/spec.md', delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login v2', [['AUTH-001.S1', 'Ok']])}`));
  tasks(root, 'tweak-auth-login', ['- [ ] T001 [TEST] [AUTH-001] Test AUTH-001.S1 in `test/c.test.js` — verify: red', '- [ ] T002 [AUTH-001] after T001 Do in `src/c.js` — verify: green']);
  medra(root, 'gate', 'tweak-auth-login', 'proposal', '--approve');
  write(root, 'test/c.test.js', '// AUTH-001.S1\n');
  medra(root, 'task', 'done', 'tweak-auth-login', 'T001', '--run', 'exit 1');
  medra(root, 'task', 'done', 'tweak-auth-login', 'T002', '--run', 'exit 0');
  write(root, 'medra/changes/tweak-auth-login/reviews/2026-10-30-verify-agent.md', verifyReport());
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

test('learnings: add, bump, merge, retire, promote, status budget and staleness', () => {
  const root = project();
  write(root, 'medra/config.yaml', read(root, 'medra/config.yaml').replace('max_active: 40', 'max_active: 1').replace('promote_after: 3', 'promote_after: 2').replace('stale_after: 10', 'stale_after: 0'));
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
  assert.match(read(root, 'medra/learnings.md'), /## Promoted\n\n### L-001 \[lesson\] A[\s\S]*\*\*Promoted:\*\* Article I \(v1\.0\)/);
  assert.match(read(root, 'medra/learnings.md'), /\*\*Retired:\*\* merged into L-001/);
  assert.equal(medra(root, 'validate', '--project', 'learnings').code, 0);
});

test('install --target antigravity: rewrite table, manifest, idempotent, refuses foreign files', () => {
  const root = project();
  const r = medra(root, 'install', '--target', 'antigravity');
  assert.equal(r.code, 0, r.stderr);
  const cmd = read(root, '.agents/skills/medra-propose/SKILL.md');
  assert.match(cmd, /^---\nname: medra-propose\ndescription: /);
  assert.doesNotMatch(cmd, /disable-model-invocation|argument-hint|\$ARGUMENTS|\$\{CLAUDE_|medra:/);
  assert.match(cmd, /\.agents\/medra\/agents\/author\.md/);
  assert.match(cmd, /`medra-pipeline-author-propose`/);
  assert.match(read(root, '.agents/skills/medra-template-spec/SKILL.md'), /`\.agents\/skills\/medra-template-spec\/template\.md`/);
  assert.ok(fs.existsSync(path.join(root, '.agents/medra/agents/reviewer.md')));
  assert.equal(read(root, '.agents/medra/VERSION').trim(), JSON.parse(read(path.resolve('.'), 'package.json')).version);
  assert.equal(medra(root, 'install', '--target', 'antigravity').code, 0, 'idempotent');
  write(root, '.agents/skills/medra-propose/SKILL.md', 'hand edited');
  assert.equal(medra(root, 'install', '--target', 'antigravity').code, 1);
  assert.equal(medra(root, 'install', '--target', 'antigravity', '--force').code, 0);
});

test('usage errors exit 2 with a JSON envelope', () => {
  const root = project();
  const r = medra(root, 'gate', 'x-y', 'proposal');
  assert.equal(r.code, 2);
  const u = medra(root, 'frobnicate');
  assert.equal(u.code, 2);
  assert.equal(u.json.ok, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { medra, medraHuman, write, read, project, req, livingSpec, proposal, delta, tasks, verifyReport, securityReport, rules, brownfieldChange } from './helpers.js';

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

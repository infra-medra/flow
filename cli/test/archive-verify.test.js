import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { medra, medraHuman, write, read, project, req, livingSpec, proposal, delta, tasks, verifyReport, securityReport, rules, brownfieldChange } from './helpers.js';

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

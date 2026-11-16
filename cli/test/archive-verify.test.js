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

test('handoff: payloads, pre-dispatch refusals, rounds, fixed findings and files changed since the previous round', () => {
  const root = project();
  const change = brownfieldChange(root);
  const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: root });
  git('add', '-A'); git('commit', '-q', '-m', 'base');
  const state = `docs/changes/${change}/.medra.yaml`;
  write(root, state, read(root, state).replace(/^diff_base: .*$/m, `diff_base: ${spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()}`));

  assert.equal(medra(root, 'handoff', change, 'nope').code, 2);
  const early = medra(root, 'handoff', change, 'check');
  assert.equal(early.code, 1);
  assert.ok(rules(early).includes('handoff.tasks'), 'open tasks block the check');
  assert.ok(rules(medra(root, 'handoff', change, 'audit')).includes('handoff.security'), 'not security-relevant');
  assert.ok(rules(medra(root, 'handoff', change, 'threat-model')).includes('handoff.track'), 'fast track gets no threat model');

  write(root, 'test/a.test.js', '// AUTH-001.S1 AUTH-001.S3 AUTH-005.S1\nprocess.exit(1);\n');
  write(root, 'src/a.js', 'export const a = 1;\n');
  write(root, 'src/b.js', 'export const b = 1;\n');
  assert.equal(medra(root, 'task', 'done', change, 'T001', '--run', 'node test/a.test.js', '--kind', 'red').code, 0);
  assert.equal(medra(root, 'task', 'done', change, 'T002', '--run', 'node -e 0').code, 0);

  // Round 1: no previous report, so no fixed_findings and no changed_since_previous
  const r1 = medra(root, 'handoff', change, 'check');
  assert.equal(r1.code, 0, r1.stdout);
  assert.equal(r1.json.agent, 'reviewer');
  assert.equal(r1.json.handoff, 'handoffs/implementer-reviewer.md');
  assert.deepEqual(Object.keys(r1.json.payload), ['change', 'change_path', 'diff_base', 'report_path', 'round']);
  assert.equal(r1.json.payload.round, 1);
  assert.match(r1.json.payload.report_path, /reviews\/\d{4}-\d{2}-\d{2}-verify-agent-r1\.md$/);
  assert.ok(rules(medra(root, 'handoff', change, 'check', '--fixed', 'F-01')).includes('handoff.fixed'), '--fixed needs an earlier report');

  // Round 2: one file edited, one added, one left alone
  write(root, r1.json.payload.report_path, verifyReport('fail').replace('None.', '### F-01: Gap\n\n### F-02: Other'));
  write(root, 'src/a.js', 'export const a = 2;\n');
  write(root, 'src/c.js', 'export const c = 1;\n');
  assert.ok(rules(medra(root, 'handoff', change, 'check', '--fixed', 'F-09')).includes('handoff.fixed'), 'unknown finding ID');
  assert.ok(rules(medra(root, 'handoff', change, 'check', '--fixed', 'S-01')).includes('handoff.fixed'), 'wrong prefix');
  const r2 = medra(root, 'handoff', change, 'check', '--fixed', 'F-01');
  assert.equal(r2.code, 0, r2.stdout);
  assert.equal(r2.json.payload.round, 2);
  assert.equal(r2.json.payload.previous_report, r1.json.payload.report_path);
  assert.deepEqual(r2.json.payload.fixed_findings, ['F-01']);
  assert.deepEqual(r2.json.payload.changed_since_previous, ['src/a.js', 'src/c.js']);
  assert.equal(medra(root, 'status', change).json.gates.proposal.status, 'pending', 'snapshots never touch gates');

  // The text form is the YAML block of the contract, with lists inline
  const text = medraHuman(root, 'handoff', change, 'check', '--fixed', 'F-01,F-02');
  assert.equal(text.code, 0);
  assert.match(text.stdout, /^change: rework-auth-flow\n/);
  assert.match(text.stdout, /^round: 2$/m);
  assert.match(text.stdout, /^fixed_findings: \[F-01, F-02\]$/m);
  assert.match(text.stdout, /^changed_since_previous: \[src\/a\.js, src\/c\.js\]$/m, 'a repeated call for the same round compares against the previous round');

  // The audit shares the round, and follows its own latest report
  const p = `docs/changes/${change}/proposal.md`;
  write(root, p, read(root, p).replace('**Rationale:** Criteria checked.', '**Rationale:** Criteria checked.\n**Security:** relevant\n**Security rationale:** New endpoint.'));
  const a2 = medra(root, 'handoff', change, 'audit');
  assert.equal(a2.code, 0, a2.stdout);
  assert.equal(a2.json.agent, 'security');
  assert.equal(a2.json.payload.round, 2);
  assert.match(a2.json.payload.report_path, /-security-agent-r2\.md$/);
  assert.equal(a2.json.payload.previous_report, undefined);

  // Threat model: full track only; revision follows the file on disk
  medra(root, 'track', change, 'full', '--reason', 'needs design');
  write(root, p, read(root, p).replace('**Track:** fast', '**Track:** full'));
  assert.ok(rules(medra(root, 'handoff', change, 'threat-model')).includes('handoff.plan'));
  write(root, `docs/changes/${change}/plan.md`, '# Plan\n');
  const t1 = medra(root, 'handoff', change, 'threat-model', '--focus', 'Token storage (D-02)');
  assert.equal(t1.code, 0, t1.stdout);
  assert.deepEqual(t1.json.payload, { change, change_path: `docs/changes/${change}`, plan_path: `docs/changes/${change}/plan.md`, threat_model_path: `docs/changes/${change}/threat-model.md`, focus: 'Token storage (D-02)' });
  write(root, `docs/changes/${change}/threat-model.md`, '# Threat Model\n');
  assert.equal(medra(root, 'handoff', change, 'threat-model').json.payload.revision, true);
  assert.equal(medra(root, 'handoff', change, 'threat-model', '--fixed', 'F-01').code, 2);
});

test('suite: verify.suite needs a green full run on the current code, and verify.merge a clean merge, before a handoff or the gate', () => {
  const root = project();
  const change = brownfieldChange(root);
  const cfg = 'docs/config-flow.yaml';
  write(root, cfg, read(root, cfg).replace('command: null', 'command: node suite.js').replace('checks: []', 'checks:\n    - node check.js'));
  write(root, 'suite.js', 'process.exit(0);\n');
  write(root, 'check.js', 'process.exit(0);\n');
  const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: root, encoding: 'utf8' });
  git('add', '-A'); git('commit', '-q', '-m', 'base');
  const state = `docs/changes/${change}/.medra.yaml`;
  write(root, state, read(root, state).replace(/^diff_base: .*$/m, `diff_base: ${git('rev-parse', '--short', 'HEAD').stdout.trim()}`));
  write(root, 'test/a.test.js', '// AUTH-001.S1 AUTH-001.S3 AUTH-005.S1\n');
  write(root, 'src/a.js', 'export const a = 1;\n');
  assert.equal(medra(root, 'task', 'done', change, 'T001', '--run', 'node -e "process.exit(1)"', '--kind', 'red').code, 0);
  assert.equal(medra(root, 'task', 'done', change, 'T002', '--run', 'node -e 0').code, 0);

  // Never run
  assert.deepEqual(rules(medra(root, 'handoff', change, 'check')), ['verify.suite']);
  assert.ok(rules(medra(root, 'validate', change, '--stage', 'verify')).includes('verify.suite'));

  // A red suite is recorded and refused, with the failure output
  write(root, 'suite.js', "console.error('AssertionError: regression in billing'); process.exit(3);\n");
  const red = medra(root, 'suite', change);
  assert.equal(red.code, 1);
  assert.deepEqual(rules(red), ['suite.failed']);
  assert.match(red.json.message, /regression in billing/);
  assert.deepEqual(rules(medra(root, 'handoff', change, 'check')), ['verify.suite']);

  // Green: the test command and every check ran, and the handoff says so
  write(root, 'suite.js', 'process.exit(0);\n');
  const green = medra(root, 'suite', change);
  assert.equal(green.code, 0, green.stdout);
  assert.deepEqual(green.json.ran, ['node suite.js', 'node check.js']);
  const ok = medra(root, 'handoff', change, 'check');
  assert.equal(ok.code, 0, ok.stdout);
  assert.equal(ok.json.payload.suite, 'green');

  // An edit after the run makes it stale, whoever made the edit and however
  write(root, 'src/a.js', 'export const a = 2;\n');
  assert.deepEqual(rules(medra(root, 'handoff', change, 'check')), ['verify.suite']);
  assert.equal(medra(root, 'suite', change).code, 0);
  assert.equal(medra(root, 'handoff', change, 'check').code, 0);

  // A failing static check fails the suite too
  write(root, 'check.js', 'process.exit(1);\n');
  assert.deepEqual(rules(medra(root, 'suite', change)), ['suite.failed']);
  write(root, 'check.js', 'process.exit(0);\n');
  assert.equal(medra(root, 'suite', change).code, 0);

  // Another change removes the requirement this one modifies: the deltas no longer merge
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-002', 'Remember me', [['AUTH-002.S1', 'Cookie']])], 'AUTH-004');
  const blocked = medra(root, 'handoff', change, 'check');
  assert.equal(blocked.code, 1);
  assert.ok(rules(blocked).includes('verify.merge'));
  const merge = medra(root, 'validate', change, '--stage', 'verify').json.findings.find((f) => f.rule === 'verify.merge');
  assert.equal(merge.ref, 'AUTH-001');
  assert.match(merge.remediation, /medra:propose/);
});

test('suite: with no test command configured it runs nothing and the rule does not apply', () => {
  const root = project();
  const change = brownfieldChange(root);
  assert.deepEqual(medra(root, 'suite', change).json, { ok: true, ran: [], skipped: true });
  assert.ok(!rules(medra(root, 'validate', change, '--stage', 'verify')).includes('verify.suite'));
});

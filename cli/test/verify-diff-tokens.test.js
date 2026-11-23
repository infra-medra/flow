import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { configWarnings, loadConfig } from '../src/core.js';
import { loadState, saveState } from '../src/change.js';
import { compileStep, diffExcludes, stepMarkdown } from '../src/step.js';
import { medra, project, livingSpec, req, proposal, write, read, BIN, verifyReport, securityReport } from './helpers.js';

function git(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
  return res.stdout.trim();
}

const commit = (root, msg) => {
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg);
};

function setExclude(root, value) {
  const cfg = read(root, 'docs/config-flow.yaml');
  assert.match(cfg, /diff_exclude: \[\]/);
  write(root, 'docs/config-flow.yaml', cfg.replace('diff_exclude: []', `diff_exclude:${value}`));
}

function verifyProject(change, { security = null } = {}) {
  const root = project({ mode: 'none' });
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])]);
  medra(root, 'new', change, '--track', 'full');
  proposal(root, change, { track: 'full', caps: [['auth', 'modified', 'AUTH-001']], security });
  write(root, `docs/changes/${change}/specs/auth/spec.md`, `# Delta: auth\n\n**Capability:** \`auth\`\n\n## MODIFIED Requirements\n\n${req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])}`);
  write(root, `docs/changes/${change}/tasks.md`, `# Tasks: ${change}\n\n## Phase 1: AUTH-001\n\n- [x] T001 [AUTH-001] Done in \`src/a.js\` — verify: ok\n`);
  const base = git(root, 'rev-parse', 'HEAD');
  return { root, base };
}

test('verify diff leaves out change documents, the Antigravity bundle and verify.diff_exclude globs', () => {
  const change = 'diff-excludes';
  const { root, base } = verifyProject(change);
  write(root, 'src/a.js', 'export const CODE_MARKER = 1;\n');
  write(root, `docs/changes/${change}/notes.md`, 'CHANGE_DOC_MARKER\n');
  write(root, '.agents/plugins/medra/x.md', 'BUNDLE_MARKER\n');
  write(root, 'gen/out.js', 'GENERATED_MARKER\n');
  const cfg = loadConfig(root);
  setExclude(root, '\n    - gen/**');
  assert.deepEqual(cfg.verify.diff_exclude, []);
  commit(root, 'work');

  const env = compileStep(root, change, { stage: 'verify', diffBase: base, full: true });
  assert.equal(env.diff_error, null);
  assert.match(env.embedded.diff, /CODE_MARKER/);
  for (const marker of [/CHANGE_DOC_MARKER/, /BUNDLE_MARKER/, /GENERATED_MARKER/]) assert.doesNotMatch(env.embedded.diff, marker);
  const rev = env.subagents.find((s) => s.role === 'reviewer');
  assert.match(rev.prompt, /do not re-run `medra context` or `git diff`/);
  assert.deepEqual(configWarnings(root), []);
});

test('diffExcludes keeps valid globs and drops pathspec magic, negations and options', () => {
  const out = diffExcludes({ verify: { diff_exclude: ['dist/**', ':(top)x', '!keep', '-p', 42, ' '] } });
  assert.deepEqual(out, [':(exclude,glob)docs/changes/**', ':(exclude,glob).agents/**', ':(exclude,glob)dist/**']);
});

test('configWarnings flags an invalid verify.diff_exclude', () => {
  const { root } = verifyProject('diff-warn');
  setExclude(root, ' ":(top)x"');
  assert.ok(configWarnings(root).some((w) => w.rule === 'config.verify'));
});

test('later verify rounds embed only the diff of files changed since the previous report', () => {
  const change = 'diff-incremental';
  const { root, base } = verifyProject(change, { security: 'relevant' });
  write(root, 'src/a.js', 'export const A_MARKER = 1;\n');
  write(root, 'src/b.js', 'export const B_MARKER = 1;\n');
  commit(root, 'round 1 work');

  const r1 = compileStep(root, change, { stage: 'verify', diffBase: base, full: true });
  assert.ok(r1.embedded.diff, 'round 1 shares one full diff');
  assert.deepEqual(r1.subagents.map((s) => s.embedded_keys.includes('diff')), [true, true]);

  write(root, `docs/changes/${change}/reviews/2026-01-01-verify-reviewer-r1.md`, '# Review\n');
  write(root, `docs/changes/${change}/reviews/2026-01-01-verify-security-r1.md`, '# Security\n');
  write(root, 'src/b.js', 'export const B_MARKER = 2; // FIXED_MARKER\n');
  commit(root, 'fix');
  const state = loadState(root, change);
  state.last_fix_round_at = new Date(Date.now() + 3600_000).toISOString();
  saveState(root, change, state);

  const r2 = compileStep(root, change, { stage: 'verify', diffBase: base, full: true });
  const rev = r2.subagents.find((s) => s.role === 'reviewer');
  const sec = r2.subagents.find((s) => s.role === 'security');
  assert.deepEqual(rev.changed_since_previous, ['src/b.js']);
  assert.deepEqual(rev.embedded_keys, ['diff'], 'identical incremental diffs are embedded once');
  assert.deepEqual(sec.embedded_keys, ['diff']);
  assert.match(r2.embedded.diff, /^<untrusted_data source="git-diff">/);
  assert.match(r2.embedded.diff, /FIXED_MARKER/);
  assert.doesNotMatch(r2.embedded.diff, /A_MARKER/);
  assert.match(rev.prompt, /only the files changed since your previous report/);

  const md = stepMarkdown(r2, { role: 'reviewer' });
  assert.match(md, /### Embedded: diff\n/);
  assert.match(md, /FIXED_MARKER/);
});

test('verify diff includes uncommitted and untracked files and drops low-priority files first when over budget', () => {
  const change = 'diff-priority';
  const { root, base } = verifyProject(change);
  write(root, 'src/a.js', 'export const COMMITTED_MARKER = 1;\n');
  write(root, 'test/a.test.js', 'TEST_MARKER\n');
  write(root, 'README.md', `${'r'.repeat(70 * 1024)}\n`);
  commit(root, 'work');
  write(root, 'src/a.js', 'export const UNCOMMITTED_MARKER = 1;\n');
  write(root, 'src/new.js', 'UNTRACKED_MARKER\n');

  const env = compileStep(root, change, { stage: 'verify', diffBase: base, full: true });
  const diff = env.embedded.diff;
  assert.match(diff, /UNCOMMITTED_MARKER/);
  assert.match(diff, /UNTRACKED_MARKER/);
  assert.ok(diff.indexOf('src/a.js') < diff.indexOf('test/a.test.js'), 'source precedes tests');
  assert.doesNotMatch(diff, /rrrrrrrr/);
  assert.match(diff, /Omitted files: README\.md/);
  const rev = env.subagents.find((s) => s.role === 'reviewer');
  assert.match(rev.prompt, /git diff was truncated; inspect remaining files via pointers \(omitted: `README\.md`\)/);
});

function backdate(root, change, ms) {
  const state = loadState(root, change);
  const past = new Date(Date.now() - ms).toISOString();
  for (const r of state.reviews) r.recorded_at = past;
  saveState(root, change, state);
}

test('verify carries a non-failing security report forward when only tests changed, after the pending reviewer, and dispatches only stale roles', () => {
  const change = 'carry-security';
  const { root, base } = verifyProject(change, { security: 'relevant' });
  write(root, 'src/a.js', 'export const a = 1;\n');
  write(root, 'test/a.test.js', 'assert(a)\n');
  commit(root, 'work');
  const old = new Date(Date.now() - 7200_000);
  for (const f of ['proposal.md', 'tasks.md', 'specs/auth/spec.md']) fs.utimesSync(path.join(root, 'docs/changes', change, f), old, old);

  const r1 = compileStep(root, change, { stage: 'verify', diffBase: base });
  assert.deepEqual(r1.subagents.map((s) => [s.role, s.round]), [['reviewer', 1], ['security', 1]]);
  write(root, r1.subagents[0].report, verifyReport('fail').replace('critical 0', 'critical 1'));
  write(root, r1.subagents[1].report, securityReport('pass'));
  assert.equal(medra(root, 'review', change, '--report', r1.subagents[0].report, '--by', 'reviewer').code, 0);
  assert.equal(medra(root, 'review', change, '--report', r1.subagents[1].report, '--by', 'security').code, 0);
  backdate(root, change, 3600_000);
  const state = loadState(root, change);
  state.last_fix_round_at = new Date(Date.now() - 1800_000).toISOString();
  saveState(root, change, state);

  write(root, 'test/a.test.js', 'assert(a === 1)\n');
  const r2 = compileStep(root, change, { stage: 'verify', diffBase: base });
  assert.deepEqual(r2.subagents.map((s) => [s.role, s.round]), [['reviewer', 2]], 'only the stale, non-carriable receiver is dispatched');
  assert.deepEqual(r2.coordinator_steps, [], 'the carry waits while the reviewer is pending in the shared round');
  assert.notEqual(medra(root, 'verify-carry', change, '--by', 'reviewer').code, 0, 'reviewer evidence changed');

  write(root, r2.subagents[0].report, verifyReport('pass'));
  assert.equal(medra(root, 'review', change, '--report', r2.subagents[0].report, '--by', 'reviewer').code, 0);
  const r3 = compileStep(root, change, { stage: 'verify', diffBase: base });
  assert.deepEqual(r3.subagents, []);
  assert.deepEqual(r3.coordinator_steps.map((c) => c.command), [`medra verify-carry ${change} --by security --json`]);

  const sub = spawnSync(process.execPath, [BIN, 'verify-carry', change, '--by', 'security', '--json'], { cwd: root, encoding: 'utf8', env: { ...process.env, MEDRA_SUBAGENT: '1' } });
  assert.notEqual(sub.status, 0, 'subagents cannot carry');

  const carried = medra(root, 'verify-carry', change, '--by', 'security');
  assert.equal(carried.code, 0, carried.stderr || carried.stdout);
  assert.match(read(root, carried.json.report), /^> \*\*Carried forward\*\* from r1/m);
  assert.match(carried.json.report, /-verify-security-r3\.md$/);

  const r4 = compileStep(root, change, { stage: 'verify', diffBase: base });
  // Both reports are fresh: no receiver is dispatched or carried again (the fixture's task lacks
  // evidence, so the step moves on to the fix round instead of the gate).
  assert.ok(!r4.subagents.some((x) => x.role === 'reviewer' || x.role === 'security'));
  assert.ok(!r4.coordinator_steps.some((c) => /verify-carry/.test(c.command ?? '')));
});

test('verify never carries a failing security report or a round whose code changed', () => {
  const change = 'carry-refused';
  const { root, base } = verifyProject(change, { security: 'relevant' });
  write(root, 'src/a.js', 'export const a = 1;\n');
  commit(root, 'work');
  const r1 = compileStep(root, change, { stage: 'verify', diffBase: base });
  write(root, r1.subagents[0].report, verifyReport('pass'));
  write(root, r1.subagents[1].report, securityReport('fail', 'critical 1 · high 0 · medium 0 · low 0 · info 0'));
  medra(root, 'review', change, '--report', r1.subagents[0].report, '--by', 'reviewer');
  medra(root, 'review', change, '--report', r1.subagents[1].report, '--by', 'security');
  backdate(root, change, 3600_000);
  const state = loadState(root, change);
  state.last_fix_round_at = new Date(Date.now() - 1800_000).toISOString();
  saveState(root, change, state);
  write(root, 'test/a.test.js', 'new test\n');
  const r2 = compileStep(root, change, { stage: 'verify', diffBase: base });
  assert.deepEqual(r2.subagents.map((s) => s.role), ['reviewer', 'security']);
  assert.deepEqual(r2.coordinator_steps, []);
});

test('each receiver gets its own diff: the reviewer skips lockfiles, the security agent skips tests', () => {
  const change = 'diff-per-role';
  const { root, base } = verifyProject(change, { security: 'relevant' });
  write(root, 'src/a.js', 'SOURCE_MARKER\n');
  write(root, 'test/a.test.js', 'TEST_MARKER\n');
  write(root, 'package-lock.json', '{"LOCK_MARKER":1}\n');
  commit(root, 'work');

  const env = compileStep(root, change, { stage: 'verify', diffBase: base, full: true });
  const rev = env.subagents.find((s) => s.role === 'reviewer');
  const sec = env.subagents.find((s) => s.role === 'security');
  assert.deepEqual(rev.embedded_keys, ['diff', 'diff:reviewer']);
  assert.deepEqual(sec.embedded_keys, ['diff', 'diff:security']);
  assert.match(env.embedded.diff, /SOURCE_MARKER/);
  assert.doesNotMatch(env.embedded.diff, /TEST_MARKER|LOCK_MARKER/);
  assert.match(env.embedded['diff:reviewer'], /TEST_MARKER/);
  assert.doesNotMatch(env.embedded['diff:reviewer'], /LOCK_MARKER/);
  assert.match(env.embedded['diff:security'], /LOCK_MARKER/);
  assert.doesNotMatch(env.embedded['diff:security'], /TEST_MARKER/);
  assert.match(sec.prompt, /omits the change's own documents, generated plugin bundles, and test files/);
  for (const s of [rev, sec]) assert.match(s.prompt, /## Conventions \(verify\)\n- Write report prose in the `language`/, 'the conventions excerpt replaces reading the reference');
  assert.doesNotMatch(sec.prompt, /## Pre-checks/, 'pre-checks are the reviewer\'s');
});

test('the reviewer prompt carries CLI pre-checks: coverage locations, TDD evidence and weakened tests', () => {
  const change = 'verify-prechecks';
  const root = project({ mode: 'tdd' });
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])]);
  medra(root, 'new', change, '--track', 'full');
  proposal(root, change, { track: 'full', caps: [['auth', 'modified', 'AUTH-001']] });
  write(root, `docs/changes/${change}/specs/auth/spec.md`, `# Delta: auth\n\n**Capability:** \`auth\`\n\n## MODIFIED Requirements\n\n${req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])}`);
  write(root, `docs/changes/${change}/tasks.md`, [
    `# Tasks: ${change}`, '', '## Phase 1: AUTH-001', '',
    '- [x] T001 [TEST] [AUTH-001] Test login — verify: red',
    '  - evidence red 2026-11-01: node --test exit 1',
    '- [x] T002 [AUTH-001] after T001 Implement login — verify: green',
    '',
  ].join('\n'));
  write(root, 'test/old.test.js', "test('kept', () => { assert.equal(1, 1); });\n");
  commit(root, 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  write(root, 'test/old.test.js', "test('kept', () => { });\n");
  write(root, 'test/new.test.js', "// AUTH-001.S1\ntest('login', () => { assert.ok(true); });\n");
  write(root, 'src/login.js', 'export const login = 1;\n');
  commit(root, 'work');

  const env = compileStep(root, change, { stage: 'verify', diffBase: base, full: true });
  const rev = env.subagents.find((s) => s.role === 'reviewer');
  assert.match(rev.prompt, /## Pre-checks \(CLI\)/);
  assert.match(rev.prompt, /Coverage: 1\/1 scenarios cited by a test/);
  assert.match(rev.prompt, /AUTH-001\.S1: `test\/new\.test\.js:1`/);
  assert.match(rev.prompt, /TDD evidence: T002 has no `green` or `manual` evidence/);
  assert.match(rev.prompt, /Test files vs `[0-9a-f]+`: 1 new, 0 additive-only, 1 to inspect for weakening:/);
  assert.match(rev.prompt, /test\/old\.test\.js .*weakening.*assertion was removed/);
});

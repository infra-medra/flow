import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { medra, medraHuman, write, read, project, req, livingSpec, proposal, delta, tasks, verifyReport, securityReport, rules, brownfieldChange } from './helpers.js';

test('version prints bare semver', () => {
  const r = medra(process.cwd(), '--version');
  assert.match(r.stdout.trim(), /^2\.0\.0-rc\.\d+$/);
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
  assert.match(cmd, /\.agents\/plugins\/medra\/references\/conventions\.md/);
  assert.match(cmd, /\.agents\/plugins\/medra\/references\/gate\.md/);
  assert.doesNotMatch(cmd, /agents\/author\.md|pipelines\/author-propose\.md/, 'a command skill is its own single source');
  assert.match(cmd, /## Operating Persona \(Author\)/);
  assert.match(cmd, /### Phase 1 — Intake/);
  const applyCmd = read(root, `${P}/skills/apply/SKILL.md`);
  assert.match(applyCmd, /## Operating Persona \(Implementer\)/);
  assert.match(applyCmd, /### Phase 1 — Resume/);
  assert.equal(fs.readdirSync(path.join(root, P, 'skills')).length, 9, 'only 9 user commands installed as skills');
  assert.match(read(root, `${P}/templates/spec/guide.md`), /`\.agents\/plugins\/medra\/templates\/spec\/template\.md`/);
  const reviewer = read(root, `${P}/agents/reviewer.md`);
  assert.match(reviewer, /^---\nname: medra-reviewer\ndescription: [^\n]+\ntools: \[read_file, write_file, run_command, ask_question\]\nmainAgent: true\nsubagent: true\n---\n/);
  assert.deepEqual(fs.readdirSync(path.join(root, P, 'agents')).sort(), ['reviewer.md', 'security.md'], 'only dispatched agents ship');
  assert.deepEqual(fs.readdirSync(path.join(root, P, 'pipelines')).sort(), ['reviewer-check.md', 'security-audit.md', 'security-threat-model.md'], 'only subagent pipelines ship');
  assert.deepEqual(fs.readdirSync(path.join(root, P, 'references')).sort(), ['conventions.md', 'gate.md', 'portability.md']);
  assert.match(read(root, `${P}/handoffs/implementer-reviewer.md`), /subagent_type: medra-reviewer/);
  assert.match(read(root, `${P}/agents/security.md`), /tools: \[read_file, write_file, run_command, search_web\]\nmainAgent: true\nsubagent: true\n---/, 'a dispatched agent is a subagent');
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

test('install --target antigravity: rejects path traversal in manifests (safeJoin guard)', () => {
  const root = project();
  const canary = path.join(root, 'canary.txt');
  fs.writeFileSync(canary, 'protected content');
  const canaryHash = crypto.createHash('sha256').update('protected content').digest('hex');

  // Attempt traversal via legacy MANIFEST.json
  const legacyManifest = {
    version: '1.1.0',
    files: {
      '../canary.txt': canaryHash,
      '../../canary.txt': canaryHash,
      '/tmp/outside.txt': 'dummy',
    },
  };
  write(root, '.agents/medra/MANIFEST.json', JSON.stringify(legacyManifest));

  // Attempt traversal via previous plugin MANIFEST.json
  const pluginManifest = {
    version: '1.7.0',
    files: {
      '../../canary.txt': canaryHash,
      '/etc/shadow': 'dummy',
    },
  };
  write(root, '.agents/plugins/medra/MANIFEST.json', JSON.stringify(pluginManifest));

  const r = medra(root, 'install', '--target', 'antigravity');
  assert.equal(r.code, 0);

  assert.ok(fs.existsSync(canary), 'canary file must not be deleted by path traversal in manifest');
  assert.equal(read(root, 'canary.txt'), 'protected content');
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

test('validation findings include prescriptive remediation in json and human output', () => {
  const root = project();
  livingSpec(root, 'auth', 'AUTH', [
    req('AUTH-001', 'Login', [['AUTH-001.S1', 'Ok']], 'It logs in.'),
  ]);
  const rJson = medra(root, 'validate', '--project', 'specs');
  assert.equal(rJson.code, 1);
  const finding = rJson.json.findings.find((f) => f.rule === 'spec.shall');
  assert.ok(finding, 'spec.shall finding should exist');
  assert.ok(finding.remediation, 'spec.shall should have a prescriptive remediation');
  assert.match(finding.remediation, /SHALL/);

  // Human terminal output format test (↳ fix: <remediation>)
  const rHuman = medraHuman(root, 'validate', '--project', 'specs');
  assert.equal(rHuman.code, 1);
  assert.match(rHuman.stderr, /↳ fix: /);
  assert.match(rHuman.stderr, /SHALL/);
});

test('sanitizeTestOutput: strips ANSI, filters npm noise, highlights failure and bounds token output', () => {
  const root = project();
  const change = brownfieldChange(root);

  // Command that prints ANSI color codes, npm error noise, and an assertion error
  const noiseScript = [
    'console.log("npm notice created a lockfile");',
    'console.log("npm error code 1");',
    'console.log("npm error A complete log of this run can be found in: /tmp/log");',
    'console.log("\\u001b[31mFAIL\\u001b[0m test/auth.test.js");',
    'console.log("AssertionError: expected false to be true");',
    'console.log("  at /src/test.js:10:5");',
    'console.log("npm error command failed");',
    'process.exit(1);',
  ].join('\n');
  write(root, 'fail.js', noiseScript);

  medra(root, 'gate', change, 'proposal', '--approve');
  medra(root, 'task', 'done', change, 'T001', '--run', 'exit 1');
  const res = medra(root, 'task', 'done', change, 'T002', '--run', 'node fail.js');
  assert.equal(res.code, 1);
  assert.equal(res.json.findings[0].rule, 'task.green');

  // The failure message should contain the clean failure and NO ANSI or npm boilerplate noise
  const msg = res.json.message;
  assert.match(msg, /FAIL test\/auth\.test\.js/);
  assert.match(msg, /AssertionError: expected false to be true/);
  assert.doesNotMatch(msg, /\u001b\[31m/);
  assert.doesNotMatch(msg, /npm error A complete log/);
  assert.doesNotMatch(msg, /npm notice/);
});

test('medra fix: deterministically auto-remediates proposal.md and plan.md validation issues', () => {
  const root = project();
  const change = brownfieldChange(root);
  medra(root, 'track', change, 'full', '--reason', 'needs design');

  // Create an incomplete plan.md: missing Summary, Complexity Tracking, and Constitution Check row
  write(root, `docs/changes/${change}/plan.md`, [
    `# Plan: wrong-title`, '',
    '## Constitution Check', '',
    '| Article | Gate | Result | Note |',
    '|---|---|---|---|',
    '## Test Strategy', '',
    '- **Command:** `npm test`', '',
    '| Scenario | Level | Test location |', '|---|---|---|',
    '| `AUTH-001.S1–S3` | unit | `test/a.test.js` |', '| `AUTH-005.S1` | unit | `test/a.test.js` |', '',
    '## Decisions', '',
    'None.', '',
  ].join('\n'));

  // Corrupt proposal.md capabilities table and track
  write(root, `docs/changes/${change}/proposal.md`, [
    `# Proposal: ${change}`, '',
    '## Why', '', 'Users need this.', '',
    '## What Changes', '', '- Changes.', '',
    '## Scope', '', '### In scope\n- Work\n### Out of scope\n- Later', '',
    '## Track', '', '**Track:** fast', '**Rationale:** Checked.', '',
    '## Capabilities', '',
    '| Capability | Operation | Requirements |',
    '|---|---|---|',
    '| `auth` | new | AUTH-999 |', '', // wrong operation and IDs
    '## Impact', '', '- **Code:** src\n- **Interfaces:** None.\n- **Data:** None.\n- **Dependencies:** None.', '',
    '## Open Questions', '', 'None.', '',
  ].join('\n'));

  // Pre-fix validation should fail
  assert.notEqual(medra(root, 'validate', change, '--stage', 'plan').code, 0);

  // Run medra fix
  const fixRes = medra(root, 'fix', change).json;
  assert.equal(fixRes.ok, true);
  assert.ok(fixRes.fixed.length >= 3, 'should fix title, anchors, and capabilities');

  // Human output test
  const fixHuman = medraHuman(root, 'fix', change);
  assert.equal(fixHuman.code, 0);
  assert.match(fixHuman.stdout, /medra: fixed|no mechanical issues/);

  // Post-fix plan.md should have canonical anchors in order and Constitution Check row
  const planText = read(root, `docs/changes/${change}/plan.md`);
  assert.match(planText, /^# Plan: rework-auth-flow/m);
  assert.match(planText, /## Summary/);
  assert.match(planText, /## Complexity Tracking/);
  assert.match(planText, /\| I \| .* \| pending \| \[NEEDS CLARIFICATION: check the plan against Article I\] \|/);
  assert.doesNotMatch(planText, /\| pass \|/, 'fix never supplies a verdict');

  // Post-fix proposal.md should have synced capabilities table and track 'full'
  const propText = read(root, `docs/changes/${change}/proposal.md`);
  assert.match(propText, /\*\*Track:\*\* full/);
  assert.match(propText, /\| `auth` \| modified \| AUTH-005, AUTH-001, AUTH-002 \|/);

  assert.doesNotMatch(propText, /\*\*Security:\*\*/, 'fix never classifies security');

  // Structure is repaired; what is left is the judgment fix refused to invent
  const after = medra(root, 'validate', change, '--stage', 'plan');
  assert.equal(after.code, 1);
  assert.deepEqual([...new Set(after.json.findings.filter((x) => x.severity === 'error').map((x) => x.rule))].sort(), ['plan.constitution', 'plan.markers']);
});

test('PLUG-005.S1 & M-07: models config accepts valid overrides, defaults to inherit, and warns on invalid entries', () => {
  const root = project();
  const cfgPath = path.join(root, 'docs', 'config-flow.yaml');
  const baseCfg = fs.readFileSync(cfgPath, 'utf8').replace(/\n?models:\n(?:[ \t]+.*\n)*/g, '\n');

  // Valid models override should not trigger config.unknown-key
  fs.writeFileSync(cfgPath, `${baseCfg.trimEnd()}\nmodels:\n  default: inherit\n  implementer: sonnet\n  reviewer: inherit\n`);
  const okVal = medra(root, 'validate', '--project', 'constitution');
  assert.equal(okVal.code, 0);
  const warningsOk = okVal.json.findings ?? [];
  assert.equal(warningsOk.some((f) => f.rule === 'config.unknown-key' && /models/.test(f.message)), false);

  // Invalid models key/value triggers a warning (M-07) without breaking validate
  fs.writeFileSync(cfgPath, `${baseCfg.trimEnd()}\nmodels:\n  bogus_role: sonnet\n  implementer: ""\n`);
  const warnVal = medra(root, 'validate', '--project', 'constitution');
  assert.equal(warnVal.code, 0);
  const warnings = warnVal.json.findings ?? [];
  assert.ok(warnings.some((f) => f.rule === 'config.models' && f.severity === 'warning'), 'expected config.models warning for unknown role or empty tier');
});

test('STATE-005.S1: 2.0.0-rc.1 CLI runs cleanly on 1.x docs layout without models config', () => {
  const root = project();
  const cfgPath = path.join(root, 'docs', 'config-flow.yaml');
  fs.writeFileSync(cfgPath, fs.readFileSync(cfgPath, 'utf8').replace(/\n?models:\n(?:[ \t]+.*\n)*/g, '\n'));
  const change = brownfieldChange(root);
  const v = medra(process.cwd(), '--version');
  assert.match(v.stdout.trim(), /^2\.0\.0-rc\.\d+$/);

  const st = medra(root, 'status');
  assert.equal(st.code, 0);

  const ctx = medra(root, 'context', change, '--stage', 'propose');
  assert.equal(ctx.code, 0);

  const stepRes = medra(root, 'step', change, '--stage', 'propose');
  assert.equal(stepRes.code, 0);
  assert.equal(stepRes.json.model.tier, 'inherit');
  assert.equal(stepRes.json.model.fallback, 'inherit');
});

test('PLUG-001.S1, PLUG-001.S2, PLUG-001.S3 & M-03/M-06: thin coordinator skills, /medra:run continuous loop and gate-pause contract, hooks guard, and Antigravity bundle parity', () => {
  const repoRoot = path.resolve(process.cwd(), '..');
  const skills = ['init', 'propose', 'plan', 'tasks', 'apply', 'verify', 'archive', 'review', 'run'];

  for (const name of skills) {
    const srcSkill = path.join(repoRoot, 'plugins', 'medra', 'skills', name, 'SKILL.md');
    const bundledSkill = path.join(repoRoot, 'cli', 'plugin', 'skills', name, 'SKILL.md');
    assert.ok(fs.existsSync(srcSkill), `missing skill ${srcSkill}`);
    assert.ok(fs.existsSync(bundledSkill), `missing bundled skill ${bundledSkill}`);
    assert.equal(fs.readFileSync(srcSkill, 'utf8'), fs.readFileSync(bundledSkill, 'utf8'), `bundle mismatch for ${name}`);
  }

  const runSkill = fs.readFileSync(path.join(repoRoot, 'plugins', 'medra', 'skills', 'run', 'SKILL.md'), 'utf8');
  assert.match(runSkill, /medra step\b.*--json/);
  assert.match(runSkill, /inherit/);
  assert.match(runSkill, /gate|human/i);
  assert.match(runSkill, /Repeat until/i);
  assert.match(runSkill, /pauses? only/i);
  assert.match(runSkill, /loop back to Step 1/i);

  for (const name of ['propose', 'plan', 'tasks', 'apply', 'verify', 'archive', 'review']) {
    const text = fs.readFileSync(path.join(repoRoot, 'plugins', 'medra', 'skills', name, 'SKILL.md'), 'utf8');
    assert.match(text, /medra step\b.*--json/, `${name} skill must compile handoff via medra step --json`);
    assert.match(text, /inherit/, `${name} skill must document inherit fallback`);
  }

  const hooksPath = path.join(repoRoot, 'plugins', 'medra', 'hooks', 'hooks.json');
  const bundledHooksPath = path.join(repoRoot, 'cli', 'plugin', 'hooks', 'hooks.json');
  assert.ok(fs.existsSync(hooksPath), 'hooks.json must exist');
  assert.equal(fs.readFileSync(hooksPath, 'utf8'), fs.readFileSync(bundledHooksPath, 'utf8'));
  assert.match(fs.readFileSync(hooksPath, 'utf8'), /PreToolUse/);

  const root = project();
  const inst = medra(root, 'install', '--target', 'antigravity');
  assert.equal(inst.code, 0);
  assert.ok(fs.existsSync(path.join(root, '.agents', 'plugins', 'medra', 'skills', 'run', 'SKILL.md')));
});

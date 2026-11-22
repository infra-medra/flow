import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { medra, medraHuman, write, read, project, req, livingSpec, proposal, delta, tasks, verifyReport, securityReport, rules, brownfieldChange } from './helpers.js';
import { loadConfig } from '../src/core.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI_ROOT = path.join(REPO_ROOT, 'cli');

test('version prints bare semver', () => {
  const r = medra(process.cwd(), '--version');
  assert.match(r.stdout.trim(), /^2\.0\.\d+(?:-rc\.\d+)?$/);
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
  assert.match(cmd, /references\/conventions\.md/);
  assert.match(cmd, /references\/gate\.md/);
  assert.doesNotMatch(cmd, /agents\/author\.md|pipelines\/author-propose\.md/, 'a command skill is its own single source');
  assert.match(cmd, /## Steps/);
  assert.match(cmd, /## Avoid/);
  const applyCmd = read(root, `${P}/skills/apply/SKILL.md`);
  assert.match(applyCmd, /## Steps/);
  assert.match(applyCmd, /## Avoid/);
  assert.equal(fs.readdirSync(path.join(root, P, 'skills')).length, 9, 'only 9 user commands installed as skills');
  assert.match(read(root, `${P}/templates/spec/guide.md`), /`\.agents\/plugins\/medra\/templates\/spec\/template\.md`/);
  const reviewer = read(root, `${P}/agents/reviewer.md`);
  assert.match(reviewer, /^---\nname: medra-reviewer\ndescription: [^\n]+\ntools: \[read_file, write_file, run_command, ask_question\]\nmainAgent: true\nsubagent: true\n---\n/);
  assert.deepEqual(fs.readdirSync(path.join(root, P, 'agents')).sort(), ['reviewer.md', 'security.md'], 'only dispatched agents ship');
  assert.deepEqual(fs.readdirSync(path.join(root, P, 'pipelines')).sort(), ['author-archive.md', 'author-init.md', 'author-plan.md', 'author-propose.md', 'author-tasks.md', 'implementer-apply.md', 'reviewer-check.md', 'security-audit.md', 'security-threat-model.md'], 'all subagent pipelines ship');
  assert.deepEqual(fs.readdirSync(path.join(root, P, 'references')).sort(), ['apply-recovery.md', 'author-edge-cases.md', 'conventions.md', 'gate.md', 'portability.md', 'verify-checklists.md']);
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
  assert.match(v.stdout.trim(), /^2\.0\.\d+(?:-rc\.\d+)?$/);

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

test('PLUG-001.S1, PLUG-001.S2, PLUG-001.S3: coordinator skills handle diff_error, drop empty persona headers, use medra review --report, standardize <untrusted_data>, and ship 1.x authoring pipelines', () => {
  const skillsDir = path.join(REPO_ROOT, 'plugins', 'medra', 'skills');
  const pipelinesDir = path.join(REPO_ROOT, 'plugins', 'medra', 'pipelines');

  const verifySkill = fs.readFileSync(path.join(skillsDir, 'verify', 'SKILL.md'), 'utf8');
  assert.match(verifySkill, /diff_error/, 'verify/SKILL.md must check step.diff_error');
  assert.match(verifySkill, /warn|pause/i, 'verify/SKILL.md must warn/pause on diff_error');

  const runSkill = fs.readFileSync(path.join(skillsDir, 'run', 'SKILL.md'), 'utf8');
  assert.match(runSkill, /diff_error/, 'run/SKILL.md must check step.diff_error');
  assert.match(runSkill, /warn|pause/i, 'run/SKILL.md must warn/pause on diff_error');

  const applySkill = fs.readFileSync(path.join(skillsDir, 'apply', 'SKILL.md'), 'utf8');
  assert.doesNotMatch(applySkill, /## Operating Persona/, 'apply/SKILL.md must not contain an empty Operating Persona header');

  const reviewSkill = fs.readFileSync(path.join(skillsDir, 'review', 'SKILL.md'), 'utf8');
  assert.match(reviewSkill, /medra review <change> --report/, 'review/SKILL.md must use medra review --report');
  assert.doesNotMatch(reviewSkill, /--stage\b.*--verdict\b/, 'review/SKILL.md must not use invalid --stage/--verdict flags');

  for (const name of ['init', 'propose', 'plan', 'tasks', 'apply', 'verify', 'archive', 'review', 'run']) {
    const text = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(text, /<\/?untrusted-data/i, `${name}/SKILL.md must standardize on <untrusted_data>`);
  }

  const expectedPipelines = [
    'author-init.md',
    'author-propose.md',
    'author-plan.md',
    'author-tasks.md',
    'implementer-apply.md',
    'author-archive.md',
    'reviewer-check.md',
    'security-audit.md',
    'security-threat-model.md',
  ];
  for (const file of expectedPipelines) {
    assert.ok(fs.existsSync(path.join(pipelinesDir, file)), `missing pipeline ${file}`);
  }
});

test('PLUG-003.S1: bundle drift check passes and versions match 2.0.1', () => {
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8')).version;
  const pluginVersion = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'medra', '.claude-plugin', 'plugin.json'), 'utf8')).version;
  assert.equal(pkgVersion, '2.0.1');
  assert.equal(pluginVersion, '2.0.1');

  const checkVer = spawnSync(process.execPath, [path.join(CLI_ROOT, 'scripts', 'check-version.js')], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(checkVer.status, 0, checkVer.stdout + checkVer.stderr);

  const driftScript = path.join(CLI_ROOT, 'scripts', 'check-bundle-drift.js');
  assert.ok(fs.existsSync(driftScript), 'cli/scripts/check-bundle-drift.js must exist');
  const driftRes = spawnSync(process.execPath, [driftScript], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(driftRes.status, 0, driftRes.stdout + driftRes.stderr);
});

test('STATE-005.S1: 2.0.0-rc.5 CLI runs cleanly on 1.x docs layout without models or apply config', () => {
  const root = project();
  const cfgPath = path.join(root, 'docs', 'config-flow.yaml');
  const strippedCfg = fs.readFileSync(cfgPath, 'utf8')
    .replace(/\n?models:\n(?:[ \t]+.*\n)*/g, '\n')
    .replace(/\n?apply:\n(?:[ \t]+.*\n)*/g, '\n');
  fs.writeFileSync(cfgPath, strippedCfg);
  const change = brownfieldChange(root);

  const v = medra(CLI_ROOT, '--version');
  assert.equal(v.stdout.trim(), '2.0.1');

  const loaded = loadConfig(root);
  assert.equal(loaded.apply?.inline_max_tasks, 3);
  assert.equal(loaded.apply?.granularity, 'batch');
  assert.equal(loaded.apply?.batch_max_tasks, 4);

  const st = medra(root, 'status');
  assert.equal(st.code, 0);

  const ctx = medra(root, 'context', change, '--stage', 'propose');
  assert.equal(ctx.code, 0);

  const stepRes = medra(root, 'step', change, '--stage', 'propose');
  assert.equal(stepRes.code, 0);
  assert.equal(stepRes.json.model.tier, 'inherit');
  assert.equal(stepRes.json.model.fallback, 'inherit');
});

test('PLUG-002.S1 & PLUG-002.S2: Antigravity bundle installs into .agents/plugins/medra/ and portability.md documents plugin_pointers and Antigravity gate boundary', () => {
  // PLUG-002.S1: bundling for Antigravity workspace into .agents/plugins/medra/
  const root = project();
  const inst = medra(root, 'install', '--target', 'antigravity');
  assert.equal(inst.code, 0, inst.stderr);
  assert.equal(inst.json.plugin, '.agents/plugins/medra');
  assert.ok(fs.existsSync(path.join(root, '.agents', 'plugins', 'medra', 'pipelines', 'implementer-apply.md')));
  assert.ok(fs.existsSync(path.join(root, '.agents', 'plugins', 'medra', 'templates', 'proposal', 'template.md')));
  assert.ok(fs.existsSync(path.join(root, '.agents', 'plugins', 'medra', 'references', 'portability.md')));

  // PLUG-002.S2: references/portability.md documents plugin_pointers / ${CLAUDE_PLUGIN_ROOT}/ resolution and Antigravity gate boundary
  const portabilityPath = path.join(REPO_ROOT, 'plugins', 'medra', 'references', 'portability.md');
  const portability = fs.readFileSync(portabilityPath, 'utf8');
  assert.match(portability, /plugin_pointers/, 'portability.md must document plugin_pointers');
  assert.match(portability, /\$\{CLAUDE_PLUGIN_ROOT\}/, 'portability.md must document ${CLAUDE_PLUGIN_ROOT}/ resolution');
  assert.match(portability, /Claude Code/i);
  assert.match(portability, /Antigravity/i);
  assert.match(portability, /gate/i, 'portability.md must document the Antigravity equivalent for subagent gate protection');
  assert.match(portability, /PreToolUse|hooks/i, 'portability.md must contrast Claude Code PreToolUse hooks with Antigravity');

  // PLUG-002.S2 & PLUG-005.S2: Antigravity subagent model selection conditional on invoke_subagent support + inline stages use session model
  assert.match(
    portability,
    /invoke_subagent[\s\S]*model|model[\s\S]*invoke_subagent/i,
    'portability.md must document that Antigravity subagent model tier applies only if invoke_subagent supports model selection',
  );
  assert.match(
    portability,
    /inherit/i,
    'portability.md must document inheriting the conversation/session model when model selection is unsupported',
  );
  assert.match(
    portability,
    /inline[\s\S]*session model/i,
    'portability.md must document that inline stages use the session model',
  );
});

test('PLUG-001.S4: no skill states that propose, plan, or tasks are dispatched to a subagent', () => {
  const skillsDir = path.join(REPO_ROOT, 'plugins', 'medra', 'skills');
  const skillNames = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();

  assert.ok(skillNames.includes('run'), 'run/SKILL.md must exist');

  for (const name of skillNames) {
    const text = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(
      text,
      /Other stages \(`?propose`?,\s*`?plan`?,\s*`?tasks`?\):\s*dispatch/i,
      `${name}/SKILL.md must not contain stage-based dispatch override for propose/plan/tasks`,
    );
    assert.doesNotMatch(
      text,
      /(?:propose|plan|tasks)[^\n.]*\bdispatch(?:es|ed)?\b[^\n.]*\bauthor\b[^\n.]*\bsubagent|\bdispatch(?:es|ed)?\b[^\n.]*\bauthor\b[^\n.]*\bsubagent[^\n.]*(?:propose|plan|tasks)/i,
      `${name}/SKILL.md must not claim propose, plan, or tasks are dispatched to an author subagent`,
    );
    if (name === 'propose' || name === 'plan' || name === 'tasks') {
      assert.doesNotMatch(
        text,
        /\b(?:dispatch(?:es|ed)?|spawn)\b[^\n]*\bauthor\b[^\n]*\bsubagent/i,
        `${name}/SKILL.md must not claim ${name} dispatches to a clean-context author subagent`,
      );
    }
  }

  const runSkill = fs.readFileSync(path.join(skillsDir, 'run', 'SKILL.md'), 'utf8');
  assert.match(
    runSkill,
    /follow(?:s)?\s+only\s+[^.\n]*`?action`?[^.\n]*(?:inline|dispatch|gate)/i,
    'run/SKILL.md must explicitly state that the coordinator follows only action (inline / dispatch / gate)',
  );
  assert.match(
    runSkill,
    /(?:without|never)\s+infer(?:ring)?\s+dispatch\s+from\s+stage\s+names/i,
    'run/SKILL.md must state not to infer dispatch from stage names',
  );
});

test('PLUG-007.S1: all 9 skills follow lean agent-oriented structure, omit spec IDs and stage-dispatch boilerplate, include user-language rule and structured gate prompts, and stay <= 110% of 2.0.0-rc.4 bytes', () => {
  const skillsDir = path.join(REPO_ROOT, 'plugins', 'medra', 'skills');
  const expectedSkills = ['init', 'propose', 'plan', 'tasks', 'apply', 'verify', 'archive', 'review', 'run'];
  const gateSkills = new Set(['propose', 'plan', 'tasks', 'verify', 'run']);
  const rc4TotalBytes = 23470;
  const maxTotalBytes = Math.floor(rc4TotalBytes * 1.10);

  let totalBytes = 0;

  for (const name of expectedSkills) {
    const filePath = path.join(skillsDir, name, 'SKILL.md');
    assert.ok(fs.existsSync(filePath), `${name}/SKILL.md must exist`);
    const buf = fs.readFileSync(filePath);
    const text = buf.toString('utf8');
    totalBytes += buf.length;

    assert.match(text, /^## Purpose\b/m, `${name}/SKILL.md must have ## Purpose`);
    assert.match(text, /^## Input\b/m, `${name}/SKILL.md must have ## Input`);
    assert.match(text, /^## Preconditions\b/m, `${name}/SKILL.md must have ## Preconditions`);
    assert.match(text, /^## (?:Coordinator )?(?:Loop|Steps)\b/m, `${name}/SKILL.md must have ## Loop or ## Steps`);
    assert.match(text, /^## Avoid\b/m, `${name}/SKILL.md must have ## Avoid`);

    const avoidMatch = text.match(/^## Avoid\b[^\n]*\n([\s\S]*?)(?=\n## |\s*$)/m);
    assert.ok(avoidMatch && avoidMatch[1].trim().length > 0, `${name}/SKILL.md ## Avoid section must not be empty`);
    assert.match(
      avoidMatch[1],
      /\b(?:because|so\s+(?:that|you|it|the|no|prior|progress)|to\s+(?:avoid|prevent|keep|ensure)|since|otherwise)\b/i,
      `${name}/SKILL.md ## Avoid rules must include rationale`,
    );

    assert.doesNotMatch(
      text,
      /\b(?:REQ|PLUG|CTX|STATE|VAL|LEARN|TM)-\d{2,}\b/,
      `${name}/SKILL.md must not contain spec IDs`,
    );
    assert.doesNotMatch(
      text,
      /\bM-\d{2}\b/,
      `${name}/SKILL.md must not contain mitigation IDs`,
    );
    assert.doesNotMatch(
      text,
      /without inferring dispatch from stage names/i,
      `${name}/SKILL.md must not repeat "without inferring dispatch from stage names" boilerplate`,
    );
    assert.match(
      text,
      /user['’]?s language|same language (?:the )?user|idioma do usu/i,
      `${name}/SKILL.md must include the user-language rule`,
    );

    if (gateSkills.has(name)) {
      assert.match(
        text,
        /(?:gate|approve)[\s\S]{0,300}(?:AskUserQuestion|ask_question)|(?:AskUserQuestion|ask_question)[\s\S]{0,300}(?:gate|approve)/i,
        `${name}/SKILL.md must require structured gate prompts (AskUserQuestion / ask_question)`,
      );
    }
  }

  assert.ok(
    totalBytes <= maxTotalBytes,
    `Total SKILL.md bytes (${totalBytes}) must be <= ${maxTotalBytes} (110% of 2.0.0-rc.4 ${rc4TotalBytes} bytes)`,
  );
});

test('STATE-007.S1: medra validate --project specs --json exits 0 with zero warnings', () => {
  const res = medra(REPO_ROOT, 'validate', '--project', 'specs');
  assert.equal(res.code, 0, res.stderr || res.stdout);
  assert.equal(res.json?.ok, true, res.stdout);
  assert.deepEqual(res.json?.findings, [], `Expected 0 validate findings, got: ${JSON.stringify(res.json?.findings)}`);
});

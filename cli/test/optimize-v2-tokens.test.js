import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { DEFAULT_CONFIG, loadConfig } from '../src/core.js';
import { compileStep } from '../src/step.js';
import { medra, medraHuman, project, livingSpec, req, proposal, write, delta } from './helpers.js';

function git(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
  return res.stdout.trim();
}

function validPlan(change, scenarios = [['AUTH-001.S1', 'test/auth.test.js']], articles = ['I']) {
  const rows = articles.map((a) => `| ${a} | Does this hold? | pass | Yes |`).join('\n');
  const scenRows = scenarios.map(([sid, loc]) => `| \`${sid}\` | unit | \`${loc}\` |`).join('\n');
  return [
    `# Plan: ${change}`,
    '',
    '## Summary',
    '',
    'Plan.',
    '',
    '## Constitution Check',
    '',
    '| Article | Gate | Result | Note |',
    '|---|---|---|---|',
    rows,
    '',
    '## Complexity Tracking',
    '',
    'None.',
    '',
    '## Test Strategy',
    '',
    '- **Command:** `node --test`',
    '- **Framework:** node:test',
    '',
    '| Scenario | Level | Test location |',
    '|---|---|---|',
    scenRows,
    '',
    '## Decisions',
    '',
    'None.',
    '',
  ].join('\n');
}

// Covers PLUG-006.S1: cross-phase vs phase-scoped batching and DEFAULT_CONFIG/docs/config-flow.yaml defaults
test('PLUG-006.S1: compileStep defaults apply.batch_scope to cross-phase and supports phase scoping', () => {
  assert.equal(DEFAULT_CONFIG.apply.batch_scope, 'cross-phase', 'DEFAULT_CONFIG.apply.batch_scope must default to cross-phase');

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const repoCfgText = fs.readFileSync(path.join(repoRoot, 'docs', 'config-flow.yaml'), 'utf8');
  assert.match(repoCfgText, /batch_scope:\s*cross-phase/, 'docs/config-flow.yaml must set apply.batch_scope: cross-phase');

  const root = project({ mode: 'tdd' });
  const cfgPath = path.join(root, 'docs', 'config-flow.yaml');
  // Config omitting apply: inherits batch_scope: cross-phase
  write(root, 'docs/config-flow.yaml', 'version: 1\nlanguage: en\nintegrations:\n  - claude\ntesting:\n  mode: tdd\n');
  assert.equal(loadConfig(root).apply.batch_scope, 'cross-phase');

  livingSpec(root, 'auth', 'AUTH', [
    req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']]),
    req('AUTH-002', 'Logout', [['AUTH-002.S1', 'Sign out']]),
    req('AUTH-003', 'Refresh', [['AUTH-003.S1', 'Renew token']]),
    req('AUTH-004', 'Audit', [['AUTH-004.S1', 'Log event']]),
  ]);

  const change = 'cross-phase-batch';
  assert.equal(medra(root, 'new', change, '--track', 'full').code, 0);
  proposal(root, change, {
    track: 'full',
    caps: [['auth', 'modified', 'AUTH-001, AUTH-002, AUTH-003, AUTH-004']],
  });
  write(
    root,
    `docs/changes/${change}/specs/auth/spec.md`,
    delta('auth', [
      '## MODIFIED Requirements',
      '',
      req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']]),
      req('AUTH-002', 'Logout', [['AUTH-002.S1', 'Sign out']]),
      req('AUTH-003', 'Refresh', [['AUTH-003.S1', 'Renew token']]),
      req('AUTH-004', 'Audit', [['AUTH-004.S1', 'Log event']]),
    ].join('\n')),
  );
  write(
    root,
    `docs/changes/${change}/plan.md`,
    `# Plan: ${change}\n\n## Summary\n\nCross-phase batch.\n\n## Constitution Check\n\n| Article | Gate | Result | Note |\n|---|---|---|---|\n| I | Does every scenario map to a test task ordered before its implementation? | pass | Yes |\n\n## Complexity Tracking\n\nNone.\n\n## Test Strategy\n\n- **Command:** \`node --test\`\n- **Framework:** node:test\n\n| Scenario | Level | Test location |\n|---|---|---|\n| \`AUTH-001.S1\` | unit | \`test/auth.test.js\` |\n\n## Decisions\n\nNone.\n`,
  );
  write(
    root,
    `docs/changes/${change}/tasks.md`,
    [
      `# Tasks: ${change}`,
      '',
      '## Phase 1: Core Tests',
      '',
      '- [ ] T001 [TEST] [AUTH-001] Write test for AUTH-001.S1 in `test/auth.test.js` — verify: red',
      '',
      '## Phase 2: Auth Implementation',
      '',
      '- [ ] T002 [AUTH-001] after T001 Implement login in `src/auth.js` — verify: green',
      '- [ ] T003 [AUTH-002] Implement logout in `src/logout.js` — verify: green',
      '',
      '## Phase 3: Tokens & Audit',
      '',
      '- [ ] T004 [AUTH-003] Implement refresh in `src/refresh.js` — verify: green',
      '- [ ] T005 [AUTH-004] Implement audit in `src/audit.js` — verify: green',
      '',
    ].join('\n'),
  );

  // Default / explicit cross-phase groups T001..T004 across phases up to batch_max_tasks: 4
  fs.writeFileSync(
    cfgPath,
    YAML.stringify({
      version: 1,
      language: 'en',
      integrations: ['claude'],
      testing: { mode: 'tdd' },
      apply: { granularity: 'batch', batch_max_tasks: 4, batch_scope: 'cross-phase' },
    }),
  );
  const crossEnv = compileStep(root, change, { stage: 'apply', full: true });
  assert.equal(crossEnv.ok, true);
  assert.equal(crossEnv.granularity, 'batch');
  assert.equal(crossEnv.subagents.length, 1);
  assert.deepEqual(
    crossEnv.subagents[0].task_ids,
    ['T001', 'T002', 'T003', 'T004'],
    'PLUG-006.S1: cross-phase batching must group T001..T004 across phases up to batch_max_tasks',
  );

  // Explicit phase scope restricts batching to same phase (T001 only)
  fs.writeFileSync(
    cfgPath,
    YAML.stringify({
      version: 1,
      language: 'en',
      integrations: ['claude'],
      testing: { mode: 'tdd' },
      apply: { granularity: 'batch', batch_max_tasks: 4, batch_scope: 'phase' },
    }),
  );
  const phaseEnv = compileStep(root, change, { stage: 'apply', full: true });
  assert.equal(phaseEnv.ok, true);
  assert.equal(phaseEnv.granularity, 'batch');
  assert.equal(phaseEnv.subagents.length, 1);
  assert.deepEqual(
    phaseEnv.subagents[0].task_ids,
    ['T001'],
    'PLUG-006.S1: batch_scope: phase must group only same-phase tasks (T001)',
  );
});

// Covers PLUG-014.S1: scoped --run test guidance in compiled apply --md when testing.command is configured
test('PLUG-014.S1: compileStep apply --md instructs targeted --run commands instead of full testing.command suite', () => {
  const root = project({ mode: 'tdd' });
  const cfgPath = path.join(root, 'docs', 'config-flow.yaml');
  const fullSuiteCmd = 'npm --prefix cli test';
  const cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.testing = { ...cfg.testing, mode: 'tdd', command: fullSuiteCmd };
  fs.writeFileSync(cfgPath, YAML.stringify(cfg));

  livingSpec(root, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])]);
  const change = 'scoped-apply-tests';
  assert.equal(medra(root, 'new', change, '--track', 'full').code, 0);
  proposal(root, change, { track: 'full', caps: [['auth', 'modified', 'AUTH-001']] });
  write(root, `docs/changes/${change}/specs/auth/spec.md`, delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])}`));
  write(root, `docs/changes/${change}/plan.md`, validPlan(change, [['AUTH-001.S1', 'test/auth.test.js']]));
  write(
    root,
    `docs/changes/${change}/tasks.md`,
    `# Tasks: ${change}\n\n## Phase 1: Work\n\n- [ ] T001 [TEST] [AUTH-001] Test AUTH-001.S1 in \`test/auth.test.js\` — verify: red\n`,
  );
  assert.equal(medra(root, 'gate', change, 'proposal', '--approve').code, 0);
  assert.equal(medra(root, 'gate', change, 'plan', '--approve').code, 0);
  assert.equal(medra(root, 'gate', change, 'tasks', '--approve').code, 0);

  const mdRes = medraHuman(root, 'step', change, '--role', 'implementer', '--md');
  assert.equal(mdRes.code, 0, mdRes.stderr || mdRes.stdout);
  assert.match(mdRes.stdout, /--run/);
  assert.match(mdRes.stdout, /target(?:ed)?|scoped/i, 'PLUG-014.S1: must instruct targeted/scoped test commands');
  assert.match(mdRes.stdout, /medra suite/, 'PLUG-014.S1: must reserve full suite for medra suite');
  assert.ok(mdRes.stdout.includes(fullSuiteCmd), 'PLUG-014.S1: must reference configured testing.command');

  // When testing.command is unset, the full-suite avoidance instruction is omitted
  const noCmdCfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
  noCmdCfg.testing.command = null;
  fs.writeFileSync(cfgPath, YAML.stringify(noCmdCfg));
  const noCmdMd = medraHuman(root, 'step', change, '--role', 'implementer', '--md');
  assert.equal(noCmdMd.code, 0, noCmdMd.stderr || noCmdMd.stdout);
  assert.doesNotMatch(noCmdMd.stdout, /medra suite/);
});

// Covers CTX-008.S1: compact task pack in --role implementer --md and omitted from default --json
test('CTX-008.S1: medra step --role implementer --md includes compact constitution, REQ excerpts, and task lines while default --json omits them', () => {
  const root = project({ mode: 'tdd' });
  write(
    root,
    'docs/constitution.md',
    `# Constitution

**Status:** draft

## Articles

### Article I: Test-first

Every behavior change MUST be covered by a test seen failing first.

**Gate:** Does every scenario map to a test task ordered before its implementation?
**Rationale:** Tests written after assert what the code does rather than what the spec requires.

### Article II: Bounded context

Prompts MUST stay bounded to touched requirements and task lines.

**Gate:** Are compiled prompts bounded to touched artifacts?
**Rationale:** Unbounded prompts waste tokens.

## Amendments

| Version | Date | Change | Source |
|---|---|---|---|
`,
  );
  assert.equal(medra(root, 'constitution', 'ratify', '--note', 'Initial').code, 0);

  livingSpec(root, 'auth', 'AUTH', [
    req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']]),
    req('AUTH-002', 'Logout', [['AUTH-002.S1', 'Sign out']]),
  ]);

  const change = 'compact-task-pack';
  assert.equal(medra(root, 'new', change, '--track', 'full').code, 0);
  proposal(root, change, { track: 'full', caps: [['auth', 'modified', 'AUTH-001, AUTH-002']] });
  write(
    root,
    `docs/changes/${change}/specs/auth/spec.md`,
    delta('auth', [
      '## MODIFIED Requirements',
      '',
      req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']]),
      req('AUTH-002', 'Logout', [['AUTH-002.S1', 'Sign out']]),
    ].join('\n')),
  );
  write(root, `docs/changes/${change}/plan.md`, validPlan(change, [['AUTH-001.S1', 'test/auth.test.js'], ['AUTH-002.S1', 'test/logout.test.js']], ['I', 'II']));
  write(
    root,
    `docs/changes/${change}/tasks.md`,
    [
      `# Tasks: ${change}`,
      '',
      '## Phase 1: Login',
      '',
      '- [ ] T001 [TEST] [AUTH-001] Write login test in `test/auth.test.js` — verify: node --test test/auth.test.js fails (red)',
      '',
      '## Phase 2: Logout',
      '',
      '- [ ] T002 [TEST] [AUTH-002] after T001 Write logout test in `test/logout.test.js` — verify: red',
      '- [ ] T003 [AUTH-002] after T002 Implement logout in `src/logout.js` — verify: passes (green)',
      '',
    ].join('\n'),
  );
  const cfgPath = path.join(root, 'docs', 'config-flow.yaml');
  const cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.apply = { ...(cfg.apply ?? {}), batch_scope: 'phase' };
  fs.writeFileSync(cfgPath, YAML.stringify(cfg));
  assert.equal(medra(root, 'gate', change, 'proposal', '--approve').code, 0);
  assert.equal(medra(root, 'gate', change, 'plan', '--approve').code, 0);
  assert.equal(medra(root, 'gate', change, 'tasks', '--approve').code, 0);

  const mdRes = medraHuman(root, 'step', change, '--role', 'implementer', '--md');
  assert.equal(mdRes.code, 0, mdRes.stderr || mdRes.stdout);
  assert.match(mdRes.stdout, /Article I:\s*Test-first/, 'CTX-008.S1: --md must include ratified Article I summary');
  assert.match(mdRes.stdout, /Article II:\s*Bounded context/, 'CTX-008.S1: --md must include ratified Article II summary');
  assert.doesNotMatch(mdRes.stdout, /\*\*Rationale:\*\*|## Amendments/, 'CTX-008.S1: constitution summary must omit verbose Rationale/Amendments');
  assert.match(mdRes.stdout, /### REQ AUTH-001:/, 'CTX-008.S1: --md must include referenced REQ AUTH-001');
  assert.match(mdRes.stdout, /#### Scenario AUTH-001\.S1:/, 'CTX-008.S1: --md must include referenced scenario AUTH-001.S1');
  assert.doesNotMatch(mdRes.stdout, /### REQ AUTH-002:/, 'CTX-008.S1: --md must omit unreferenced REQ AUTH-002');
  assert.match(mdRes.stdout, /T001.*verify: node --test test\/auth\.test\.js/, 'CTX-008.S1: --md must include matching tasks.md line with verify hint');

  const jsonRes = medra(root, 'step', change);
  assert.equal(jsonRes.code, 0, jsonRes.stderr || jsonRes.stdout);
  assert.ok(Buffer.byteLength(jsonRes.stdout, 'utf8') < 4096, 'CTX-008.S1: default --json must stay compact');
  assert.equal(jsonRes.json.subagents[0].prompt, undefined, 'CTX-008.S1: default --json must omit prompt');
  assert.equal(jsonRes.json.embedded, undefined, 'CTX-008.S1: default --json must omit embedded');
  assert.doesNotMatch(jsonRes.stdout, /Article I:\s*Test-first/, 'CTX-008.S1: default --json must omit constitution summary');
  assert.doesNotMatch(jsonRes.stdout, /Scenario AUTH-001\.S1/, 'CTX-008.S1: default --json must omit REQ/scenario excerpts');
  assert.doesNotMatch(jsonRes.stdout, /Write login test/, 'CTX-008.S1: default --json must omit tasks.md task lines');
});

// Covers STATE-008.S1: non-verify compileStep skips safeGitDiff, suiteFindings, and prepareVerifyRound while verify retains them
test('STATE-008.S1: non-verify compileStep skips safeGitDiff and prepareVerifyRound while verify retains pre-dispatch checks and diff', () => {
  const root = project({ mode: 'tdd' });
  const cfgPath = path.join(root, 'docs', 'config-flow.yaml');
  const cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.testing = { ...cfg.testing, mode: 'tdd', command: 'node -e "process.exit(0)"' };
  fs.writeFileSync(cfgPath, YAML.stringify(cfg));

  livingSpec(root, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])]);
  const change = 'fast-path-step';
  assert.equal(medra(root, 'new', change, '--track', 'full').code, 0);

  // 1. propose (before proposal.md) with invalid diffBase must skip safeGitDiff & prepareVerifyRound
  const proposeEnv = compileStep(root, change, { stage: 'propose', diffBase: '--invalid-ref' });
  assert.equal(proposeEnv.stage, 'propose');
  assert.equal(proposeEnv.action, 'inline');
  assert.equal(proposeEnv.diff_error, undefined);

  proposal(root, change, { track: 'full', caps: [['auth', 'modified', 'AUTH-001']] });
  write(root, `docs/changes/${change}/specs/auth/spec.md`, delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])}`));
  assert.equal(medra(root, 'gate', change, 'proposal', '--approve').code, 0);

  // 2. plan with invalid diffBase skips heavy checks
  const planEnv = compileStep(root, change, { stage: 'plan', diffBase: '--invalid-ref' });
  assert.equal(planEnv.stage, 'plan');
  assert.equal(planEnv.action, 'inline');
  assert.equal(planEnv.diff_error, undefined);
  assert.equal(planEnv.findings, undefined);

  write(root, `docs/changes/${change}/plan.md`, validPlan(change, [['AUTH-001.S1', 'test/auth.test.js']]));
  assert.equal(medra(root, 'gate', change, 'plan', '--approve').code, 0);

  // 3. tasks with invalid diffBase skips heavy checks
  const tasksEnv = compileStep(root, change, { stage: 'tasks', diffBase: '--invalid-ref' });
  assert.equal(tasksEnv.stage, 'tasks');
  assert.equal(tasksEnv.action, 'inline');
  assert.equal(tasksEnv.diff_error, undefined);
  assert.equal(tasksEnv.findings, undefined);

  write(
    root,
    `docs/changes/${change}/tasks.md`,
    `# Tasks: ${change}\n\n## Phase 1: Work\n\n- [ ] T001 [TEST] [AUTH-001] Write test in \`test/auth.test.js\` — verify: red\n`,
  );
  assert.equal(medra(root, 'gate', change, 'tasks', '--approve').code, 0);

  // Introduce a living-spec merge conflict (verify.merge) AND unrun suite (verify.suite)
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-009', 'Different', [['AUTH-009.S1', 'Different']])]);

  // 4. apply with invalid diffBase & merge/suite dirty state skips heavy checks
  const applyEnv = compileStep(root, change, { stage: 'apply', diffBase: '--invalid-ref' });
  assert.equal(applyEnv.stage, 'apply');
  assert.equal(applyEnv.action, 'dispatch');
  assert.equal(applyEnv.diff_error, undefined);
  assert.equal(applyEnv.findings, undefined);

  // 5. done (archive stage) with invalid diffBase & merge/suite dirty state skips heavy checks
  const doneEnv = compileStep(root, change, { stage: 'archive', diffBase: '--invalid-ref' });
  assert.equal(doneEnv.stage, 'archive');
  assert.equal(doneEnv.action, 'done');
  assert.equal(doneEnv.diff_error, undefined);
  assert.equal(doneEnv.findings, undefined);

  // 6. verify with not-run suite checks readiness first (skips safeGitDiff when blocked on suite)
  livingSpec(root, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])]);
  write(
    root,
    `docs/changes/${change}/tasks.md`,
    `# Tasks: ${change}\n\n## Phase 1: Work\n\n- [x] T001 [TEST] [AUTH-001] Write test in \`test/auth.test.js\` — verify: red\n`,
  );
  const verifySuiteEnv = compileStep(root, change, { stage: 'verify', diffBase: '--invalid-ref' });
  assert.equal(verifySuiteEnv.stage, 'verify');
  assert.equal(verifySuiteEnv.action, 'dispatch');
  assert.equal(verifySuiteEnv.coordinator_steps[0].command, `medra suite ${change} --json`);

  // 7. verify with green suite runs safeGitDiff (rejects unsafe diffBase) and computes diff on valid diffBase
  const baseSha = git(root, 'rev-parse', 'HEAD');
  write(root, 'src/auth.js', 'export const ok = true;\n');
  git(root, 'add', 'src/auth.js');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'feat');
  assert.equal(medra(root, 'suite', change).code, 0);

  assert.throws(
    () => compileStep(root, change, { stage: 'verify', diffBase: '--invalid-ref' }),
    /diff_base|unsafe/i,
    'STATE-008.S1: verify must still invoke safeGitDiff once pre-dispatch checks pass',
  );
  const verifyEnv = compileStep(root, change, { stage: 'verify', diffBase: baseSha, full: true });
  assert.equal(verifyEnv.stage, 'verify');
  assert.equal(verifyEnv.action, 'dispatch');
  assert.equal(verifyEnv.subagents[0].round, 1);
  assert.match(verifyEnv.embedded.diff, /export const ok = true/);
});

// Covers PLUG-013.S1 & PLUG-014.S1: lean core pipelines byte budget (<= 44621 B) and scoped --run guidance in implementer-apply.md
test('PLUG-013.S1: measure-envelope.js reports total_pipeline_bytes <= 44621 and implementer-apply.md includes scoped --run test guidance', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const scriptPath = path.join(repoRoot, 'cli', 'scripts', 'measure-envelope.js');
  const res = spawnSync(process.execPath, [scriptPath], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr || res.stdout);

  const jsonStart = res.stdout.indexOf('{');
  assert.ok(jsonStart !== -1, 'measure-envelope.js must output JSON summary');
  const summary = JSON.parse(res.stdout.slice(jsonStart));
  assert.ok(
    summary.total_pipeline_bytes <= 44621,
    `PLUG-013.S1: total_pipeline_bytes (${summary.total_pipeline_bytes} B) must be <= 44621 B (>= 40% reduction from 74369 B)`,
  );

  const applyPipeline = fs.readFileSync(
    path.join(repoRoot, 'plugins', 'medra', 'pipelines', 'implementer-apply.md'),
    'utf8',
  );
  assert.match(applyPipeline, /--run/);
  assert.match(applyPipeline, /target(?:ed)?|scoped/i, 'PLUG-014.S1: implementer-apply.md must instruct targeted/scoped --run test commands');
  assert.match(applyPipeline, /medra suite/, 'PLUG-014.S1: implementer-apply.md must reserve full suite for medra suite');
});

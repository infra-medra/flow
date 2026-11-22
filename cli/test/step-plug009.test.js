import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import YAML from 'yaml';
import { compileStep, stepMarkdown } from '../src/step.js';
import { medra, medraHuman, project, livingSpec, req, proposal, write, delta, tasks, verifyReport, securityReport } from './helpers.js';

const PREFIX = 'MEDRA_SUBAGENT=1 ';
const PROMPT_RULE_RE = /MEDRA_SUBAGENT=1/;

function assertSubagentPrefixed(sub, label) {
  assert.ok(sub.fetch_command.startsWith(PREFIX), `${label}: fetch_command must start with "${PREFIX}", got: ${sub.fetch_command}`);
  assert.ok(sub.exit_command.startsWith(PREFIX), `${label}: exit_command must start with "${PREFIX}", got: ${sub.exit_command}`);
}

function assertPromptHasPrefixRule(prompt, label) {
  assert.match(prompt ?? '', PROMPT_RULE_RE, `${label}: prompt must instruct running medra commands with MEDRA_SUBAGENT=1 prefix`);
}

function assertNoPrefix(str, label) {
  assert.doesNotMatch(str ?? '', /MEDRA_SUBAGENT=1/, `${label}: must not include MEDRA_SUBAGENT=1`);
}

// Covers PLUG-009.S2: non-inline subagent fetch_command/exit_command and --md/--full prompts carry MEDRA_SUBAGENT=1, while coordinator_steps[] and inline stages do not
test('PLUG-009.S2: non-inline subagents prefix fetch_command/exit_command and prompts with MEDRA_SUBAGENT=1; coordinator_steps and inline omit it', () => {
  // 1. Inline stages (propose, plan, tasks) and fast-track inline apply (<= 3 tasks)
  const fullRoot = project({ mode: 'tdd' });
  livingSpec(fullRoot, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])]);
  const fullChange = 'plug009-full';
  assert.equal(medra(fullRoot, 'new', fullChange, '--track', 'full').code, 0);

  const proposeEnv = compileStep(fullRoot, fullChange, { stage: 'propose', full: true });
  assert.equal(proposeEnv.action, 'inline');
  assertNoPrefix(proposeEnv.subagents[0].fetch_command, 'inline propose fetch_command');
  assertNoPrefix(proposeEnv.subagents[0].exit_command, 'inline propose exit_command');
  assertNoPrefix(proposeEnv.subagents[0].prompt, 'inline propose --full prompt');
  assertNoPrefix(stepMarkdown(proposeEnv), 'inline propose --md');

  proposal(fullRoot, fullChange, { track: 'full', caps: [['auth', 'modified', 'AUTH-001']], security: 'relevant' });
  write(fullRoot, `docs/changes/${fullChange}/specs/auth/spec.md`, delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])}`));
  assert.equal(medra(fullRoot, 'gate', fullChange, 'proposal', '--approve').code, 0);

  const planEnv = compileStep(fullRoot, fullChange, { stage: 'plan', full: true });
  assert.equal(planEnv.action, 'inline');
  assertNoPrefix(planEnv.subagents[0].fetch_command, 'inline plan fetch_command');
  assertNoPrefix(planEnv.subagents[0].exit_command, 'inline plan exit_command');
  assertNoPrefix(planEnv.subagents[0].prompt, 'inline plan --full prompt');

  write(fullRoot, `docs/changes/${fullChange}/plan.md`, [
    `# Plan: ${fullChange}`,
    '',
    '## Summary',
    '',
    'Plan.',
    '',
    '## Constitution Check',
    '',
    '| Article | Gate | Result | Note |',
    '|---|---|---|---|',
    '| I | Does every scenario map to a test task ordered before its implementation? | pass | Yes |',
    '',
    '## Complexity Tracking',
    '',
    'None.',
    '',
    '## Test Strategy',
    '',
    '- **Command:** `npm test`',
    '- **Framework:** node:test',
    '',
    '| Scenario | Level | Test location |',
    '|---|---|---|',
    '| `AUTH-001.S1` | unit | `test/auth.test.js` |',
    '',
    '## Decisions',
    '',
    '### D-01: Token expiry',
    '**Choice:** Expire tokens.',
    '**Alternatives:** None.',
    '**Rationale:** Safety.',
    '',
  ].join('\n'));
  write(fullRoot, `docs/changes/${fullChange}/threat-model.md`, [
    `# Threat Model: ${fullChange}`,
    '',
    '## Scope',
    '',
    '- **In:** login',
    '',
    '## Assets',
    '',
    '- Tokens',
    '',
    '## Trust Boundaries',
    '',
    '| ID | Boundary | From → To |',
    '|---|---|---|',
    '| B-01 | API | Internet → API |',
    '',
    '## Entry Points',
    '',
    '- `POST /login` (B-01)',
    '',
    '## Threats',
    '',
    '| ID | STRIDE | Threat | Boundary | Severity | Likelihood | Mitigations |',
    '|---|---|---|---|---|---|---|',
    '| TM-01 | S, I | Token guessed | B-01 | high | medium | M-01 |',
    '',
    '## Mitigations',
    '',
    '| ID | Mitigation | Threats | Decision |',
    '|---|---|---|---|',
    '| M-01 | Hash tokens | TM-01 | accepted (D-01) |',
    '',
    '## Residual Risks',
    '',
    'None.',
    '',
    '## Sources',
    '',
    '- https://cheatsheetseries.owasp.org — M-01',
    '',
  ].join('\n'));
  const planGate = medra(fullRoot, 'gate', fullChange, 'plan', '--approve');
  assert.equal(planGate.code, 0, planGate.stderr || planGate.stdout);

  const tasksEnv = compileStep(fullRoot, fullChange, { stage: 'tasks', full: true });
  assert.equal(tasksEnv.action, 'inline');
  assertNoPrefix(tasksEnv.subagents[0].fetch_command, 'inline tasks fetch_command');
  assertNoPrefix(tasksEnv.subagents[0].exit_command, 'inline tasks exit_command');
  assertNoPrefix(tasksEnv.subagents[0].prompt, 'inline tasks --full prompt');

  // 2. Apply batch granularity (full track)
  tasks(fullRoot, fullChange, [
    '- [ ] T001 [TEST] [AUTH-001] Test AUTH-001.S1 in `test/auth.test.js` — verify: red',
    '- [ ] T002 [AUTH-001] after T001 Implement login (M-01) in `src/auth.js` — verify: green',
  ]);
  const tasksGate = medra(fullRoot, 'gate', fullChange, 'tasks', '--approve');
  assert.equal(tasksGate.code, 0, tasksGate.stderr || tasksGate.stdout);

  const batchEnv = compileStep(fullRoot, fullChange, { stage: 'apply', full: true });
  assert.equal(batchEnv.action, 'dispatch');
  assert.equal(batchEnv.granularity, 'batch');
  assertSubagentPrefixed(batchEnv.subagents[0], 'apply batch');
  assertPromptHasPrefixRule(batchEnv.subagents[0].prompt, 'apply batch --full');
  const batchMd = medraHuman(fullRoot, 'step', fullChange, '--role', 'implementer', '--task', 'T001', '--md');
  assert.equal(batchMd.code, 0, batchMd.stderr);
  assertPromptHasPrefixRule(batchMd.stdout, 'apply batch --md');

  // 3. Apply task granularity (granularity: 'task')
  const cfgPath = path.join(fullRoot, 'docs', 'config-flow.yaml');
  const cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.apply = { ...cfg.apply, granularity: 'task' };
  fs.writeFileSync(cfgPath, YAML.stringify(cfg));

  const taskEnv = compileStep(fullRoot, fullChange, { stage: 'apply', full: true });
  assert.equal(taskEnv.action, 'dispatch');
  assert.equal(taskEnv.granularity, 'task');
  assertSubagentPrefixed(taskEnv.subagents[0], 'apply task');
  assertPromptHasPrefixRule(taskEnv.subagents[0].prompt, 'apply task --full');
  const taskMd = medraHuman(fullRoot, 'step', fullChange, '--role', 'implementer', '--task', 'T001', '--md');
  assert.equal(taskMd.code, 0, taskMd.stderr);
  assertPromptHasPrefixRule(taskMd.stdout, 'apply task --md');

  // 4. Fast-track apply: inline (<= 3 tasks) vs stage dispatch (> 3 tasks)
  const fastInlineRoot = project({ mode: 'none' });
  livingSpec(fastInlineRoot, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])]);
  assert.equal(medra(fastInlineRoot, 'new', 'fast-inline', '--track', 'fast').code, 0);
  proposal(fastInlineRoot, 'fast-inline', { track: 'fast', caps: [['auth', 'modified', 'AUTH-001']] });
  write(fastInlineRoot, 'docs/changes/fast-inline/specs/auth/spec.md', delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])}`));
  tasks(fastInlineRoot, 'fast-inline', [
    '- [ ] T001 [AUTH-001] One in `src/a.js` — verify: ok',
    '- [ ] T002 [AUTH-001] Two in `src/b.js` — verify: ok',
  ]);
  assert.equal(medra(fastInlineRoot, 'gate', 'fast-inline', 'proposal', '--approve').code, 0);
  const fastInlineEnv = compileStep(fastInlineRoot, 'fast-inline', { stage: 'apply', full: true });
  assert.equal(fastInlineEnv.action, 'inline');
  assertNoPrefix(fastInlineEnv.subagents[0].fetch_command, 'fast inline apply fetch_command');
  assertNoPrefix(fastInlineEnv.subagents[0].exit_command, 'fast inline apply exit_command');
  assertNoPrefix(fastInlineEnv.subagents[0].prompt, 'fast inline apply --full prompt');

  const fastStageRoot = project({ mode: 'none' });
  livingSpec(fastStageRoot, 'auth', 'AUTH', [req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])]);
  assert.equal(medra(fastStageRoot, 'new', 'fast-stage', '--track', 'fast').code, 0);
  proposal(fastStageRoot, 'fast-stage', { track: 'fast', caps: [['auth', 'modified', 'AUTH-001']] });
  write(fastStageRoot, 'docs/changes/fast-stage/specs/auth/spec.md', delta('auth', `## MODIFIED Requirements\n\n${req('AUTH-001', 'Login', [['AUTH-001.S1', 'Valid login']])}`));
  tasks(fastStageRoot, 'fast-stage', [
    '- [ ] T001 [AUTH-001] One in `src/a.js` — verify: ok',
    '- [ ] T002 [AUTH-001] Two in `src/b.js` — verify: ok',
    '- [ ] T003 [AUTH-001] Three in `src/c.js` — verify: ok',
    '- [ ] T004 [AUTH-001] Four in `src/d.js` — verify: ok',
  ]);
  assert.equal(medra(fastStageRoot, 'gate', 'fast-stage', 'proposal', '--approve').code, 0);
  const fastStageEnv = compileStep(fastStageRoot, 'fast-stage', { stage: 'apply', full: true });
  assert.equal(fastStageEnv.action, 'dispatch');
  assert.equal(fastStageEnv.granularity, 'stage');
  assertSubagentPrefixed(fastStageEnv.subagents[0], 'apply stage');
  assertPromptHasPrefixRule(fastStageEnv.subagents[0].prompt, 'apply stage --full');
  const fastStageMd = medraHuman(fastStageRoot, 'step', 'fast-stage', '--role', 'implementer', '--md');
  assert.equal(fastStageMd.code, 0, fastStageMd.stderr);
  assertPromptHasPrefixRule(fastStageMd.stdout, 'apply stage --md');

  // 5. Complete tasks on fullRoot, check pre-verify suite coordinator_steps[] (unprefixed)
  write(fullRoot, 'test/auth.test.js', '// AUTH-001.S1\n');
  write(fullRoot, 'src/auth.js', 'export const login = () => true;\n');
  assert.equal(medra(fullRoot, 'task', 'done', fullChange, 'T001', '--run', 'exit 1').code, 0);
  assert.equal(medra(fullRoot, 'task', 'done', fullChange, 'T002', '--run', 'exit 0').code, 0);

  const suiteCfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
  suiteCfg.testing.command = 'node -e "process.exit(0)"';
  fs.writeFileSync(cfgPath, YAML.stringify(suiteCfg));

  const suiteStepEnv = compileStep(fullRoot, fullChange);
  assert.equal(suiteStepEnv.stage, 'verify');
  assert.equal(suiteStepEnv.action, 'dispatch');
  assert.deepEqual(suiteStepEnv.subagents, []);
  assert.equal(suiteStepEnv.coordinator_steps[0].command, `medra suite ${fullChange} --json`);
  assertNoPrefix(suiteStepEnv.coordinator_steps[0].command, 'coordinator_steps medra suite');

  // 6. After suite passes -> verify reviewer + security subagents
  assert.equal(medra(fullRoot, 'suite', fullChange).code, 0);
  const verifyEnv = compileStep(fullRoot, fullChange, { full: true });
  assert.equal(verifyEnv.stage, 'verify');
  assert.equal(verifyEnv.action, 'dispatch');
  assert.equal(verifyEnv.subagents.length, 2);

  for (const role of ['reviewer', 'security']) {
    const sub = verifyEnv.subagents.find((s) => s.role === role);
    assert.ok(sub, `missing ${role} subagent`);
    assertSubagentPrefixed(sub, `verify ${role}`);
    assertPromptHasPrefixRule(sub.prompt, `verify ${role} --full`);
    const roleMd = medraHuman(fullRoot, 'step', fullChange, '--role', role, '--md');
    assert.equal(roleMd.code, 0, roleMd.stderr);
    assertPromptHasPrefixRule(roleMd.stdout, `verify ${role} --md`);
  }

  // 7. Failing review report -> fix implementer subagent + unprefixed verify-fix coordinator_step
  const revSub = verifyEnv.subagents.find((s) => s.role === 'reviewer');
  const secSub = verifyEnv.subagents.find((s) => s.role === 'security');
  const toRootRel = (p) => (p.startsWith('docs/') ? p : `docs/changes/${fullChange}/${p}`);
  const revRel = toRootRel(revSub.report);
  const secRel = toRootRel(secSub.report);
  const future = Date.now() + 5000;
  write(fullRoot, revRel, verifyReport('fail'));
  write(fullRoot, secRel, securityReport('pass'));
  fs.utimesSync(path.join(fullRoot, revRel), new Date(future), new Date(future));
  fs.utimesSync(path.join(fullRoot, secRel), new Date(future), new Date(future));
  assert.equal(medra(fullRoot, 'review', fullChange, '--report', revRel, '--by', 'reviewer').code, 0);
  assert.equal(medra(fullRoot, 'review', fullChange, '--report', secRel, '--by', 'security').code, 0);

  const fixEnv = compileStep(fullRoot, fullChange, { full: true });
  assert.equal(fixEnv.stage, 'verify');
  assert.equal(fixEnv.action, 'dispatch');
  assert.equal(fixEnv.coordinator_steps[0].command, `medra verify-fix ${fullChange} --json`);
  assertNoPrefix(fixEnv.coordinator_steps[0].command, 'coordinator_steps medra verify-fix');
  assert.equal(fixEnv.subagents[0].role, 'implementer');
  assertSubagentPrefixed(fixEnv.subagents[0], 'verify fix implementer');
  assertPromptHasPrefixRule(fixEnv.subagents[0].prompt, 'verify fix implementer --full');
  const fixMd = medraHuman(fullRoot, 'step', fullChange, '--role', 'implementer', '--md');
  assert.equal(fixMd.code, 0, fixMd.stderr);
  assertPromptHasPrefixRule(fixMd.stdout, 'verify fix implementer --md');

  // 8. Passing review -> approve verify gate -> archive (action: 'done')
  const later = Date.now() + 10000;
  write(fullRoot, revRel, verifyReport('pass'));
  fs.utimesSync(path.join(fullRoot, revRel), new Date(later), new Date(later));
  assert.equal(medra(fullRoot, 'review', fullChange, '--report', revRel, '--by', 'reviewer').code, 0);
  assert.equal(medra(fullRoot, 'gate', fullChange, 'verify', '--approve').code, 0);

  const archiveEnv = compileStep(fullRoot, fullChange, { full: true });
  assert.equal(archiveEnv.stage, 'archive');
  assert.equal(archiveEnv.action, 'done');
  assert.equal(archiveEnv.subagents[0].role, 'author');
  assertSubagentPrefixed(archiveEnv.subagents[0], 'archive author');
  assertPromptHasPrefixRule(archiveEnv.subagents[0].prompt, 'archive author --full');
  const archiveMd = medraHuman(fullRoot, 'step', fullChange, '--role', 'author', '--md');
  assert.equal(archiveMd.code, 0, archiveMd.stderr);
  assertPromptHasPrefixRule(archiveMd.stdout, 'archive author --md');
});

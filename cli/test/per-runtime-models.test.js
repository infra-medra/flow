import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { configWarnings, loadConfig } from '../src/core.js';
import { projectFindings } from '../src/validate.js';
import { compileStep } from '../src/step.js';
import { medra, project, read, write } from './helpers.js';

const CLI_BIN = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'bin', 'medra.js');

function setupChange(root, yamlModels) {
  write(root, 'docs/config-flow.yaml', [
    'version: 1',
    'language: en',
    'integrations: [claude, antigravity]',
    'testing:',
    '  mode: none',
    'apply:',
    '  granularity: batch',
    'models:',
    ...yamlModels,
  ].join('\n'));
  assert.equal(medra(root, 'new', 'c-rt', '--track', 'full').code, 0);
  write(root, 'docs/changes/c-rt/.medra.yaml', [
    'change: c-rt',
    'created: 2026-11-22',
    'track: full',
    'phase: tasked',
    'security: not-relevant',
    'gates:',
    '  proposal: { status: approved }',
    '  plan: { status: approved }',
    '  tasks: { status: approved }',
  ].join('\n'));
  write(root, 'docs/changes/c-rt/specs/cap/spec.md', '# Delta: cap\n\n**Capability:** `cap`\n**ID prefix:** `CAP`\n\n## Purpose\n\nTest capability.\n\n## ADDED Requirements\n\n### REQ CAP-001: Test\n\nThe system SHALL test.\n\n#### Scenario CAP-001.S1: S\n\n- **Given** x\n- **When** y\n- **Then** z\n');
  write(root, 'docs/changes/c-rt/tasks.md', '# Tasks: c-rt\n\n## Phase 1\n- [ ] T001 [TEST] [CAP-001] Write test in `test/a.test.js` — verify: `node --test test/a.test.js` fails\n');
  write(root, 'test/a.test.js', '// CAP-001.S1\n');
}

test('PLUG-005.S2: configWarnings and loadConfig support models.claude and models.antigravity without unknown-key warnings', () => {
  const root = project();
  setupChange(root, [
    '  default: inherit',
    '  claude:',
    '    apply: haiku',
    '    verify: opus',
    '    reviewer: sonnet',
    '  antigravity:',
    '    apply: flash',
    '    verify: pro',
  ]);
  const cfg = loadConfig(root);
  assert.equal(cfg.models.claude.apply, 'haiku');
  assert.equal(cfg.models.claude.reviewer, 'sonnet');
  assert.equal(cfg.models.antigravity.apply, 'flash');
  assert.equal(cfg.models.antigravity.verify, 'pro');

  const warnings = configWarnings(root);
  assert.deepEqual(warnings, []);

  // Inline override warnings also catch per-runtime inline overrides
  write(root, 'docs/config-flow.yaml', [
    'version: 1',
    'language: en',
    'integrations: [claude, antigravity]',
    'models:',
    '  claude:',
    '    plan: opus',
    '  antigravity:',
    '    author: pro',
  ].join('\n'));
  const inlineWarns = projectFindings(root, 'specs').filter((f) => f.rule === 'config.models');
  assert.equal(inlineWarns.length, 2);

  // Invalid models.<runtime> config warnings (non-object, unknown nested key, empty tier)
  write(root, 'docs/config-flow.yaml', [
    'version: 1',
    'language: en',
    'integrations: [claude, antigravity]',
    'models:',
    '  claude: flash',
    '  antigravity:',
    '    bogus: flash',
    '    apply: ""',
  ].join('\n'));
  const badWarns = configWarnings(root).filter((f) => f.rule === 'config.models');
  assert.equal(badWarns.length, 3);
});

test('PLUG-005.S2: compileStep resolves per-runtime models via --runtime, env detection, and flat fallback', () => {
  const root = project();
  setupChange(root, [
    '  default: inherit',
    '  implementer: fallback-tier',
    '  claude:',
    '    apply: haiku',
    '    verify: opus',
    '    reviewer: sonnet',
    '  antigravity:',
    '    apply: flash',
    '    verify: pro',
  ]);

  const claudeApply = compileStep(root, 'c-rt', { stage: 'apply', runtime: 'claude' });
  assert.equal(claudeApply.model.tier, 'haiku');
  assert.equal(claudeApply.subagents[0].model.tier, 'haiku');

  const agyApply = compileStep(root, 'c-rt', { stage: 'apply', runtime: 'antigravity' });
  assert.equal(agyApply.model.tier, 'flash');
  assert.equal(agyApply.subagents[0].model.tier, 'flash');

  // CLI --runtime flag and invalid --runtime exit 2 (while T001 is still pending)
  const cliAgy = spawnSync(process.execPath, [CLI_BIN, 'step', 'c-rt', '--stage', 'apply', '--runtime', 'antigravity', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(cliAgy.status, 0, cliAgy.stderr);
  assert.equal(JSON.parse(cliAgy.stdout).model.tier, 'flash');

  const cliClaudeEnv = spawnSync(process.execPath, [CLI_BIN, 'step', 'c-rt', '--stage', 'apply', '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CLAUDECODE: '1', MEDRA_RUNTIME: '', ANTIGRAVITY_AGENT: '', GEMINI_CLI: '' },
  });
  assert.equal(cliClaudeEnv.status, 0, cliClaudeEnv.stderr);
  assert.equal(JSON.parse(cliClaudeEnv.stdout).model.tier, 'haiku');

  const cliBad = spawnSync(process.execPath, [CLI_BIN, 'step', 'c-rt', '--runtime', 'bogus', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(cliBad.status, 2);

  // MEDRA_RUNTIME and ANTIGRAVITY_AGENT / GEMINI_CLI env detection
  const cliMedraRt = spawnSync(process.execPath, [CLI_BIN, 'step', 'c-rt', '--stage', 'apply', '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, MEDRA_RUNTIME: 'claude', ANTIGRAVITY_AGENT: '', GEMINI_CLI: '', CLAUDECODE: '' },
  });
  assert.equal(cliMedraRt.status, 0, cliMedraRt.stderr);
  assert.equal(JSON.parse(cliMedraRt.stdout).model.tier, 'haiku');

  const cliAgyEnv = spawnSync(process.execPath, [CLI_BIN, 'step', 'c-rt', '--stage', 'apply', '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, MEDRA_RUNTIME: '', ANTIGRAVITY_AGENT: '1', CLAUDECODE: '', CLAUDE_CODE_ENTRYPOINT: '' },
  });
  assert.equal(cliAgyEnv.status, 0, cliAgyEnv.stderr);
  assert.equal(JSON.parse(cliAgyEnv.stdout).model.tier, 'flash');

  // models[runtime].default and flat implementer: fallback-tier resolution when stage/runtime keys omit overrides
  // Mark T001 done before verify step
  write(root, 'docs/changes/c-rt/tasks.md', '# Tasks: c-rt\n\n## Phase 1\n- [x] T001 [TEST] [CAP-001] Write test in `test/a.test.js` — verify: `node --test test/a.test.js` fails\n');
  // Role override beats stage override for claude, while antigravity falls back to verify: pro
  const claudeVerify = compileStep(root, 'c-rt', { stage: 'verify', runtime: 'claude' });
  assert.equal(claudeVerify.model.tier, 'opus');
  assert.equal(claudeVerify.subagents[0].model.tier, 'sonnet');

  const agyVerify = compileStep(root, 'c-rt', { stage: 'verify', runtime: 'antigravity' });
  assert.equal(agyVerify.model.tier, 'pro');
  assert.equal(agyVerify.subagents[0].model.tier, 'pro');

  // Re-open T001 to test models[runtime].default (single-integration fallback) and flat implementer fallback
  write(root, 'docs/changes/c-rt/tasks.md', '# Tasks: c-rt\n\n## Phase 1\n- [ ] T001 [TEST] [CAP-001] Write test in `test/a.test.js` — verify: `node --test test/a.test.js` fails\n');
  write(root, 'docs/config-flow.yaml', [
    'version: 1',
    'language: en',
    'integrations: [claude]',
    'testing:',
    '  mode: none',
    'models:',
    '  implementer: fallback-tier',
    '  claude:',
    '    default: sonnet',
  ].join('\n'));
  const singleIntRes = spawnSync(process.execPath, [CLI_BIN, 'step', 'c-rt', '--stage', 'apply', '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, MEDRA_RUNTIME: '', ANTIGRAVITY_AGENT: '', GEMINI_CLI: '', CLAUDECODE: '', CLAUDE_CODE_ENTRYPOINT: '' },
  });
  assert.equal(singleIntRes.status, 0, singleIntRes.stderr);
  const singleIntStep = JSON.parse(singleIntRes.stdout);
  assert.equal(singleIntStep.model.tier, 'sonnet');
  assert.equal(singleIntStep.subagents[0].model.tier, 'sonnet');

  write(root, 'docs/config-flow.yaml', [
    'version: 1',
    'language: en',
    'integrations: [claude, antigravity]',
    'testing:',
    '  mode: none',
    'models:',
    '  implementer: fallback-tier',
    '  claude:',
    '    verify: opus',
  ].join('\n'));
  const flatFallbackStep = compileStep(root, 'c-rt', { stage: 'apply', runtime: 'claude' });
  assert.equal(flatFallbackStep.model.tier, 'inherit');
  assert.equal(flatFallbackStep.subagents[0].model.tier, 'fallback-tier');
});

test('PLUG-005.S2: install --target antigravity passes --runtime antigravity in medra step skill calls', () => {
  const root = project();
  assert.equal(medra(root, 'install', '--target', 'antigravity').code, 0);
  const runSkill = read(root, '.agents/plugins/medra/skills/run/SKILL.md');
  assert.match(runSkill, /medra step <change> --runtime antigravity --json/);
});

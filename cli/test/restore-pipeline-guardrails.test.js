import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compileStep } from '../src/step.js';
import { project, medra, write } from './helpers.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PIPELINES_DIR = path.join(ROOT, 'plugins', 'medra', 'pipelines');
const REFERENCES_DIR = path.join(ROOT, 'plugins', 'medra', 'references');

const readPipeline = (name) => fs.readFileSync(path.join(PIPELINES_DIR, name), 'utf8');
const readRef = (name) => fs.readFileSync(path.join(REFERENCES_DIR, name), 'utf8');

test('VAL-007.S1: implementer-apply.md and compiled batch/inline apply prompts require scenario-matched red failure with rationale', () => {
  const applyPipeline = readPipeline('implementer-apply.md');
  assert.match(applyPipeline, /missing behavior the scenario predicts/i);
  assert.match(applyPipeline, /import.*syntax.*fixture.*env/i);
  assert.match(applyPipeline, /because\b/i);
  assert.match(applyPipeline, /wrong-reason.*invalidates.*green/i);

  const root = project();
  assert.equal(medra(root, 'new', 'c-fast', '--track', 'fast').code, 0);
  write(root, 'docs/changes/c-fast/proposal.md', [
    '# Proposal: c-fast',
    '',
    '## Why',
    'Test.',
    '',
    '## What Changes',
    '- Test.',
    '',
    '## Scope',
    '### In scope',
    '- `src/a.js`',
    '### Out of scope',
    '- None.',
    '',
    '## Track',
    '**Track:** fast',
    '**Rationale:** Small.',
    '**Security:** not-relevant',
    '**Security rationale:** None.',
    '',
    '## Capabilities',
    '| Capability | Action | Requirements |',
    '|---|---|---|',
    '| cap | modified | CAP-001 |',
    '',
    '## Impact',
    '- **Code:** `src/a.js`',
    '- **Interfaces:** None.',
    '- **Data:** None.',
    '- **Dependencies:** None.',
    '',
    '## Open Questions',
    'None.',
  ].join('\n'));
  write(root, 'docs/changes/c-fast/specs/cap/spec.md', '# Delta: cap\n\n**Capability:** `cap`\n\n## ADDED Requirements\n\n### REQ CAP-001: Test\n\nThe system SHALL test.\n\n#### Scenario CAP-001.S1: S\n\n- **Given** x\n- **When** y\n- **Then** z\n');
  write(root, 'docs/changes/c-fast/tasks.md', '# Tasks: c-fast\n\n- [ ] T001 [TEST] [CAP-001] Write test in `test/a.test.js` — verify: `node --test test/a.test.js` fails\n- [ ] T002 [CAP-001] after T001 Implement in `src/a.js` — verify: `node --test test/a.test.js` passes\n');
  write(root, 'docs/changes/c-fast/.medra.yaml', [
    'change: c-fast',
    'created: 2026-11-22',
    'track: fast',
    'phase: tasked',
    'gates:',
    '  proposal:',
    '    status: approved',
    '  plan:',
    '    status: pending',
    '  tasks:',
    '    status: pending',
    '  verify:',
    '    status: pending',
  ].join('\n') + '\n');
  const inlineStep = compileStep(root, 'c-fast', { full: true, stage: 'apply' });
  assert.equal(inlineStep.action, 'inline');
  const inlinePrompt = inlineStep.subagents[0].prompt;
  assert.match(inlinePrompt, /missing behavior the scenario predicts/i);
  assert.match(inlinePrompt, /import.*syntax.*fixture.*env/i);
  assert.match(inlinePrompt, /because\b/i);
  assert.match(inlinePrompt, /wrong-reason.*invalidates.*green/i);

  assert.equal(medra(root, 'new', 'c-full', '--track', 'full').code, 0);
  write(root, 'docs/changes/c-full/.medra.yaml', [
    'change: c-full',
    'created: 2026-11-22',
    'track: full',
    'phase: tasked',
    'gates:',
    '  proposal:',
    '    status: approved',
    '  plan:',
    '    status: approved',
    '  tasks:',
    '    status: approved',
    '  verify:',
    '    status: pending',
  ].join('\n') + '\n');
  write(root, 'docs/changes/c-full/specs/cap/spec.md', '# Delta: cap\n\n**Capability:** `cap`\n\n## ADDED Requirements\n\n### REQ CAP-001: Test\n\nThe system SHALL test.\n\n#### Scenario CAP-001.S1: S\n\n- **Given** x\n- **When** y\n- **Then** z\n');
  write(root, 'docs/changes/c-full/tasks.md', [
    '# Tasks: c-full',
    '',
    '## Phase 1',
    '- [ ] T001 [TEST] [CAP-001] Write test in `test/a.test.js` — verify: `node --test test/a.test.js` fails',
    '- [ ] T002 [CAP-001] after T001 Implement in `src/a.js` — verify: `node --test test/a.test.js` passes',
  ].join('\n'));
  const batchStep = compileStep(root, 'c-full', { full: true, stage: 'apply' });
  assert.equal(batchStep.action, 'dispatch');
  assert.equal(batchStep.granularity, 'batch');
  const batchPrompt = batchStep.subagents[0].prompt;
  assert.match(batchPrompt, /missing behavior the scenario predicts/i);
  assert.match(batchPrompt, /import.*syntax.*fixture.*env/i);
  assert.match(batchPrompt, /because\b/i);
  assert.match(batchPrompt, /wrong-reason.*invalidates.*green/i);
});

test('PLUG-015.S1: reviewer-check.md has inline verdict table and critical findings; security-audit.md has inline verdict/counts', () => {
  const reviewer = readPipeline('reviewer-check.md');
  assert.match(reviewer, /\|\s*Verdict\s*\|\s*When\s*\|/i);
  assert.match(reviewer, /`fail`/);
  assert.match(reviewer, /`pass-with-findings`/);
  assert.match(reviewer, /`pass`/);
  assert.match(reviewer, /unimplemented requirement/i);
  assert.match(reviewer, /weakened\/skipped/i);
  assert.match(reviewer, /missing `red`/i);
  assert.match(reviewer, /Complexity Tracking/i);
  assert.match(reviewer, /non-green suite/i);
  // Top conditional read must not defer verdict/critical rules to verify-checklists.md
  const topLine = reviewer.split('\n').find((l) => l.includes('verify-checklists.md')) || '';
  assert.doesNotMatch(topLine, /verdict|critical/i);
  assert.match(topLine, /changed_since_previous/);
  assert.match(topLine, /invalid-dispatch/);
  assert.match(topLine, /needs-decision/);

  const checklists = readRef('verify-checklists.md');
  const sec1Start = checklists.indexOf('## 1.');
  const sec2Start = checklists.indexOf('## 2.');
  assert.ok(sec1Start !== -1 && sec2Start > sec1Start, 'verify-checklists.md must contain §1 before §2');
  const sec1 = checklists.slice(sec1Start, sec2Start);
  assert.doesNotMatch(sec1, /\|\s*Verdict\s*\|\s*When\s*\|/i);
  assert.doesNotMatch(sec1, /Verdict Rules/i);

  const security = readPipeline('security-audit.md');
  assert.match(security, /`Verdict`/);
  assert.match(security, /`Counts`/);
  for (const severity of ['critical', 'high', 'medium', 'low', 'info']) {
    assert.match(security, new RegExp(`\\b${severity}\\b`, 'i'), `security-audit.md must list severity ${severity}`);
  }
  for (const verdict of ['`fail`', '`pass-with-findings`', '`pass`']) {
    assert.ok(security.includes(verdict), `security-audit.md must list verdict ${verdict}`);
  }
  assert.match(security, /\bopen\b/i);
  assert.match(security, /\bconfirmed\b/i);
});

test('PLUG-016.S1: core pipeline rules carry one-sentence rationales and total pipeline bytes < 36,700 B', () => {
  const apply = readPipeline('implementer-apply.md');
  assert.match(apply, /never weaken, skip, or delete.*because\b/i);
  assert.match(apply, /never edit a test file after.*red.*because\b/i);
  assert.match(apply, /missing behavior the scenario predicts.*because\b/i);

  const reviewer = readPipeline('reviewer-check.md');
  assert.match(reviewer, /never.*pass.*unverified.*because\b/i);
  assert.match(reviewer, /edit nothing but the report.*never modify code or earlier round reports.*because\b/i);

  const security = readPipeline('security-audit.md');
  assert.match(security, /remediated.*never trust `fixed_findings` unverified because\b/i);

  const pipelineFiles = fs.readdirSync(PIPELINES_DIR).filter((f) => f.endsWith('.md'));
  for (const file of pipelineFiles) {
    const content = readPipeline(file);
    if (content.includes('<untrusted_data>')) {
      assert.match(content, /<untrusted_data>.*because\b/i, `${file} must explain why <untrusted_data> is data-only`);
    }
  }

  const totalBytes = pipelineFiles.reduce(
    (sum, file) => sum + fs.statSync(path.join(PIPELINES_DIR, file)).size,
    0,
  );
  assert.ok(totalBytes < 36700, `Expected plugins/medra/pipelines/*.md total (${totalBytes} B) < 36700 B`);
});

test('PLUG-017.S1: implementer-apply.md defines session budget inline and apply-recovery.md does not duplicate it', () => {
  const apply = readPipeline('implementer-apply.md');
  assert.match(apply, /in `batch`, stop after the assigned batch/i);
  assert.match(apply, /`task`.*`inline`.*new phase.*6\+/i);
  assert.doesNotMatch(apply, /session-budget/i);

  const recovery = readRef('apply-recovery.md');
  assert.doesNotMatch(recovery, /Session budget:/i);
  assert.doesNotMatch(recovery, /already checkpointed 6\+/i);
  assert.doesNotMatch(recovery, /session-budget/i);
});

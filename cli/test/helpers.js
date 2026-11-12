import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'medra.js');

export function medra(cwd, ...args) {
  const res = spawnSync(process.execPath, [BIN, ...args, '--json'], { cwd, encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(res.stdout.trim().split('\n').pop()); } catch { /* non-JSON output */ }
  return { code: res.status, json, stdout: res.stdout, stderr: res.stderr };
}

export function medraHuman(cwd, ...args) {
  const res = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

export function write(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

export const CONSTITUTION = `# Constitution

**Status:** draft

## Articles

### Article I: Test-first

Every behavior change MUST be covered by a test seen failing first.

**Gate:** Does every scenario map to a test task ordered before its implementation?
**Rationale:** Tests written after assert what the code does.

## Amendments

| Version | Date | Change | Source |
|---|---|---|---|
`;

/** A git-initialised project with a ratified constitution. */
export function project({ mode = 'tdd' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'medra-test-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: root });
  const r = medra(root, 'init', '--testing-mode', mode, '--language', 'en');
  if (r.code !== 0) throw new Error(r.stderr || r.stdout);
  write(root, 'docs/constitution.md', CONSTITUTION);
  medra(root, 'constitution', 'ratify', '--note', 'Initial');
  return root;
}

export const req = (id, title, scenarios, statement = `The system SHALL ${title.toLowerCase()}.`) =>
  [`### REQ ${id}: ${title}`, '', statement, '', ...scenarios.flatMap(([sid, t]) => [`#### Scenario ${sid}: ${t}`, '', '- **Given** a state', '- **When** an action', '- **Then** an outcome', ''])].join('\n');

export function livingSpec(root, cap, prefix, reqs, retired = '') {
  write(root, `docs/specs/${cap}/spec.md`, [`# ${cap} title`, '', `**Capability:** \`${cap}\``, `**ID prefix:** \`${prefix}\``, '', '## Purpose', '', `Does ${cap}.`, '', '## Requirements', '', ...(retired ? [`<!-- retired: ${retired} -->`, ''] : []), ...reqs, ''].join('\n'));
}

export function proposal(root, change, { track = 'fast', caps = [['auth', 'modified', 'AUTH-001']], security = null } = {}) {
  const securityLines = security ? `\n**Security:** ${security}\n**Security rationale:** External input: new endpoint.` : '';
  write(root, `docs/changes/${change}/proposal.md`, `# Proposal: ${change}

## Why

Users need this. It costs support time.

## What Changes

- A change.

## Scope

### In scope

- It.

### Out of scope

- Other — later.

## Track

**Track:** ${track}
**Rationale:** Criteria checked.${securityLines}

## Capabilities

| Capability | Operation | Requirements |
|---|---|---|
${caps.map(([c, op, r]) => `| \`${c}\` | ${op} | ${r} |`).join('\n')}

## Impact

- **Code:** src
- **Interfaces:** None.
- **Data:** None.
- **Dependencies:** None.

## Open Questions

None.
`);
}

export const delta = (cap, sections, header = '') => `# Delta: ${cap} title\n\n**Capability:** \`${cap}\`\n${header}\n${sections}\n`;

export function tasks(root, change, lines) {
  write(root, `docs/changes/${change}/tasks.md`, `# Tasks: ${change}\n\n## Phase 1: Work\n\n${lines.join('\n')}\n`);
}

export const securityReport = (verdict = 'pass', counts = 'critical 0 · high 0 · medium 0 · low 0 · info 0') => `# Security Report: x — round 1\n\n**Stage:** security\n**Verdict:** ${verdict}\n**Counts:** ${counts}\n**Reviewer:** security agent\n**Date:** 2026-11-04\n\n## Summary\n\nOk.\n`;

export const verifyReport = (verdict = 'pass') => `# Review: x — verify\n\n**Stage:** verify\n**Verdict:** ${verdict}\n**Counts:** critical 0 · major 0 · minor 0\n**Reviewer:** reviewer agent\n**Date:** 2026-10-30\n\n## Summary\n\nOk.\n\n## Findings\n\nNone.\n\n## Coverage\n\n| Requirement | Evidence | Status |\n|---|---|---|\n`;

export const rules = (r) => (r.json?.findings ?? []).filter((f) => f.severity === 'error').map((f) => f.rule);

/** A fast-track change modifying AUTH-001 (keeps S1, drops S2, adds S3), adding AUTH-003, removing AUTH-002. */
export function brownfieldChange(root, change = 'rework-auth-flow') {
  livingSpec(root, 'auth', 'AUTH', [
    req('AUTH-001', 'Login', [['AUTH-001.S1', 'Ok'], ['AUTH-001.S2', 'Locked']]),
    req('AUTH-002', 'Remember me', [['AUTH-002.S1', 'Cookie']]),
  ], 'AUTH-004');
  assert.equal(medra(root, 'new', change).code, 0);
  proposal(root, change, { caps: [['auth', 'modified', 'AUTH-001, AUTH-002, AUTH-003']] });
  write(root, `docs/changes/${change}/specs/auth/spec.md`, delta('auth', [
    '## ADDED Requirements', '', req('AUTH-005', 'Reset', [['AUTH-005.S1', 'Link']]),
    '## MODIFIED Requirements', '', req('AUTH-001', 'Login v2', [['AUTH-001.S1', 'Ok'], ['AUTH-001.S3', 'MFA']]),
    '## REMOVED Requirements', '', '### REQ AUTH-002: Remember me', '', '**Reason:** Unsafe.', '**Migration:** None', '',
  ].join('\n')));
  tasks(root, change, [
    '- [ ] T001 [TEST] [AUTH-001, AUTH-005] Write tests for AUTH-001.S1, AUTH-001.S3, AUTH-005.S1 in `test/a.test.js` — verify: red',
    '- [ ] T002 [AUTH-001, AUTH-005] after T001 Implement in `src/a.js` — verify: green',
  ]);
  return change;
}

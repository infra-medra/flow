#!/usr/bin/env node
// Benchmarks `medra step` / `compileStep` coordinator envelope byte sizes across stages.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStep } from '../src/step.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(SCRIPT_DIR, '..', 'bin', 'medra.js');

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function medra(cwd, ...args) {
  return execFileSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(root, relPath, content) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

const CONSTITUTION = `# Constitution

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

const LIVING_SPEC = `# Core Capability

**Capability:** \`core\`
**ID prefix:** \`CORE\`

## Purpose

Core module behavior.

## Requirements

### REQ CORE-001: Process payload

The system SHALL process payloads deterministically.

#### Scenario CORE-001.S1: Valid payload

- **Given** a valid payload
- **When** processed
- **Then** it returns a normalized result
`;

const DELTA_SPEC = `# Delta: core

**Capability:** \`core\`

## MODIFIED Requirements

### REQ CORE-001: Process payload

The system SHALL process payloads deterministically and validate against the schema.

#### Scenario CORE-001.S1: Valid payload

- **Given** a valid payload
- **When** processed
- **Then** it returns a normalized result matching \`contracts/sample.schema.json\`
`;

const PROPOSAL = `# Proposal: sample-change

## Why

Benchmark step envelope sizes across stages.

## What Changes

- Update core payload processing and add schema validation.

## Scope

### In scope

- Core payload processor and schema contract.

### Out of scope

- External integrations.

## Track

**Track:** full
**Rationale:** Includes contract and multiple tasks.
**Security:** relevant
**Security rationale:** Validates untrusted input payloads.

## Capabilities

| Capability | Operation | Requirements |
|---|---|---|
| \`core\` | modified | CORE-001 |

## Impact

- **Code:** \`src/module.js\`
- **Interfaces:** \`contracts/sample.schema.json\`
- **Data:** None.
- **Dependencies:** None.

## Open Questions

None.
`;

const PLAN = `# Plan: sample-change

## Summary

Add schema-validated payload processing in \`src/module.js\`.

## Constitution Check

| Article | Gate | Result | Note |
|---|---|---|---|
| I | Does every scenario map to a test task ordered before its implementation? | pass | Yes |

## Complexity Tracking

None.

## Test Strategy

- **Command:** \`node --test\`
- **Framework:** node:test

| Scenario | Level | Test location |
|---|---|---|
| \`CORE-001.S1\` | unit | \`test/module.test.js\` |

## Decisions

### D-01: Schema validation

**Choice:** Validate against \`contracts/sample.schema.json\`.
**Alternatives:** Ad-hoc checks.
**Rationale:** Deterministic contract.
`;

function buildTasks(doneCount = 0) {
  const lines = [
    '# Tasks: sample-change',
    '',
    '## Phase 1: Setup & Tests',
    '',
  ];
  for (let i = 1; i <= 8; i += 1) {
    const id = `T${String(i).padStart(3, '0')}`;
    const mark = i <= doneCount ? 'x' : ' ';
    const isTest = i % 2 === 1;
    const tag = isTest ? '[TEST] ' : '';
    const dep = i > 1 ? `after T${String(i - 1).padStart(3, '0')} ` : '';
    const target = isTest ? 'test/module.test.js' : 'src/module.js';
    const verify = isTest ? 'fails (red)' : 'passes (green)';
    const mit = i === 2 ? ' (M-01)' : '';
    lines.push(`- [${mark}] ${id} ${tag}[CORE-001] ${dep}Step ${i}${mit} in \`${target}\` — verify: ${verify}`);
  }
  return `${lines.join('\n')}\n`;
}

const CONTRACT = JSON.stringify(
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'SamplePayload',
    type: 'object',
    required: ['id', 'version', 'items'],
    properties: {
      id: { type: 'string', minLength: 1 },
      version: { type: 'integer', minimum: 1 },
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'value'],
          properties: {
            name: { type: 'string' },
            value: { type: 'number' },
          },
        },
      },
    },
  },
  null,
  2,
);

function measureStage(root, change, stage, diffBase) {
  const env = compileStep(root, change, { stage, diffBase });
  const compileBytes = Buffer.byteLength(JSON.stringify(env), 'utf8');
  const cliArgs = ['step', change, '--stage', stage, '--json'];
  if (diffBase) cliArgs.push('--diff-base', diffBase);
  const cliOut = medra(root, ...cliArgs);
  const cliBytes = Buffer.byteLength(cliOut.trimEnd(), 'utf8');
  return {
    stage,
    action: env.action,
    subagents: env.subagents?.length ?? 0,
    compile_bytes: compileBytes,
    cli_json_bytes: cliBytes,
  };
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'medra-measure-'));
  const change = 'sample-change';

  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.name', 'medra-bench');
    git(root, 'config', 'user.email', 'bench@example.com');

    write(root, 'src/module.js', 'export function processPayload(input) {\n  return input;\n}\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base commit');
    const baseSha = git(root, 'rev-parse', 'HEAD');

    medra(root, 'init', '--testing-mode', 'tdd', '--language', 'en', '--json');
    write(root, 'docs/constitution.md', CONSTITUTION);
    medra(root, 'constitution', 'ratify', '--note', 'Initial', '--json');
    write(root, 'docs/specs/core/spec.md', LIVING_SPEC);

    medra(root, 'new', change, '--track', 'full', '--json');
    write(root, `docs/changes/${change}/contracts/sample.schema.json`, CONTRACT);
    write(root, `docs/changes/${change}/specs/core/spec.md`, DELTA_SPEC);

    // Create a ~40 KB git diff in a tracked file.
    const fillerLines = Array.from(
      { length: 650 },
      (_, idx) => `export const entry_${String(idx).padStart(4, '0')} = "payload-validation-rule-${String(idx).padStart(4, '0')}-deterministic";`,
    );
    write(root, 'src/module.js', `${fillerLines.join('\n')}\n`);
    git(root, 'add', 'src/module.js');
    git(root, 'commit', '-q', '-m', 'add ~40 KB module changes');

    const results = [];

    // 1. propose (before proposal.md exists -> dispatch)
    results.push(measureStage(root, change, 'propose', baseSha));

    // Write proposal & approve proposal gate
    write(root, `docs/changes/${change}/proposal.md`, PROPOSAL);
    medra(root, 'gate', change, 'proposal', '--approve', '--by', 'bench', '--json');

    // 2. plan (before plan.md exists -> dispatch)
    results.push(measureStage(root, change, 'plan', baseSha));

    // Write plan & approve plan gate
    write(root, `docs/changes/${change}/plan.md`, PLAN);
    write(root, `docs/changes/${change}/threat-model.md`, `# Threat Model: sample-change

## Scope

Payload processor in \`src/module.js\`.

## Assets

- Validated payload data.

## Trust Boundaries

- Untrusted input boundary at \`processPayload\`.

## Entry Points

- \`processPayload(input)\`

## Threats

| ID | STRIDE | Threat | Boundary | Severity | Likelihood | Mitigations |
|---|---|---|---|---|---|---|
| TM-01 | T | Malformed payload | TB-01 | medium | medium | M-01 |

## Mitigations

| ID | Mitigation | Threats | Decision |
|---|---|---|---|
| M-01 | Validate against \`contracts/sample.schema.json\` | TM-01 | accepted (D-01) |

## Residual Risks

None.

## Sources

- \`contracts/sample.schema.json\`
`);
    medra(root, 'gate', change, 'plan', '--approve', '--by', 'bench', '--json');

    // 3. tasks (before tasks.md exists -> dispatch)
    results.push(measureStage(root, change, 'tasks', baseSha));

    // Write 8 tasks (T001..T008) & approve tasks gate
    write(root, `docs/changes/${change}/tasks.md`, buildTasks(0));
    medra(root, 'gate', change, 'tasks', '--approve', '--by', 'bench', '--json');

    // 4. apply (pending tasks -> dispatch)
    results.push(measureStage(root, change, 'apply', baseSha));

    // 5. verify (all 8 tasks completed -> dispatch with ~40 KB diff + 1 contract)
    write(root, `docs/changes/${change}/tasks.md`, buildTasks(8));
    results.push(measureStage(root, change, 'verify', baseSha));

    const totalCompileBytes = results.reduce((sum, r) => sum + r.compile_bytes, 0);
    const totalCliBytes = results.reduce((sum, r) => sum + r.cli_json_bytes, 0);

    console.log('stage     | action   | subagents | compile_bytes | cli_json_bytes');
    console.log('----------|----------|-----------|---------------|---------------');
    for (const r of results) {
      console.log(
        `${r.stage.padEnd(9)} | ${r.action.padEnd(8)} | ${String(r.subagents).padStart(9)} | ${String(r.compile_bytes).padStart(13)} | ${String(r.cli_json_bytes).padStart(14)}`,
      );
    }
    console.log('----------|----------|-----------|---------------|---------------');
    console.log(
      `${'TOTAL'.padEnd(9)} | ${''.padEnd(8)} | ${''.padStart(9)} | ${String(totalCompileBytes).padStart(13)} | ${String(totalCliBytes).padStart(14)}`,
    );
    console.log('');
    console.log(JSON.stringify({ stages: results, total_compile_bytes: totalCompileBytes, total_cli_json_bytes: totalCliBytes }, null, 2));

    const verifyResult = results.find((r) => r.stage === 'verify');
    if (verifyResult && verifyResult.cli_json_bytes >= 4096) {
      console.error(`verify coordinator --json (${verifyResult.cli_json_bytes} bytes) exceeds 4096 byte target`);
      process.exitCode = 1;
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();

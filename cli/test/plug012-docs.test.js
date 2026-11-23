import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Covers PLUG-012.S1: Reference docs and bundled plugin reflect MEDRA_SUBAGENT=1 scope
test('PLUG-012.S1: gate.md and portability.md state MEDRA_SUBAGENT=1 applies only to the medra command and is stripped from child test/check processes', () => {
  const files = [
    ['plugins/medra/references/gate.md', fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'medra', 'references', 'gate.md'), 'utf8')],
    ['plugins/medra/references/portability.md', fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'medra', 'references', 'portability.md'), 'utf8')],
  ];

  for (const [name, content] of files) {
    assert.match(
      content,
      /MEDRA_SUBAGENT=1`?\s+applies\s+only\s+to\s+the\s+`?medra`?\s+command/i,
      `${name} must state that MEDRA_SUBAGENT=1 applies only to the medra command invoked by the subagent`,
    );
    assert.match(
      content,
      /(strips?|removes?)\s+(it|MEDRA_SUBAGENT)\s+from\s+the\s+environment\s+of\s+(child\s+)?test\s+and\s+check\s+(commands|processes)/i,
      `${name} must state that the CLI strips MEDRA_SUBAGENT from the environment of child test and check commands`,
    );
  }

  const driftRes = spawnSync(process.execPath, [path.join(REPO_ROOT, 'cli', 'scripts', 'check-bundle-drift.js')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(driftRes.status, 0, driftRes.stdout + driftRes.stderr);
});

// Fails when .agents/plugins/medra/ or cli/plugin/ has drifted from plugins/medra/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../src/install.js';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.join(cli, '..');

function walkFiles(dir, { exclude = () => false } = {}) {
  if (!fs.existsSync(dir)) return null;
  const out = new Map();
  const visit = (cur) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (exclude(full)) continue;
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile()) {
        out.set(path.relative(dir, full), fs.readFileSync(full));
      }
    }
  };
  visit(dir);
  return out;
}

function compareTrees(label, actualDir, expectedDir, opts) {
  const actual = walkFiles(actualDir, opts);
  const expected = walkFiles(expectedDir, opts);
  if (!expected) return [`${label}: expected source directory missing (${expectedDir})`];
  if (!actual) return [`${label}: target directory missing (${actualDir})`];

  const diffs = [];
  for (const [rel, expBuf] of expected) {
    const actBuf = actual.get(rel);
    if (!actBuf) diffs.push(`${label}: missing ${rel}`);
    else if (!actBuf.equals(expBuf)) diffs.push(`${label}: modified ${rel}`);
  }
  for (const rel of actual.keys()) {
    if (!expected.has(rel)) diffs.push(`${label}: extra ${rel}`);
  }
  return diffs.sort();
}

const errors = [];

// 1. Verify cli/plugin/ matches plugins/medra/ (excluding BLUEPRINT.md, matching bundle-plugin.js).
errors.push(
  ...compareTrees(
    'cli/plugin',
    path.join(cli, 'plugin'),
    path.join(repoRoot, 'plugins', 'medra'),
    { exclude: (p) => p.endsWith('BLUEPRINT.md') },
  ),
);

// 2. Verify .agents/plugins/medra/ matches a fresh `medra install --target antigravity` from plugins/medra/.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'medra-bundle-drift-'));
try {
  install(tmpRoot, { scope: 'workspace', force: true });
  errors.push(
    ...compareTrees(
      '.agents/plugins/medra',
      path.join(repoRoot, '.agents', 'plugins', 'medra'),
      path.join(tmpRoot, '.agents', 'plugins', 'medra'),
    ),
  );
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

if (errors.length > 0) {
  console.error('bundle drift detected:');
  for (const err of errors) console.error(`  - ${err}`);
  console.error('Run `npm --prefix cli run bundle-plugin` and `node cli/bin/medra.js install --target antigravity --force` to resync.');
  process.exit(1);
}

console.log('bundle parity ok: cli/plugin/ and .agents/plugins/medra/ match plugins/medra/');

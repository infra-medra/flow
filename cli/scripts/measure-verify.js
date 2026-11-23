#!/usr/bin/env node
// Measures what a verify round costs before the agent starts working: the embedded diff (legacy
// `base..HEAD` capped at 64 KiB vs the filtered, prioritized working-tree diff) and the fixed files
// each receiver reads at intake. Usage: node cli/scripts/measure-verify.js [--base <ref>] [--json]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import picomatch from 'picomatch';
import { loadConfig } from '../src/core.js';
import { diffExcludes, safeGitDiff } from '../src/step.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGIN = path.join(REPO_ROOT, 'plugins', 'medra');
const LEGACY_CAP = 64 * 1024;

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'HEAD~1';
const json = args.includes('--json');

const bytes = (file) => (fs.existsSync(file) ? fs.statSync(file).size : 0);
const sum = (files) => files.reduce((n, f) => n + bytes(path.join(PLUGIN, f)), 0);

const legacyRaw = execFileSync('git', ['diff', '--no-ext-diff', `${base}..HEAD`, '--'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const legacyBytes = Buffer.byteLength(legacyRaw, 'utf8');
const config = loadConfig(REPO_ROOT);
const current = safeGitDiff(REPO_ROOT, base, {
  excludes: diffExcludes(config),
  isTest: picomatch(config.testing.paths ?? [], { dot: true }),
});

// Intake reads per receiver on a compiled dispatch: agent file, pipeline, report guide and template
// (the prompt carries the conventions excerpt). `medra context` output, which legacy intake also
// read, is not counted.
const intake = {
  reviewer: ['agents/reviewer.md', 'pipelines/reviewer-check.md', 'templates/review/guide.md', 'templates/review/template.md'],
  security: ['agents/security.md', 'pipelines/security-audit.md', 'templates/security-report/guide.md', 'templates/security-report/template.md'],
};
// Legacy intake also read the conventions reference and the handoff contract. Legacy sizes of the
// files trimmed since are taken from git at LEGACY_REF so the comparison stays honest.
const LEGACY_REF = 'c2c9554';
const legacyFileBytes = (rel) => {
  try { return Buffer.byteLength(execFileSync('git', ['show', `${LEGACY_REF}:plugins/medra/${rel}`], { cwd: REPO_ROOT, encoding: 'utf8' }), 'utf8'); } catch { return bytes(path.join(PLUGIN, rel)); }
};
const legacyExtra = { reviewer: ['handoffs/implementer-reviewer.md', 'references/conventions.md'], security: ['handoffs/implementer-security.md', 'references/conventions.md'] };

const result = {
  base,
  diff: {
    legacy_raw_bytes: legacyBytes,
    legacy_embedded_bytes: Math.min(legacyBytes, LEGACY_CAP),
    legacy_truncated: legacyBytes > LEGACY_CAP,
    current_embedded_bytes: Buffer.byteLength(current.diff, 'utf8'),
    current_truncated: current.truncated,
    current_omitted: current.omitted,
  },
  intake: Object.fromEntries(Object.entries(intake).map(([role, files]) => [role, {
    legacy_bytes: [...files, ...legacyExtra[role]].reduce((n, f) => n + legacyFileBytes(f), 0),
    current_bytes: sum(files),
  }])),
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const d = result.diff;
  console.log(`verify cost vs ${base} (bytes; ~4 bytes per token)`);
  console.log(`  diff   legacy ${d.legacy_embedded_bytes}${d.legacy_truncated ? ` (truncated from ${d.legacy_raw_bytes})` : ''} -> current ${d.current_embedded_bytes}${d.current_truncated ? ` (omitted: ${d.current_omitted.join(', ')})` : ''}`);
  for (const [role, v] of Object.entries(result.intake)) console.log(`  intake ${role.padEnd(8)} legacy ${v.legacy_bytes} -> current ${v.current_bytes}`);
}

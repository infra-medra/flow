// Shared plumbing: errors and exit codes, project root, config, atomic writes, hashing, git.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';

export const EXIT = { OK: 0, REFUSED: 1, USAGE: 2, CONFLICT: 3, ENV: 4 };

export class MedraError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.findings = extra.findings ?? [{ rule: 'cli', severity: 'error', message }];
    this.extra = extra;
  }
}

export const refused = (findings, message = 'Refused') => new MedraError(EXIT.REFUSED, message, { findings });
export const envError = (message) => new MedraError(EXIT.ENV, message);
export const usageError = (message) => new MedraError(EXIT.USAGE, message);

export function finding(rule, message, { file = null, line = null, ref = null, severity = 'error' } = {}) {
  return { rule, severity, file, line, message, ref };
}

export const errorsOf = (findings) => findings.filter((f) => f.severity === 'error');

export const CHANGE_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+){1,7}$/;
export const CAPABILITY_NAME = /^[a-z][a-z0-9-]{1,40}$/;

export const DEFAULT_CONFIG = {
  version: 1,
  language: 'en',
  integrations: ['claude'],
  testing: { mode: 'tdd', command: null, paths: ['test/**', '**/*.test.*', '**/*_test.*', 'tests/**'] },
  learning: { max_active: 40, promote_after: 3, stale_after: 10, context_max: 10 },
};

export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'medra', 'config.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireRoot() {
  const root = findRoot();
  if (!root) throw envError('Not a medra project: no medra/config.yaml found in this directory or its parents. Run `medra init`.');
  return root;
}

export function loadConfig(root) {
  const file = path.join(root, 'medra', 'config.yaml');
  const raw = YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    testing: { ...DEFAULT_CONFIG.testing, ...(raw.testing ?? {}) },
    learning: { ...DEFAULT_CONFIG.learning, ...(raw.learning ?? {}) },
  };
}

export function configWarnings(root) {
  const raw = YAML.parse(fs.readFileSync(path.join(root, 'medra', 'config.yaml'), 'utf8')) ?? {};
  const known = new Set(Object.keys(DEFAULT_CONFIG));
  return Object.keys(raw)
    .filter((k) => !known.has(k))
    .map((k) => finding('config.unknown-key', `Unknown config key "${k}"`, { file: 'medra/config.yaml', severity: 'warning' }));
}

export const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
export const readIf = (file) => (fs.existsSync(file) ? readText(file) : null);
export const rel = (root, file) => path.relative(root, file).split(path.sep).join('/');

/**
 * Writes every file to a temporary sibling first and renames only after all writes succeed,
 * so a failure leaves no partial state.
 */
export function writeAtomic(files) {
  const staged = [];
  try {
    for (const [file, content] of files) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.medra-tmp-${process.pid}`;
      fs.writeFileSync(tmp, content);
      staged.push([tmp, file]);
    }
  } catch (err) {
    for (const [tmp] of staged) fs.rmSync(tmp, { force: true });
    throw err;
  }
  for (const [tmp, file] of staged) fs.renameSync(tmp, file);
}

export const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

export const today = () => new Date().toISOString().slice(0, 10);
export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

export function identity(root, by) {
  return by || git(root, ['config', 'user.name']) || process.env.USER || 'unknown';
}

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

export const listOpt = (value) => (value ? String(value).split(',').map((s) => s.trim()).filter(Boolean) : []);

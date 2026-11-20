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

export function finding(rule, message, { file = null, line = null, ref = null, severity = 'error', remediation = null, data = null } = {}) {
  return { rule, severity, file, line, message, ref, ...(remediation ? { remediation } : {}), ...(data ?? {}) };
}

export const errorsOf = (findings) => findings.filter((f) => f.severity === 'error');

export const DOCS_DIR = 'docs';
export const CONFIG_FILE = 'config-flow.yaml';
/** Absolute path inside the project's documents directory. */
export const docsPath = (root, ...parts) => path.join(root, DOCS_DIR, ...parts);
/** The same path as shown to users and agents, relative to the project root. */
export const docsRel = (...parts) => [DOCS_DIR, ...parts].join('/');
export const configRel = docsRel(CONFIG_FILE);

export const CHANGE_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+){1,7}$/;
export const CAPABILITY_NAME = /^[a-z][a-z0-9-]{1,40}$/;

export const DEFAULT_CONFIG = {
  version: 1,
  language: 'en',
  integrations: ['claude'],
  testing: { mode: 'tdd', command: null, checks: [], 'allow-additive-test-edits': false, paths: ['test/**', '**/*.test.*', '**/*_test.*', 'tests/**'] },
  learning: { max_active: 40, promote_after: 3, stale_after: 10, context_max: 10 },
};

/** Nearest ancestor holding docs/config-flow.yaml, or the 1.0 layout (medra/config.yaml): { root, legacy }. */
export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(docsPath(dir, CONFIG_FILE))) return { root: dir, legacy: false };
    if (fs.existsSync(path.join(dir, 'medra', 'config.yaml'))) return { root: dir, legacy: true };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireRoot() {
  const found = findRoot();
  if (!found) throw envError(`Not a medra project: no ${configRel} found in this directory or its parents. Run \`medra init\`.`);
  return found;
}

export function loadConfig(root) {
  const file = docsPath(root, CONFIG_FILE);
  const raw = YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    testing: { ...DEFAULT_CONFIG.testing, ...(raw.testing ?? {}) },
    learning: { ...DEFAULT_CONFIG.learning, ...(raw.learning ?? {}) },
  };
}

export function configWarnings(root) {
  const raw = YAML.parse(fs.readFileSync(docsPath(root, CONFIG_FILE), 'utf8')) ?? {};
  const known = new Set(Object.keys(DEFAULT_CONFIG));
  return Object.keys(raw)
    .filter((k) => !known.has(k))
    .map((k) => finding('config.unknown-key', `Unknown config key "${k}"`, { file: configRel, severity: 'warning' }));
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

// Calendar dates (folder names, evidence lines, ratification) use the local date, so a change
// archived in the evening west of UTC is not stamped with tomorrow. Timestamps (nowIso) stay UTC.
export const today = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
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

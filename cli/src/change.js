// Change folders: state (.medra.yaml), stage documents and hashes, gate status, coverage.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import fg from 'fast-glob';
import ignore from 'ignore';
import picomatch from 'picomatch';
import { envError, finding, readText, readIf, sha256, writeAtomic, rel, loadConfig, docsPath, DOCS_DIR, git } from './core.js';
import { tasksHashBasis, parseTasks, parseReport, parseProposal } from './documents.js';
import { loadDeltas, loadLivingSpecs, planMerge } from './specs.js';

export const GATES = ['proposal', 'plan', 'tasks', 'verify'];
export const changesDir = (root) => docsPath(root, 'changes');
export const changeDir = (root, change) => path.join(changesDir(root), change);
export const statePath = (root, change) => path.join(changeDir(root, change), '.medra.yaml');

export function loadState(root, change) {
  const file = statePath(root, change);
  if (!fs.existsSync(file)) throw envError(`No active change "${change}" (missing ${rel(root, file)})`);
  const state = YAML.parse(readText(file));
  state.gates ??= {};
  for (const g of GATES) state.gates[g] ??= { status: 'pending' };
  state.gate_notes ??= [];
  state.reviews ??= [];
  state.track_history ??= [];
  state.blockers ??= [];
  state.verify_fix_rounds ??= 0;
  state.last_fix_round_at ??= null;
  return state;
}

export const stateContent = (state) => YAML.stringify(state, { lineWidth: 0 });
export const saveState = (root, change, state) => writeAtomic([[statePath(root, change), stateContent(state)]]);

export function activeChanges(root) {
  const dir = changesDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((d) => d !== 'archive' && fs.existsSync(path.join(dir, d, '.medra.yaml'))).sort();
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

export function latestReport(root, change, stage) {
  const dir = path.join(changeDir(root, change), 'reviews');
  // A verify report carries its round as a `-r<N>` suffix; the highest round wins, and a file
  // without one (1.2 and earlier, or a document stage) ranks below any suffixed round.
  const round = (f) => Number(/-r(\d+)\.md$/.exec(f)?.[1] ?? 0);
  const files = walk(dir).filter((f) => f.endsWith('.md'))
    .map((f) => ({ file: f, ...parseReport(readText(f)), round: round(f), mtime: fs.statSync(f).mtimeMs }))
    .filter((r) => r.stage === stage)
    .sort((a, b) => a.round - b.round || a.mtime - b.mtime);
  return files.pop() ?? null;
}

/** The proposal's `**Security:**` value; a proposal without the line (before 1.4) is not-relevant. */
export function securityRelevance(root, change) {
  const text = readIf(path.join(changeDir(root, change), 'proposal.md'));
  return text !== null && parseProposal(text).security === 'relevant' ? 'relevant' : 'not-relevant';
}

/** Stage documents per gate (SPEC §5), as absolute paths in sorted order. */
export function stageDocuments(root, change, gate, state) {
  const dir = changeDir(root, change);
  const deltas = walk(path.join(dir, 'specs')).filter((f) => f.endsWith('.md'));
  const proposal = [path.join(dir, 'proposal.md'), ...deltas];
  const tasks = path.join(dir, 'tasks.md');
  // threat-model.md is filtered out below when absent, so plans approved before 1.4 keep their hash.
  const plan = [path.join(dir, 'plan.md'), path.join(dir, 'threat-model.md'), ...walk(path.join(dir, 'contracts'))];
  let files;
  if (gate === 'proposal') files = state.track === 'fast' ? [...proposal, tasks] : proposal;
  else if (gate === 'plan') files = plan;
  else if (gate === 'tasks') files = [tasks];
  else {
    const reports = ['verify', 'security'].map((stage) => latestReport(root, change, stage)).filter(Boolean);
    files = [...proposal, ...plan, tasks, ...reports.map((r) => r.file)];
  }
  return files.filter((f) => fs.existsSync(f)).sort();
}

/**
 * Hash over a gate's stage documents. Paths are relative to the change folder, so moving the
 * documents directory does not stale a gate. `legacyPrefix` reproduces the 1.0 hashes, which used
 * root-relative paths under medra/, for the layout migration.
 */
export function stageHash(root, change, gate, state, { legacyPrefix = null } = {}) {
  const dir = changeDir(root, change);
  const parts = stageDocuments(root, change, gate, state).map((f) => {
    const text = readText(f);
    const name = legacyPrefix ? `${legacyPrefix}/${rel(dir, f)}` : rel(dir, f);
    return `${name}\n${f.endsWith('tasks.md') ? tasksHashBasis(text) : text}`;
  });
  return sha256(parts.join('\n\0\n'));
}

export function gateStatus(root, change, state, gate) {
  if (state.track === 'fast' && (gate === 'plan' || gate === 'tasks')) return 'skipped';
  const g = state.gates[gate] ?? { status: 'pending' };
  if (g.status === 'approved' && g.hash !== stageHash(root, change, gate, state)) return 'stale';
  return g.status;
}

export const isApproved = (root, change, state, gate) => gateStatus(root, change, state, gate) === 'approved';

export function loadTasks(root, change) {
  const text = readIf(path.join(changeDir(root, change), 'tasks.md'));
  return text === null ? null : parseTasks(text);
}

export function nextTask(tasks, state) {
  const done = new Set(tasks.filter((t) => t.done).map((t) => t.id));
  const blocked = new Set(state.blockers.filter((b) => !b.resolved).map((b) => b.task));
  return tasks.find((t) => !t.done && !blocked.has(t.id) && t.after.every((a) => done.has(a))) ?? null;
}

/**
 * When the next runnable task is marked `[P]`, returns up to `max` runnable `[P]` tasks from the
 * same phase and kind (`[TEST]` vs implementation) so the agent can batch edits in one session turn.
 */
export function readyBatch(tasks, state, max = 3) {
  const first = nextTask(tasks, state);
  if (!first) return [];
  if (!first.parallel) return [first];
  const done = new Set(tasks.filter((t) => t.done).map((t) => t.id));
  const blocked = new Set(state.blockers.filter((b) => !b.resolved).map((b) => b.task));
  return tasks
    .filter((t) => !t.done && !blocked.has(t.id) && t.parallel && t.phase === first.phase && t.test === first.test && t.after.every((a) => done.has(a)))
    .slice(0, max);
}

/**
 * Detects reverse spec drift: capabilities with `**Paths:**` whose matching files were modified in
 * git (commits since the living spec was last updated, or working-tree edits) without an active change.
 */
export function specDrift(root) {
  const specs = loadLivingSpecs(root);
  const coveredByActive = new Set(
    activeChanges(root).flatMap((c) => Object.keys(loadDeltas(changeDir(root, c)))),
  );
  // `index` and `status` call this on every run, so it spawns git only for capabilities that can drift,
  // and diffs each distinct spec commit once (specs archived together share one).
  const watched = Object.entries(specs).filter(([cap, spec]) => spec.paths?.length && !coveredByActive.has(cap));
  if (!watched.length) return [];
  const statusOut = git(root, ['status', '--porcelain', '-uall']) ?? '';
  const dirtyFiles = statusOut.split('\n').filter(Boolean).map((l) => l.slice(3).trim().split(' -> ').pop());
  const diffSince = new Map();
  const drifted = [];
  for (const [cap, spec] of watched) {
    const specRel = rel(root, spec.file);
    const specSha = git(root, ['log', '-1', '--format=%H', '--', specRel]);
    if (specSha && !diffSince.has(specSha)) {
      diffSince.set(specSha, (git(root, ['diff', '--name-only', `${specSha}..HEAD`]) ?? '').split('\n').filter(Boolean));
    }
    const committedSince = specSha ? diffSince.get(specSha) : [];
    const candidates = [...new Set([...committedSince, ...dirtyFiles])]
      .filter((f) => f && !f.startsWith(`${DOCS_DIR}/`) && !f.startsWith('.agents/'));
    const isMatch = picomatch(spec.paths);
    const changed = candidates.filter((f) => isMatch(f)).sort();
    if (changed.length) {
      drifted.push({
        capability: cap,
        paths: spec.paths,
        changed_files: changed,
        since_commit: specSha ? specSha.slice(0, 7) : 'uncommitted',
      });
    }
  }
  return drifted;
}

/** Scenario IDs a change adds or modifies, or all living scenarios with `all`. */
export function changeScenarios(root, change) {
  const deltas = loadDeltas(changeDir(root, change));
  return Object.values(deltas).flatMap((d) => [...(d.ops.ADDED ?? []), ...(d.ops.MODIFIED ?? [])])
    .flatMap((b) => (b.scenarios ?? []).map((s) => s.id).filter(Boolean));
}

const SCENARIO_ID = /\b[A-Z][A-Z0-9]{1,9}-\d{3,}\.S\d+\b/g;

export function coverage(root, scenarioIds) {
  const config = loadConfig(root);
  const ig = ignore().add(['node_modules/', '.git/', `${DOCS_DIR}/changes/`, `${DOCS_DIR}/specs/`, '.agents/']);
  const gi = readIf(path.join(root, '.gitignore'));
  if (gi) ig.add(gi);
  const files = fg.sync(config.testing.paths, { cwd: root, dot: false, onlyFiles: true, unique: true })
    .filter((f) => !ig.ignores(f)).sort();
  const wanted = new Set(scenarioIds);
  const locations = {};
  for (const f of files) {
    let text;
    try { text = readText(path.join(root, f)); } catch { continue; }
    text.split('\n').forEach((line, i) => {
      for (const id of line.match(SCENARIO_ID) ?? []) {
        if (!wanted.has(id)) continue;
        locations[id] ??= [];
        if (locations[id].length < 3 && !locations[id].includes(`${f}:${i + 1}`)) locations[id].push(`${f}:${i + 1}`);
      }
    });
  }
  const uncovered = scenarioIds.filter((id) => !locations[id]);
  return { scenarios: scenarioIds.length, covered: scenarioIds.length - uncovered.length, uncovered, locations };
}

/**
 * Content hashes of every file the change touched since `diffBase` (tracked edits and untracked
 * files, outside docs/ and .agents/). Null when git cannot say, or when more than `max` files changed.
 */
export function snapshot(root, diffBase, { max = Infinity } = {}) {
  if (!diffBase || diffBase === 'none') return null;
  const tracked = git(root, ['-c', 'core.quotepath=off', 'diff', '--name-only', diffBase]);
  if (tracked === null) return null;
  const untracked = git(root, ['-c', 'core.quotepath=off', 'ls-files', '--others', '--exclude-standard']) ?? '';
  const files = [...new Set(`${tracked}\n${untracked}`.split('\n').map((f) => f.trim()).filter(Boolean))]
    .filter((f) => !f.startsWith(`${DOCS_DIR}/`) && !f.startsWith('.agents/')).sort();
  if (files.length > max) return null;
  const out = {};
  for (const f of files) {
    const abs = path.join(root, f);
    out[f] = fs.existsSync(abs) && fs.statSync(abs).isFile()
      ? crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
      : 'deleted';
  }
  return out;
}

/** One hash over the change's code as it is now, or null when git cannot say. */
export function fingerprint(root, state) {
  const snap = snapshot(root, state.diff_base);
  return snap === null ? null : sha256(JSON.stringify(Object.entries(snap)));
}

/** verify.suite: a green `medra suite` run on the code as it is now. Applies when a test command is configured. */
export function suiteFindings(root, change, state) {
  const { testing } = loadConfig(root);
  if (testing.mode === 'none' || !testing.command) return [];
  const remediation = `Run "medra suite ${change}"`;
  const s = state.suite;
  if (!s) return [finding('verify.suite', 'The full test suite has not been run for this change', { ref: change, remediation })];
  if (s.exit !== 0) return [finding('verify.suite', `The last full-suite run failed: "${s.command}" exited ${s.exit}`, { ref: change, remediation: `Fix the failure, then run "medra suite ${change}"` })];
  const now = fingerprint(root, state);
  const stale = s.fingerprint && now ? s.fingerprint !== now : Date.parse(s.at) < Date.parse(state.last_task_done_at ?? s.at);
  return stale ? [finding('verify.suite', 'Code changed after the last full-suite run', { ref: change, remediation })] : [];
}

const MERGE_FIX = {
  'missing-target': 'Another change removed or renamed this requirement in the living spec; rewrite the delta against the current spec through /medra:propose',
  'added-collision': 'Another change took this ID; move the requirement to the next free ID in the delta, the tasks and the tests through /medra:propose',
  'post-merge-invalid': 'Fix the delta block so the merged living spec validates',
};

/** verify.merge: the change's deltas merge into the living specs as they are now. */
export function mergeFindings(root, change) {
  return planMerge(root, changeDir(root, change)).conflicts.map((c) => finding('verify.merge',
    `${c.operation} ${c.id ?? c.capability ?? ''} would not merge (${c.problem})${c.message ? `: ${c.message}` : ''}`,
    { ref: c.id ?? c.capability ?? null, remediation: MERGE_FIX[c.problem] ?? null }));
}

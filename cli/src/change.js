// Change folders: state (.medra.yaml), stage documents and hashes, gate status, coverage.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import fg from 'fast-glob';
import ignore from 'ignore';
import picomatch from 'picomatch';
import { envError, readText, readIf, sha256, writeAtomic, rel, loadConfig, docsPath, DOCS_DIR, git } from './core.js';
import { tasksHashBasis, parseTasks, parseReport, parseProposal } from './documents.js';
import { loadDeltas, loadLivingSpecs } from './specs.js';

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
  const statusOut = git(root, ['status', '--porcelain', '-uall']) ?? '';
  const dirtyFiles = statusOut.split('\n').filter(Boolean).map((l) => l.slice(3).trim().split(' -> ').pop());
  const drifted = [];
  for (const [cap, spec] of Object.entries(specs)) {
    if (!spec.paths?.length || coveredByActive.has(cap)) continue;
    const specRel = rel(root, spec.file);
    const specSha = git(root, ['log', '-1', '--format=%H', '--', specRel]);
    const committedSince = specSha
      ? (git(root, ['diff', '--name-only', `${specSha}..HEAD`]) ?? '').split('\n').filter(Boolean)
      : [];
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

// Command implementations. Each returns the success payload; failures throw MedraError.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import {
  refused, envError, usageError, finding, errorsOf, readIf, readText, writeAtomic, rel, git, sha256,
  identity, today, nowIso, loadConfig, configWarnings, DEFAULT_CONFIG, CHANGE_NAME, ROMAN, listOpt, docsPath, docsRel, CONFIG_FILE,
} from './core.js';
import { parseConstitution, ratifyConstitution, parseTasks, tickTask, parseReport, parseArchiveIndex, ARCHIVE_INDEX_HEADER } from './documents.js';
import { loadLivingSpecs, loadDeltas } from './specs.js';
import { loadLearnings, saveLearnings, nextLearningId, learningsPath, renderLearnings, STAGES as LEARN_STAGES } from './learnings.js';
import { changeDir, loadState, saveState, activeChanges, gateStatus, isApproved, stageHash, GATES, loadTasks, nextTask, specDrift, coverage, changeScenarios, latestReport, securityRelevance, fingerprint } from './change.js';
import { changeFindings, projectFindings, STAGES } from './validate.js';
import { archiveIndexPath, nextTaskPayload, taskContext } from './context.js';
import { install } from './install.js';
import { fixChange } from './fix.js';

const constitutionPath = (root) => docsPath(root, 'constitution.md');
const constitutionOf = (root) => parseConstitution(readIf(constitutionPath(root)) ?? '');
const archiveSequence = (root) => parseArchiveIndex(readIf(archiveIndexPath(root))).length;

// ---------- init ----------

export function init(cwd, opts) {
  const root = path.resolve(cwd);
  const configFile = docsPath(root, CONFIG_FILE);
  const created = [];
  const existing = [];
  let config = DEFAULT_CONFIG;
  const plan = [];
  if (fs.existsSync(configFile)) existing.push(configFile);
  else {
    config = {
      ...DEFAULT_CONFIG,
      language: opts.language ?? DEFAULT_CONFIG.language,
      integrations: opts.integrations ? listOpt(opts.integrations) : DEFAULT_CONFIG.integrations,
      testing: { ...DEFAULT_CONFIG.testing, mode: opts.testingMode ?? 'tdd', command: opts.testingCommand ?? null },
    };
    if (!['tdd', 'test-after', 'none'].includes(config.testing.mode)) throw usageError(`Unknown testing mode "${config.testing.mode}"`);
    plan.push([configFile, YAML.stringify(config)]);
  }
  const files = [
    [constitutionPath(root), '**Status:** draft\n'],
    [learningsPath(root), renderLearnings([])],
    [archiveIndexPath(root), ARCHIVE_INDEX_HEADER],
  ];
  for (const [f, content] of files) (fs.existsSync(f) ? existing : plan).push(fs.existsSync(f) ? f : [f, content]);
  writeAtomic(plan);
  created.push(...plan.map(([f]) => f));
  for (const d of [docsPath(root, 'specs')]) if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); created.push(d); }
  if (fs.existsSync(configFile)) config = loadConfig(root);
  const result = { created: created.map((f) => rel(root, f)), existing: existing.map((f) => rel(root, f)), config };
  if (config.integrations.includes('antigravity')) result.antigravity = install(root, { scope: 'workspace' });
  return result;
}

// ---------- new / status / track ----------

export function newChange(root, change, { track = 'fast' }) {
  const findings = [];
  if (!CHANGE_NAME.test(change)) findings.push(finding('new.name', `"${change}" is not a kebab-case change name of 2-8 words`, { remediation: 'Use 2-8 kebab-case words, e.g. "add-user-auth"' }));
  if (!['fast', 'full'].includes(track)) throw usageError('--track must be fast or full');
  if (fs.existsSync(changeDir(root, change))) findings.push(finding('new.exists', `Change "${change}" already exists`, { remediation: 'Choose an unused change name or resume the existing change' }));
  if (constitutionOf(root).status !== 'ratified') findings.push(finding('new.constitution', 'The constitution is not ratified; run /medra:init', { remediation: 'Run "medra constitution ratify --note Initial" to ratify the constitution' }));
  if (findings.length) throw refused(findings);
  const warnings = parseArchiveIndex(readIf(archiveIndexPath(root))).filter((r) => r.change === change)
    .map((r) => finding('new.archived-name', `An archived change #${r.sequence} has the same name`, { severity: 'warning' }));
  const dir = changeDir(root, change);
  fs.mkdirSync(path.join(dir, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'reviews'), { recursive: true });
  const state = {
    change, created: today(), track, phase: 'proposed', diff_base: git(root, ['rev-parse', '--short', 'HEAD']) ?? 'none',
    gates: Object.fromEntries(GATES.map((g) => [g, { status: 'pending' }])), gate_notes: [], reviews: [], track_history: [], blockers: [],
  };
  saveState(root, change, state);
  return { change, path: rel(root, dir), track, findings: warnings };
}

export function status(root, change) {
  if (!change) {
    const c = constitutionOf(root);
    const store = loadLearnings(root);
    const active = store.entries.filter((e) => e.section === 'Active').length;
    const drift = specDrift(root);
    return {
      project: {
        constitution: { status: c.status ?? 'missing', version: c.version ?? null },
        capabilities: Object.keys(loadLivingSpecs(root)).length,
        learnings: { active, over_budget: active > loadConfig(root).learning.max_active },
      },
      changes: activeChanges(root).map((name) => { const s = loadState(root, name); return { name, track: s.track, phase: s.phase }; }),
      ...(drift.length ? { drift } : {}),
    };
  }
  const state = loadState(root, change);
  const tasks = loadTasks(root, change)?.tasks ?? [];
  const next = nextTask(tasks, state);
  const last = state.reviews[state.reviews.length - 1];
  const sec = latestReport(root, change, 'security');
  return {
    change, track: state.track, phase: state.phase, security: securityRelevance(root, change),
    gates: Object.fromEntries(GATES.map((g) => [g, { status: gateStatus(root, change, state, g), by: state.gates[g]?.by ?? null, at: state.gates[g]?.at ?? null }])),
    tasks: { total: tasks.length, done: tasks.filter((t) => t.done).length, next: next ? next.id : null },
    blockers_open: state.blockers.filter((b) => !b.resolved).length,
    reviews: state.reviews.length,
    last_review: last ? { stage: last.stage, verdict: last.verdict } : null,
    last_security: sec ? { path: rel(root, sec.file), round: sec.round, verdict: sec.verdict } : null,
  };
}

export function driftCmd(root) {
  return { drifted: specDrift(root) };
}

export function track(root, change, to, { reason }) {
  if (!['fast', 'full'].includes(to)) throw usageError('Track must be fast or full');
  if (!reason) throw usageError('--reason is required');
  const state = loadState(root, change);
  if (state.track === to) return { track: to, phase: state.phase };
  if (to === 'fast' && isApproved(root, change, state, 'plan')) throw refused([finding('track.plan-approved', 'Cannot switch to fast after the plan gate is approved')]);
  state.track_history.push({ from: state.track, to, at: nowIso(), reason });
  state.track = to;
  if (to === 'full') {
    state.gates.plan = { status: 'pending' };
    state.gates.tasks = { status: 'pending' };
    if (['proposed', 'tasked', 'implementing'].includes(state.phase)) state.phase = 'proposed';
    // The proposal hash on the fast track covered tasks.md; re-hash so an approved proposal stays approved.
    if (state.gates.proposal.status === 'approved') state.gates.proposal.hash = stageHash(root, change, 'proposal', state);
  }
  saveState(root, change, state);
  return { track: state.track, phase: state.phase };
}

// ---------- validate / gate / review ----------

export function validate(root, change, { stage, project }) {
  let findings;
  if (project) findings = projectFindings(root, project);
  else {
    if (!STAGES.includes(stage)) throw usageError(`--stage must be one of ${STAGES.join(', ')}`);
    findings = changeFindings(root, change, stage);
  }
  findings.push(...configWarnings(root));
  if (errorsOf(findings).length) throw refused(findings, `${errorsOf(findings).length} validation error(s)`);
  return { findings };
}

const GATE_PHASE = { plan: 'planned', tasks: 'tasked', verify: 'verified' };

export function gate(root, change, name, { approve, requestChanges, note, by }) {
  if (!GATES.includes(name)) throw usageError(`Gate must be one of ${GATES.join(', ')}`);
  if (!!approve === !!requestChanges) throw usageError('Pass exactly one of --approve or --request-changes');
  const state = loadState(root, change);
  const who = identity(root, by);
  if (requestChanges) {
    if (!note) throw usageError('--request-changes requires --note');
    const prev = state.gates[name] ?? {};
    state.gates[name] = { status: 'changes-requested', by: who, at: nowIso(), last_approved_at: prev.status === 'approved' ? prev.at : prev.last_approved_at ?? null };
    state.gate_notes.push({ gate: name, by: who, at: nowIso(), note });
    saveState(root, change, state);
    return { gate: name, status: 'changes-requested', phase: state.phase };
  }
  const pre = [];
  if (state.track === 'fast' && (name === 'plan' || name === 'tasks')) pre.push(finding('gate.track', `The fast track has no ${name} gate`, { remediation: `Switch to track full via "medra track ${change} full --reason <text>" to use gate ${name}` }));
  if (name === 'plan' && !isApproved(root, change, state, 'proposal')) pre.push(finding('gate.prerequisite', 'Gate proposal must be approved first', { remediation: 'Approve gate proposal before approving plan gate' }));
  if (name === 'tasks' && !isApproved(root, change, state, 'plan')) pre.push(finding('gate.prerequisite', 'Gate plan must be approved first', { remediation: 'Approve gate plan before approving tasks gate' }));
  if (name === 'proposal' && state.track === 'fast' && !fs.existsSync(path.join(changeDir(root, change), 'tasks.md'))) pre.push(finding('gate.prerequisite', 'The fast-track proposal gate covers tasks.md, which is missing', { remediation: 'Create tasks.md before approving the fast-track proposal gate' }));
  if (name === 'verify') {
    const prior = state.track === 'full' ? 'tasks' : 'proposal';
    if (!isApproved(root, change, state, prior)) pre.push(finding('gate.prerequisite', `Gate ${prior} must be approved first`, { remediation: `Approve gate ${prior} before approving gate verify` }));
  }
  if (pre.length) throw refused(pre);
  const findings = changeFindings(root, change, name);
  if (errorsOf(findings).length) throw refused(findings, 'The stage does not validate');
  state.gates[name] = { status: 'approved', by: who, at: nowIso(), hash: stageHash(root, change, name, state), note: note ?? null };
  state.phase = name === 'proposal' ? (state.track === 'fast' ? 'tasked' : 'proposed') : GATE_PHASE[name];
  saveState(root, change, state);
  return { gate: name, status: 'approved', phase: state.phase };
}

export function review(root, change, { report, by }) {
  const file = path.resolve(root, report);
  const text = readIf(file);
  if (text === null) throw envError(`Report ${report} not found`);
  const r = parseReport(text);
  const verdicts = ['approve', 'request-changes', 'comment', 'pass', 'pass-with-findings', 'fail'];
  const f = [];
  if (!['proposal', 'plan', 'tasks', 'verify'].includes(r.stage)) f.push(finding('review.report', '**Stage:** must be proposal, plan, tasks or verify', { file: report }));
  if (!verdicts.includes(r.verdict)) f.push(finding('review.report', `**Verdict:** must be one of ${verdicts.join(', ')}`, { file: report }));
  if (!r.counts) f.push(finding('review.report', '**Counts:** must read "critical <n> · major <n> · minor <n>"', { file: report }));
  if (f.length) throw refused(f);
  const state = loadState(root, change);
  const who = identity(root, by);
  state.reviews.push({ stage: r.stage, by: who, at: nowIso(), verdict: r.verdict, report: rel(changeDir(root, change), file) });
  if (r.verdict === 'request-changes') state.gate_notes.push({ gate: r.stage, by: who, at: nowIso(), report: rel(changeDir(root, change), file) });
  saveState(root, change, state);
  return { stage: r.stage, verdict: r.verdict };
}

// ---------- tasks ----------

// A verbose test run must not be cut off: Node's 1 MB default kills the command and fakes a failure.
const RUN_BUFFER = 64 * 1024 * 1024;

const ALLOWED_KINDS = {
  tdd: { test: ['red'], other: ['green'] },
  'test-after': { test: ['green'], other: ['green', 'manual'] },
  none: { test: [], other: ['manual'] },
};

/** Collects existing test files named in backticks in a [TEST] task or covering its requirement scenarios. */
function testFilesForTask(root, change, task) {
  const fromDesc = [...task.description.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]).filter((f) => {
    try {
      return fs.statSync(path.join(root, f)).isFile();
    } catch {
      return false;
    }
  });
  const deltas = loadDeltas(changeDir(root, change));
  const reqSet = new Set(task.reqs);
  const sids = Object.values(deltas).flatMap((d) => [...(d.ops.ADDED ?? []), ...(d.ops.MODIFIED ?? [])])
    .filter((b) => reqSet.has(b.id))
    .flatMap((b) => (b.scenarios ?? []).map((s) => s.id).filter(Boolean));
  const fromCov = sids.length
    ? Object.values(coverage(root, sids).locations).flat().map((loc) => loc.replace(/:\d+$/, ''))
    : [];
  return [...new Set([...fromDesc, ...fromCov])].sort();
}

export function sanitizeTestOutput(stdout = '', stderr = '', maxLines = 8) {
  const raw = `${stdout ?? ''}\n${stderr ?? ''}`;
  const stripped = raw.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '');
  const lines = stripped.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';

  const isNoise = (l) =>
    /^npm (notice|warn|info)/i.test(l) ||
    /^npm error (code|path|command failed|A complete log of this run)/i.test(l) ||
    /^npm error$/i.test(l) ||
    /^\s*at\s+node:internal\//.test(l) ||
    /^\[.*\]\s*$/.test(l);

  const filtered = lines.filter((l) => !isNoise(l));
  const pool = filtered.length ? filtered : lines;

  const failurePatterns = [
    /(?:AssertionError|Assertion failed|failed with|Expected:|Received:|FAIL|✕|✖|Error:|TypeError:|ReferenceError:)/i,
  ];
  const firstFailIdx = pool.findIndex((l) => failurePatterns.some((p) => p.test(l)));

  const slice = firstFailIdx >= 0
    ? pool.slice(firstFailIdx, firstFailIdx + maxLines)
    : pool.slice(-maxLines);

  return slice.map((l) => (l.length > 250 ? `${l.slice(0, 247)}...` : l)).join('\n');
}

export function taskDone(root, change, id, { run, evidence, kind, allowTestEdit }) {
  if (!!run === !!evidence) throw usageError('Pass exactly one of --run or --evidence');
  const state = loadState(root, change);
  const file = path.join(changeDir(root, change), 'tasks.md');
  const text = readIf(file);
  if (text === null) throw envError('tasks.md is missing');
  const { tasks } = parseTasks(text);
  const t = tasks.find((x) => x.id === id);
  if (!t) throw refused([finding('task.unknown', `No task ${id}`, { ref: id, remediation: 'Verify task ID against tasks.md' })]);
  if (t.done) throw refused([finding('task.done', `${id} is already done`, { ref: id, remediation: 'Task is already marked done in tasks.md' })]);
  const pending = t.after.filter((a) => !tasks.find((x) => x.id === a)?.done);
  if (pending.length) throw refused([finding('task.after', `${id} is after ${pending.join(', ')}, not done yet`, { ref: id, remediation: `Complete prerequisite tasks first: ${pending.join(', ')}` })]);
  const config = loadConfig(root);
  const mode = config.testing.mode;
  // In tdd, a task tied to no requirement and no mitigation (setup, documentation) has no test of
  // its own to turn green, so it may also be recorded as a manual check.
  const untraced = !t.test && !t.reqs.length && !/\bM-\d{2,}\b/.test(`${t.description} ${t.verify}`);
  const allowed = mode === 'tdd' && untraced ? ['green', 'manual'] : ALLOWED_KINDS[mode][t.test ? 'test' : 'other'];
  if (!allowed.length) throw refused([finding('task.kind', `[TEST] tasks are not used in testing mode ${mode}`, { ref: id, remediation: `In testing mode "${mode}", remove [TEST] flag or adjust config-flow.yaml` })]);
  // `red` and `green` are claims about a run, so only the CLI's own run can record them.
  const k = kind ?? (evidence && allowed.includes('manual') ? 'manual' : allowed[0]);
  if (!allowed.includes(k)) throw refused([finding('task.kind', `${id} needs ${allowed.join(' or ')} evidence in mode ${mode}`, { ref: id, remediation: `Pass --kind ${allowed[0]}` })]);
  if (evidence && k !== 'manual') {
    throw refused([finding('task.evidence', `${id} needs --run for ${k} evidence; --evidence records only a manual check`, { ref: id, remediation: allowed.includes('manual') ? `Pass --run "<focused command>", or --kind manual when the task has no automated check` : `Pass --run "<focused command>" so the CLI observes the ${k} result itself` })]);
  }
  let testEdited = false;
  if (k === 'green' && !t.test && state.test_hashes) {
    const seen = new Set();
    const queue = [...t.after];
    while (queue.length) {
      const dep = queue.pop();
      if (seen.has(dep)) continue;
      seen.add(dep);
      const dt = tasks.find((x) => x.id === dep);
      if (dt) queue.push(...dt.after);
    }
    for (const dt of tasks) if (dt.test && dt.reqs.some((r) => t.reqs.includes(r))) seen.add(dt.id);
    const tampered = [];
    for (const tid of seen) {
      for (const [f, hash] of Object.entries(state.test_hashes[tid] ?? {})) {
        const cur = readIf(path.join(root, f));
        if (cur === null || sha256(cur) !== hash) {
          testEdited = true;
          if (!allowTestEdit) {
            tampered.push(finding('task.test-tampered', `${id} modified or deleted test file "${f}" locked at red by ${tid} (pass --allow-test-edit if intentional)`, { file: f, ref: id, remediation: `Revert edits to "${f}" or pass --allow-test-edit if modification was intentional` }));
          }
        }
      }
    }
    if (tampered.length) throw refused(tampered);
  }
  let detail;
  if (run) {
    const res = spawnSync(run, { cwd: root, shell: true, encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: RUN_BUFFER });
    if (res.error && res.error.code === 'ETIMEDOUT') throw envError(`Command timed out after 10 minutes: ${run}`);
    const code = res.status ?? 1;
    if (code === 127) throw envError(`Command not found: ${run}`);
    const sanitized = sanitizeTestOutput(res.stdout, res.stderr);
    if (k === 'red' && code === 0) throw refused([finding('task.red', `${id} needs a failing run (red), but the command exited 0`, { ref: id, remediation: 'Ensure test fails on unimplemented behavior before marking kind red' })], sanitized || 'Command exited 0');
    if (k === 'green' && code !== 0) throw refused([finding('task.green', `${id} needs a passing run (green), but the command exited ${code}`, { ref: id, remediation: 'Fix code to make tests pass (exit 0) before checkpointing green' })], sanitized || `Command exited ${code}`);
    if (k === 'green' && !t.test) {
      const checks = config.testing.checks ?? [];
      for (const chk of Array.isArray(checks) ? checks : [checks]) {
        if (!chk) continue;
        const cres = spawnSync(chk, { cwd: root, shell: true, encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: RUN_BUFFER });
        if (cres.error && cres.error.code === 'ETIMEDOUT') throw envError(`Check timed out after 10 minutes: ${chk}`);
        const ccode = cres.status ?? 1;
        if (ccode !== 127 && ccode !== 0) {
          const csanitized = sanitizeTestOutput(cres.stdout, cres.stderr);
          throw refused([finding('task.check', `${id} passed tests, but check "${chk}" exited ${ccode}`, { ref: id, remediation: `Fix static check issues for "${chk}" to pass (exit 0)` })], csanitized || `Check exited ${ccode}`);
        }
        if (ccode === 127) throw envError(`Check command not found: ${chk}`);
      }
    }
    const tailLines = (sanitized || '').split('\n').filter(Boolean);
    detail = `\`${run.replace(/`/g, "'")}\` exit ${code}${code !== 0 && tailLines.length ? ` — "${tailLines.slice(-3).join(' | ').replace(/"/g, "'").slice(0, 300)}"` : ''}`;
  } else detail = evidence.replace(/\n/g, ' ');
  if (testEdited) detail += ' [test-edited]';
  if (k === 'red' && t.test) {
    const files = testFilesForTask(root, change, t);
    if (files.length) {
      state.test_hashes ??= {};
      state.test_hashes[id] = Object.fromEntries(files.map((f) => [f, sha256(readText(path.join(root, f)))]));
    }
  }
  writeAtomic([[file, tickTask(text, id, `- evidence ${k} ${today()}: ${detail}`)]]);
  if (['tasked', 'proposed'].includes(state.phase)) state.phase = 'implementing';
  state.last_task_done_at = nowIso();
  saveState(root, change, state);
  const { next_task, parallel_batch, remaining } = nextTaskPayload(root, change, state);
  return { task: id, kind: k, remaining, next: next_task ? next_task.id : null, next_task, ...(parallel_batch ? { parallel_batch } : {}) };
}

// ---------- suite ----------

/**
 * Runs the whole test suite (`testing.command`, unfocused) and every `testing.checks` command, and
 * records the outcome with a fingerprint of the change's code, so `verify.suite` can tell a run on
 * this exact code from one that predates an edit.
 */
export function suite(root, change) {
  const state = loadState(root, change);
  const { testing } = loadConfig(root);
  const checks = Array.isArray(testing.checks) ? testing.checks : [testing.checks];
  const commands = [testing.mode !== 'none' ? testing.command : null, ...checks].filter(Boolean);
  if (!commands.length) return { ran: [], skipped: true };
  for (const command of commands) {
    const res = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', timeout: 30 * 60 * 1000, maxBuffer: RUN_BUFFER });
    if (res.error && res.error.code === 'ETIMEDOUT') throw envError(`Command timed out after 30 minutes: ${command}`);
    const code = res.status ?? 1;
    if (code === 127) throw envError(`Command not found: ${command}`);
    if (code !== 0) {
      state.suite = { at: nowIso(), exit: code, command };
      saveState(root, change, state);
      throw refused([finding('suite.failed', `"${command}" exited ${code}`, { ref: change, remediation: 'Fix the failure and run the suite again' })], sanitizeTestOutput(res.stdout, res.stderr, 20) || `Command exited ${code}`);
    }
  }
  state.suite = { at: nowIso(), exit: 0, commands, fingerprint: fingerprint(root, state) };
  saveState(root, change, state);
  return { ran: commands, exit: 0 };
}

export function taskBlock(root, change, id, { note }, unblock = false) {
  const state = loadState(root, change);
  if (!loadTasks(root, change)?.tasks.find((t) => t.id === id)) throw refused([finding('task.unknown', `No task ${id}`, { ref: id })]);
  if (unblock) {
    const open = state.blockers.filter((b) => b.task === id && !b.resolved);
    if (!open.length) throw refused([finding('task.unblock', `${id} has no open blocker`, { ref: id })]);
    for (const b of open) { b.resolved = true; b.resolved_at = nowIso(); }
  } else {
    if (!note) throw usageError('--note is required');
    state.blockers.push({ task: id, at: nowIso(), note, resolved: false });
  }
  saveState(root, change, state);
  const { next_task, parallel_batch, remaining } = nextTaskPayload(root, change, state);
  return { task: id, blocked: !unblock, remaining, next: next_task ? next_task.id : null, next_task, ...(parallel_batch ? { parallel_batch } : {}) };
}

export function taskContextCmd(root, change, taskId) {
  return taskContext(root, change, taskId);
}

export function fixCmd(root, change, opts = {}) {
  return fixChange(root, change, opts.file);
}

// ---------- coverage ----------

export function coverageCmd(root, change, { all }) {
  if (all) {
    const ids = Object.values(loadLivingSpecs(root)).flatMap((s) => s.requirements.flatMap((r) => (r.scenarios ?? []).map((x) => x.id).filter(Boolean)));
    return coverage(root, ids);
  }
  if (!change) throw usageError('Pass a change name or --all');
  loadState(root, change);
  return coverage(root, changeScenarios(root, change));
}

// ---------- constitution ----------

export function ratify(root, { bump, note, source = 'init', by }) {
  if (!note) throw usageError('--note is required');
  const file = constitutionPath(root);
  const text = readIf(file);
  if (text === null) throw envError(`${docsRel('constitution.md')} is missing`);
  const findings = projectFindings(root, 'constitution');
  if (errorsOf(findings).length) throw refused(findings);
  const c = parseConstitution(text);
  const first = c.status !== 'ratified';
  let version = '1.0';
  if (!first) {
    if (!['major', 'minor'].includes(bump)) throw usageError('An amendment requires --bump major|minor');
    const [ma, mi] = c.version.split('.').map(Number);
    version = bump === 'major' ? `${ma + 1}.0` : `${ma}.${mi + 1}`;
  }
  const changeText = by ? `${note} (${identity(root, by)})` : note;
  writeAtomic([[file, ratifyConstitution(text, { version, date: today(), change: changeText, source, first })]]);
  return { version };
}

// ---------- learn ----------

export function learn(root, action, args, opts) {
  const store = loadLearnings(root);
  const entries = store.entries;
  const config = loadConfig(root).learning;
  const seq = archiveSequence(root);
  const get = (id) => {
    const e = entries.find((x) => x.id === id);
    if (!e) throw refused([finding('learn.unknown', `No learning ${id}`, { ref: id })]);
    return e;
  };
  const active = () => entries.filter((e) => e.section === 'Active');
  switch (action) {
    case 'add': {
      if (!['lesson', 'preference'].includes(opts.type)) throw usageError('--type must be lesson or preference');
      for (const k of ['title', 'statement', 'change']) if (!opts[k]) throw usageError(`--${k} is required`);
      const stages = listOpt(opts.stages);
      const bad = stages.filter((s) => !LEARN_STAGES.includes(s));
      if (bad.length) throw usageError(`Unknown stage(s): ${bad.join(', ')}`);
      const e = {
        id: nextLearningId(entries), type: opts.type, title: opts.title, statement: opts.statement, section: 'Active',
        scope: { capabilities: listOpt(opts.capabilities), paths: listOpt(opts.paths), stages },
        evidence: [opts.change], occurrences: 1, lastSeen: seq,
      };
      entries.push(e);
      saveLearnings(root, entries);
      return { id: e.id };
    }
    case 'bump': {
      if (!opts.change) throw usageError('--change is required');
      const e = get(args[0]);
      e.occurrences += 1;
      if (!e.evidence.includes(opts.change)) e.evidence.push(opts.change);
      e.lastSeen = seq;
      saveLearnings(root, entries);
      return { id: e.id, occurrences: e.occurrences };
    }
    case 'merge': {
      if (!opts.into) throw usageError('--into is required');
      const src = get(args[0]);
      const dst = get(opts.into);
      dst.occurrences += src.occurrences;
      dst.evidence = [...new Set([...dst.evidence, ...src.evidence])];
      dst.lastSeen = Math.max(dst.lastSeen, src.lastSeen);
      src.section = 'Retired';
      src.retired = `merged into ${dst.id}`;
      saveLearnings(root, entries);
      return { id: src.id, into: dst.id };
    }
    case 'retire': {
      if (!opts.reason) throw usageError('--reason is required');
      const e = get(args[0]);
      e.section = 'Retired';
      e.retired = opts.reason;
      saveLearnings(root, entries);
      return { id: e.id };
    }
    case 'promote': {
      if (!opts.article || !ROMAN.includes(opts.article)) throw usageError('--article must be a Roman numeral');
      const e = get(args[0]);
      const c = constitutionOf(root);
      if (!c.articles.some((a) => a.roman === opts.article)) throw refused([finding('learn.article', `The constitution has no Article ${opts.article}`)]);
      e.section = 'Promoted';
      e.promoted = `Article ${opts.article} (v${c.version})`;
      saveLearnings(root, entries);
      return { id: e.id, article: opts.article };
    }
    case 'status': {
      const a = active();
      return {
        active: a.length, max_active: config.max_active, over_budget: a.length > config.max_active,
        stale: a.filter((e) => seq - e.lastSeen >= config.stale_after).map((e) => e.id).slice(0, config.max_active),
        candidates: a.filter((e) => e.type === 'lesson' && e.occurrences >= config.promote_after).length,
      };
    }
    case 'candidates':
      return { candidates: active().filter((e) => e.type === 'lesson' && e.occurrences >= config.promote_after).map(({ id, title, occurrences }) => ({ id, title, occurrences })) };
    default:
      throw usageError(`Unknown learn action "${action}"`);
  }
}

// ---------- update ----------

export function update(root) {
  const config = loadConfig(root);
  if (!config.integrations.includes('antigravity')) return { installed: 0, note: 'No antigravity integration; Claude Code updates through /plugin update' };
  return install(root, { scope: 'workspace', force: false });
}

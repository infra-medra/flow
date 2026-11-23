// Dispatch payloads for the three handoff contracts (SPEC §8.16): the sender's pre-dispatch checks,
// the round and report paths, and the files changed since the receiver's previous round.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import picomatch from 'picomatch';
import { refused, usageError, finding, errorsOf, readText, rel, today, listOpt, loadConfig } from './core.js';
import { changeDir, loadState, saveState, loadTasks, securityRelevance, snapshot, suiteFindings, mergeFindings } from './change.js';
import { changeFindings } from './validate.js';
import { parseReport } from './documents.js';

export const CONTRACTS = {
  check: { agent: 'reviewer', handoff: 'handoffs/implementer-reviewer.md', kind: 'verify', prefix: 'F' },
  audit: { agent: 'security', handoff: 'handoffs/implementer-security.md', kind: 'security', prefix: 'S' },
  'threat-model': { agent: 'security', handoff: 'handoffs/author-security.md' },
};

// Above this many changed files the list costs more than it saves; the receiver does a full pass.
const MAX_CHANGED = 100;
// .medra.yaml is committed with the project, so a change touching more files than this keeps no
// snapshot; its rounds are full passes.
const MAX_SNAPSHOT = 300;
const ROUND_FILE = /(?:^|-)(verify|security)-(agent|reviewer|security)-r(\d+)\.md$/;

/** Round reports in reviews/, as { kind, round, file }, by file name. */
function roundReports(root, change) {
  const dir = path.join(changeDir(root, change), 'reviews');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => {
    const m = ROUND_FILE.exec(name);
    if (!m) return null;
    const kind = m[2] === 'security' ? 'security' : m[2] === 'reviewer' ? 'verify' : m[1];
    return { kind, round: Number(m[3]), file: path.join(dir, name) };
  }).filter(Boolean);
}

const changedBetween = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter((f) => before[f] !== after[f]).sort();

/**
 * Non-throwing verify round preparation shared between `medra handoff` and `medra step`.
 * Returns `{ ok: true, findings: [], payload }` or `{ ok: false, findings, payload: null }`.
 */
export function prepareVerifyRound(root, change, contract, opts = {}) {
  const spec = CONTRACTS[contract];
  if (!spec || !spec.kind) throw usageError(`Unknown round handoff "${contract}"; use check or audit`);
  const state = opts.state ?? loadState(root, change);
  const forStep = opts.forStep === true;
  const findings = [];

  if (!forStep) {
    const tasks = loadTasks(root, change)?.tasks ?? [];
    if (!tasks.length || tasks.some((t) => !t.done)) {
      findings.push(finding('handoff.tasks', 'Every task must be done before the check', { remediation: `Finish the open tasks with /medra:apply ${change}` }));
    }
    if (contract === 'check') findings.push(...errorsOf(changeFindings(root, change, 'tasks')));
    if (contract === 'audit' && securityRelevance(root, change) !== 'relevant') {
      findings.push(finding('handoff.security', 'The proposal does not say **Security:** relevant; this change gets no audit'));
    }
  }

  // A receiver's round is wasted on code whose suite is red or whose deltas no longer merge.
  findings.push(...suiteFindings(root, change, state), ...mergeFindings(root, change));
  const reports = roundReports(root, change);
  const round = Math.max(0, ...reports.map((r) => r.round)) + 1;
  const previous = reports.filter((r) => r.kind === spec.kind).sort((a, b) => a.round - b.round).pop() ?? null;
  const fixedIds = forStep ? [] : listOpt(opts.fixed);
  if (fixedIds.length) {
    if (!previous) findings.push(finding('handoff.fixed', '--fixed needs an earlier report of this receiver', { remediation: 'Omit --fixed on the first round' }));
    else {
      const text = readText(previous.file);
      for (const id of fixedIds) {
        if (!new RegExp(`^${spec.prefix}-\\d{2,}$`).test(id) || !new RegExp(`\\b${id}\\b`).test(text)) {
          findings.push(finding('handoff.fixed', `${id} is not a finding of ${rel(root, previous.file)}`, { ref: id, remediation: `Pass only ${spec.prefix}-NN IDs that the previous report lists` }));
        }
      }
    }
  }
  if (findings.length) return { ok: false, findings, payload: null };

  const dir = changeDir(root, change);
  if (!forStep) fs.mkdirSync(path.join(dir, 'reviews'), { recursive: true });
  const reportName = forStep
    ? `${today()}-verify-${spec.agent}-r${round}.md`
    : `${today()}-${spec.kind}-agent-r${round}.md`;
  const diffBase = opts.diffBase ?? state.diff_base ?? 'none';
  const payload = {
    change,
    change_path: rel(root, dir),
    diff_base: diffBase,
    report_path: rel(root, path.join(dir, 'reviews', reportName)),
    round,
  };
  if (previous) {
    payload.previous_report = rel(root, previous.file);
    if (!forStep) payload.fixed_findings = fixedIds;
  }
  // The snapshot of this round is what the next round is compared against. Rounds older than the
  // previous report are dropped, so the state keeps at most two snapshots per contract.
  const { testing } = loadConfig(root);
  if (testing.mode !== 'none' && testing.command) payload.suite = 'green';
  const now = snapshot(root, diffBase, { max: MAX_SNAPSHOT });
  const kept = state.handoff_snapshots?.[contract] ?? {};
  if (previous && now && kept[previous.round]) {
    const changed = changedBetween(kept[previous.round], now);
    if (changed.length <= MAX_CHANGED) payload.changed_since_previous = changed;
  }
  if (now) {
    const next = previous && kept[previous.round] ? { [previous.round]: kept[previous.round] } : {};
    next[round] = now;
    const prevSaved = state.handoff_snapshots?.[contract];
    const unchanged = prevSaved
      && Object.keys(prevSaved).length === Object.keys(next).length
      && Object.entries(next).every(([k, v]) => JSON.stringify(prevSaved[k]) === JSON.stringify(v));
    if (!unchanged) {
      state.handoff_snapshots = { ...(state.handoff_snapshots ?? {}), [contract]: next };
      saveState(root, change, state);
    }
  }
  return { ok: true, findings: [], payload };
}

function roundPayload(root, change, contract, state, opts) {
  const res = prepareVerifyRound(root, change, contract, { ...opts, state, forStep: false });
  if (!res.ok) throw refused(res.findings);
  return res.payload;
}

function threatModelPayload(root, change, state, { focus }) {
  const dir = changeDir(root, change);
  const findings = [];
  if (state.track !== 'full') findings.push(finding('handoff.track', 'A threat model needs the full track; on the fast track the security work happens at verify'));
  if (securityRelevance(root, change) !== 'relevant') findings.push(finding('handoff.security', 'The proposal does not say **Security:** relevant; this change gets no threat model'));
  if (!fs.existsSync(path.join(dir, 'plan.md'))) findings.push(finding('handoff.plan', 'plan.md is missing; draft the plan before the threat model'));
  findings.push(...errorsOf(changeFindings(root, change, 'proposal')));
  if (findings.length) throw refused(findings);
  const payload = {
    change,
    change_path: rel(root, dir),
    plan_path: rel(root, path.join(dir, 'plan.md')),
    threat_model_path: rel(root, path.join(dir, 'threat-model.md')),
  };
  if (focus) payload.focus = String(focus).replace(/\s+/g, ' ').trim();
  if (fs.existsSync(path.join(dir, 'threat-model.md'))) payload.revision = true;
  return payload;
}

export function handoff(root, change, contract, opts = {}) {
  const spec = CONTRACTS[contract];
  if (!spec) throw usageError(`Unknown handoff "${contract}"; use check, audit or threat-model`);
  if (contract === 'threat-model' && opts.fixed) throw usageError('--fixed applies to check and audit');
  if (contract !== 'threat-model' && opts.focus) throw usageError('--focus applies to threat-model');
  const state = loadState(root, change);
  const payload = contract === 'threat-model' ? threatModelPayload(root, change, state, opts) : roundPayload(root, change, contract, state, opts);
  return { contract, agent: spec.agent, handoff: spec.handoff, payload };
}

/** The payload as the YAML block the receiver's contract defines, with its lists inline. */
export function handoffText(res) {
  const doc = new YAML.Document(res.payload);
  for (const key of ['fixed_findings', 'changed_since_previous']) {
    const node = doc.get(key, true);
    if (YAML.isSeq(node)) node.flow = true;
  }
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/** Newest mtime of the change's documents, ignoring round reports and CLI state. */
function changeDocsMtime(root, change) {
  const dir = changeDir(root, change);
  let newest = 0;
  const visit = (cur) => {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) { if (!(cur === dir && e.name === 'reviews')) visit(full); }
      else if (e.isFile() && !(cur === dir && e.name === '.medra.yaml')) newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  };
  if (fs.existsSync(dir)) visit(dir);
  return newest;
}

/**
 * Why a verify round can reuse the receiver's previous report instead of dispatching it, or null.
 * Deterministic and conservative: the previous report must parse, the change documents must be
 * untouched since it, and either no code changed or (security only) only tests changed after a
 * non-failing audit.
 */
export function carryReason(root, change, contract, payload) {
  if (!payload?.previous_report || payload.changed_since_previous === undefined) return null;
  const prevFile = path.join(root, payload.previous_report);
  if (!fs.existsSync(prevFile)) return null;
  const prev = parseReport(readText(prevFile));
  if (!prev.verdict || !prev.counts) return null;
  if (changeDocsMtime(root, change) > fs.statSync(prevFile).mtimeMs) return null;
  const changed = payload.changed_since_previous;
  if (changed.length === 0) return 'no code changed since the previous report';
  if (contract !== 'audit' || prev.verdict === 'fail') return null;
  const isTest = picomatch(loadConfig(root).testing.paths ?? [], { dot: true });
  return changed.every((f) => isTest(f)) ? 'only test files changed since a non-failing security report' : null;
}

// Dispatch payloads for the three handoff contracts (SPEC §8.16): the sender's pre-dispatch checks,
// the round and report paths, and the files changed since the receiver's previous round.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import { refused, usageError, finding, errorsOf, readText, rel, git, today, listOpt, DOCS_DIR } from './core.js';
import { changeDir, loadState, saveState, loadTasks, securityRelevance } from './change.js';
import { changeFindings } from './validate.js';

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
const ROUND_FILE = /-(verify|security)-agent-r(\d+)\.md$/;

/** Round reports in reviews/, as { kind, round, file }, by file name. */
function roundReports(root, change) {
  const dir = path.join(changeDir(root, change), 'reviews');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => {
    const m = ROUND_FILE.exec(name);
    return m ? { kind: m[1], round: Number(m[2]), file: path.join(dir, name) } : null;
  }).filter(Boolean);
}

/**
 * Content hashes of every file the change touched since `diff_base` (tracked edits and untracked
 * files, outside docs/ and .agents/), or null when git cannot say.
 */
function snapshot(root, diffBase) {
  if (!diffBase || diffBase === 'none') return null;
  const tracked = git(root, ['-c', 'core.quotepath=off', 'diff', '--name-only', diffBase]);
  if (tracked === null) return null;
  const untracked = git(root, ['-c', 'core.quotepath=off', 'ls-files', '--others', '--exclude-standard']) ?? '';
  const files = [...new Set(`${tracked}\n${untracked}`.split('\n').map((f) => f.trim()).filter(Boolean))]
    .filter((f) => !f.startsWith(`${DOCS_DIR}/`) && !f.startsWith('.agents/')).sort();
  if (files.length > MAX_SNAPSHOT) return null;
  const out = {};
  for (const f of files) {
    const abs = path.join(root, f);
    out[f] = fs.existsSync(abs) && fs.statSync(abs).isFile()
      ? crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
      : 'deleted';
  }
  return out;
}

const changedBetween = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter((f) => before[f] !== after[f]).sort();

function roundPayload(root, change, contract, state, { fixed }) {
  const spec = CONTRACTS[contract];
  const findings = [];
  const tasks = loadTasks(root, change)?.tasks ?? [];
  if (!tasks.length || tasks.some((t) => !t.done)) {
    findings.push(finding('handoff.tasks', 'Every task must be done before the check', { remediation: `Finish the open tasks with /medra:apply ${change}` }));
  }
  if (contract === 'check') findings.push(...errorsOf(changeFindings(root, change, 'tasks')));
  if (contract === 'audit' && securityRelevance(root, change) !== 'relevant') {
    findings.push(finding('handoff.security', 'The proposal does not say **Security:** relevant; this change gets no audit'));
  }
  const reports = roundReports(root, change);
  const round = Math.max(0, ...reports.map((r) => r.round)) + 1;
  const previous = reports.filter((r) => r.kind === spec.kind).sort((a, b) => a.round - b.round).pop() ?? null;
  const fixedIds = listOpt(fixed);
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
  if (findings.length) throw refused(findings);

  const dir = changeDir(root, change);
  fs.mkdirSync(path.join(dir, 'reviews'), { recursive: true });
  const payload = {
    change,
    change_path: rel(root, dir),
    diff_base: state.diff_base ?? 'none',
    report_path: rel(root, path.join(dir, 'reviews', `${today()}-${spec.kind}-agent-r${round}.md`)),
    round,
  };
  if (previous) {
    payload.previous_report = rel(root, previous.file);
    payload.fixed_findings = fixedIds;
  }
  // The snapshot of this round is what the next round is compared against. Rounds older than the
  // previous report are dropped, so the state keeps at most two snapshots per contract.
  const now = snapshot(root, payload.diff_base);
  const kept = state.handoff_snapshots?.[contract] ?? {};
  if (previous && now && kept[previous.round]) {
    const changed = changedBetween(kept[previous.round], now);
    if (changed.length <= MAX_CHANGED) payload.changed_since_previous = changed;
  }
  if (now) {
    const next = previous && kept[previous.round] ? { [previous.round]: kept[previous.round] } : {};
    next[round] = now;
    state.handoff_snapshots = { ...(state.handoff_snapshots ?? {}), [contract]: next };
    saveState(root, change, state);
  }
  return payload;
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

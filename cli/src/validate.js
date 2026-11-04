// The validation rules of SPEC §6, grouped by stage.
import fs from 'node:fs';
import path from 'node:path';
import { finding, readIf, readText, loadConfig, rel, docsPath } from './core.js';
import { parseConstitution, constitutionFindings, liveArticles, parseProposal, PROPOSAL_HEADINGS, parsePlan, PLAN_ANCHORS, parseThreatModel, THREAT_MODEL_ANCHORS } from './documents.js';
import { loadLivingSpecs, loadDeltas, livingSpecFindings, deltaFindings } from './specs.js';
import { loadLearnings, learningsFindings } from './learnings.js';
import { changeDir, loadState, loadTasks, latestReport, coverage, changeScenarios, securityRelevance } from './change.js';

export const STAGES = ['proposal', 'plan', 'tasks', 'verify'];

export function projectFindings(root, scope) {
  if (scope === 'constitution') {
    const text = readIf(docsPath(root, 'constitution.md'));
    if (text === null) return [finding('constitution.structure', 'docs/constitution.md is missing')];
    return constitutionFindings(parseConstitution(text));
  }
  if (scope === 'specs') return livingSpecFindings(root, loadLivingSpecs(root));
  if (scope === 'learnings') return learningsFindings(loadLearnings(root));
  return [finding('cli', `Unknown project scope "${scope}"`)];
}

function proposalFindings(root, change, state) {
  const dir = changeDir(root, change);
  const file = rel(root, path.join(dir, 'proposal.md'));
  const text = readIf(path.join(dir, 'proposal.md'));
  if (text === null) return [finding('proposal.structure', 'proposal.md is missing', { file })];
  const p = parseProposal(text);
  const out = [];
  // proposal.structure: required headings in order
  let cursor = 0;
  for (const [level, name] of PROPOSAL_HEADINGS) {
    const idx = p.headings.findIndex((h, i) => i >= cursor && h.level === level && (name === null ? h.text === `Proposal: ${change}` : h.text === name));
    if (idx < 0) out.push(finding('proposal.structure', `Missing or out-of-order heading: ${'#'.repeat(level)} ${name ?? `Proposal: ${change}`}`, { file }));
    else cursor = idx + 1;
  }
  if (!['fast', 'full'].includes(p.track)) out.push(finding('proposal.structure', '**Track:** must be fast or full', { file }));
  else if (p.track !== state.track) out.push(finding('proposal.structure', `**Track:** ${p.track} differs from the change track ${state.track}`, { file }));
  if (!p.rationale) out.push(finding('proposal.structure', 'Missing **Rationale:** under ## Track', { file }));
  // proposal.security: optional line (absent before 1.4); when present, a valid value and a rationale
  if (p.security !== null) {
    if (!['relevant', 'not-relevant'].includes(p.security)) out.push(finding('proposal.security', '**Security:** must be relevant or not-relevant', { file }));
    if (!p.securityRationale) out.push(finding('proposal.security', 'Missing **Security rationale:** after **Security:**', { file }));
  }
  // proposal.markers
  const deltas = loadDeltas(dir);
  for (const [f, t] of [[file, text], ...Object.values(deltas).map((d) => [rel(root, d.file), readText(d.file)])]) {
    t.split('\n').forEach((line, i) => {
      if (line.includes('[NEEDS CLARIFICATION')) out.push(finding('proposal.markers', 'Open clarification marker', { file: f, line: i + 1 }));
    });
  }
  // proposal.capabilities
  const living = loadLivingSpecs(root);
  const rows = new Map(p.capabilities.map((r) => [r.capability, r]));
  for (const [cap, d] of Object.entries(deltas)) {
    const row = rows.get(cap);
    if (!row) { out.push(finding('proposal.capabilities', `Delta for "${cap}" has no Capabilities row`, { file, ref: cap })); continue; }
    const expected = !living[cap] ? 'new' : (d.ops.ADDED || d.ops.MODIFIED) ? 'modified' : 'removed';
    if (row.operation !== expected) out.push(finding('proposal.capabilities', `Capabilities row for "${cap}" says ${row.operation}; the delta is ${expected}`, { file, ref: cap }));
  }
  for (const cap of rows.keys()) if (!deltas[cap]) out.push(finding('proposal.capabilities', `Capabilities row "${cap}" has no delta file`, { file, ref: cap }));
  out.push(...deltaFindings(root, deltas, living));
  return out;
}

function planFindings(root, change) {
  const dir = changeDir(root, change);
  const file = rel(root, path.join(dir, 'plan.md'));
  const text = readIf(path.join(dir, 'plan.md'));
  if (text === null) return [finding('plan.structure', 'plan.md is missing', { file })];
  const p = parsePlan(text);
  const out = [];
  if (p.title !== `Plan: ${change}`) out.push(finding('plan.structure', `Title must be "# Plan: ${change}"`, { file }));
  const anchorsSeen = p.h2.filter((h) => PLAN_ANCHORS.includes(h));
  if (anchorsSeen.join() !== PLAN_ANCHORS.join()) out.push(finding('plan.structure', `Anchors must be, in order: ${PLAN_ANCHORS.join(', ')}`, { file }));
  const ts = p.h2.indexOf('Test Strategy');
  const dc = p.h2.indexOf('Decisions');
  p.h2.forEach((h, i) => {
    if (!PLAN_ANCHORS.includes(h) && !(i > ts && i < dc)) out.push(finding('plan.structure', `Free-form section "## ${h}" must sit between Test Strategy and Decisions`, { file }));
  });
  for (const d of p.decisions ?? []) {
    if (!d.valid || !d.choice || !d.alternatives || !d.rationale) out.push(finding('plan.structure', `Decision "${d.heading}" needs a D-NN heading, **Choice:**, **Alternatives:** and **Rationale:**`, { file }));
  }
  // plan.constitution
  const constitution = parseConstitution(readIf(docsPath(root, 'constitution.md')) ?? '');
  const live = liveArticles(constitution).map((a) => a.roman);
  const rows = p.check ?? [];
  const rowArticles = rows.map((r) => (r.article || '').replace(/^Article\s+/, ''));
  for (const a of live) {
    const n = rowArticles.filter((x) => x === a).length;
    if (n !== 1) out.push(finding('plan.constitution', `Constitution Check needs exactly one row for Article ${a} (found ${n})`, { file, ref: a }));
  }
  for (const r of rows) {
    if (!['pass', 'fail', 'n/a'].includes(r.result)) out.push(finding('plan.constitution', `Result for Article ${r.article} must be pass, fail or n/a`, { file }));
    if (r.result === 'n/a' && !r.note) out.push(finding('plan.constitution', `Article ${r.article} is n/a without a Note`, { file }));
  }
  const fails = rows.filter((r) => r.result === 'fail').map((r) => (r.article || '').replace(/^Article\s+/, ''));
  const justified = (p.complexity?.rows ?? []).map((r) => (r[0] || '').replace(/^Article\s+/, ''));
  for (const a of fails) if (!justified.includes(a)) out.push(finding('plan.constitution', `Article ${a} fails without a Complexity Tracking row`, { file, ref: a }));
  if (p.complexity && !p.complexity.none && !p.complexity.rows.length) out.push(finding('plan.constitution', 'Complexity Tracking must be "None." or a table', { file }));
  // plan.test-strategy
  const mode = loadConfig(root).testing.mode;
  if (!p.testStrategy) out.push(finding('plan.test-strategy', '## Test Strategy is empty', { file }));
  else if (mode === 'none' && !/No automated tests\.\s*\S+/.test(p.testStrategy)) out.push(finding('plan.test-strategy', 'Mode none requires "No automated tests." followed by a reason', { file }));
  if (securityRelevance(root, change) === 'relevant') out.push(...threatModelFindings(root, change, p));
  return out;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const LIKELIHOODS = ['high', 'medium', 'low'];

/** plan.threat-model (SPEC §4.8b): structure, threat ↔ mitigation links, and decided mitigations. */
function threatModelFindings(root, change, plan) {
  const dir = changeDir(root, change);
  const file = rel(root, path.join(dir, 'threat-model.md'));
  const text = readIf(path.join(dir, 'threat-model.md'));
  const f = (message, ref = null) => finding('plan.threat-model', message, { file, ref });
  if (text === null) return [f('threat-model.md is missing; the proposal says **Security:** relevant')];
  const tm = parseThreatModel(text);
  const out = [];
  if (tm.title !== `Threat Model: ${change}`) out.push(f(`Title must be "# Threat Model: ${change}"`));
  const seen = tm.h2.filter((h) => THREAT_MODEL_ANCHORS.includes(h));
  if (seen.join() !== THREAT_MODEL_ANCHORS.join()) out.push(f(`Headings must be, in order: ${THREAT_MODEL_ANCHORS.join(', ')}`));
  const dupes = (rows) => rows.map((r) => r.id).filter((id, i, all) => all.indexOf(id) !== i);
  for (const id of new Set([...dupes(tm.threats), ...dupes(tm.mitigations)])) out.push(f(`${id} is duplicated`, id));
  const threatIds = new Set(tm.threats.map((t) => t.id));
  const mitigationIds = new Set(tm.mitigations.map((m) => m.id));
  for (const t of tm.threats) {
    if (!/^TM-\d{2,}$/.test(t.id)) out.push(f(`Threat ID "${t.id}" must be TM-NN`, t.id));
    if (!/^[STRIDE](?:[ ,]*[STRIDE])*$/.test((t.stride || '').trim())) out.push(f(`${t.id}: STRIDE must be letters from S T R I D E`, t.id));
    if (!SEVERITIES.includes((t.severity || '').trim())) out.push(f(`${t.id}: Severity must be one of ${SEVERITIES.join(', ')}`, t.id));
    if (!LIKELIHOODS.includes((t.likelihood || '').trim())) out.push(f(`${t.id}: Likelihood must be one of ${LIKELIHOODS.join(', ')}`, t.id));
    if (!t.none && !t.mitigations.length) out.push(f(`${t.id} names no mitigation and is not marked —`, t.id));
    for (const m of t.mitigations) if (!mitigationIds.has(m)) out.push(f(`${t.id} names unknown mitigation ${m}`, t.id));
  }
  const decisions = new Set((plan.decisions ?? []).map((d) => (d.heading.match(/^(D-\d{2,}):/) || [])[1]).filter(Boolean));
  for (const m of tm.mitigations) {
    if (!/^M-\d{2,}$/.test(m.id)) out.push(f(`Mitigation ID "${m.id}" must be M-NN`, m.id));
    if (!m.threats.length) out.push(f(`${m.id} names no threat`, m.id));
    for (const t of m.threats) if (!threatIds.has(t)) out.push(f(`${m.id} names unknown threat ${t}`, m.id));
    if (m.decision === 'pending') out.push(f(`${m.id} is still pending; accept or decline it with a plan Decision`, m.id));
    else if (!m.decision || !m.ref) out.push(f(`${m.id}: Decision must be pending, accepted (D-NN) or declined (D-NN)`, m.id));
    else if (!decisions.has(m.ref)) out.push(f(`${m.id} cites ${m.ref}, which is not a Decision in plan.md`, m.id));
  }
  return out;
}

/** Mitigations accepted in threat-model.md, or [] when the change has none. */
function acceptedMitigations(root, change) {
  const text = readIf(path.join(changeDir(root, change), 'threat-model.md'));
  return text === null ? [] : parseThreatModel(text).mitigations.filter((m) => m.decision === 'accepted').map((m) => m.id);
}

function tasksFindings(root, change) {
  const dir = changeDir(root, change);
  const file = rel(root, path.join(dir, 'tasks.md'));
  const parsed = loadTasks(root, change);
  if (!parsed) return [finding('tasks.structure', 'tasks.md is missing', { file })];
  const out = [];
  if (parsed.title !== `Tasks: ${change}`) out.push(finding('tasks.structure', `Title must be "# Tasks: ${change}"`, { file }));
  for (const m of parsed.malformed) out.push(finding('tasks.structure', `Task line does not match the grammar: ${m.text}`, { file, line: m.line }));
  const { tasks } = parsed;
  const pos = new Map();
  tasks.forEach((t, i) => {
    if (pos.has(t.id)) out.push(finding('tasks.structure', `${t.id} is duplicated`, { file, line: t.line, ref: t.id }));
    pos.set(t.id, i);
  });
  for (const t of tasks) {
    for (const a of t.after) {
      if (!pos.has(a)) out.push(finding('tasks.after', `${t.id} is after unknown task ${a}`, { file, line: t.line, ref: t.id }));
      else if (pos.get(a) >= pos.get(t.id)) out.push(finding('tasks.after', `${t.id} is after ${a}, which is not listed earlier`, { file, line: t.line, ref: t.id }));
    }
  }
  const deltas = loadDeltas(dir);
  const required = Object.values(deltas).flatMap((d) => [...(d.ops.ADDED ?? []), ...(d.ops.MODIFIED ?? [])]).map((b) => b.id).filter(Boolean);
  const mode = loadConfig(root).testing.mode;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ancestors = (t, seen = new Set()) => {
    for (const a of t.after) if (!seen.has(a) && byId.has(a)) { seen.add(a); ancestors(byId.get(a), seen); }
    return seen;
  };
  for (const r of required) {
    const refs = tasks.filter((t) => t.reqs.includes(r));
    if (!refs.length) out.push(finding('tasks.coverage', `${r} is not referenced by any task`, { file, ref: r }));
    if ((mode === 'tdd' || mode === 'test-after') && !refs.some((t) => t.test)) out.push(finding('tasks.test-task', `${r} has no [TEST] task`, { file, ref: r }));
    if (mode === 'tdd') {
      for (const t of refs.filter((x) => !x.test)) {
        const anc = ancestors(t);
        if (![...anc].some((a) => byId.get(a).test && byId.get(a).reqs.includes(r))) out.push(finding('tasks.test-before-impl', `${t.id} implements ${r} but is not after its [TEST] task`, { file, line: t.line, ref: t.id }));
      }
    }
  }
  // tasks.mitigations: every accepted mitigation reaches a task
  for (const m of acceptedMitigations(root, change)) {
    const cited = tasks.some((t) => new RegExp(`\\b${m}\\b`).test(`${t.description} — verify: ${t.verify}`));
    if (!cited) out.push(finding('tasks.mitigations', `Accepted mitigation ${m} is not cited by any task`, { file, ref: m }));
  }
  return out;
}

function verifyFindings(root, change, state) {
  const out = [];
  const parsed = loadTasks(root, change);
  const file = rel(root, path.join(changeDir(root, change), 'tasks.md'));
  for (const t of parsed?.tasks ?? []) {
    if (!t.done || !t.evidence.length) out.push(finding('verify.tasks-done', `${t.id} is not done with evidence`, { file, line: t.line, ref: t.id }));
  }
  const mode = loadConfig(root).testing.mode;
  if (mode !== 'none') {
    const cov = coverage(root, changeScenarios(root, change));
    for (const id of cov.uncovered) out.push(finding('verify.coverage', `${id} is not cited by any test`, { ref: id }));
  }
  const report = latestReport(root, change, 'verify');
  const lastDone = state.last_task_done_at ? Date.parse(state.last_task_done_at) : 0;
  if (!report) out.push(finding('verify.report', 'No verify review report in reviews/'));
  else {
    if (report.mtime < lastDone) out.push(finding('verify.report', 'The verify report is older than the last task done; re-run the check', { file: rel(root, report.file) }));
    if (!['pass', 'pass-with-findings'].includes(report.verdict)) out.push(finding('verify.report', `Verify verdict is ${report.verdict}`, { file: rel(root, report.file) }));
  }
  // verify.security-report: presence only. Its verdict informs the gate and never blocks it.
  if (securityRelevance(root, change) === 'relevant') {
    const sec = latestReport(root, change, 'security');
    if (!sec) out.push(finding('verify.security-report', 'No security report in reviews/; the proposal says **Security:** relevant'));
    else if (sec.mtime < lastDone) out.push(finding('verify.security-report', 'The security report is older than the last task done; re-run the audit', { file: rel(root, sec.file) }));
  }
  return out;
}

/** Runs the rules of `stage` and of every earlier stage that applies to the change's track. */
export function changeFindings(root, change, stage) {
  const state = loadState(root, change);
  const upto = STAGES.indexOf(stage);
  const out = [];
  if (upto >= 0) out.push(...proposalFindings(root, change, state));
  if (upto >= 1 && state.track === 'full') out.push(...planFindings(root, change));
  if (upto >= 2 || (stage === 'proposal' && state.track === 'fast' && fs.existsSync(path.join(changeDir(root, change), 'tasks.md')))) out.push(...tasksFindings(root, change));
  if (upto >= 3) out.push(...verifyFindings(root, change, state));
  return out;
}

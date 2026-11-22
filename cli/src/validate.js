// The validation rules of SPEC §6, grouped by stage.
import fs from 'node:fs';
import path from 'node:path';
import { finding, readIf, readText, loadConfig, rel, docsPath, configRel, sha256 } from './core.js';
import { section, trimBlank } from './markdown.js';
import { parseConstitution, constitutionFindings, liveArticles, parseProposal, PROPOSAL_HEADINGS, parsePlan, PLAN_ANCHORS, parseThreatModel, THREAT_MODEL_ANCHORS } from './documents.js';
import { loadLivingSpecs, loadDeltas, livingSpecFindings, deltaFindings } from './specs.js';
import { loadLearnings, learningsFindings } from './learnings.js';
import { changeDir, loadState, loadTasks, latestReport, coverage, changeScenarios, securityRelevance, suiteFindings, mergeFindings } from './change.js';

export const STAGES = ['proposal', 'plan', 'tasks', 'verify'];

const INLINE_MODEL_KEYS = ['propose', 'plan', 'tasks', 'author'];

function inlineModelWarnings(root) {
  const models = loadConfig(root).models ?? {};
  const warnings = [];
  for (const k of INLINE_MODEL_KEYS) {
    if (typeof models[k] === 'string' && models[k] !== 'inherit') {
      warnings.push(finding(
        'config.models',
        `models.${k} (${models[k]}) does not apply because inline stages (propose, plan, tasks) run in the main session`,
        { file: configRel, severity: 'warning' },
      ));
    }
  }
  for (const rt of ['claude', 'antigravity']) {
    const rtModels = models[rt];
    if (!rtModels || typeof rtModels !== 'object') continue;
    for (const k of INLINE_MODEL_KEYS) {
      if (typeof rtModels[k] === 'string' && rtModels[k] !== 'inherit') {
        warnings.push(finding(
          'config.models',
          `models.${rt}.${k} (${rtModels[k]}) does not apply because inline stages (propose, plan, tasks) run in the main session`,
          { file: configRel, severity: 'warning' },
        ));
      }
    }
  }
  return warnings;
}

export function projectFindings(root, scope) {
  let out;
  if (scope === 'constitution') {
    const text = readIf(docsPath(root, 'constitution.md'));
    out = text === null
      ? [finding('constitution.structure', 'docs/constitution.md is missing')]
      : constitutionFindings(parseConstitution(text));
  } else if (scope === 'specs') {
    out = livingSpecFindings(root, loadLivingSpecs(root));
  } else if (scope === 'learnings') {
    out = learningsFindings(loadLearnings(root));
  } else {
    return [finding('cli', `Unknown project scope "${scope}"`)];
  }
  return [...out, ...inlineModelWarnings(root)];
}

const IMPACT_LINES = ['Code', 'Interfaces', 'Data', 'Dependencies'];

function proposalFindings(root, change, state) {
  const dir = changeDir(root, change);
  const file = rel(root, path.join(dir, 'proposal.md'));
  const text = readIf(path.join(dir, 'proposal.md'));
  if (text === null) return [finding('proposal.structure', 'proposal.md is missing', { file, remediation: 'Create "proposal.md" with required headings (# Proposal: <change>, ## Why, ## What Changes, ## Capabilities, ## Track)' })];
  const p = parseProposal(text);
  const out = [];
  // proposal.structure: required headings in order
  let cursor = 0;
  for (const [level, name] of PROPOSAL_HEADINGS) {
    const idx = p.headings.findIndex((h, i) => i >= cursor && h.level === level && (name === null ? h.text === `Proposal: ${change}` : h.text === name));
    if (idx < 0) out.push(finding('proposal.structure', `Missing or out-of-order heading: ${'#'.repeat(level)} ${name ?? `Proposal: ${change}`}`, { file, remediation: `Add heading "${'#'.repeat(level)} ${name ?? `Proposal: ${change}`}" in the designated order` }));
    else cursor = idx + 1;
  }
  if (!['fast', 'full'].includes(p.track)) out.push(finding('proposal.structure', '**Track:** must be fast or full', { file, remediation: 'Set "**Track:** fast" or "**Track:** full"' }));
  else if (p.track !== state.track) out.push(finding('proposal.structure', `**Track:** ${p.track} differs from the change track ${state.track}`, { file, remediation: `Set "**Track:** ${state.track}" in proposal.md or switch track via "medra track ${change} ${p.track} --reason <text>"` }));
  if (!p.rationale) out.push(finding('proposal.structure', 'Missing **Rationale:** under ## Track', { file, remediation: 'Add "**Rationale:** <reason>" under ## Track' }));
  // proposal.security: optional line (absent before 1.4); when present, a valid value and a rationale
  if (p.security !== null) {
    if (!['relevant', 'not-relevant'].includes(p.security)) out.push(finding('proposal.security', '**Security:** must be relevant or not-relevant', { file, remediation: 'Set "**Security:** relevant" or "**Security:** not-relevant"' }));
    if (!p.securityRationale) out.push(finding('proposal.security', 'Missing **Security rationale:** after **Security:**', { file, remediation: 'Add "**Security rationale:** <reason>" immediately after **Security:**' }));
  }
  // proposal.markers
  const deltas = loadDeltas(dir);
  for (const [f, t] of [[file, text], ...Object.values(deltas).map((d) => [rel(root, d.file), readText(d.file)])]) {
    t.split('\n').forEach((line, i) => {
      if (line.includes('[NEEDS CLARIFICATION')) out.push(finding('proposal.markers', 'Open clarification marker', { file: f, line: i + 1, remediation: 'Resolve or remove [NEEDS CLARIFICATION: ...] marker before gate approval' }));
    });
  }
  // proposal.impact: the four Impact lines, each with a value
  const impact = section(p.lines, 'Impact', 2);
  if (impact) {
    for (const name of IMPACT_LINES) {
      const line = impact.body.find((l) => new RegExp(`^\\s*[-*]?\\s*\\*\\*${name}:\\*\\*`).test(l));
      const value = line ? line.slice(line.indexOf(':**') + 3).trim() : '';
      if (!value || /^\{.*\}$/.test(value)) out.push(finding('proposal.impact', `Impact needs a filled **${name}:** line`, { file, remediation: `Add "- **${name}:** <what is affected>" under ## Impact, or "None."` }));
    }
  }
  // proposal.open-questions: with no marker left anywhere, the section reads "None."
  const questions = section(p.lines, 'Open Questions', 2);
  if (questions && !out.some((f) => f.rule === 'proposal.markers') && trimBlank(questions.body).join('\n').trim() !== 'None.') {
    out.push(finding('proposal.open-questions', 'Open Questions must read "None." once every marker is resolved', { file, remediation: 'Replace the body of ## Open Questions with "None."' }));
  }
  // proposal.capabilities
  const living = loadLivingSpecs(root);
  const rows = new Map(p.capabilities.map((r) => [r.capability, r]));
  for (const [cap, d] of Object.entries(deltas)) {
    const row = rows.get(cap);
    if (!row) { out.push(finding('proposal.capabilities', `Delta for "${cap}" has no Capabilities row`, { file, ref: cap, remediation: `Add row "| ${cap} | ${!living[cap] ? 'new' : (d.ops.ADDED || d.ops.MODIFIED) ? 'modified' : 'removed'} | <IDs> |" to Capabilities table` })); continue; }
    const expected = !living[cap] ? 'new' : (d.ops.ADDED || d.ops.MODIFIED) ? 'modified' : 'removed';
    if (row.operation !== expected) out.push(finding('proposal.capabilities', `Capabilities row for "${cap}" says ${row.operation}; the delta is ${expected}`, { file, ref: cap, remediation: `Change operation for "${cap}" to "${expected}" in the Capabilities table` }));
  }
  for (const cap of rows.keys()) if (!deltas[cap]) out.push(finding('proposal.capabilities', `Capabilities row "${cap}" has no delta file`, { file, ref: cap, remediation: `Create delta spec at "docs/changes/${change}/specs/${cap}/spec.md" or remove "${cap}" from Capabilities table` }));
  out.push(...deltaFindings(root, deltas, living));
  return out;
}

/** Scenario IDs a text cites, with ranges such as `AUTH-004.S1–S3` expanded. */
function citedScenarios(text) {
  const ids = new Set(text.match(/\b[A-Z][A-Z0-9]{1,9}-\d{3,}\.S\d+\b/g) ?? []);
  for (const m of text.matchAll(/\b([A-Z][A-Z0-9]{1,9}-\d{3,})\.S(\d+)\s*[–—-]\s*S?(\d+)\b/g)) {
    for (let n = Number(m[2]); n <= Number(m[3]) && n < Number(m[2]) + 50; n++) ids.add(`${m[1]}.S${n}`);
  }
  return ids;
}

function planFindings(root, change) {
  const dir = changeDir(root, change);
  const file = rel(root, path.join(dir, 'plan.md'));
  const text = readIf(path.join(dir, 'plan.md'));
  if (text === null) return [finding('plan.structure', 'plan.md is missing', { file, remediation: 'Create "plan.md" following the plan template' })];
  const p = parsePlan(text);
  const out = [];
  if (p.title !== `Plan: ${change}`) out.push(finding('plan.structure', `Title must be "# Plan: ${change}"`, { file, remediation: `Set first heading to "# Plan: ${change}"` }));
  const anchorsSeen = p.h2.filter((h) => PLAN_ANCHORS.includes(h));
  if (anchorsSeen.join() !== PLAN_ANCHORS.join()) out.push(finding('plan.structure', `Anchors must be, in order: ${PLAN_ANCHORS.join(', ')}`, { file, remediation: `Ensure anchors appear in order: ${PLAN_ANCHORS.join(', ')}` }));
  const ts = p.h2.indexOf('Test Strategy');
  const dc = p.h2.indexOf('Decisions');
  p.h2.forEach((h, i) => {
    if (!PLAN_ANCHORS.includes(h) && !(i > ts && i < dc)) out.push(finding('plan.structure', `Free-form section "## ${h}" must sit between Test Strategy and Decisions`, { file, remediation: `Move "## ${h}" to sit between ## Test Strategy and ## Decisions` }));
  });
  for (const d of p.decisions ?? []) {
    if (!d.valid || !d.choice || !d.alternatives || !d.rationale) out.push(finding('plan.structure', `Decision "${d.heading}" needs a D-NN heading, **Choice:**, **Alternatives:** and **Rationale:**`, { file, remediation: 'Format decision as "### D-NN: <title>" with "**Choice:**", "**Alternatives:**", and "**Rationale:**"' }));
  }
  // plan.constitution
  const constitution = parseConstitution(readIf(docsPath(root, 'constitution.md')) ?? '');
  const live = liveArticles(constitution).map((a) => a.roman);
  const rows = p.check ?? [];
  const rowArticles = rows.map((r) => (r.article || '').replace(/^Article\s+/, ''));
  for (const a of live) {
    const n = rowArticles.filter((x) => x === a).length;
    if (n !== 1) out.push(finding('plan.constitution', `Constitution Check needs exactly one row for Article ${a} (found ${n})`, { file, ref: a, remediation: `Add exactly one row: "| Article ${a} | pass | <evidence> |" to the Constitution Check table` }));
  }
  for (const r of rows) {
    if (!['pass', 'fail', 'n/a'].includes(r.result)) out.push(finding('plan.constitution', `Result for Article ${r.article} must be pass, fail or n/a`, { file, remediation: `Set Result for Article ${r.article} to "pass", "fail", or "n/a"` }));
    if (r.result === 'pass' && !r.note) out.push(finding('plan.constitution', `Article ${r.article} passes without evidence in its Note`, { file, remediation: `Write in the Note column where this plan shows that Article ${r.article} holds` }));
    if (r.result === 'n/a' && !r.note) out.push(finding('plan.constitution', `Article ${r.article} is n/a without a Note`, { file, remediation: `Add a Note column explaining why Article ${r.article} is not applicable` }));
  }
  const fails = rows.filter((r) => r.result === 'fail').map((r) => (r.article || '').replace(/^Article\s+/, ''));
  const justified = (p.complexity?.rows ?? []).map((r) => (r[0] || '').replace(/^Article\s+/, ''));
  for (const a of fails) if (!justified.includes(a)) out.push(finding('plan.constitution', `Article ${a} fails without a Complexity Tracking row`, { file, ref: a, remediation: `Add a row to Complexity Tracking justifying why Article ${a} fails` }));
  if (p.complexity && !p.complexity.none && !p.complexity.rows.length) out.push(finding('plan.constitution', 'Complexity Tracking must be "None." or a table', { file, remediation: 'Set Complexity Tracking to "None." or provide a Markdown table' }));
  // plan.markers
  text.split('\n').forEach((line, i) => {
    if (line.includes('[NEEDS CLARIFICATION')) out.push(finding('plan.markers', 'Open clarification marker', { file, line: i + 1, remediation: 'Resolve the [NEEDS CLARIFICATION: ...] marker before gate approval' }));
  });
  // plan.test-strategy
  const mode = loadConfig(root).testing.mode;
  if (!p.testStrategy) out.push(finding('plan.test-strategy', '## Test Strategy is empty', { file, remediation: 'Provide a test strategy mapping delta scenarios to test levels and files' }));
  else if (mode === 'none' && !/No automated tests\.\s*\S+/.test(p.testStrategy)) out.push(finding('plan.test-strategy', 'Mode none requires "No automated tests." followed by a reason', { file, remediation: 'Write "No automated tests. <reason>" under ## Test Strategy' }));
  else if (mode !== 'none') {
    const cited = citedScenarios(p.testStrategy);
    for (const id of changeScenarios(root, change)) {
      if (!cited.has(id)) out.push(finding('plan.test-strategy', `${id} is not mapped in the Test Strategy`, { file, ref: id, remediation: `Add a Test Strategy row "| \`${id}\` | <level> | \`<test file>\` |"` }));
    }
  }
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
  const f = (message, ref = null, remediation = null) => finding('plan.threat-model', message, { file, ref, remediation });
  if (text === null) return [f('threat-model.md is missing; the proposal says **Security:** relevant', null, 'Run the security agent or create "threat-model.md" with STRIDE threats and mitigations')];
  const tm = parseThreatModel(text);
  const out = [];
  if (tm.title !== `Threat Model: ${change}`) out.push(f(`Title must be "# Threat Model: ${change}"`, null, `Set title to "# Threat Model: ${change}"`));
  const seen = tm.h2.filter((h) => THREAT_MODEL_ANCHORS.includes(h));
  if (seen.join() !== THREAT_MODEL_ANCHORS.join()) out.push(f(`Headings must be, in order: ${THREAT_MODEL_ANCHORS.join(', ')}`, null, `Ensure headings appear in order: ${THREAT_MODEL_ANCHORS.join(', ')}`));
  const dupes = (rows) => rows.map((r) => r.id).filter((id, i, all) => all.indexOf(id) !== i);
  for (const id of new Set([...dupes(tm.threats), ...dupes(tm.mitigations)])) out.push(f(`${id} is duplicated`, id, `Assign a unique ID; "${id}" is duplicated`));
  const threatIds = new Set(tm.threats.map((t) => t.id));
  const mitigationIds = new Set(tm.mitigations.map((m) => m.id));
  for (const t of tm.threats) {
    if (!/^TM-\d{2,}$/.test(t.id)) out.push(f(`Threat ID "${t.id}" must be TM-NN`, t.id, 'Use threat ID format "TM-NN", e.g. "TM-01"'));
    if (!/^[STRIDE](?:[ ,]*[STRIDE])*$/.test((t.stride || '').trim())) out.push(f(`${t.id}: STRIDE must be letters from S T R I D E`, t.id, 'Use one or more letters from STRIDE (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege)'));
    if (!SEVERITIES.includes((t.severity || '').trim())) out.push(f(`${t.id}: Severity must be one of ${SEVERITIES.join(', ')}`, t.id, `Set Severity to one of: ${SEVERITIES.join(', ')}`));
    if (!LIKELIHOODS.includes((t.likelihood || '').trim())) out.push(f(`${t.id}: Likelihood must be one of ${LIKELIHOODS.join(', ')}`, t.id, `Set Likelihood to one of: ${LIKELIHOODS.join(', ')}`));
    if (!t.none && !t.mitigations.length) out.push(f(`${t.id} names no mitigation and is not marked —`, t.id, 'Reference at least one mitigation ID (e.g. M-01) or mark with "—"'));
    for (const m of t.mitigations) if (!mitigationIds.has(m)) out.push(f(`${t.id} names unknown mitigation ${m}`, t.id, `Define mitigation ${m} in the Mitigations table`));
  }
  const decisions = new Set((plan.decisions ?? []).map((d) => (d.heading.match(/^(D-\d{2,}):/) || [])[1]).filter(Boolean));
  for (const m of tm.mitigations) {
    if (!/^M-\d{2,}$/.test(m.id)) out.push(f(`Mitigation ID "${m.id}" must be M-NN`, m.id, 'Use mitigation ID format "M-NN", e.g. "M-01"'));
    if (!m.threats.length) out.push(f(`${m.id} names no threat`, m.id, 'Reference at least one threat ID (e.g. TM-01) in the Threats column'));
    for (const t of m.threats) if (!threatIds.has(t)) out.push(f(`${m.id} names unknown threat ${t}`, m.id, `Define threat ${t} in the Threats table`));
    if (m.decision === 'pending') out.push(f(`${m.id} is still pending; accept or decline it with a plan Decision`, m.id, `Set Decision to "accepted (D-NN)" or "declined (D-NN)" and document in plan.md`));
    else if (!m.decision || !m.ref) out.push(f(`${m.id}: Decision must be pending, accepted (D-NN) or declined (D-NN)`, m.id, 'Format Decision as "pending", "accepted (D-NN)", or "declined (D-NN)"'));
    else if (!decisions.has(m.ref)) out.push(f(`${m.id} cites ${m.ref}, which is not a Decision in plan.md`, m.id, `Add decision "### ${m.ref}: <title>" under ## Decisions in plan.md`));
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
  if (!parsed) return [finding('tasks.structure', 'tasks.md is missing', { file, remediation: 'Create "tasks.md" with tasks following the medra task grammar' })];
  const out = [];
  if (parsed.title !== `Tasks: ${change}`) out.push(finding('tasks.structure', `Title must be "# Tasks: ${change}"`, { file, remediation: `Set top-level heading to "# Tasks: ${change}"` }));
  for (const m of parsed.malformed) out.push(finding('tasks.structure', `Task line does not match the grammar: ${m.text}`, { file, line: m.line, remediation: 'Format task as "- [ ] T<NNN> [TEST] [<REQ-IDS>] [after T<NNN>] <description> — verify: <evidence>"' }));
  const { tasks } = parsed;
  const pos = new Map();
  tasks.forEach((t, i) => {
    if (pos.has(t.id)) out.push(finding('tasks.structure', `${t.id} is duplicated`, { file, line: t.line, ref: t.id, remediation: `Assign a unique task ID; "${t.id}" is duplicated` }));
    pos.set(t.id, i);
  });
  for (const t of tasks) {
    for (const a of t.after) {
      if (!pos.has(a)) out.push(finding('tasks.after', `${t.id} is after unknown task ${a}`, { file, line: t.line, ref: t.id, remediation: `Ensure prerequisite task "${a}" exists in tasks.md` }));
      else if (pos.get(a) >= pos.get(t.id)) out.push(finding('tasks.after', `${t.id} is after ${a}, which is not listed earlier`, { file, line: t.line, ref: t.id, remediation: `Move prerequisite task "${a}" above task "${t.id}" in the task list` }));
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
    if (!refs.length) out.push(finding('tasks.coverage', `${r} is not referenced by any task`, { file, ref: r, remediation: `Add a task referencing [${r}], e.g. "- [ ] T<NNN> [${r}] Implement ${r} — verify: <check>"` }));
    if ((mode === 'tdd' || mode === 'test-after') && !refs.some((t) => t.test)) out.push(finding('tasks.test-task', `${r} has no [TEST] task`, { file, ref: r, remediation: `Add a [TEST] task: "- [ ] T<NNN> [TEST] [${r}] Write tests for ${r} — verify: red"` }));
    if (mode === 'tdd') {
      for (const t of refs.filter((x) => !x.test)) {
        const anc = ancestors(t);
        if (![...anc].some((a) => byId.get(a).test && byId.get(a).reqs.includes(r))) out.push(finding('tasks.test-before-impl', `${t.id} implements ${r} but is not after its [TEST] task`, { file, line: t.line, ref: t.id, remediation: `Add "after <TEST_TASK_ID>" to task ${t.id} to ensure test precedes implementation` }));
      }
    }
  }
  // tasks.mitigations: every accepted mitigation reaches a task
  for (const m of acceptedMitigations(root, change)) {
    const cited = tasks.some((t) => new RegExp(`\\b${m}\\b`).test(`${t.description} — verify: ${t.verify}`));
    if (!cited) out.push(finding('tasks.mitigations', `Accepted mitigation ${m} is not cited by any task`, { file, ref: m, remediation: `Add a task citing accepted mitigation "${m}" in its description or verify clause` }));
  }
  // tasks.traceability: every task cites a REQ/scenario or backticked file path for deterministic slicing
  for (const t of tasks) {
    const text = `${t.description ?? ''} ${t.verify ?? ''}`;
    const hasReq = t.reqs.length > 0 || /\b[A-Z]{2,10}-\d{3,}(?:\.S\d+)?\b/.test(text);
    const hasPath = /`[^`\s]+\/[^`\s]*`/.test(text);
    if (!hasReq && !hasPath) {
      out.push(finding('tasks.traceability', `${t.id} lacks a REQ/scenario reference and target file path`, { file, line: t.line, ref: t.id, remediation: `Cite [<REQ-ID>] or a backticked file path in ${t.id}` }));
    }
  }
  return out;
}

/**
 * Evaluates report freshness against `freshFloor`.
 * Uses `reviews[].recorded_at` and SHA-256 `hash` when recorded; falls back to `mtime` for 1.x states without `recorded_at`.
 */
export function reportFreshness(root, change, state, report, freshFloor = 0) {
  const reportRel = rel(changeDir(root, change), report.file);
  const reviews = state?.reviews ?? [];
  let entry = null;
  for (let i = reviews.length - 1; i >= 0; i--) {
    if (reviews[i]?.report === reportRel) {
      entry = reviews[i];
      break;
    }
  }
  if (entry?.recorded_at) {
    const recordedMs = Date.parse(entry.recorded_at);
    const currentHash = sha256(readText(report.file));
    const hashMismatch = Boolean(entry.hash && currentHash !== entry.hash);
    const fresh = !hashMismatch && !Number.isNaN(recordedMs) && recordedMs >= freshFloor;
    return { fresh, hashMismatch, timestampMs: Number.isNaN(recordedMs) ? 0 : recordedMs, source: 'recorded_at' };
  }
  return { fresh: report.mtime >= freshFloor, hashMismatch: false, timestampMs: report.mtime, source: 'mtime' };
}

export function verifyFindings(root, change, state = loadState(root, change)) {
  const out = [];
  const parsed = loadTasks(root, change);
  const file = rel(root, path.join(changeDir(root, change), 'tasks.md'));
  for (const t of parsed?.tasks ?? []) {
    if (!t.done || !t.evidence.length) out.push(finding('verify.tasks-done', `${t.id} is not done with evidence`, { file, line: t.line, ref: t.id, remediation: `Complete task ${t.id} using "medra task done <change> ${t.id} --run '<cmd>'" or "--evidence '<text>'"` }));
  }
  const mode = loadConfig(root).testing.mode;
  if (mode !== 'none') {
    const cov = coverage(root, changeScenarios(root, change));
    for (const id of cov.uncovered) out.push(finding('verify.coverage', `${id} is not cited by any test`, { ref: id, remediation: `Reference scenario ID "${id}" in test names, comments, or tags in the test files` }));
  }
  out.push(...suiteFindings(root, change, state), ...mergeFindings(root, change));
  const report = latestReport(root, change, 'verify');
  const lastDoneMs = state.last_task_done_at ? Date.parse(state.last_task_done_at) : 0;
  const lastFixMs = state.last_fix_round_at ? Date.parse(state.last_fix_round_at) : 0;
  const freshFloor = Math.max(lastDoneMs || 0, lastFixMs || 0);
  if (!report) out.push(finding('verify.report', 'No verify review report in reviews/', { remediation: 'Run reviewer verification via /medra:verify to produce a review report' }));
  else {
    const freshness = reportFreshness(root, change, state, report, freshFloor);
    if (!freshness.fresh) {
      const msg = freshness.hashMismatch
        ? 'The verify report content changed after it was recorded; re-run the check'
        : 'The verify report is older than the last task done or fix round; re-run the check';
      out.push(finding('verify.report', msg, { file: rel(root, report.file), remediation: 'Re-run /medra:verify check because tasks or fix rounds were completed after the last report' }));
    }
    if (!['pass', 'pass-with-findings'].includes(report.verdict)) out.push(finding('verify.report', `Verify verdict is ${report.verdict}`, { file: rel(root, report.file), remediation: 'Address reported findings and re-run /medra:verify until verdict is pass or pass-with-findings' }));
  }
  // verify.security-report: presence only. Its verdict informs the gate and never blocks it.
  if (securityRelevance(root, change) === 'relevant') {
    const sec = latestReport(root, change, 'security');
    if (!sec) out.push(finding('verify.security-report', 'No security report in reviews/; the proposal says **Security:** relevant', { remediation: 'Run security audit via /medra:verify to generate a security report in reviews/' }));
    else {
      const secFreshness = reportFreshness(root, change, state, sec, freshFloor);
      if (!secFreshness.fresh) {
        const msg = secFreshness.hashMismatch
          ? 'The security report content changed after it was recorded; re-run the audit'
          : 'The security report is older than the last task done or fix round; re-run the audit';
        out.push(finding('verify.security-report', msg, { file: rel(root, sec.file), remediation: 'Re-run security audit (/medra:verify) because tasks or fix rounds were completed after the last audit' }));
      }
    }
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

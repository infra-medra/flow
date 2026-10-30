// `medra index` and `medra context`: bounded knowledge packs for agents.
import path from 'node:path';
import { readIf, loadConfig, rel, usageError, docsPath, docsRel } from './core.js';
import { parseConstitution, liveArticles, parsePlan, parseArchiveIndex } from './documents.js';
import { firstSentence } from './markdown.js';
import { loadLivingSpecs, loadDeltas, nextId } from './specs.js';
import { loadLearnings, selectLearnings } from './learnings.js';
import { changeDir, loadState, activeChanges, loadTasks, nextTask, coverage, changeScenarios, gateStatus } from './change.js';

export const CONTEXT_STAGES = ['propose', 'plan', 'tasks', 'apply', 'verify', 'review', 'archive'];

const constitutionOf = (root) => parseConstitution(readIf(docsPath(root, 'constitution.md')) ?? '');
export const archiveIndexPath = (root) => docsPath(root, 'changes', 'archive', 'INDEX.md');

export function index(root, { learnings: caps } = {}) {
  const specs = loadLivingSpecs(root);
  const store = loadLearnings(root);
  const out = {
    constitution: liveArticles(constitutionOf(root)).map((a) => ({ article: a.roman, title: a.title })),
    capabilities: Object.entries(specs).map(([name, s]) => ({
      name, prefix: s.prefix, purpose: s.purpose ? firstSentence(s.purpose) : null, next_id: s.prefix ? nextId(s) : null,
      requirements: s.requirements.filter((r) => r.id).map((r) => ({ id: r.id, title: r.title })),
    })),
    active_changes: activeChanges(root).map((c) => {
      const st = loadState(root, c);
      return { name: c, phase: st.phase, capabilities: Object.keys(loadDeltas(changeDir(root, c))) };
    }),
    learnings: { active: store.entries.filter((e) => e.section === 'Active').length },
  };
  if (caps) out.matching_learnings = selectLearnings(store.entries, { capabilities: caps }, loadConfig(root).learning.context_max);
  return out;
}

/** Paths the change names in backticks inside tasks.md and plan.md — used for learning scope matching. */
function namedPaths(root, change) {
  const dir = changeDir(root, change);
  const text = [readIf(path.join(dir, 'tasks.md')), readIf(path.join(dir, 'plan.md'))].filter(Boolean).join('\n');
  return [...new Set([...text.matchAll(/`([^`\s]+\/[^`\s]*)`/g)].map((m) => m[1]))];
}

function lastChangedBy(root) {
  const rows = parseArchiveIndex(readIf(archiveIndexPath(root)));
  const map = {};
  for (const r of rows) for (const q of r.requirements) map[q.id] = docsRel('changes', 'archive', `${r.date}-${r.change}`);
  return map;
}

const stageGate = { propose: 'proposal', plan: 'plan', tasks: 'tasks', verify: 'verify' };

export function context(root, change, stage) {
  if (!CONTEXT_STAGES.includes(stage)) throw usageError(`Unknown stage "${stage}"`);
  const config = loadConfig(root);
  const state = loadState(root, change);
  const dir = changeDir(root, change);
  const specs = loadLivingSpecs(root);
  const deltas = loadDeltas(dir);
  const pointers = lastChangedBy(root);
  const touchedCaps = Object.keys(deltas);
  const requirements = [];
  for (const [cap, d] of Object.entries(deltas)) {
    for (const [op, blocks] of Object.entries(d.ops)) {
      for (const b of blocks) {
        if (!b.id) continue;
        const living = specs[cap]?.requirements.find((r) => r.id === b.id);
        requirements.push({
          id: b.id, capability: cap, operation: op,
          delta: b.raw.join('\n'),
          living: op === 'ADDED' ? null : living ? living.raw.join('\n') : null,
          last_changed_by: op === 'ADDED' ? null : pointers[b.id] ?? null,
        });
      }
    }
  }
  const out = { change, stage, track: state.track, phase: state.phase, requirements };
  if (['plan', 'tasks', 'review', 'verify'].includes(stage)) {
    out.constitution = liveArticles(constitutionOf(root)).map((a) => ({ article: a.roman, title: a.title, gate: a.gate }));
  }
  if (['propose', 'plan', 'review'].includes(stage)) {
    const ids = new Set(requirements.map((r) => r.id));
    out.siblings = touchedCaps.flatMap((cap) => (specs[cap]?.requirements ?? []).filter((r) => r.id && !ids.has(r.id)).map((r) => ({ id: r.id, title: r.title })));
  }
  const learningStage = stage === 'archive' ? null : stage;
  out.learnings = selectLearnings(loadLearnings(root).entries, { capabilities: touchedCaps, paths: namedPaths(root, change), stage: learningStage }, config.learning.context_max);
  const gate = stage === 'review' ? (state.phase === 'proposed' ? 'proposal' : state.phase === 'planned' ? 'plan' : 'tasks') : stageGate[stage];
  out.gate_notes = gate && gateStatus(root, change, state, gate) !== 'approved'
    ? state.gate_notes.filter((n) => n.gate === gate && n.at > (state.gates[gate]?.status === 'approved' ? state.gates[gate].at : state.gates[gate]?.last_approved_at ?? '')).map(({ by, at, note, report }) => ({ by, at, note: note ?? null, report: report ?? null }))
    : [];
  out.documents = ['proposal.md', 'plan.md', 'tasks.md'].filter((f) => readIf(path.join(dir, f)) !== null).map((f) => rel(root, path.join(dir, f)))
    .concat(Object.values(deltas).map((d) => rel(root, d.file)));
  if (stage === 'apply' || stage === 'verify') {
    const planText = readIf(path.join(dir, 'plan.md'));
    out.test_strategy = planText ? parsePlan(planText).testStrategy : null;
  }
  if (stage === 'apply') {
    const parsed = loadTasks(root, change);
    const tasks = parsed?.tasks ?? [];
    const t = nextTask(tasks, state);
    const blockFor = (id) => {
      const r = requirements.find((x) => x.id === id);
      if (r) return r.delta;
      for (const s of Object.values(specs)) { const l = s.requirements.find((x) => x.id === id); if (l) return l.raw.join('\n'); }
      return null;
    };
    out.next_task = t ? { id: t.id, line: parsed.lines[t.index], requirements: t.reqs.map(blockFor).filter(Boolean), phase_title: t.phase } : null;
    out.remaining = tasks.filter((x) => !x.done).length;
  }
  if (stage === 'verify') out.coverage = coverage(root, changeScenarios(root, change));
  return out;
}

export function contextMarkdown(pack) {
  const out = [`# Context: ${pack.change} · ${pack.stage}`, '', `Track: \`${pack.track}\` · Phase: \`${pack.phase}\``, ''];
  if (pack.constitution) {
    out.push('## Constitution', '');
    for (const a of pack.constitution) out.push(`- **Article ${a.article}: ${a.title}** — Gate: ${a.gate}`);
    out.push('');
  }
  out.push('## Requirements', '');
  for (const r of pack.requirements) {
    out.push(`### ${r.operation} ${r.id} (${r.capability})${r.last_changed_by ? ` — last changed by \`${r.last_changed_by}\`` : ''}`, '');
    if (r.living) out.push('Current living block:', '', r.living, '');
    out.push(r.operation === 'REMOVED' ? 'Removal:' : 'Delta block:', '', r.delta, '');
  }
  if (pack.siblings?.length) out.push('## Sibling requirements', '', ...pack.siblings.map((s) => `- ${s.id}: ${s.title}`), '');
  if (pack.learnings.length) out.push('## Learnings', '', ...pack.learnings.map((l) => `- **${l.id} [${l.type}] ${l.title}** — ${l.statement}`), '');
  if (pack.gate_notes.length) out.push('## Open gate notes', '', ...pack.gate_notes.map((n) => `- ${n.by} (${n.at}): ${n.note ?? n.report}`), '');
  if (pack.test_strategy) out.push('## Test strategy', '', pack.test_strategy, '');
  if (pack.stage === 'apply') {
    out.push('## Next task', '', pack.next_task ? pack.next_task.line : 'None.', '');
    if (pack.next_task) out.push(...pack.next_task.requirements.flatMap((b) => [b, '']));
    out.push(`Remaining: ${pack.remaining}`, '');
  }
  if (pack.coverage) out.push('## Coverage', '', `Covered: ${pack.coverage.covered}/${pack.coverage.scenarios}`, ...(pack.coverage.uncovered.length ? [`Uncovered: ${pack.coverage.uncovered.join(', ')}`] : []), '');
  out.push('## Documents', '', ...pack.documents.map((d) => `- \`${d}\``));
  return `${out.join('\n')}\n`;
}

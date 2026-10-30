// medra/learnings.md: the CLI owns its whole structure; agents supply content through `medra learn`.
import path from 'node:path';
import picomatch from 'picomatch';
import { finding, readIf, writeAtomic } from './core.js';
import { toLines, headings, label } from './markdown.js';

const SECTIONS = ['Active', 'Promoted', 'Retired'];
export const STAGES = ['propose', 'plan', 'tasks', 'apply', 'verify', 'review'];
export const learningsPath = (root) => path.join(root, 'medra', 'learnings.md');

function parseScope(value) {
  const scope = { capabilities: [], paths: [], stages: [] };
  if (!value || value === 'all') return scope;
  for (const part of value.split('·')) {
    const m = part.trim().match(/^(capabilities|paths|stages):\s*(.*)$/);
    if (m) scope[m[1]] = m[2].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return scope;
}

const renderScope = (s) => {
  const parts = ['capabilities', 'paths', 'stages'].filter((k) => s[k].length).map((k) => `${k}: ${s[k].join(', ')}`);
  return parts.length ? parts.join(' · ') : 'all';
};

export function parseLearnings(text) {
  const lines = toLines(text ?? '');
  const hs = headings(lines);
  const entries = [];
  const malformed = [];
  let current = null;
  hs.forEach((h, i) => {
    if (h.level === 2) { current = SECTIONS.includes(h.text) ? h.text : null; return; }
    if (h.level !== 3 || !current) return;
    const m = h.text.match(/^(L-\d{3,}) \[(lesson|preference)\] (.+)$/);
    const next = hs.slice(i + 1).find((x) => x.level <= 3);
    const body = lines.slice(h.index + 1, next ? next.index : lines.length);
    if (!m) { malformed.push({ line: h.index + 1, text: h.text }); return; }
    entries.push({
      id: m[1], type: m[2], title: m[3], section: current,
      statement: label(body, 'Statement') ?? '',
      scope: parseScope(label(body, 'Scope')),
      evidence: (label(body, 'Evidence') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      occurrences: Number(label(body, 'Occurrences') ?? 1),
      lastSeen: Number(label(body, 'Last seen') ?? 0),
      promoted: label(body, 'Promoted'),
      retired: label(body, 'Retired'),
    });
  });
  return { entries, malformed, sections: hs.filter((h) => h.level === 2).map((h) => h.text) };
}

export function renderLearnings(entries) {
  const out = ['# Learnings', ''];
  for (const sec of SECTIONS) {
    out.push(`## ${sec}`, '');
    for (const e of entries.filter((x) => x.section === sec).sort((a, b) => a.id.localeCompare(b.id))) {
      out.push(`### ${e.id} [${e.type}] ${e.title}`, '', `**Statement:** ${e.statement}`, `**Scope:** ${renderScope(e.scope)}`,
        `**Evidence:** ${e.evidence.join(', ')}`, `**Occurrences:** ${e.occurrences}`, `**Last seen:** ${e.lastSeen}`);
      if (e.promoted) out.push(`**Promoted:** ${e.promoted}`);
      if (e.retired) out.push(`**Retired:** ${e.retired}`);
      out.push('');
    }
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

export const loadLearnings = (root) => parseLearnings(readIf(learningsPath(root)));
export const saveLearnings = (root, entries) => writeAtomic([[learningsPath(root), renderLearnings(entries)]]);

export function learningsFindings(parsed, file = 'medra/learnings.md') {
  const out = [];
  for (const s of SECTIONS) if (!parsed.sections.includes(s)) out.push(finding('learnings.structure', `Missing ## ${s}`, { file }));
  for (const m of parsed.malformed) out.push(finding('learnings.structure', `"${m.text}" is not an "L-NNN [lesson|preference] <title>" heading`, { file, line: m.line }));
  const seen = new Set();
  for (const e of parsed.entries) {
    if (seen.has(e.id)) out.push(finding('learnings.structure', `${e.id} is duplicated`, { file, ref: e.id }));
    seen.add(e.id);
    if (!e.statement) out.push(finding('learnings.structure', `${e.id} has no **Statement:**`, { file, ref: e.id }));
    for (const st of e.scope.stages) if (!STAGES.includes(st)) out.push(finding('learnings.structure', `${e.id} has unknown stage "${st}"`, { file, ref: e.id }));
  }
  return out;
}

export function nextLearningId(entries) {
  const n = entries.reduce((m, e) => Math.max(m, Number(e.id.slice(2))), 0) + 1;
  return `L-${String(n).padStart(3, '0')}`;
}

/** An entry matches when any scoped capability or path matches the change, and its stages (if set) include the stage. */
export function matches(entry, { capabilities = [], paths = [], stage = null }) {
  const s = entry.scope;
  if (stage && s.stages.length && !s.stages.includes(stage)) return false;
  if (!s.capabilities.length && !s.paths.length) return true;
  if (s.capabilities.some((c) => capabilities.includes(c))) return true;
  return s.paths.some((glob) => { const isM = picomatch(glob, { dot: true }); return paths.some((p) => isM(p)); });
}

export function selectLearnings(entries, ctx, max) {
  return entries.filter((e) => e.section === 'Active' && matches(e, ctx))
    .sort((a, b) => b.occurrences - a.occurrences || a.id.localeCompare(b.id))
    .slice(0, max)
    .map(({ id, type, title, statement }) => ({ id, type, title, statement }));
}

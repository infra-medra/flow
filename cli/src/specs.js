// Living specs and delta specs: parsing, validation rules, and the archive merge.
import fs from 'node:fs';
import path from 'node:path';
import { finding, readText, CAPABILITY_NAME, docsPath } from './core.js';
import { toLines, headings, section, label, trimBlank } from './markdown.js';

const REQ_HEADING = /^REQ ([A-Z][A-Z0-9]{1,9})-(\d{3,}):\s*(.+)$/;
const SCENARIO_HEADING = /^Scenario ([A-Z][A-Z0-9]{1,9}-\d{3,})\.S(\d+):\s*(.+)$/;
const STEP = /^\s*[-*]\s+\*\*(Given|When|Then|And|But)\*\*\s+(.+)$/;
export const OPERATIONS = ['ADDED Requirements', 'MODIFIED Requirements', 'REMOVED Requirements'];

const reqNum = (id) => Number(id.split('-').pop());

/** Splits a run of lines into REQ blocks. Lines before the first REQ heading are returned as `lead`. */
function requirementBlocks(lines, offset = 0) {
  const hs = headings(lines).filter((h) => h.level <= 3);
  const blocks = [];
  hs.forEach((h, i) => {
    if (h.level !== 3) return;
    const m = h.text.match(REQ_HEADING);
    const next = hs.slice(i + 1).find((x) => x.level <= 3);
    const raw = trimBlank(lines.slice(h.index, next ? next.index : lines.length));
    blocks.push(m
      ? { id: `${m[1]}-${m[2]}`, prefix: m[1], title: m[3], raw, line: offset + h.index + 1, ...parseBody(raw, offset + h.index) }
      : { id: null, heading: h.text, raw, line: offset + h.index + 1 });
  });
  return blocks;
}

function parseBody(raw, offset) {
  const hs = headings(raw).filter((h) => h.level === 4);
  const statementEnd = hs.length ? hs[0].index : raw.length;
  const statement = trimBlank(raw.slice(1, statementEnd)).join('\n');
  const scenarios = hs.map((h, i) => {
    const m = h.text.match(SCENARIO_HEADING);
    const end = hs[i + 1] ? hs[i + 1].index : raw.length;
    const sRaw = trimBlank(raw.slice(h.index, end));
    const body = raw.slice(h.index + 1, end);
    const steps = body.map((l) => l.match(STEP)).filter(Boolean).map((s) => s[1]);
    return m ? { id: `${m[1]}.S${m[2]}`, req: m[1], n: Number(m[2]), title: m[3], steps, raw: sRaw, line: offset + h.index + 1 }
      : { id: null, heading: h.text, steps, raw: sRaw, line: offset + h.index + 1 };
  });
  return { statement, scenarios, reason: label(raw, 'Reason'), migration: label(raw, 'Migration') };
}

function parsePaths(lines) {
  const raw = label(lines, 'Paths');
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim().replace(/^`|`$/g, '')).filter(Boolean);
}

function retiredIds(lines) {
  for (const l of lines) {
    const m = l.match(/^<!--\s*retired:\s*(.*?)\s*-->$/);
    if (m) return m[1].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function parseLivingSpec(text) {
  const lines = toLines(text);
  const title = (headings(lines).find((h) => h.level === 1) || {}).text ?? null;
  const reqSection = section(lines, 'Requirements', 2);
  const purpose = section(lines, 'Purpose', 2);
  return {
    title,
    capability: label(lines, 'Capability'),
    prefix: label(lines, 'ID prefix'),
    paths: parsePaths(lines),
    purpose: purpose ? trimBlank(purpose.body).join('\n') : null,
    retired: reqSection ? retiredIds(reqSection.body) : [],
    requirements: reqSection ? requirementBlocks(reqSection.body, reqSection.start + 1) : [],
    hasRequirementsSection: !!reqSection,
    lines,
  };
}

export function parseDelta(text) {
  const lines = toLines(text);
  const h1 = headings(lines).find((h) => h.level === 1);
  const h2 = headings(lines).filter((h) => h.level === 2);
  const purpose = section(lines, 'Purpose', 2);
  const ops = {};
  for (const op of OPERATIONS) {
    const s = section(lines, op, 2);
    if (s) ops[op.split(' ')[0]] = requirementBlocks(s.body, s.start + 1);
  }
  return {
    title: h1 && h1.text.startsWith('Delta: ') ? h1.text.slice(7) : null,
    hasDeltaTitle: !!(h1 && h1.text.startsWith('Delta: ')),
    capability: label(lines, 'Capability'),
    prefix: label(lines, 'ID prefix'),
    paths: parsePaths(lines),
    retire: (label(lines, 'Retire capability') || '').toLowerCase() === 'yes',
    purpose: purpose ? trimBlank(purpose.body).join('\n') : null,
    sectionOrder: h2.map((h) => h.text),
    ops,
  };
}

export const livingPath = (root, cap) => docsPath(root, 'specs', cap, 'spec.md');

export function loadLivingSpecs(root) {
  const dir = docsPath(root, 'specs');
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const cap of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, cap, 'spec.md');
    if (fs.existsSync(file)) out[cap] = { file, ...parseLivingSpec(readText(file)) };
  }
  return out;
}

export function loadDeltas(changeDir) {
  const dir = path.join(changeDir, 'specs');
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const cap of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, cap, 'spec.md');
    if (fs.existsSync(file)) out[cap] = { file, ...parseDelta(readText(file)) };
  }
  return out;
}

/** Highest requirement number in a capability, counting retired IDs. */
export function nextId(spec) {
  const nums = [...spec.requirements.filter((r) => r.id).map((r) => reqNum(r.id)),
    ...spec.retired.filter((id) => !id.includes('.S')).map(reqNum)];
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${spec.prefix}-${String(n).padStart(3, '0')}`;
}

/** Rules shared by living specs and the requirement blocks of deltas: spec.shall, spec.scenario. */
export function blockFindings(block, file) {
  const out = [];
  if (!block.id) {
    out.push(finding('spec.structure', `Heading "${block.heading}" is not a "REQ <PREFIX>-<NNN>: <title>" heading`, { file, line: block.line }));
    return out;
  }
  if (!/\bSHALL\b/.test(block.statement)) out.push(finding('spec.shall', `${block.id} statement does not contain SHALL`, { file, line: block.line, ref: block.id }));
  if (!block.scenarios.length) out.push(finding('spec.scenario', `${block.id} has no scenario`, { file, line: block.line, ref: block.id }));
  for (const s of block.scenarios) {
    if (!s.id) { out.push(finding('spec.structure', `Heading "${s.heading}" is not a "Scenario <REQ>.S<n>: <title>" heading`, { file, line: s.line })); continue; }
    if (s.req !== block.id) out.push(finding('spec.ids', `${s.id} sits under ${block.id}`, { file, line: s.line, ref: s.id }));
    const w = s.steps.indexOf('When');
    const g = s.steps.indexOf('Given');
    if (w < 0 || !s.steps.includes('Then')) out.push(finding('spec.scenario', `${s.id} needs at least one When and one Then`, { file, line: s.line, ref: s.id }));
    if (g >= 0 && w >= 0 && g > w) out.push(finding('spec.scenario', `${s.id} has Given after When`, { file, line: s.line, ref: s.id }));
  }
  return out;
}

export function livingSpecFindings(root, specs) {
  const out = [];
  const prefixes = {};
  for (const [cap, spec] of Object.entries(specs)) {
    const file = path.relative(root, spec.file);
    if (!spec.title) out.push(finding('spec.structure', 'Missing "# <title>" heading', { file }));
    if (spec.capability !== cap) out.push(finding('spec.structure', `**Capability:** must be \`${cap}\``, { file }));
    if (!CAPABILITY_NAME.test(cap)) out.push(finding('spec.structure', `Capability folder "${cap}" is not a valid name`, { file }));
    if (!spec.prefix || !/^[A-Z][A-Z0-9]{1,9}$/.test(spec.prefix)) out.push(finding('spec.structure', 'Missing or invalid **ID prefix:**', { file }));
    else if (prefixes[spec.prefix]) out.push(finding('spec.structure', `ID prefix ${spec.prefix} is also used by ${prefixes[spec.prefix]}`, { file }));
    else prefixes[spec.prefix] = cap;
    if (!spec.purpose) out.push(finding('spec.structure', 'Missing ## Purpose', { file }));
    if (!spec.hasRequirementsSection) out.push(finding('spec.structure', 'Missing ## Requirements', { file }));
    const seen = new Set();
    for (const r of spec.requirements) {
      out.push(...blockFindings(r, file));
      if (!r.id) continue;
      if (r.prefix !== spec.prefix) out.push(finding('spec.ids', `${r.id} does not use prefix ${spec.prefix}`, { file, line: r.line, ref: r.id }));
      for (const id of [r.id, ...r.scenarios.map((s) => s.id).filter(Boolean)]) {
        if (seen.has(id)) out.push(finding('spec.ids', `${id} is duplicated`, { file, ref: id }));
        if (spec.retired.includes(id)) out.push(finding('spec.ids', `${id} is retired and cannot be reused`, { file, ref: id }));
        seen.add(id);
      }
    }
  }
  return out;
}

/** delta.structure, delta.targets, delta.new-capability plus spec rules on delta blocks. */
export function deltaFindings(root, deltas, living) {
  const out = [];
  for (const [cap, d] of Object.entries(deltas)) {
    const file = path.relative(root, d.file);
    const spec = living[cap];
    if (!d.hasDeltaTitle) out.push(finding('delta.structure', 'Missing "# Delta: <capability title>" heading', { file }));
    if (d.capability !== cap) out.push(finding('delta.structure', `**Capability:** must be \`${cap}\``, { file }));
    const allowed = new Set(['Purpose', ...OPERATIONS]);
    for (const h of d.sectionOrder) if (!allowed.has(h)) out.push(finding('delta.structure', `Unexpected section "## ${h}"`, { file }));
    const opOrder = d.sectionOrder.filter((h) => OPERATIONS.includes(h));
    if (opOrder.join() !== OPERATIONS.filter((o) => opOrder.includes(o)).join()) out.push(finding('delta.structure', 'Operation sections must appear in the order ADDED, MODIFIED, REMOVED', { file }));
    if (!opOrder.length) out.push(finding('delta.structure', 'A delta needs at least one operation section', { file }));
    for (const [op, blocks] of Object.entries(d.ops)) {
      if (!blocks.length) out.push(finding('delta.structure', `## ${op} Requirements is empty; omit it`, { file }));
      for (const b of blocks) {
        if (op === 'REMOVED') {
          if (!b.id) out.push(finding('delta.structure', `Heading "${b.heading}" is not a REQ heading`, { file, line: b.line }));
          else if (!b.reason || !b.migration) out.push(finding('delta.structure', `${b.id} removal needs **Reason:** and **Migration:**`, { file, line: b.line, ref: b.id }));
        } else out.push(...blockFindings(b, file));
      }
    }
    if (!spec) {
      if (!d.prefix || !/^[A-Z][A-Z0-9]{1,9}$/.test(d.prefix) || !d.purpose) out.push(finding('delta.new-capability', 'A new capability needs **ID prefix:** and ## Purpose', { file }));
      if (d.ops.MODIFIED || d.ops.REMOVED) out.push(finding('delta.new-capability', 'A new capability allows only ADDED', { file }));
      const clash = Object.entries(living).find(([, s]) => s.prefix === d.prefix);
      if (clash) out.push(finding('delta.new-capability', `ID prefix ${d.prefix} is used by ${clash[0]}`, { file }));
      continue;
    }
    const ids = new Set(spec.requirements.map((r) => r.id));
    for (const b of d.ops.ADDED ?? []) {
      if (!b.id) continue;
      if (ids.has(b.id)) out.push(finding('delta.targets', `ADDED ${b.id} already exists in the living spec`, { file, line: b.line, ref: b.id }));
      if (spec.retired.includes(b.id)) out.push(finding('delta.targets', `ADDED ${b.id} is a retired ID`, { file, line: b.line, ref: b.id }));
      if (b.prefix !== spec.prefix) out.push(finding('delta.targets', `${b.id} does not use prefix ${spec.prefix}`, { file, line: b.line, ref: b.id }));
    }
    for (const op of ['MODIFIED', 'REMOVED']) {
      for (const b of d.ops[op] ?? []) if (b.id && !ids.has(b.id)) out.push(finding('delta.targets', `${op} ${b.id} does not exist in the living spec`, { file, line: b.line, ref: b.id }));
    }
  }
  return out;
}

const sortById = (blocks) => [...blocks].sort((a, b) => reqNum(a.id) - reqNum(b.id));

function renderLiving({ title, capability, prefix, paths, purpose, retired, requirements }) {
  const parts = [`# ${title}`, '', `**Capability:** \`${capability}\``, `**ID prefix:** \`${prefix}\``];
  if (paths?.length) parts.push(`**Paths:** ${paths.map((p) => `\`${p}\``).join(', ')}`);
  parts.push('', '## Purpose', '', purpose, '', '## Requirements', '');
  if (retired.length) parts.push(`<!-- retired: ${retired.join(', ')} -->`, '');
  for (const r of requirements) parts.push(...r.raw, '');
  return `${parts.join('\n').replace(/\n+$/, '')}\n`;
}

/**
 * Applies one delta to its living spec (or creates it) in the order REMOVED → MODIFIED → ADDED.
 * Returns { content | delete, conflicts, counts }. Pure: writes nothing.
 */
export function mergeDelta(cap, delta, spec) {
  const conflicts = [];
  const counts = { added: 0, modified: 0, removed: 0 };
  const conflict = (id, operation, problem) => conflicts.push({ capability: cap, id, operation, problem });
  let model;
  if (!spec) {
    model = { title: delta.title, capability: cap, prefix: delta.prefix, paths: delta.paths ?? [], purpose: delta.purpose, retired: [], requirements: [] };
  } else {
    // Keep the living header (title, labels, purpose) as written; requirements are re-rendered.
    model = { title: spec.title, capability: spec.capability, prefix: spec.prefix, paths: delta.paths?.length ? delta.paths : (spec.paths ?? []), purpose: spec.purpose, retired: [...spec.retired], requirements: spec.requirements.filter((r) => r.id).map((r) => ({ ...r })) };
  }
  const byId = () => new Map(model.requirements.map((r) => [r.id, r]));
  for (const b of delta.ops.REMOVED ?? []) {
    const cur = byId().get(b.id);
    if (!cur) { conflict(b.id, 'REMOVED', 'missing-target'); continue; }
    model.requirements = model.requirements.filter((r) => r.id !== b.id);
    model.retired.push(b.id, ...cur.scenarios.map((s) => s.id).filter(Boolean));
    counts.removed++;
  }
  for (const b of delta.ops.MODIFIED ?? []) {
    const cur = byId().get(b.id);
    if (!cur) { conflict(b.id, 'MODIFIED', 'missing-target'); continue; }
    const kept = new Set(b.scenarios.map((s) => s.id));
    model.retired.push(...cur.scenarios.map((s) => s.id).filter((id) => id && !kept.has(id)));
    model.requirements = model.requirements.map((r) => (r.id === b.id ? { ...b } : r));
    counts.modified++;
  }
  for (const b of delta.ops.ADDED ?? []) {
    if (byId().has(b.id) || model.retired.includes(b.id)) { conflict(b.id, 'ADDED', 'added-collision'); continue; }
    model.requirements.push({ ...b });
    counts.added++;
  }
  model.requirements = sortById(model.requirements);
  model.retired = [...new Set(model.retired)];
  if (delta.retire && model.requirements.length === 0) return { delete: true, conflicts, counts };
  return { content: renderLiving(model), conflicts, counts };
}

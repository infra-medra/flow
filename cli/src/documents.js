// Parsers for constitution, proposal, plan, tasks, review and security reports, threat models, and the archive index.
import { toLines, headings, section, label, tableRows, trimBlank, firstSentence } from './markdown.js';
import { ROMAN, finding } from './core.js';

// ---------- Constitution ----------

export function parseConstitution(text) {
  const lines = toLines(text);
  const hs = headings(lines);
  const articles = [];
  hs.forEach((h, i) => {
    if (h.level !== 3) return;
    const m = h.text.match(/^Article ([IVXLC]+):\s*(.+)$/);
    const next = hs.slice(i + 1).find((x) => x.level <= 3);
    const body = lines.slice(h.index + 1, next ? next.index : lines.length);
    const gates = body.filter((l) => l.startsWith('**Gate:**'));
    articles.push({
      valid: !!m, heading: h.text, roman: m ? m[1] : null, title: m ? m[2] : null, line: h.index + 1,
      gate: gates.length ? gates[0].replace('**Gate:**', '').trim() : null, gateCount: gates.length,
      retired: label(body, 'Retired'),
    });
  });
  return {
    lines,
    title: (hs.find((h) => h.level === 1) || {}).text,
    status: label(lines, 'Status'),
    version: label(lines, 'Version'),
    ratified: label(lines, 'Ratified'),
    lastAmended: label(lines, 'Last amended'),
    hasArticles: !!section(lines, 'Articles', 2),
    hasAmendments: !!section(lines, 'Amendments', 2),
    articles,
  };
}

export const liveArticles = (c) => c.articles.filter((a) => a.valid && !a.retired);

/** Rewrites the CLI-owned status lines and appends an Amendments row. */
export function ratifyConstitution(text, { version, date, change, source, first }) {
  let lines = toLines(text);
  const setLabel = (name, value) => {
    const i = lines.findIndex((l) => l.startsWith(`**${name}:**`));
    if (i >= 0) lines[i] = `**${name}:** ${value}`;
    else {
      const anchor = Math.max(...['Status', 'Version', 'Ratified', 'Last amended'].map((n) => lines.findIndex((l) => l.startsWith(`**${n}:**`))));
      lines.splice(anchor + 1, 0, `**${name}:** ${value}`);
    }
  };
  setLabel('Status', 'ratified');
  setLabel('Version', version);
  if (first) setLabel('Ratified', date);
  setLabel('Last amended', date);
  const amend = section(lines, 'Amendments', 2);
  const row = `| ${version} | ${date} | ${change.replace(/\|/g, '\\|')} | ${source} |`;
  if (!amend) {
    lines = [...trimBlank(lines), '', '## Amendments', '', '| Version | Date | Change | Source |', '|---|---|---|---|', row];
  } else {
    const body = lines.slice(amend.start + 1, amend.end);
    const lastTable = body.map((l, i) => (l.trim().startsWith('|') ? i : -1)).filter((i) => i >= 0).pop();
    if (lastTable === undefined) lines.splice(amend.start + 1, 0, '', '| Version | Date | Change | Source |', '|---|---|---|---|', row);
    else lines.splice(amend.start + 1 + lastTable + 1, 0, row);
  }
  return `${trimBlank(lines).join('\n')}\n`;
}

export function constitutionFindings(c, file = 'docs/constitution.md') {
  const out = [];
  if (c.title !== 'Constitution') out.push(finding('constitution.structure', 'Missing "# Constitution" heading', { file, remediation: 'Start file with "# Constitution"' }));
  if (!['draft', 'ratified'].includes(c.status)) out.push(finding('constitution.structure', '**Status:** must be draft or ratified', { file, remediation: 'Set "**Status:** draft" or "**Status:** ratified"' }));
  if (c.status === 'ratified') {
    if (!/^\d+\.\d+$/.test(c.version || '')) out.push(finding('constitution.structure', '**Version:** must be MAJOR.MINOR', { file, remediation: 'Format version as MAJOR.MINOR, e.g. "1.0"' }));
    if (!c.ratified || !c.lastAmended) out.push(finding('constitution.structure', '**Ratified:** and **Last amended:** are required once ratified', { file, remediation: 'Include "**Ratified:** YYYY-MM-DD" and "**Last amended:** YYYY-MM-DD"' }));
  }
  if (!c.hasArticles) out.push(finding('constitution.structure', 'Missing ## Articles', { file, remediation: 'Add "## Articles" section containing Article definitions' }));
  c.articles.forEach((a, i) => {
    if (!a.valid) { out.push(finding('constitution.structure', `"${a.heading}" is not an "Article <Roman>: <title>" heading`, { file, line: a.line, remediation: 'Format heading as "### Article <Roman>: <title>"' })); return; }
    if (a.roman !== ROMAN[i]) out.push(finding('constitution.structure', `Article ${a.roman} is out of sequence; expected ${ROMAN[i]}`, { file, line: a.line, remediation: `Renumber article to Article ${ROMAN[i]}` }));
    if (!a.retired && a.gateCount !== 1) out.push(finding('constitution.gate', `Article ${a.roman} must have exactly one **Gate:** line`, { file, line: a.line, ref: a.roman, remediation: 'Include exactly one "**Gate:** <question>" line under the article' }));
  });
  if (!liveArticles(c).length) out.push(finding('constitution.structure', 'At least one live article is required', { file, remediation: 'Add at least one active article with a **Gate:** question' }));
  return out;
}

// ---------- Proposal ----------

export const PROPOSAL_HEADINGS = [[1, null], [2, 'Why'], [2, 'What Changes'], [2, 'Scope'], [3, 'In scope'], [3, 'Out of scope'], [2, 'Track'], [2, 'Capabilities'], [2, 'Impact'], [2, 'Open Questions']];

export function parseProposal(text) {
  const lines = toLines(text);
  const hs = headings(lines);
  const caps = section(lines, 'Capabilities', 2);
  const why = section(lines, 'Why', 2);
  return {
    lines,
    headings: hs,
    title: (hs.find((h) => h.level === 1) || {}).text,
    track: label(lines, 'Track'),
    rationale: label(lines, 'Rationale'),
    // Absent in proposals written before 1.4, which read as not-relevant.
    security: label(lines, 'Security'),
    securityRationale: label(lines, 'Security rationale'),
    why: why ? trimBlank(why.body).join(' ') : '',
    capabilities: caps ? tableRows(caps.body).map(([c, op, reqs]) => ({ capability: (c || '').replace(/`/g, ''), operation: op, requirements: reqs })) : [],
  };
}

export const archiveWhy = (proposal) => {
  const s = firstSentence(proposal.why || '').replace(/\|/g, '/');
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
};

// ---------- Plan ----------

export const PLAN_ANCHORS = ['Summary', 'Constitution Check', 'Complexity Tracking', 'Test Strategy', 'Decisions'];

export function parsePlan(text) {
  const lines = toLines(text);
  const hs = headings(lines);
  const check = section(lines, 'Constitution Check', 2);
  const complexity = section(lines, 'Complexity Tracking', 2);
  const test = section(lines, 'Test Strategy', 2);
  const decisions = section(lines, 'Decisions', 2);
  return {
    lines,
    title: (hs.find((h) => h.level === 1) || {}).text,
    h2: hs.filter((h) => h.level === 2).map((h) => h.text),
    check: check ? tableRows(check.body).map(([article, gate, result, note]) => ({ article, gate, result, note })) : null,
    complexity: complexity ? { none: trimBlank(complexity.body).join('').trim() === 'None.', rows: tableRows(complexity.body) } : null,
    testStrategy: test ? trimBlank(test.body).join('\n') : null,
    decisions: decisions ? headings(decisions.body).filter((h) => h.level === 3).map((h) => {
      const next = headings(decisions.body).find((x) => x.index > h.index && x.level <= 3);
      const body = decisions.body.slice(h.index + 1, next ? next.index : decisions.body.length);
      return { heading: h.text, valid: /^D-\d{2,}:/.test(h.text), choice: label(body, 'Choice'), alternatives: label(body, 'Alternatives'), rationale: label(body, 'Rationale') };
    }) : null,
    decisionsText: decisions ? trimBlank(decisions.body).join('\n') : null,
  };
}

// ---------- Tasks ----------

const REQ_LIST = '[A-Z][A-Z0-9]{1,9}-\\d{3,}(?:, ?[A-Z][A-Z0-9]{1,9}-\\d{3,})*';
export const TASK_LINE = new RegExp(`^- \\[( |x)\\] (T\\d{3,})( \\[P\\])?( \\[TEST\\])?(?: \\[(${REQ_LIST})\\])?(?: after (T\\d{3,}(?:, ?T\\d{3,})*))? (.+?) — verify: (.+)$`);
export const EVIDENCE_LINE = /^ {2}- evidence (red|green|manual) \d{4}-\d{2}-\d{2}: .+$/;

export function parseTasks(text) {
  const lines = toLines(text);
  const tasks = [];
  const malformed = [];
  let phase = null;
  lines.forEach((line, i) => {
    const h = line.match(/^## (.+)$/);
    if (h) { phase = h[1]; return; }
    if (/^- \[[ x]\]/.test(line)) {
      const m = line.match(TASK_LINE);
      if (!m) { malformed.push({ line: i + 1, text: line }); return; }
      tasks.push({
        done: m[1] === 'x', id: m[2], parallel: !!m[3], test: !!m[4],
        reqs: m[5] ? m[5].split(',').map((s) => s.trim()) : [],
        after: m[6] ? m[6].split(',').map((s) => s.trim()) : [],
        description: m[7], verify: m[8], line: i + 1, index: i, phase, evidence: [],
      });
      return;
    }
    if (EVIDENCE_LINE.test(line) && tasks.length) tasks[tasks.length - 1].evidence.push(line.trim());
  });
  return { lines, tasks, malformed, title: (headings(lines).find((x) => x.level === 1) || {}).text };
}

/** tasks.md with checkbox state and evidence lines removed — the hash basis for the tasks gate. */
export const tasksHashBasis = (text) => toLines(text).filter((l) => !EVIDENCE_LINE.test(l)).map((l) => l.replace(/^- \[x\]/, '- [ ]')).join('\n');

export function tickTask(text, taskId, evidenceLine) {
  const lines = toLines(text);
  const { tasks } = parseTasks(text);
  const t = tasks.find((x) => x.id === taskId);
  let insertAt = t.index + 1;
  while (insertAt < lines.length && EVIDENCE_LINE.test(lines[insertAt])) insertAt++;
  lines[t.index] = lines[t.index].replace(/^- \[ \]/, '- [x]');
  lines.splice(insertAt, 0, `  ${evidenceLine}`);
  return lines.join('\n');
}

// ---------- Review report ----------

const REVIEW_COUNTS = /critical (\d+) · major (\d+) · minor (\d+)/;
const SECURITY_COUNTS = /critical (\d+) · high (\d+) · medium (\d+) · low (\d+) · info (\d+)/;

export function parseReport(text) {
  const lines = toLines(text);
  const stage = label(lines, 'Stage');
  const raw = label(lines, 'Counts') ?? '';
  let counts = null;
  if (stage === 'security') {
    const m = raw.match(SECURITY_COUNTS);
    if (m) counts = { critical: +m[1], high: +m[2], medium: +m[3], low: +m[4], info: +m[5] };
  } else {
    const m = raw.match(REVIEW_COUNTS);
    if (m) counts = { critical: +m[1], major: +m[2], minor: +m[3] };
  }
  return { stage, verdict: label(lines, 'Verdict'), counts };
}

// ---------- Threat model ----------

export const THREAT_MODEL_ANCHORS = ['Scope', 'Assets', 'Trust Boundaries', 'Entry Points', 'Threats', 'Mitigations', 'Residual Risks', 'Sources'];

const idsIn = (cell, prefix) => [...(cell || '').matchAll(new RegExp(`\\b${prefix}-\\d{2,}\\b`, 'g'))].map((m) => m[0]);

export function parseThreatModel(text) {
  const lines = toLines(text);
  const hs = headings(lines);
  const threats = section(lines, 'Threats', 2);
  const mitigations = section(lines, 'Mitigations', 2);
  return {
    title: (hs.find((h) => h.level === 1) || {}).text,
    h2: hs.filter((h) => h.level === 2).map((h) => h.text),
    threats: threats ? tableRows(threats.body).map(([id, stride, threat, boundary, severity, likelihood, mits]) => ({
      id: (id || '').trim(), stride, threat, boundary, severity, likelihood,
      mitigations: idsIn(mits, 'M'), none: (mits || '').trim() === '—',
    })) : [],
    mitigations: mitigations ? tableRows(mitigations.body).map(([id, mitigation, threatIds, decision]) => {
      const d = (decision || '').trim().match(/^(pending|accepted|declined)(?: \((D-\d{2,})\))?$/);
      return { id: (id || '').trim(), mitigation, threats: idsIn(threatIds, 'TM'), decision: d ? d[1] : null, ref: d?.[2] ?? null };
    }) : [],
  };
}

// ---------- Archive index ----------

export function parseArchiveIndex(text) {
  if (!text) return [];
  return tableRows(toLines(text)).map(([n, date, change, caps, reqs, why]) => ({
    sequence: Number(n), date, change, capabilities: (caps || '').split(',').map((s) => s.trim()).filter(Boolean),
    requirements: (reqs || '').split(/\s+/).filter(Boolean).map((t) => ({ op: t[0], id: t.slice(1) })), why,
  }));
}

export const ARCHIVE_INDEX_HEADER = '# Archive\n\n| # | Date | Change | Capabilities | Requirements | Why |\n|---|---|---|---|---|---|\n';

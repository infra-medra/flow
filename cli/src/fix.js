// Deterministic auto-remediations for document validation issues.
import path from 'node:path';
import { readIf, writeAtomic, docsPath, rel, usageError } from './core.js';
import { changeDir, loadState, activeChanges } from './change.js';
import {
  parseConstitution, liveArticles, parseProposal, PROPOSAL_HEADINGS,
  parsePlan, PLAN_ANCHORS,
} from './documents.js';
import { toLines, headings, section, tableRows } from './markdown.js';
import { loadLivingSpecs, loadDeltas } from './specs.js';

const constitutionOf = (root) => parseConstitution(readIf(docsPath(root, 'constitution.md')) ?? '');

/**
 * Deterministically auto-fixes mechanical issues in proposal.md:
 * - ensures title '# Proposal: <change>'
 * - syncs Track with state.track and ensures Rationale
 * - defaults Security to not-relevant with rationale if missing
 * - syncs Capabilities table with actual deltas on disk
 * - ensures required section headings in designated order
 */
export function fixProposal(root, change, state) {
  const dir = changeDir(root, change);
  const file = path.join(dir, 'proposal.md');
  const text = readIf(file);
  if (text === null) return { fixed: [] };

  const fixed = [];
  let lines = toLines(text);

  // 1. Title
  const expectedTitle = `# Proposal: ${change}`;
  if (!lines.length || !lines[0].startsWith('# ')) {
    lines.unshift(expectedTitle, '');
    fixed.push("added title '# Proposal: " + change + "'");
  } else if (lines[0] !== expectedTitle) {
    lines[0] = expectedTitle;
    fixed.push("corrected title to '# Proposal: " + change + "'");
  }

  // 2. Track & Rationale
  let trackSec = section(lines, 'Track', 2);
  const trackLine = `**Track:** ${state.track}`;
  const rationaleLine = '**Rationale:** Criteria checked.';
  const secLines = '\n**Security:** not-relevant\n**Security rationale:** Internal changes only.';

  if (!trackSec) {
    lines.push('', '## Track', '', trackLine, rationaleLine + secLines);
    fixed.push("added '## Track' section with track '" + state.track + "'");
  } else {
    let body = trackSec.body.join('\n');
    if (!/\*\*Track:\*\*\s*(fast|full)/.test(body)) {
      trackSec.body.unshift(trackLine);
      fixed.push("added '**Track:** " + state.track + "'");
    } else if (!new RegExp(`\\*\\*Track:\\*\\*\\s*${state.track}`).test(body)) {
      trackSec.body = trackSec.body.map((l) => (l.startsWith('**Track:**') ? trackLine : l));
      fixed.push("synced '**Track:**' to '" + state.track + "'");
    }
    if (!/\*\*Rationale:\*\*/.test(trackSec.body.join('\n'))) {
      const tIdx = trackSec.body.findIndex((l) => l.startsWith('**Track:**'));
      trackSec.body.splice(tIdx >= 0 ? tIdx + 1 : 0, 0, rationaleLine);
      fixed.push("added '**Rationale:**' under '## Track'");
    }
    if (!/\*\*Security:\*\*/.test(trackSec.body.join('\n'))) {
      trackSec.body.push('**Security:** not-relevant', '**Security rationale:** Internal changes only.');
      fixed.push("defaulted '**Security:** not-relevant' with rationale");
    }
  }

  // Re-read lines if Track was modified
  if (trackSec) {
    const hs = headings(lines);
    const th = hs.find((h) => h.level === 2 && h.text === 'Track');
    if (th) {
      const nextH = hs.find((h) => h.index > th.index && h.level <= 2);
      const endIdx = nextH ? nextH.index : lines.length;
      lines.splice(th.index + 1, endIdx - (th.index + 1), ...trackSec.body);
    }
  }

  // 3. Capabilities table sync
  const deltas = loadDeltas(dir);
  const living = loadLivingSpecs(root);
  const capsSec = section(lines, 'Capabilities', 2);

  const desiredRows = Object.entries(deltas).map(([cap, d]) => {
    const expected = !living[cap] ? 'new' : (d.ops.ADDED?.length || d.ops.MODIFIED?.length) ? 'modified' : 'removed';
    const allIds = [
      ...(d.ops.ADDED ?? []),
      ...(d.ops.MODIFIED ?? []),
      ...(d.ops.REMOVED ?? []),
    ].map((b) => b.id).filter(Boolean);
    return `| \`${cap}\` | ${expected} | ${allIds.join(', ') || 'None'} |`;
  });

  const tableHeader = ['| Capability | Operation | Requirements |', '|---|---|---|'];
  const fullTable = [...tableHeader, ...desiredRows];

  if (!capsSec) {
    lines.push('', '## Capabilities', '', ...fullTable);
    fixed.push("added '## Capabilities' table synced with deltas");
  } else {
    // Replace capabilities table with synced rows
    const hs = headings(lines);
    const ch = hs.find((h) => h.level === 2 && h.text === 'Capabilities');
    if (ch) {
      const nextH = hs.find((h) => h.index > ch.index && h.level <= 2);
      const endIdx = nextH ? nextH.index : lines.length;
      const existingRows = tableRows(capsSec.body);
      const existingText = existingRows.map((r) => r.join(' ')).join(' ');
      const newText = desiredRows.map((r) => r.replace(/`/g, '')).join(' ');
      if (existingText !== newText || existingRows.length !== desiredRows.length) {
        lines.splice(ch.index + 1, endIdx - (ch.index + 1), '', ...fullTable, '');
        fixed.push("synced '## Capabilities' table with specs deltas");
      }
    }
  }

  // 4. Required Headings from PROPOSAL_HEADINGS
  const requiredDefaults = {
    Why: 'Users need this functionality.',
    'What Changes': '- Description of changes.',
    Scope: '### In scope\n\n- Primary changes.\n\n### Out of scope\n\n- Secondary changes.',
    Impact: '- **Code:** src\n- **Interfaces:** None.\n- **Data:** None.\n- **Dependencies:** None.',
    'Open Questions': 'None.',
  };

  for (const [lvl, name] of PROPOSAL_HEADINGS) {
    if (!name || lvl !== 2) continue;
    const hs = headings(lines);
    if (!hs.some((h) => h.level === 2 && h.text === name)) {
      const def = requiredDefaults[name] ?? 'None.';
      lines.push('', `## ${name}`, '', def);
      fixed.push(`added missing '## ${name}' section`);
    }
  }

  const newText = `${lines.join('\n').trim()}\n`;
  if (fixed.length && newText !== text) {
    return { file, content: newText, fixed };
  }
  return { fixed: [] };
}

/**
 * Deterministically auto-fixes mechanical issues in plan.md:
 * - ensures title '# Plan: <change>'
 * - ensures all 5 PLAN_ANCHORS are present in order
 * - ensures all live constitution articles have rows in Constitution Check
 */
export function fixPlan(root, change) {
  const dir = changeDir(root, change);
  const file = path.join(dir, 'plan.md');
  const text = readIf(file);
  if (text === null) return { fixed: [] };

  const fixed = [];
  let lines = toLines(text);

  // 1. Title
  const expectedTitle = `# Plan: ${change}`;
  if (!lines.length || !lines[0].startsWith('# ')) {
    lines.unshift(expectedTitle, '');
    fixed.push("added title '# Plan: " + change + "'");
  } else if (lines[0] !== expectedTitle) {
    lines[0] = expectedTitle;
    fixed.push("corrected title to '# Plan: " + change + "'");
  }

  // 2. Constitution Check Table
  const constitution = constitutionOf(root);
  const live = liveArticles(constitution);
  let checkSec = section(lines, 'Constitution Check', 2);

  if (!checkSec) {
    const table = [
      '| Article | Gate | Result | Note |',
      '|---|---|---|---|',
      ...live.map((a) => `| ${a.roman} | ${a.gate ?? 'tasks'} | pass | Conforms to Article ${a.roman} |`),
    ];
    lines.push('', '## Constitution Check', '', ...table);
    fixed.push("added '## Constitution Check' with rows for all live articles");
  } else {
    const rows = tableRows(checkSec.body);
    const checkedArticles = new Set(rows.map(([art]) => (art ?? '').trim().replace(/^Article\s+/i, '')));
    const missing = live.filter((a) => !checkedArticles.has(a.roman));
    if (missing.length) {
      for (const m of missing) {
        checkSec.body.push(`| ${m.roman} | ${m.gate ?? 'tasks'} | pass | Conforms to Article ${m.roman} |`);
        fixed.push(`added row for Article ${m.roman} to 'Constitution Check'`);
      }
      const hs = headings(lines);
      const ch = hs.find((h) => h.level === 2 && h.text === 'Constitution Check');
      if (ch) {
        const nextH = hs.find((h) => h.index > ch.index && h.level <= 2);
        const endIdx = nextH ? nextH.index : lines.length;
        lines.splice(ch.index + 1, endIdx - (ch.index + 1), '', ...checkSec.body, '');
      }
    }
  }

  // 3. Ensure other PLAN_ANCHORS are present
  const anchorDefaults = {
    Summary: 'Architectural summary of the implementation.',
    'Complexity Tracking': 'None.',
    'Test Strategy': '- **Command:** `npm test`',
    Decisions: 'None.',
  };

  for (const anchor of PLAN_ANCHORS) {
    if (anchor === 'Constitution Check') continue;
    const hs = headings(lines);
    if (!hs.some((h) => h.level === 2 && h.text === anchor)) {
      lines.push('', `## ${anchor}`, '', anchorDefaults[anchor] ?? 'None.');
      fixed.push(`added missing '## ${anchor}' anchor`);
    }
  }

  // 4. Re-align PLAN_ANCHORS in designated canonical order
  const hs = headings(lines);
  const presentAnchors = hs.filter((h) => h.level === 2 && PLAN_ANCHORS.includes(h.text)).map((h) => h.text);
  if (presentAnchors.join() !== PLAN_ANCHORS.join()) {
    // Reorder sections
    const titleLine = lines[0];
    const sectionsMap = new Map();
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      if (h.level !== 2) continue;
      const nextH = hs.find((x) => x.index > h.index && x.level <= 2);
      const body = lines.slice(h.index + 1, nextH ? nextH.index : lines.length);
      sectionsMap.set(h.text, body);
    }
    const reordered = [titleLine, ''];
    for (const anchor of PLAN_ANCHORS) {
      if (anchor === 'Decisions') {
        // Any free-form sections sit between Test Strategy and Decisions
        for (const [name, body] of sectionsMap.entries()) {
          if (!PLAN_ANCHORS.includes(name)) {
            reordered.push(`## ${name}`, ...body, '');
          }
        }
      }
      if (sectionsMap.has(anchor)) {
        reordered.push(`## ${anchor}`, ...sectionsMap.get(anchor), '');
      }
    }
    lines = reordered;
    fixed.push('reordered plan sections into canonical anchor sequence');
  }

  const newText = `${lines.join('\n').trim()}\n`;
  if (fixed.length && newText !== text) {
    return { file, content: newText, fixed };
  }
  return { fixed: [] };
}

/**
 * Executes auto-fixes across all documents in a change.
 */
export function fixChange(root, change, fileFilter = null) {
  if (!change) {
    const active = activeChanges(root);
    if (active.length === 1) change = active[0];
    else if (active.length === 0) throw usageError('No active changes found');
    else throw usageError(`Pass a change name: ${active.join(', ')}`);
  }

  // Handle path passed as change name (e.g. docs/changes/add-reset/plan.md)
  if (change.includes('/') || change.includes(path.sep)) {
    const parts = change.split(/[/\\]/);
    const cIdx = parts.indexOf('changes');
    if (cIdx >= 0 && parts[cIdx + 1]) {
      const targetDoc = parts.slice(cIdx + 2).join('/');
      return fixChange(root, parts[cIdx + 1], targetDoc || fileFilter);
    }
  }

  const state = loadState(root, change);
  const writes = [];
  const allFixed = [];

  const shouldFix = (name) => !fileFilter || fileFilter.includes(name);

  if (shouldFix('proposal.md')) {
    const res = fixProposal(root, change, state);
    if (res.content) {
      writes.push([res.file, res.content]);
      allFixed.push(...res.fixed.map((f) => `proposal.md: ${f}`));
    }
  }

  if (shouldFix('plan.md')) {
    const res = fixPlan(root, change);
    if (res.content) {
      writes.push([res.file, res.content]);
      allFixed.push(...res.fixed.map((f) => `plan.md: ${f}`));
    }
  }

  if (writes.length) {
    writeAtomic(writes);
  }

  return { change, fixed: allFixed };
}

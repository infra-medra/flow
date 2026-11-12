// `medra index` and `medra context`: bounded knowledge packs for agents.
import path from 'node:path';
import { readIf, loadConfig, rel, usageError, docsPath, docsRel, refused, finding } from './core.js';
import { parseConstitution, liveArticles, parsePlan, parseArchiveIndex, parseProposal } from './documents.js';
import { firstSentence } from './markdown.js';
import { loadLivingSpecs, loadDeltas, nextId } from './specs.js';
import { loadLearnings, selectLearnings } from './learnings.js';
import { changeDir, loadState, activeChanges, loadTasks, nextTask, readyBatch, specDrift, coverage, changeScenarios, gateStatus } from './change.js';

export const CONTEXT_STAGES = ['propose', 'plan', 'tasks', 'apply', 'verify', 'review', 'archive'];

const constitutionOf = (root) => parseConstitution(readIf(docsPath(root, 'constitution.md')) ?? '');
export const archiveIndexPath = (root) => docsPath(root, 'changes', 'archive', 'INDEX.md');

export function index(root, { learnings: caps } = {}) {
  const specs = loadLivingSpecs(root);
  const store = loadLearnings(root);
  const drift = specDrift(root);
  const out = {
    constitution: liveArticles(constitutionOf(root)).map((a) => ({ article: a.roman, title: a.title })),
    capabilities: Object.entries(specs).map(([name, s]) => ({
      name, prefix: s.prefix, ...(s.paths?.length ? { paths: s.paths } : {}),
      purpose: s.purpose ? firstSentence(s.purpose) : null, next_id: s.prefix ? nextId(s) : null,
      requirements: s.requirements.filter((r) => r.id).map((r) => ({ id: r.id, title: r.title })),
    })),
    active_changes: activeChanges(root).map((c) => {
      const st = loadState(root, c);
      return { name: c, phase: st.phase, capabilities: Object.keys(loadDeltas(changeDir(root, c))) };
    }),
    learnings: { active: store.entries.filter((e) => e.section === 'Active').length },
    ...(drift.length ? { drift } : {}),
  };
  if (caps) {
    const capPaths = caps.flatMap((c) => specs[c]?.paths ?? []);
    out.matching_learnings = selectLearnings(store.entries, { capabilities: caps, paths: capPaths }, loadConfig(root).learning.context_max);
  }
  return out;
}

export function indexMarkdown(pack) {
  const out = ['# Project Index', ''];
  if (pack.constitution.length) {
    out.push('## Constitution', '', ...pack.constitution.map((a) => `- **Article ${a.article}:** ${a.title}`), '');
  }
  if (pack.capabilities.length) {
    out.push('## Capabilities', '');
    for (const c of pack.capabilities) {
      const meta = [c.prefix && `prefix \`${c.prefix}\``, c.next_id && `next \`${c.next_id}\``, c.paths?.length && `paths ${c.paths.map((p) => `\`${p}\``).join(', ')}`].filter(Boolean).join(' · ');
      out.push(`### ${c.name}${meta ? ` (${meta})` : ''}`);
      if (c.purpose) out.push(c.purpose);
      for (const r of c.requirements) out.push(`- ${r.id}: ${r.title}`);
      out.push('');
    }
  }
  if (pack.drift?.length) {
    out.push('## Spec drift (code modified outside active changes)', '');
    for (const d of pack.drift) out.push(`- \`${d.capability}\` (since \`${d.since_commit}\`): ${d.changed_files.map((f) => `\`${f}\``).join(', ')}`);
    out.push('');
  }
  if (pack.active_changes.length) {
    out.push('## Active changes', '', ...pack.active_changes.map((c) => `- \`${c.name}\` (${c.phase}) — ${c.capabilities.join(', ') || 'no deltas'}`), '');
  }
  out.push(`Active learnings: ${pack.learnings.active}`);
  if (pack.matching_learnings?.length) {
    out.push('', '## Matching learnings', '', ...pack.matching_learnings.map((l) => `- **${l.id} [${l.type}] ${l.title}** — ${l.statement}`));
  }
  return `${out.join('\n')}\n`;
}

/** Paths the change names in backticks inside tasks.md and plan.md, plus capability paths — used for learning scope matching. */
function namedPaths(root, change, specs = {}, deltas = {}) {
  const dir = changeDir(root, change);
  const text = [readIf(path.join(dir, 'tasks.md')), readIf(path.join(dir, 'plan.md'))].filter(Boolean).join('\n');
  const specPaths = Object.keys(deltas).flatMap((cap) => [...(specs[cap]?.paths ?? []), ...(deltas[cap]?.paths ?? [])]);
  return [...new Set([...specPaths, ...[...text.matchAll(/`([^`\s]+\/[^`\s]*)`/g)].map((m) => m[1])])];
}

function lastChangedBy(root) {
  const rows = parseArchiveIndex(readIf(archiveIndexPath(root)));
  const map = {};
  for (const r of rows) for (const q of r.requirements) map[q.id] = docsRel('changes', 'archive', `${r.date}-${r.change}`);
  return map;
}

/** Compacts a MODIFIED living block by replacing scenarios byte-identical to the delta with a one-line marker. */
function compactLiving(living, deltaBlock) {
  if (!living) return null;
  if (!deltaBlock?.scenarios?.length || !living.scenarios?.length) return living.raw.join('\n');
  const deltaById = new Map(deltaBlock.scenarios.filter((s) => s.id && s.raw).map((s) => [s.id, s.raw.join('\n')]));
  const parts = [`### REQ ${living.id}: ${living.title}`, '', living.statement];
  for (const s of living.scenarios) {
    if (s.id && s.raw && deltaById.get(s.id) === s.raw.join('\n')) {
      parts.push('', `#### Scenario ${s.id}: ${s.title} *(unchanged in delta)*`);
    } else if (s.raw) {
      parts.push('', ...s.raw);
    }
  }
  return parts.join('\n');
}

export function nextTaskPayload(root, change, state = loadState(root, change), specs = loadLivingSpecs(root), deltas = loadDeltas(changeDir(root, change))) {
  const parsed = loadTasks(root, change);
  const tasks = parsed?.tasks ?? [];
  const batch = readyBatch(tasks, state);
  const remaining = tasks.filter((x) => !x.done).length;
  if (!batch.length) return { next_task: null, parallel_batch: null, remaining };
  const deltaMap = new Map();
  for (const d of Object.values(deltas)) {
    for (const blocks of Object.values(d.ops)) {
      for (const b of blocks) if (b.id) deltaMap.set(b.id, b.raw.join('\n'));
    }
  }
  const blockFor = (id) => {
    if (deltaMap.has(id)) return deltaMap.get(id);
    for (const s of Object.values(specs)) { const l = s.requirements.find((x) => x.id === id); if (l) return l.raw.join('\n'); }
    return null;
  };
  const isBatch = batch.length > 1;
  const seenReqs = new Set();
  const toPayload = (t) => {
    const reqs = [];
    for (const reqId of t.reqs) {
      if (!isBatch || !seenReqs.has(reqId)) {
        const b = blockFor(reqId);
        if (b) { reqs.push(b); seenReqs.add(reqId); }
      }
    }
    return { id: t.id, line: parsed.lines[t.index], requirements: reqs, phase_title: t.phase };
  };
  const mapped = batch.map(toPayload);
  return {
    next_task: isBatch ? { id: mapped[0].id, line: mapped[0].line, phase_title: mapped[0].phase_title, requirements: [] } : mapped[0],
    parallel_batch: isBatch ? mapped : null,
    remaining,
  };
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
          living: op === 'ADDED' ? null : op === 'MODIFIED' ? compactLiving(living, b) : living ? living.raw.join('\n') : null,
          last_changed_by: op === 'ADDED' ? null : pointers[b.id] ?? null,
        });
      }
    }
  }
  const out = { change, stage, track: state.track, phase: state.phase };
  if (stage !== 'apply') out.requirements = requirements;
  if (['plan', 'tasks', 'review', 'verify'].includes(stage)) {
    out.constitution = liveArticles(constitutionOf(root)).map((a) => ({ article: a.roman, title: a.title, gate: a.gate }));
  }
  if (['propose', 'plan', 'review'].includes(stage)) {
    const ids = new Set(requirements.map((r) => r.id));
    out.siblings = touchedCaps.flatMap((cap) => (specs[cap]?.requirements ?? []).filter((r) => r.id && !ids.has(r.id)).map((r) => ({ id: r.id, title: r.title })));
  }
  const learningStage = stage === 'archive' ? null : stage;
  out.learnings = selectLearnings(loadLearnings(root).entries, { capabilities: touchedCaps, paths: namedPaths(root, change, specs, deltas), stage: learningStage }, config.learning.context_max);
  const gate = stage === 'review' ? (state.phase === 'proposed' ? 'proposal' : state.phase === 'planned' ? 'plan' : 'tasks') : stageGate[stage];
  // Timestamps have one-second precision, so a note recorded in the same second as the approval
  // it follows compares equal; `>=` keeps it.
  out.gate_notes = gate && gateStatus(root, change, state, gate) !== 'approved'
    ? state.gate_notes.filter((n) => n.gate === gate && n.at >= (state.gates[gate]?.status === 'approved' ? state.gates[gate].at : state.gates[gate]?.last_approved_at ?? '')).map(({ by, at, note, report }) => ({ by, at, note: note ?? null, report: report ?? null }))
    : [];
  out.documents = ['proposal.md', 'plan.md', 'tasks.md'].filter((f) => readIf(path.join(dir, f)) !== null).map((f) => rel(root, path.join(dir, f)))
    .concat(Object.values(deltas).map((d) => rel(root, d.file)));
  if (stage === 'apply' || stage === 'verify') {
    const planText = readIf(path.join(dir, 'plan.md'));
    const parsedPlan = planText ? parsePlan(planText) : null;
    out.test_strategy = parsedPlan ? parsedPlan.testStrategy : null;
    if (stage === 'apply') out.plan_summary = parsedPlan?.summary ?? null;
  }
  if (stage === 'apply') {
    const { next_task, parallel_batch, remaining } = nextTaskPayload(root, change, state, specs, deltas);
    out.next_task = next_task;
    if (parallel_batch) out.parallel_batch = parallel_batch;
    out.remaining = remaining;
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
  if (pack.requirements?.length) {
    out.push('## Requirements', '');
    for (const r of pack.requirements) {
      out.push(`### ${r.operation} ${r.id} (${r.capability})${r.last_changed_by ? ` — last changed by \`${r.last_changed_by}\`` : ''}`, '');
      if (r.living) out.push('Current living block:', '', r.living, '');
      out.push(r.operation === 'REMOVED' ? 'Removal:' : 'Delta block:', '', r.delta, '');
    }
  }
  if (pack.siblings?.length) out.push('## Sibling requirements', '', ...pack.siblings.map((s) => `- ${s.id}: ${s.title}`), '');
  if (pack.learnings.length) out.push('## Learnings', '', ...pack.learnings.map((l) => `- **${l.id} [${l.type}] ${l.title}** — ${l.statement}`), '');
  if (pack.gate_notes.length) out.push('## Open gate notes', '', ...pack.gate_notes.map((n) => `- ${n.by} (${n.at}): ${n.note ?? n.report}`), '');
  if (pack.plan_summary) out.push('## Plan summary', '', pack.plan_summary, '');
  if (pack.test_strategy) out.push('## Test strategy', '', pack.test_strategy, '');
  if (pack.stage === 'apply') {
    if (pack.parallel_batch?.length > 1) {
      out.push(`## Parallel batch ([P]${pack.next_task?.phase_title ? ` — ${pack.next_task.phase_title}` : ''})`, '');
      for (const t of pack.parallel_batch) out.push(t.line);
      out.push('');
      const uniqueReqs = [...new Set(pack.parallel_batch.flatMap((t) => t.requirements))];
      out.push(...uniqueReqs.flatMap((b) => [b, '']));
    } else {
      out.push('## Next task', '', pack.next_task ? `${pack.next_task.phase_title ? `[${pack.next_task.phase_title}] ` : ''}${pack.next_task.line}` : 'None.', '');
      if (pack.next_task) out.push(...pack.next_task.requirements.flatMap((b) => [b, '']));
    }
    out.push(`Remaining: ${pack.remaining}`, '');
  }
  if (pack.coverage) {
    out.push('## Coverage', '', `Covered: ${pack.coverage.covered}/${pack.coverage.scenarios}`);
    if (pack.coverage.uncovered.length) out.push(`Uncovered: ${pack.coverage.uncovered.join(', ')}`);
    for (const [id, locs] of Object.entries(pack.coverage.locations ?? {})) out.push(`- ${id}: ${locs.join(', ')}`);
    out.push('');
  }
  out.push('## Documents', '', ...pack.documents.map((d) => `- \`${d}\``));
  return `${out.join('\n')}\n`;
}

export function taskDoneMarkdown(res) {
  const out = [`# Task checkpoint: ${res.task} (${res.kind})`, '', `Remaining: ${res.remaining}`];
  if (res.parallel_batch?.length > 1) {
    out.push('', `## Parallel batch ([P]${res.next_task?.phase_title ? ` — ${res.next_task.phase_title}` : ''})`, '');
    for (const t of res.parallel_batch) out.push(t.line);
    out.push('');
    const uniqueReqs = [...new Set(res.parallel_batch.flatMap((t) => t.requirements))];
    out.push(...uniqueReqs.flatMap((b) => [b, '']));
  } else if (res.next_task && res.next_task.requirements?.length) {
    out.push('', '## Next task', '', `${res.next_task.phase_title ? `[${res.next_task.phase_title}] ` : ''}${res.next_task.line}`, '');
    out.push(...res.next_task.requirements.flatMap((b) => [b, '']));
  } else if (res.next_task) {
    out.push('', '## Next task', '', `${res.next_task.phase_title ? `[${res.next_task.phase_title}] ` : ''}${res.next_task.line}`);
  } else {
    out.push('', '## Next task', '', 'None. All tasks done.');
  }
  return `${out.join('\n').trim()}\n`;
}

export function taskBlockMarkdown(res) {
  const out = [`# Task ${res.blocked ? 'blocked' : 'unblocked'}: ${res.task}`, '', `Remaining: ${res.remaining}`];
  if (res.parallel_batch?.length > 1) {
    out.push('', `## Parallel batch ([P]${res.next_task?.phase_title ? ` — ${res.next_task.phase_title}` : ''})`, '');
    for (const t of res.parallel_batch) out.push(t.line);
    out.push('');
    const uniqueReqs = [...new Set(res.parallel_batch.flatMap((t) => t.requirements))];
    out.push(...uniqueReqs.flatMap((b) => [b, '']));
  } else if (res.next_task && res.next_task.requirements?.length) {
    out.push('', '## Next task', '', `${res.next_task.phase_title ? `[${res.next_task.phase_title}] ` : ''}${res.next_task.line}`, '');
    out.push(...res.next_task.requirements.flatMap((b) => [b, '']));
  } else if (res.next_task) {
    out.push('', '## Next task', '', `${res.next_task.phase_title ? `[${res.next_task.phase_title}] ` : ''}${res.next_task.line}`);
  } else {
    out.push('', '## Next task', '', 'None.');
  }
  return `${out.join('\n').trim()}\n`;
}

export function taskContext(root, change, taskId) {
  const dir = changeDir(root, change);
  const state = loadState(root, change);
  const parsed = loadTasks(root, change);
  if (!parsed) throw usageError(`No tasks.md found for change "${change}"`);
  const tasks = parsed.tasks ?? [];

  let targetTask = null;
  if (taskId) {
    targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) {
      throw refused([
        finding('task.unknown', `No task ${taskId}`, {
          ref: taskId,
          remediation: `Pick an existing task ID (e.g. ${tasks[0]?.id ?? 'T001'}) from tasks.md`,
        }),
      ]);
    }
  } else {
    targetTask = nextTask(tasks, state);
  }

  const remaining = tasks.filter((x) => !x.done).length;
  if (!targetTask) {
    return {
      change,
      track: state.track,
      phase: state.phase,
      task: null,
      remaining,
      all_done: remaining === 0,
    };
  }

  const specs = loadLivingSpecs(root);
  const deltas = loadDeltas(dir);
  const pointers = lastChangedBy(root);

  // 1. Architecture Anchor (Summary & Test Strategy)
  const planText = readIf(path.join(dir, 'plan.md'));
  const parsedPlan = planText ? parsePlan(planText) : null;
  const proposalText = readIf(path.join(dir, 'proposal.md'));
  const parsedProposal = proposalText ? parseProposal(proposalText) : null;

  const anchor = {
    summary: parsedPlan?.summary ?? (parsedProposal?.why ? firstSentence(parsedProposal.why) : null),
    test_strategy: parsedPlan?.testStrategy ?? null,
  };

  // 2. Dependencies
  const dependencies = targetTask.after.map((depId) => {
    const dep = tasks.find((t) => t.id === depId);
    if (!dep) return { id: depId, missing: true };
    return {
      id: dep.id,
      done: dep.done,
      line: parsed.lines[dep.index],
      description: dep.description,
      evidence: dep.evidence,
    };
  });

  // 3. Requirements (delta + living)
  const deltaMap = new Map();
  for (const [cap, d] of Object.entries(deltas)) {
    for (const [op, blocks] of Object.entries(d.ops)) {
      for (const b of blocks) {
        if (b.id) deltaMap.set(b.id, { cap, op, b });
      }
    }
  }

  const touchedCaps = new Set();
  const requirements = [];
  for (const reqId of targetTask.reqs) {
    if (deltaMap.has(reqId)) {
      const { cap, op, b } = deltaMap.get(reqId);
      touchedCaps.add(cap);
      const living = specs[cap]?.requirements.find((r) => r.id === b.id);
      requirements.push({
        id: b.id,
        capability: cap,
        operation: op,
        delta: b.raw.join('\n'),
        living: op === 'ADDED' ? null : op === 'MODIFIED' ? compactLiving(living, b) : living ? living.raw.join('\n') : null,
        last_changed_by: op === 'ADDED' ? null : pointers[b.id] ?? null,
      });
    } else {
      for (const [cap, s] of Object.entries(specs)) {
        const living = s.requirements.find((x) => x.id === reqId);
        if (living) {
          touchedCaps.add(cap);
          requirements.push({
            id: living.id,
            capability: cap,
            operation: 'UNCHANGED',
            delta: null,
            living: living.raw.join('\n'),
            last_changed_by: pointers[living.id] ?? null,
          });
          break;
        }
      }
    }
  }

  // 4. Scoped Learnings
  const candidatePaths = [
    ...[...targetTask.description.matchAll(/`([^`\s]+\/[^`\s]*)`/g)].map((m) => m[1]),
    ...[...targetTask.verify.matchAll(/`([^`\s]+\/[^`\s]*)`/g)].map((m) => m[1]),
    ...[...touchedCaps].flatMap((cap) => specs[cap]?.paths ?? []),
  ];
  const config = loadConfig(root);
  const learnings = selectLearnings(
    loadLearnings(root).entries,
    { capabilities: [...touchedCaps], paths: candidatePaths, stage: 'apply' },
    config.learning.context_max,
  );

  return {
    change,
    track: state.track,
    phase: state.phase,
    task: {
      id: targetTask.id,
      line: parsed.lines[targetTask.index],
      phase: targetTask.phase,
      description: targetTask.description,
      verify: targetTask.verify,
      test: targetTask.test,
      parallel: targetTask.parallel,
      done: targetTask.done,
      after: targetTask.after,
      reqs: targetTask.reqs,
      evidence: targetTask.evidence,
    },
    anchor,
    dependencies,
    requirements,
    learnings,
    remaining,
  };
}

export function taskContextMarkdown(pack) {
  if (!pack.task) {
    return `# Task Context: ${pack.change}\n\nNo executable tasks remaining. All done (${pack.remaining} remaining).\n`;
  }
  const t = pack.task;
  const out = [
    `# Task Context: ${pack.change} · ${t.id}`,
    '',
    `Phase: ${t.phase ?? 'Work'} · Track: \`${pack.track}\` · Remaining: ${pack.remaining}`,
    '',
    '## Task',
    '',
    t.line,
    '',
    `- **Status:** ${t.done ? '[x] Done' : '[ ] Pending'}`,
    `- **Verification:** \`${t.verify}\``,
  ];

  if (pack.anchor?.summary) {
    out.push('', '## Architecture Anchor', '', pack.anchor.summary);
  }
  if (pack.anchor?.test_strategy) {
    out.push('', '## Test Strategy', '', pack.anchor.test_strategy);
  }
  if (pack.dependencies?.length) {
    out.push('', `## Dependencies (${pack.dependencies.length})`, '');
    for (const d of pack.dependencies) {
      out.push(`- [${d.done ? 'x' : ' '}] **${d.id}**: ${d.description || d.line}`);
      if (d.evidence?.length) {
        for (const ev of d.evidence) out.push(`    ↳ ${ev}`);
      }
    }
  }
  if (pack.requirements?.length) {
    out.push('', `## Requirements (${pack.requirements.length})`, '');
    for (const r of pack.requirements) {
      out.push(`### ${r.operation} ${r.id} (${r.capability})${r.last_changed_by ? ` — last changed by \`${r.last_changed_by}\`` : ''}`, '');
      if (r.living) out.push('Current living block:', '', r.living, '');
      if (r.delta) out.push(r.operation === 'REMOVED' ? 'Removal:' : 'Delta block:', '', r.delta, '');
    }
  }
  if (pack.learnings?.length) {
    out.push('', `## Matching Learnings (${pack.learnings.length})`, '');
    for (const l of pack.learnings) {
      out.push(`- **${l.id} [${l.type}] ${l.title}** — ${l.statement}`);
    }
  }
  return `${out.join('\n').trim()}\n`;
}

// `medra archive`: merge deltas into living specs, append the index row, move the change folder.
import fs from 'node:fs';
import path from 'node:path';
import { MedraError, EXIT, refused, finding, readIf, writeAtomic, today, rel, errorsOf } from './core.js';
import { parseProposal, archiveWhy, parseArchiveIndex, ARCHIVE_INDEX_HEADER } from './documents.js';
import { loadLivingSpecs, loadDeltas, mergeDelta, livingPath, parseLivingSpec, livingSpecFindings } from './specs.js';
import { changeDir, loadState, stateContent, statePath, isApproved, gateStatus } from './change.js';
import { archiveIndexPath } from './context.js';

export function archive(root, change, { dryRun = false } = {}) {
  const state = loadState(root, change);
  if (!isApproved(root, change, state, 'verify')) {
    throw refused([finding('archive.gate', `Gate verify is ${gateStatus(root, change, state, 'verify')}; it must be approved and not stale`, { ref: change })]);
  }
  const dir = changeDir(root, change);
  const living = loadLivingSpecs(root);
  const deltas = loadDeltas(dir);
  const conflicts = [];
  const writes = [];
  const deletes = [];
  const counts = { added: 0, modified: 0, removed: 0 };
  const reqTokens = [];
  for (const [cap, d] of Object.entries(deltas)) {
    const r = mergeDelta(cap, d, living[cap]);
    conflicts.push(...r.conflicts);
    for (const k of Object.keys(counts)) counts[k] += r.counts[k];
    for (const b of d.ops.ADDED ?? []) reqTokens.push(`+${b.id}`);
    for (const b of d.ops.MODIFIED ?? []) reqTokens.push(`~${b.id}`);
    for (const b of d.ops.REMOVED ?? []) reqTokens.push(`-${b.id}`);
    if (r.delete) deletes.push(livingPath(root, cap));
    else if (r.content !== undefined) writes.push([livingPath(root, cap), r.content]);
  }
  // Post-merge validation, on the merged result in memory.
  const merged = { ...living };
  for (const f of deletes) delete merged[path.basename(path.dirname(f))];
  for (const [file, content] of writes) merged[path.basename(path.dirname(file))] = { file, ...parseLivingSpec(content) };
  for (const f of errorsOf(livingSpecFindings(root, merged))) {
    conflicts.push({ capability: f.file ? f.file.split('/').slice(-2, -1)[0] : null, id: f.ref, operation: 'merge', problem: 'post-merge-invalid', message: f.message });
  }
  if (conflicts.length) throw new MedraError(EXIT.CONFLICT, `${conflicts.length} merge conflict(s)`, { conflicts, findings: [] });

  const indexFile = archiveIndexPath(root);
  const indexText = readIf(indexFile) ?? ARCHIVE_INDEX_HEADER;
  const sequence = parseArchiveIndex(indexText).length + 1;
  const date = today();
  const proposal = parseProposal(readIf(path.join(dir, 'proposal.md')) ?? '');
  const row = `| ${sequence} | ${date} | ${change} | ${Object.keys(deltas).join(', ')} | ${reqTokens.join(' ')} | ${archiveWhy(proposal)} |`;
  const archivedDir = path.join(root, 'medra', 'changes', 'archive', `${date}-${change}`);
  const result = {
    archived_path: rel(root, archivedDir), sequence,
    specs: counts, capabilities_touched: Object.keys(deltas).length, dry_run: dryRun,
  };
  if (dryRun) return result;
  if (fs.existsSync(archivedDir)) throw refused([finding('archive.exists', `${rel(root, archivedDir)} already exists`)]);

  state.phase = 'archived';
  state.archived = { at: date, sequence };
  writeAtomic([...writes, [indexFile, `${indexText.replace(/\n+$/, '')}\n${row}\n`], [statePath(root, change), stateContent(state)]]);
  for (const f of deletes) fs.rmSync(path.dirname(f), { recursive: true, force: true });
  fs.renameSync(dir, archivedDir);
  return result;
}

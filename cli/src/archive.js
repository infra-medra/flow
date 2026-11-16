// `medra archive`: merge deltas into living specs, append the index row, move the change folder.
import fs from 'node:fs';
import path from 'node:path';
import { MedraError, EXIT, refused, finding, readIf, writeAtomic, today, rel, docsPath } from './core.js';
import { parseProposal, archiveWhy, parseArchiveIndex, ARCHIVE_INDEX_HEADER } from './documents.js';
import { planMerge } from './specs.js';
import { changeDir, loadState, stateContent, statePath, isApproved, gateStatus } from './change.js';
import { archiveIndexPath } from './context.js';

export function archive(root, change, { dryRun = false } = {}) {
  const state = loadState(root, change);
  if (!isApproved(root, change, state, 'verify')) {
    throw refused([finding('archive.gate', `Gate verify is ${gateStatus(root, change, state, 'verify')}; it must be approved and not stale`, { ref: change })]);
  }
  const dir = changeDir(root, change);
  const { deltas, conflicts, writes, deletes, counts, reqTokens } = planMerge(root, dir);
  if (conflicts.length) throw new MedraError(EXIT.CONFLICT, `${conflicts.length} merge conflict(s)`, { conflicts, findings: [] });

  const indexFile = archiveIndexPath(root);
  const indexText = readIf(indexFile) ?? ARCHIVE_INDEX_HEADER;
  const sequence = parseArchiveIndex(indexText).length + 1;
  const date = today();
  const proposal = parseProposal(readIf(path.join(dir, 'proposal.md')) ?? '');
  const row = `| ${sequence} | ${date} | ${change} | ${Object.keys(deltas).join(', ')} | ${reqTokens.join(' ')} | ${archiveWhy(proposal)} |`;
  const archivedDir = docsPath(root, 'changes', 'archive', `${date}-${change}`);
  const result = {
    archived_path: rel(root, archivedDir), sequence,
    specs: counts, capabilities_touched: Object.keys(deltas).length, dry_run: dryRun,
  };
  if (dryRun) return result;
  if (fs.existsSync(archivedDir)) throw refused([finding('archive.exists', `${rel(root, archivedDir)} already exists`)]);

  state.phase = 'archived';
  state.archived = { at: date, sequence };
  // Move the folder before writing anything: it is the step most likely to fail (a folder locked
  // by an editor or by Windows), and failing here leaves the project untouched. If the writes then
  // fail, the folder goes back, so the change is either fully archived or not archived at all.
  fs.mkdirSync(path.dirname(archivedDir), { recursive: true });
  fs.renameSync(dir, archivedDir);
  try {
    writeAtomic([
      ...writes,
      [indexFile, `${indexText.replace(/\n+$/, '')}\n${row}\n`],
      [path.join(archivedDir, path.basename(statePath(root, change))), stateContent(state)],
    ]);
  } catch (err) {
    fs.renameSync(archivedDir, dir);
    throw err;
  }
  for (const f of deletes) fs.rmSync(path.dirname(f), { recursive: true, force: true });
  return result;
}

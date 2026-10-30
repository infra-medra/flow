// Moves the 1.0 layout (medra/) into docs/, renaming config.yaml to config-flow.yaml. Keeps git
// history where files are tracked, and keeps every gate that was valid before the move.
import fs from 'node:fs';
import path from 'node:path';
import { refused, finding, git, docsPath, DOCS_DIR, CONFIG_FILE, loadConfig } from './core.js';
import { activeChanges, loadState, saveState, stageHash, GATES } from './change.js';
import { install } from './install.js';

const LEGACY = 'medra';

function move(root, from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const relFrom = path.relative(root, from);
  const tracked = git(root, ['ls-files', '--error-unmatch', relFrom]) !== null;
  if (tracked && git(root, ['mv', relFrom, path.relative(root, to)]) !== null) return;
  fs.renameSync(from, to);
}

export function migrateLayout(root) {
  const legacy = path.join(root, LEGACY);
  const entries = fs.readdirSync(legacy);
  const target = (name) => (name === 'config.yaml' ? docsPath(root, CONFIG_FILE) : docsPath(root, name));
  const collisions = entries.filter((e) => fs.existsSync(target(e)));
  if (collisions.length) {
    throw refused(collisions.map((e) => finding('layout.collision',
      `Cannot migrate ${LEGACY}/${e}: ${path.relative(root, target(e))} already exists. Move or rename it, then run any medra command again.`)));
  }
  for (const e of entries) move(root, path.join(legacy, e), target(e));
  if (!fs.readdirSync(legacy).length) fs.rmdirSync(legacy);

  // A 1.0 gate hash used root-relative paths (medra/changes/<change>/…). Document content and the
  // paths inside each change are unchanged by the move, so a gate whose 1.0 hash still matches was
  // valid before the migration and is re-signed with the new, change-relative hash.
  let rehashed = 0;
  for (const change of activeChanges(root)) {
    const state = loadState(root, change);
    for (const g of GATES) {
      const gate = state.gates[g];
      if (gate?.status !== 'approved') continue;
      if (stageHash(root, change, g, state, { legacyPrefix: `${LEGACY}/changes/${change}` }) === gate.hash) {
        gate.hash = stageHash(root, change, g, state);
        rehashed++;
      }
    }
    saveState(root, change, state);
  }

  const result = { from: `${LEGACY}/`, to: `${DOCS_DIR}/`, moved: entries.length, gates_rehashed: rehashed };
  if (loadConfig(root).integrations.includes('antigravity')) result.antigravity = install(root, { scope: 'workspace' });
  return result;
}

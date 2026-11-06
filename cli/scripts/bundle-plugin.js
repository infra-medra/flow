// Copies ../plugins/medra into ./plugin and ../README.md + ../CHANGELOG.md into ./ so the published npm package has all of them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(cli, '..', 'plugins', 'medra');
const dst = path.join(cli, 'plugin');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith('BLUEPRINT.md') });
for (const doc of ['README.md', 'CHANGELOG.md']) {
  fs.cpSync(path.join(cli, '..', doc), path.join(cli, doc));
}
console.log(`bundled ${path.relative(cli, src)} -> plugin/, README.md, CHANGELOG.md`);

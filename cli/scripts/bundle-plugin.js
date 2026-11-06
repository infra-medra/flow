// Copies ../plugins/medra into ./plugin and ../README.md into ./README.md so the published npm package has both.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(cli, '..', 'plugins', 'medra');
const dst = path.join(cli, 'plugin');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith('BLUEPRINT.md') });
fs.cpSync(path.join(cli, '..', 'README.md'), path.join(cli, 'README.md'));
console.log(`bundled ${path.relative(cli, src)} -> plugin/ and ../README.md -> README.md`);

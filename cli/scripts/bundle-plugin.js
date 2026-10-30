// Copies ../plugins/medra into ./plugin so the published package can run `medra install`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(cli, '..', 'plugins', 'medra');
const dst = path.join(cli, 'plugin');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith('BLUEPRINT.md') });
console.log(`bundled ${path.relative(cli, src)} -> plugin/`);

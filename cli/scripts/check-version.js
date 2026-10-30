// Fails when the CLI and plugin versions differ; skills and CLI ship in lockstep.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(cli, 'package.json'), 'utf8')).version;
const plugin = JSON.parse(fs.readFileSync(path.join(cli, '..', 'plugins', 'medra', '.claude-plugin', 'plugin.json'), 'utf8')).version;
if (pkg !== plugin) {
  console.error(`version mismatch: package.json ${pkg} vs plugin.json ${plugin}`);
  process.exit(1);
}
console.log(`version ${pkg} matches`);

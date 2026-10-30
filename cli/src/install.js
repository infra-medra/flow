// `medra install --target antigravity`: generate the Antigravity plugin from the bundled plugin (SPEC §8.13).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envError, refused, finding, readText, readIf, sha256, writeAtomic } from './core.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The repository's plugin (development checkout, where `plugin/` may be a stale bundle) or the bundled copy (published package). */
export function pluginDir() {
  for (const dir of [path.join(here, '..', '..', 'plugins', 'medra'), path.join(here, '..', 'plugin')]) {
    if (fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))) return dir;
  }
  throw envError('Bundled medra plugin not found; reinstall the CLI');
}

export const cliVersion = () => JSON.parse(readText(path.join(here, '..', 'package.json'))).version;

const SCHEMA = 'https://antigravity.google/schemas/v1/plugin.json';
const MANIFEST_KEYS = ['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords'];

// Claude Code tool → Antigravity tool. Antigravity refuses to start an agent that names an unknown tool.
const TOOLS = {
  Read: 'read_file', Grep: 'read_file', Glob: 'read_file', Skill: 'read_file',
  Write: 'write_file', Edit: 'edit_file', Bash: 'run_command', AskUserQuestion: 'ask_question',
  Agent: 'invoke_subagent', WebFetch: 'search_web', WebSearch: 'search_web',
};

function splitFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? { lines: m[1].split('\n'), body: text.slice(m[0].length) } : null;
}

const field = (lines, key) => lines.find((l) => l.startsWith(`${key}:`));

function skillFrontmatter(text, name) {
  const fm = splitFrontmatter(text);
  if (!fm) return text;
  return `---\nname: ${name}\n${field(fm.lines, 'description') ?? ''}\n---\n${fm.body}`;
}

function agentFrontmatter(text, name, { subagent }) {
  const fm = splitFrontmatter(text);
  if (!fm) return text;
  const tools = [];
  for (const raw of (field(fm.lines, 'tools') ?? 'tools:').slice('tools:'.length).split(',').map((t) => t.trim()).filter(Boolean)) {
    const mapped = TOOLS[raw.replace(/\(.*\)$/, '')];
    if (!mapped) throw envError(`agents/${name}.md: tool ${raw} has no Antigravity equivalent; extend the tool table (SPEC §8.13)`);
    if (!tools.includes(mapped)) tools.push(mapped);
  }
  // Antigravity offers every plugin agent as a subagent unless told otherwise.
  const out = [`name: medra-${name}`, field(fm.lines, 'description'), `tools: [${tools.join(', ')}]`, 'mainAgent: true', `subagent: ${subagent}`];
  return `---\n${out.filter(Boolean).join('\n')}\n---\n${fm.body}`;
}

function rewriteBody(text, { root, skillDir, agents }) {
  return text
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, root)
    .replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir)
    .replace(/\$ARGUMENTS/g, 'the text the user typed after the command')
    .replace(/medra:([a-z][a-z0-9-]*)/g, (all, name) => (agents.includes(name) ? `medra-${name}` : all));
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** Removes `dir` and its parents up to (not including) `stop` while they are empty. */
function pruneEmpty(dir, stop) {
  while (dir.startsWith(stop + path.sep) && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

/** Deletes the unedited files of a 1.1-style install (loose skills plus `<base>/medra/`). */
function removeLegacy(base) {
  const manifestFile = path.join(base, 'medra', 'MANIFEST.json');
  const text = readIf(manifestFile);
  if (text === null) return { removed: 0, findings: [] };
  const findings = [];
  let removed = 0;
  for (const [key, hash] of Object.entries(JSON.parse(text).files ?? {})) {
    const file = path.join(base, key);
    const cur = readIf(file);
    if (cur === null) continue;
    if (sha256(cur) !== hash) {
      findings.push(finding('install.legacy-edited', `${file} was edited since medra generated it; left in place`, { severity: 'warning' }));
      continue;
    }
    fs.rmSync(file);
    removed += 1;
    pruneEmpty(path.dirname(file), base);
  }
  for (const f of [manifestFile, path.join(base, 'medra', 'VERSION')]) fs.rmSync(f, { force: true });
  pruneEmpty(path.join(base, 'medra'), base);
  return { removed, findings };
}

export function install(projectRoot, { scope = 'workspace', force = false } = {}) {
  const src = pluginDir();
  const version = cliVersion();
  const base = scope === 'global' ? path.join(os.homedir(), '.gemini', 'config') : path.join(projectRoot, '.agents');
  const display = `${scope === 'global' ? '~/.gemini/config' : '.agents'}/plugins/medra`;
  const plugin = path.join(base, 'plugins', 'medra');
  const manifestFile = path.join(plugin, 'MANIFEST.json');
  const previous = JSON.parse(readIf(manifestFile) ?? '{"files":{}}').files;

  const agents = fs.readdirSync(path.join(src, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
  const skills = fs.readdirSync(path.join(src, 'skills')).sort();
  const skillText = skills.flatMap((s) => walk(path.join(src, 'skills', s))).map(readText).join('\n');
  const dispatched = new Set([...skillText.matchAll(/subagent_type: medra:([a-z][a-z0-9-]*)/g)].map((m) => m[1]));

  const source = JSON.parse(readText(path.join(src, '.claude-plugin', 'plugin.json')));
  const manifestJson = { $schema: SCHEMA, ...Object.fromEntries(MANIFEST_KEYS.filter((k) => k in source).map((k) => [k, source[k]])) };
  const files = [[path.join(plugin, 'plugin.json'), `${JSON.stringify(manifestJson, null, 2)}\n`]];
  for (const skill of skills) {
    const dir = path.join(src, 'skills', skill);
    for (const file of walk(dir)) {
      let text = readText(file);
      if (path.basename(file) === 'SKILL.md') text = skillFrontmatter(text, skill);
      text = rewriteBody(text, { root: display, skillDir: `${display}/skills/${skill}`, agents });
      files.push([path.join(plugin, 'skills', skill, path.relative(dir, file)), text]);
    }
  }
  for (const agent of agents) {
    const text = agentFrontmatter(readText(path.join(src, 'agents', `${agent}.md`)), agent, { subagent: dispatched.has(agent) });
    files.push([path.join(plugin, 'agents', `${agent}.md`), rewriteBody(text, { root: display, skillDir: display, agents })]);
  }
  // Refuse to overwrite files medra did not generate (absent from the manifest, or edited since).
  if (!force) {
    const foreign = files.map(([f]) => f).filter((f) => {
      const cur = readIf(f);
      if (cur === null) return false;
      return previous[path.relative(plugin, f)] !== sha256(cur);
    });
    if (foreign.length) throw refused(foreign.slice(0, 20).map((f) => finding('install.foreign-file', `${f} exists and was not generated by medra (use --force to replace)`)));
  }
  const manifest = { version, files: Object.fromEntries(files.map(([f, t]) => [path.relative(plugin, f), sha256(t)])) };
  writeAtomic([...files, [manifestFile, `${JSON.stringify(manifest, null, 2)}\n`], [path.join(plugin, 'VERSION'), `${version}\n`]]);
  // Remove files a previous version generated that this version no longer ships.
  for (const key of Object.keys(previous)) {
    if (manifest.files[key]) continue;
    fs.rmSync(path.join(plugin, key), { force: true });
    pruneEmpty(path.dirname(path.join(plugin, key)), plugin);
  }
  const legacy = removeLegacy(base);
  return { installed: files.length, scope, version, plugin: display, legacy_removed: legacy.removed, ...(legacy.findings.length ? { findings: legacy.findings } : {}) };
}

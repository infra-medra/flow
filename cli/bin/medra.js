#!/usr/bin/env node
// Entry point: wires commands, prints `--json` or a human summary, and maps failures to exit codes.
import { Command, CommanderError } from 'commander';
import { MedraError, EXIT, requireRoot, findRoot } from '../src/core.js';
import { migrateLayout } from '../src/migrate.js';
import * as cmd from '../src/commands.js';
import { index, indexMarkdown, context, contextMarkdown, taskDoneMarkdown, taskBlockMarkdown, taskContext, taskContextMarkdown } from '../src/context.js';
import { archive } from '../src/archive.js';
import { install, cliVersion } from '../src/install.js';

const program = new Command();
program.name('medra').description('Deterministic operations for the medra workflow').version(cliVersion(), '-V, --version');
program.exitOverride();
program.configureOutput({ writeErr: (s) => process.stderr.write(s) });

let jsonMode = process.argv.includes('--json');

function human(value, indent = '') {
  if (value === null || value === undefined) return `${indent}—`;
  if (Array.isArray(value)) return value.length ? value.map((v) => (typeof v === 'object' ? `${indent}- ${JSON.stringify(v)}` : `${indent}- ${v}`)).join('\n') : `${indent}(none)`;
  if (typeof value === 'object') {
    return Object.entries(value).map(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 6
      ? `${indent}${k}: ${Object.entries(v).map(([a, b]) => `${a}=${typeof b === 'object' ? JSON.stringify(b) : b}`).join(' · ')}`
      : Array.isArray(v) ? `${indent}${k}:\n${human(v, `${indent}  `)}` : `${indent}${k}: ${v}`)).join('\n');
  }
  return `${indent}${value}`;
}

let migration = null;

/** Migrates a 1.0 project (medra/) to docs/ before any command touches it, and says so. */
function migrateIfLegacy(found) {
  if (found?.legacy && !migration) {
    migration = migrateLayout(found.root);
    process.stderr.write(`medra: migrated ${migration.from} to ${migration.to} (${migration.moved} entries moved, ${migration.gates_rehashed} approved gates kept). Commit the move.\n`);
  }
  return found;
}

function emit(payload, mdText) {
  if (migration) payload = { ...payload, migration };
  if (jsonMode) process.stdout.write(`${JSON.stringify({ ok: true, ...payload })}\n`);
  else process.stdout.write(mdText ?? `${human(payload)}\n`);
}

const run = (fn) => async (...args) => { emit(await fn(...args)); };
const root = () => migrateIfLegacy(requireRoot()).root;
const j = (c) => c.option('--json', 'machine-readable output');

j(program.command('init').description('Create the docs/ scaffold (never overwrites)')
  .option('--language <tag>').option('--integrations <list>').option('--testing-mode <mode>').option('--testing-command <cmd>'))
  .action(run((o) => { const f = findRoot(); if (f?.root === process.cwd()) migrateIfLegacy(f); return cmd.init(process.cwd(), o); }));

j(program.command('new <change>').description('Create a change folder and its state').option('--track <track>', 'fast | full', 'fast'))
  .action(run((change, o) => cmd.newChange(root(), change, o)));

j(program.command('status [change]').description('Project or change state')).action(run((change) => cmd.status(root(), change)));

j(program.command('drift').description('Detect capabilities whose code paths changed outside active changes')).action(run(() => cmd.driftCmd(root())));

j(program.command('validate [change]').description('Run validation rules').option('--stage <stage>').option('--project <scope>'))
  .action(run((change, o) => {
    if (!o.project && !change) throw new MedraError(EXIT.USAGE, 'Pass a change with --stage, or --project <scope>');
    return cmd.validate(root(), change, o);
  }));

j(program.command('index').description('Bounded project overview').option('--learnings <capabilities>').option('--md', 'Markdown output'))
  .action((o) => {
    const pack = index(root(), { learnings: o.learnings ? o.learnings.split(',').map((s) => s.trim()) : undefined });
    if (o.md && !jsonMode) process.stdout.write(indexMarkdown(pack));
    else emit(pack, jsonMode ? undefined : indexMarkdown(pack));
  });

j(program.command('context <change>').description('Bounded context pack for one stage').requiredOption('--stage <stage>').option('--md', 'Markdown output'))
  .action((change, o) => {
    const pack = context(root(), change, o.stage);
    if (o.md && !jsonMode) process.stdout.write(contextMarkdown(pack));
    else emit(pack, jsonMode ? undefined : contextMarkdown(pack));
  });

j(program.command('gate <change> <gate>').description('Record a gate decision')
  .option('--approve').option('--request-changes').option('--note <text>').option('--by <name>'))
  .action(run((change, g, o) => cmd.gate(root(), change, g, o)));

j(program.command('track <change> <track>').description('Switch a change between fast and full').option('--reason <text>'))
  .action(run((change, t, o) => cmd.track(root(), change, t, o)));

j(program.command('review <change>').description("Record a review report's verdict").requiredOption('--report <path>').option('--by <name>'))
  .action(run((change, o) => cmd.review(root(), change, o)));

j(program.command('coverage [change]').description('Map scenario IDs to tests').option('--all'))
  .action(run((change, o) => cmd.coverageCmd(root(), change, o)));

j(program.command('archive <change>').description('Merge deltas into living specs and archive the change').option('--dry-run'))
  .action(run((change, o) => archive(root(), change, { dryRun: !!o.dryRun })));

j(program.command('install').description('Install the medra skills for another runtime').requiredOption('--target <target>')
  .option('--scope <scope>', 'workspace | global', 'workspace').option('--force'))
  .action(run((o) => {
    if (o.target !== 'antigravity') throw new MedraError(EXIT.USAGE, 'Only --target antigravity is supported');
    return install(process.cwd(), { scope: o.scope, force: !!o.force });
  }));

j(program.command('update').description('Refresh installed integrations')).action(run(() => cmd.update(root())));

const task = program.command('task').description('Task checkpoints');
j(task.command('context <change> [task]').description('Bounded smart-sliced context for a task').option('--md', 'Markdown output'))
  .action((change, t, o) => {
    const res = taskContext(root(), change, t);
    if (o.md && !jsonMode) process.stdout.write(taskContextMarkdown(res));
    else emit(res, jsonMode ? undefined : taskContextMarkdown(res));
  });
j(task.command('done <change> <task>').option('--run <command>').option('--evidence <text>').option('--kind <kind>').option('--allow-test-edit').option('--md', 'Markdown output'))
  .action((change, t, o) => {
    const res = cmd.taskDone(root(), change, t, o);
    if (o.md && !jsonMode) process.stdout.write(taskDoneMarkdown(res));
    else emit(res, jsonMode ? undefined : taskDoneMarkdown(res));
  });
j(task.command('block <change> <task>').requiredOption('--note <text>').option('--md', 'Markdown output'))
  .action((change, t, o) => {
    const res = cmd.taskBlock(root(), change, t, o);
    if (o.md && !jsonMode) process.stdout.write(taskBlockMarkdown(res));
    else emit(res, jsonMode ? undefined : taskBlockMarkdown(res));
  });
j(task.command('unblock <change> <task>').option('--md', 'Markdown output'))
  .action((change, t, o) => {
    const res = cmd.taskBlock(root(), change, t, {}, true);
    if (o.md && !jsonMode) process.stdout.write(taskBlockMarkdown(res));
    else emit(res, jsonMode ? undefined : taskBlockMarkdown(res));
  });

const constitution = program.command('constitution').description('Constitution lifecycle');
j(constitution.command('ratify').option('--bump <level>').option('--note <text>').option('--source <source>', 'init or L-NNN', 'init').option('--by <name>'))
  .action(run((o) => cmd.ratify(root(), o)));

const learn = program.command('learn').description('Learnings store');
const learnAction = (name, args, opts = []) => {
  const c = learn.command(`${name}${args ? ` ${args}` : ''}`);
  for (const o of opts) c.option(o);
  j(c).action(run((...a) => { const o = a[a.length - 2]; return cmd.learn(root(), name, a.slice(0, -2), o); }));
};
learnAction('add', '', ['--type <type>', '--title <title>', '--statement <text>', '--change <change>', '--capabilities <list>', '--paths <globs>', '--stages <list>']);
learnAction('bump', '<id>', ['--change <change>']);
learnAction('merge', '<id>', ['--into <id>']);
learnAction('retire', '<id>', ['--reason <text>']);
learnAction('promote', '<id>', ['--article <roman>']);
learnAction('status', '');
learnAction('candidates', '');

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof CommanderError) {
    if (err.code === 'commander.version' || err.code === 'commander.helpDisplayed' || err.code === 'commander.help') process.exit(0);
    if (jsonMode) process.stdout.write(`${JSON.stringify({ ok: false, code: EXIT.USAGE, findings: [{ rule: 'usage', severity: 'error', message: err.message }] })}\n`);
    process.exit(EXIT.USAGE);
  }
  const e = err instanceof MedraError ? err : new MedraError(EXIT.ENV, err.message);
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify({ ok: false, code: e.code, findings: e.findings, ...(e.extra.conflicts ? { conflicts: e.extra.conflicts } : {}), ...(e.message && e.code === EXIT.REFUSED ? { message: e.message } : {}) })}\n`);
  } else {
    process.stderr.write(`medra: ${e.message}\n`);
    for (const f of e.findings) {
      process.stderr.write(`  [${f.severity}] ${f.rule}: ${f.message}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : ''}\n`);
      if (f.remediation) process.stderr.write(`    ↳ fix: ${f.remediation}\n`);
    }
    for (const c of e.extra.conflicts ?? []) process.stderr.write(`  [conflict] ${c.problem} ${c.capability ?? ''} ${c.id ?? ''} ${c.operation ?? ''}\n`);
  }
  if (!(err instanceof MedraError)) process.stderr.write(`${err.stack}\n`);
  process.exit(e.code);
}

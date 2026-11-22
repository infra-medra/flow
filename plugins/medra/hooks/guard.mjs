#!/usr/bin/env node
// PreToolUse guard for medra projects on Claude Code. It turns three prompt rules into enforcement:
//   1. a gate approval, a constitution ratification and --allow-test-edit are the user's decisions,
//      so each one asks the user directly;
//   2. CLI-owned files (.medra.yaml, the archive, task ticks and evidence lines) change only through
//      the medra CLI, so a hand edit is denied;
//   3. an existing living spec changes through merged deltas, so a hand edit asks first.
// It prints nothing, and so decides nothing, for every other call and outside a medra project.
import fs from 'node:fs';
import path from 'node:path';

const decide = (permissionDecision, permissionDecisionReason) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason } }));
  process.exit(0);
};

let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
const tool = input.tool_name;
const args = input.tool_input ?? {};

// One shell segment: up to the next ; | & or newline.
const SEG = '[^\\n;|&]*';
const TICK = /^\s*- \[x\]/i;
const EVIDENCE = /^\s*- evidence (red|green|manual) /;
const count = (text, re) => String(text ?? '').split('\n').filter((l) => re.test(l)).length;

const isSubagent = Boolean(input.agent_id) || process.env.MEDRA_SUBAGENT === '1';

if (tool === 'Bash') {
  const cmd = String(args.command ?? '');
  const gate = cmd.match(new RegExp(`\\bmedra(?:\\.js)?\\s+gate\\s+(\\S+)\\s+(\\S+)${SEG}--approve\\b`)) ?? cmd.match(new RegExp(`\\bmedra(?:\\.js)?\\s+gate\\b${SEG}--approve\\b`));
  if (gate) {
    const what = gate[2] ? `the ${gate[2]} gate of "${gate[1]}"` : 'a medra gate';
    if (isSubagent) {
      decide('deny', `medra: subagents cannot approve ${what}. Gate approvals are human-only decisions.`);
    }
    decide('ask', `medra: this records your approval of ${what}. Allow it only if you reviewed the documents and chose to approve.`);
  }
  if (/\bmedra(?:\.js)?\s+constitution\s+ratify\b/.test(cmd)) {
    decide('ask', 'medra: this ratifies the constitution, which gates every future plan. Allow it only if you approved these articles.');
  }
  if (new RegExp(`\\bmedra(?:\\.js)?\\s+task\\s+done\\b${SEG}--allow-test-edit\\b`).test(cmd)) {
    decide('ask', 'medra: --allow-test-edit accepts a change to a test that was locked when it was seen failing, with the reason given in --reason. Allow it only if you agreed to that test edit.');
  }
  if (/(?:>>?|\btee\b|\bsed\s+(?:-\S+\s+)*-i)[^\n;|&]*(?:\.medra\.yaml|changes\/archive\/)/.test(cmd)) {
    decide('deny', 'medra: .medra.yaml and the archive are CLI-owned. Change state through the medra CLI (gate, task done, task block, track, archive) instead of writing the files.');
  }
  process.exit(0);
}

if (tool !== 'Write' && tool !== 'Edit') process.exit(0);

const file = String(args.file_path ?? '').split(path.sep).join('/').replace(/\\/g, '/');
const at = file.lastIndexOf('/docs/');
if (at < 0) process.exit(0);
const root = file.slice(0, at);
if (!fs.existsSync(path.join(root, 'docs', 'config-flow.yaml'))) process.exit(0);
const rel = file.slice(at + 1);

if (/^docs\/changes\/archive\//.test(rel)) {
  decide('deny', 'medra: the archive is history written by `medra archive`. Read it; do not edit it.');
}
if (/^docs\/changes\/[^/]+\/\.medra\.yaml$/.test(rel)) {
  decide('deny', 'medra: .medra.yaml is CLI-owned. Use `medra gate`, `medra task done`, `medra task block` or `medra track` to change it.');
}
if (/^docs\/changes\/[^/]+\/tasks\.md$/.test(rel)) {
  const before = tool === 'Edit' ? String(args.old_string ?? '') : (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  const after = tool === 'Edit' ? String(args.new_string ?? '') : String(args.content ?? '');
  const known = new Set(before.split('\n').filter((l) => EVIDENCE.test(l)).map((l) => l.trim()));
  const forged = after.split('\n').filter((l) => EVIDENCE.test(l)).some((l) => !known.has(l.trim()));
  if (count(after, TICK) > count(before, TICK) || forged) {
    decide('deny', 'medra: only `medra task done` ticks a task or writes an evidence line. Run `medra task done <change> <T-NNN> --run "<command>"` instead of editing the checkbox.');
  }
}
if (/^docs\/specs\/[^/]+\/spec\.md$/.test(rel) && fs.existsSync(file)) {
  decide('ask', 'medra: a living spec changes through deltas merged by `medra archive`. Allow this hand edit only if you want the spec changed outside a change (for example, while bootstrapping specs in /medra:init).');
}
process.exit(0);

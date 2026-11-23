import test from 'node:test';
import assert from 'node:assert/strict';
import { medra, medraHuman, project, brownfieldChange } from './helpers.js';

// Covers PLUG-011.S1: Test harness helpers medra() and medraHuman() strip inherited MEDRA_SUBAGENT
test('PLUG-011.S1: medra() and medraHuman() strip inherited MEDRA_SUBAGENT from default child env', () => {
  const hadSubagent = Object.prototype.hasOwnProperty.call(process.env, 'MEDRA_SUBAGENT');
  const prevSubagent = process.env.MEDRA_SUBAGENT;
  process.env.MEDRA_SUBAGENT = '1';

  try {
    const root = project();
    const change = brownfieldChange(root);

    const approveRes = medra(root, 'gate', change, 'proposal', '--approve');
    assert.equal(approveRes.code, 0, approveRes.stdout || approveRes.stderr);
    assert.equal(approveRes.json?.status, 'approved');

    const humanRes = medraHuman(root, 'gate', change, 'proposal', '--request-changes', '--note', 'recheck');
    assert.equal(humanRes.code, 0, humanRes.stdout || humanRes.stderr);
  } finally {
    if (hadSubagent) process.env.MEDRA_SUBAGENT = prevSubagent;
    else delete process.env.MEDRA_SUBAGENT;
  }
});

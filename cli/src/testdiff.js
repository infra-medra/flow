// Classifies a change to a test file that was locked when its [TEST] task was seen failing (red).
// `additive` is claimed only when it can be shown from the text: every line of the red snapshot is
// still there, in order, and the added lines disable nothing. Anything else is `weakening` (a test
// or an assertion was removed, renamed or disabled) or `other` (a change that cannot be read as
// either, including a snapshot or diff that is unavailable). Language-agnostic by design: the
// patterns cover the common JS, Python, Go, Java and C# test idioms and err toward not-additive.
import zlib from 'node:zlib';

const MAX_CELLS = 4_000_000;
const MAX_NAMES = 12;

// A test or suite declaration, capturing its name.
const DECLARATIONS = [
  /\b(?:it|test|describe|context|suite|scenario)(?:\.\w+)*(?:\.each\([^)]*\))?\s*\(\s*(['"`])(.*?)\1/,
  /\bdef\s+(test\w*)\s*\(/,
  /\bfunc\s+(Test\w*)\s*\(/,
  /\b(?:void|public|async)\s+(?:\w+\s+)?(test\w+|Test\w+)\s*\(/,
  /\[(?:Fact|Theory|Test|TestMethod)\b[^\]]*\]/,
  /@Test\b/,
];
const declName = (line) => {
  for (const re of DECLARATIONS) {
    const m = line.match(re);
    if (m) return (m[2] ?? m[1] ?? m[0]).trim();
  }
  return null;
};

const ASSERTION = /\b(?:expect|assert\w*|should|verify|require|check)\s*[.(]|\.(?:to|not)\b|\bt\.(?:Error|Fatal|Fail)\w*\(|\bself\.assert\w*\(|\bAssert\.\w+\(|\bexpectation\b/i;

// Constructs that switch a test off or end it before its assertions.
const DISABLING = [
  /\.(?:skip|only|todo|failing)\b/,
  /\b(?:xit|xtest|xdescribe|xcontext|fit|fdescribe|ftest)\s*\(/,
  /@(?:pytest\.mark\.(?:skip\w*|xfail)|unittest\.(?:skip\w*|expectedFailure)|Ignore|Disabled)\b/,
  /\bt\.Skip(?:Now|f)?\s*\(/,
  /\bSkip\s*=/,
  /\b(?:this\.skip|pending|pytest\.skip|xfail)\s*\(/,
  /^\s*return\s*;?\s*$/,
  /\bprocess\.exit\s*\(/,
];

const lcsDiff = (a, b) => {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const ma = endA - start;
  const mb = endB - start;
  if (ma * mb > MAX_CELLS) return null;
  const w = mb + 1;
  const dp = new Uint32Array((ma + 1) * w);
  for (let i = ma - 1; i >= 0; i--) {
    for (let j = mb - 1; j >= 0; j--) {
      dp[i * w + j] = a[start + i] === b[start + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const added = [];
  const removed = [];
  let i = 0;
  let j = 0;
  while (i < ma || j < mb) {
    if (i < ma && j < mb && a[start + i] === b[start + j]) { i++; j++; }
    else if (j < mb && (i === ma || dp[i * w + j + 1] >= dp[(i + 1) * w + j])) { added.push({ n: start + j, text: b[start + j] }); j++; }
    else { removed.push({ n: start + i, text: a[start + i] }); i++; }
  }
  return { added, removed };
};

// Contiguous runs of added lines; a block comment opened or closed inside a run alone could
// comment out lines that are still present, so the run must open and close the same number.
const unbalancedComment = (added) => {
  let run = [];
  const runs = [];
  for (const l of added) {
    if (run.length && l.n !== run[run.length - 1].n + 1) { runs.push(run); run = []; }
    run.push(l);
  }
  if (run.length) runs.push(run);
  return runs.some((r) => {
    const text = r.map((l) => l.text).join('\n');
    return (text.match(/\/\*/g) ?? []).length !== (text.match(/\*\//g) ?? []).length
      || (text.match(/^\s*(?:'''|""")\s*$/gm) ?? []).length % 2 === 1;
  });
};

/**
 * @param {string|null} before the red snapshot (null when none was kept)
 * @param {string|null} after the file now (null when deleted)
 * @returns {{classification: 'additive'|'weakening'|'other', added: number, removed: number, added_tests: string[], removed_tests: string[], reasons: string[]}}
 */
export function classifyTestChange(before, after) {
  const out = { classification: 'other', added: 0, removed: 0, added_tests: [], removed_tests: [], reasons: [] };
  if (after === null) {
    out.classification = 'weakening';
    out.reasons.push('the test file was deleted');
    if (before !== null) out.removed = before.split('\n').length;
    return out;
  }
  if (before === null) {
    out.reasons.push('no snapshot of the red version is available, so the change cannot be read');
    return out;
  }
  const diff = lcsDiff(before.split('\n'), after.split('\n'));
  if (!diff) {
    out.reasons.push('the files are too large to compare line by line');
    return out;
  }
  const { added, removed } = diff;
  out.added = added.length;
  out.removed = removed.length;
  out.added_tests = [...new Set(added.map((l) => declName(l.text)).filter(Boolean))].slice(0, MAX_NAMES);
  out.removed_tests = [...new Set(removed.map((l) => declName(l.text)).filter(Boolean))].slice(0, MAX_NAMES);

  const weak = [];
  if (removed.some((l) => declName(l.text))) weak.push('a test or suite declaration was removed or renamed');
  if (removed.some((l) => ASSERTION.test(l.text))) weak.push('an assertion was removed or changed');
  const disabling = added.filter((l) => DISABLING.some((re) => re.test(l.text)));
  if (disabling.length) weak.push(`an added line skips, focuses or ends a test early (line ${disabling[0].n + 1}: ${disabling[0].text.trim().slice(0, 60)})`);
  if (weak.length) {
    out.classification = 'weakening';
    out.reasons.push(...weak);
    return out;
  }
  if (removed.length) {
    out.reasons.push(`${removed.length} line(s) of the red version were removed or edited`);
    return out;
  }
  if (!added.length) {
    out.reasons.push('only whitespace or line endings changed');
    return out;
  }
  if (unbalancedComment(added)) {
    out.reasons.push('added lines open or close a block comment, which could comment out existing lines');
    return out;
  }
  out.classification = 'additive';
  return out;
}

/** One line for messages and evidence: `+2/-0 additive; adds "case a", "case b"`. */
export function summarizeChange(file, c) {
  const names = c.added_tests.length ? `; adds ${c.added_tests.map((n) => `"${n}"`).join(', ')}` : '';
  const gone = c.removed_tests.length ? `; removes ${c.removed_tests.map((n) => `"${n}"`).join(', ')}` : '';
  const why = c.classification === 'additive' || !c.reasons.length ? '' : ` (${c.reasons.join('; ')})`;
  return `${file} +${c.added}/-${c.removed} ${c.classification}${names}${gone}${why}`;
}

// Snapshots of the red versions are kept in the change state, compressed and keyed by content hash.
export const packSnapshot = (text) => zlib.gzipSync(Buffer.from(text, 'utf8')).toString('base64');
export const unpackSnapshot = (packed) => {
  try { return zlib.gunzipSync(Buffer.from(packed, 'base64')).toString('utf8'); } catch { return null; }
};

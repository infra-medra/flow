// Block-level Markdown tokenizer for medra documents. It finds headings, labelled lines and tables
// while skipping fenced code, so document prose is never matched by whole-file patterns and
// merges can splice blocks byte-for-byte.

export const toLines = (text) => text.replace(/\r\n/g, '\n').split('\n');

/** Headings outside fenced code: [{ level, text, index }] (index is 0-based line number). */
export function headings(lines) {
  const out = [];
  let fence = null;
  lines.forEach((line, index) => {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence) return;
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (h) out.push({ level: h[1].length, text: h[2], index });
  });
  return out;
}

/** Lines of the section under the first heading matching `test`, up to the next heading of level <= its own. */
export function section(lines, test, level) {
  const hs = headings(lines);
  const start = hs.find((h) => (level ? h.level === level : true) && (typeof test === 'string' ? h.text === test : test.test(h.text)));
  if (!start) return null;
  const end = hs.find((h) => h.index > start.index && h.level <= start.level);
  return { heading: start, body: lines.slice(start.index + 1, end ? end.index : lines.length), start: start.index, end: end ? end.index : lines.length };
}

/** Value of a `**Label:** value` line (first match), with surrounding backticks stripped. */
export function label(lines, name) {
  const re = new RegExp(`^\\*\\*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\*\\*\\s*(.*)$`);
  for (const line of lines) {
    const m = line.match(re);
    if (m) return m[1].trim().replace(/^`(.*)`$/, '$1');
  }
  return null;
}

/** Rows of the first pipe table in `lines`: array of cell arrays, header and separator excluded. */
export function tableRows(lines) {
  const rows = [];
  let seenHeader = false;
  for (const line of lines) {
    if (!line.trim().startsWith('|')) {
      if (seenHeader && rows.length) break;
      continue;
    }
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
    if (!seenHeader) { seenHeader = true; continue; }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

export const nonEmpty = (lines) => lines.filter((l) => l.trim() !== '');

export function trimBlank(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === '') a++;
  while (b > a && lines[b - 1].trim() === '') b--;
  return lines.slice(a, b);
}

export const firstSentence = (text) => {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1] : t;
};

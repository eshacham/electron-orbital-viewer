#!/usr/bin/env node
// §14 check 5: the science text on screen -- iso note, enclosed fraction, key
// wording, orbital labels, configuration -- identical to main for the same URL.
//   node tools/design/science_diff.mjs /tmp/6g1-T19main-metrics.json /tmp/6g1-T19-metrics.json [--sizes desktop,phone]
//
// Levels Task 9: the text moved out of the panels into Info, so a field-by-field read no longer finds most of it. Two
// checks now:
//   1. The ★ fields (phaseKey, plotLegend, enclosedNote, subshellChips, configuration), dark desktop, as before --
//      shoot.mjs reads enclosedNote and configuration from Info where their old place is gone.
//   2. "Moved, not changed": when both runs were shot with --sweep, every sentence of one side's metrics.scienceText
//      is looked for anywhere in the other side's text of the same scene and size. A sentence found only after the
//      typography rules (subscripts and superscripts read flat, U+2212 read as '-', ×10ⁿ read as e-notation, '_'
//      dropped, no-break and thin spaces read as spaces) is listed as (a) typography; one not found at all is listed
//      as main-only or branch-only, to be classified by hand in CHECKLIST.md (ruled change or unexplained).
// Exits 1 when any difference other than typography is left.
import { readFileSync } from 'node:fs';

// Task 9 review M9: options are parsed by name, so a file is any other argument (no guessing from its spelling).
const args = process.argv.slice(2);
const sizesAt = args.indexOf('--sizes');
const sizes = (sizesAt >= 0 ? args[sizesAt + 1] : 'desktop').split(',');
const files = args.filter((a, i) => !a.startsWith('--') && !(sizesAt >= 0 && i === sizesAt + 1));
if (files.length !== 2) throw new Error('usage: science_diff.mjs <main-metrics.json> <branch-metrics.json> [--sizes desktop,phone]');
const [mainFile, branchFile] = files;
const load = file => JSON.parse(readFileSync(file, 'utf8'));
const mainShots = load(mainFile).filter(s => s.theme === 'dark');
const branchShots = load(branchFile).filter(s => s.theme === 'dark');

// 1. The ★ fields.
const byScene = shots => Object.fromEntries(shots.filter(s => s.size === 'desktop').map(s => [s.scene, s.metrics.text]));
const main = byScene(mainShots);
const branch = byScene(branchShots);
const FIELDS = ['phaseKey', 'plotLegend', 'enclosedNote', 'subshellChips', 'configuration'];
let differences = 0;
let typography = 0;

const MINUS = new RegExp(String.fromCharCode(0x2212), 'g');
/** The typography rules of the levels plan, applied to both sides before comparing. (Not exported: this file is a CLI
 * that runs on import -- Task 9 review M9.) */
function flat(text) {
  return String(text)
    .normalize('NFKC')                                     // ₂ → 2, ᵥ → v, ₑ → e, ⁻³ → U+2212 3, nbsp → space
    .replace(MINUS, '-')                                   // after NFKC, which makes a superscript minus U+2212
    .replace(/\p{Zs}/gu, ' ')                              // no-break, thin and narrow no-break spaces
    .replace(/_/g, '')
    .replace(/(\d(?:\.\d+)?)\s*×\s*10\s*([-+]?)(\d+)/g, (_, m, sign, e) => `${m}e${sign === '+' ? '' : sign}${e}`)
    .replace(/(\d)\s+%/g, '$1%')
    .replace(/\s+/g, ' ')
    .trim();
}

console.log('== 1. The ★ fields (dark desktop)');
for (const scene of Object.keys(main)) {
  for (const field of FIELDS) {
    const before = JSON.stringify(main[scene]?.[field] ?? null);
    const after = JSON.stringify(branch[scene]?.[field] ?? null);
    if (before === after) continue;
    const typographic = flat(before) === flat(after);
    if (typographic) typography++;
    else differences++;
    console.log(`${scene} ${field}${typographic ? '  (a) typography' : ''}\n  main:   ${before}\n  branch: ${after}`);
  }
}

// 2. Moved, not changed.
const sentences = block => block.split(/(?<=[.;!?])\s+(?=[^a-z])/u).map(s => s.trim()).filter(Boolean);
const key = s => `${s.scene}|${s.size}`;
const sweptMain = new Map(mainShots.filter(s => s.metrics.scienceText && sizes.includes(s.size)).map(s => [key(s), s]));
const sweptBranch = new Map(branchShots.filter(s => s.metrics.scienceText && sizes.includes(s.size)).map(s => [key(s), s]));
/** sentence → { scenes, kind, flat } across every scene, so a sentence shared by several scenes is listed once. */
const found = new Map();
const note = (sentence, where, kind) => {
  const entry = found.get(`${kind}|${sentence}`) ?? { sentence, kind, where: [] };
  entry.where.push(where);
  found.set(`${kind}|${sentence}`, entry);
};
for (const [k, mainShot] of sweptMain) {
  const branchShot = sweptBranch.get(k);
  if (!branchShot) { console.log(`(no branch sweep for ${k})`); continue; }
  const sides = [['main-only', mainShot.metrics.scienceText, branchShot.metrics.scienceText],
    ['branch-only', branchShot.metrics.scienceText, mainShot.metrics.scienceText]];
  for (const [kind, ours, theirs] of sides) {
    const raw = theirs.join(' ¶ ');
    const flatTheirs = flat(raw);
    for (const sentence of new Set(ours.flatMap(sentences))) {
      if (raw.includes(sentence)) continue;
      note(sentence, k, flatTheirs.includes(flat(sentence)) ? `${kind} (a) typography` : kind);
    }
  }
}
if (sweptMain.size) {
  for (const kind of ['main-only', 'branch-only', 'main-only (a) typography', 'branch-only (a) typography']) {
    const entries = [...found.values()].filter(e => e.kind === kind);
    console.log(`\n== 2. ${kind}: ${entries.length}`);
    for (const e of entries) console.log(`- ${JSON.stringify(e.sentence)}\n    in ${e.where.join(', ')}`);
    if (kind.includes('typography')) typography += entries.length;
    else differences += entries.length;
  }
}

console.log(differences
  ? `\n${differences} difference(s) besides ${typography} typographic one(s): each must be classified in CHECKLIST.md or fixed`
  : `\nscience text identical to main apart from ${typography} typographic difference(s)`);
process.exit(differences ? 1 : 0);

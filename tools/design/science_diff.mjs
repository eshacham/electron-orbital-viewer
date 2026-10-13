#!/usr/bin/env node
// §14 check 5: the science text on screen -- iso note, enclosed fraction, key
// wording, orbital labels, configuration -- identical to main for the same URL.
//   node tools/design/science_diff.mjs /tmp/6g1-T19main-metrics.json /tmp/6g1-T19-metrics.json
import { readFileSync } from 'node:fs';

const [mainFile, branchFile] = process.argv.slice(2);
const load = file => JSON.parse(readFileSync(file, 'utf8'));
const byScene = shots => Object.fromEntries(shots.filter(s => s.size === 'desktop' && s.theme === 'dark').map(s => [s.scene, s.metrics.text]));
const main = byScene(load(mainFile));
const branch = byScene(load(branchFile));
const FIELDS = ['phaseKey', 'plotLegend', 'enclosedNote', 'subshellChips', 'configuration'];
let differences = 0;
for (const scene of Object.keys(main)) {
  for (const field of FIELDS) {
    const before = JSON.stringify(main[scene]?.[field] ?? null);
    const after = JSON.stringify(branch[scene]?.[field] ?? null);
    if (before !== after) {
      differences++;
      console.log(`${scene} ${field}\n  main:   ${before}\n  6G-1:   ${after}`);
    }
  }
}
console.log(differences ? `${differences} difference(s): each must be explained in CHECKLIST.md or fixed` : 'science text identical to main');
process.exit(differences ? 1 : 0);

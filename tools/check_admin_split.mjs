// Proves on a real build that the owner dashboard's code ships only with
// /admin.html: walks every JS chunk each page can load (its <script> and
// modulepreload tags, then every chunk those import, statically or lazily,
// and worker URLs) and looks for strings only the dashboard contains.
//   npm run build && npm run check:admin-split
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const MARKERS = ['eov-admin-dashboard', 'Daily spend'];
const CHUNK = /["'`(](?:\.\/|\/?assets\/)([\w.-]+\.js)["'`)]/g;

function chunksOf(page) {
  const html = readFileSync(join(dist, page), 'utf8');
  const queue = [...html.matchAll(/(?:src|href)="\/assets\/([\w.-]+\.js)"/g)].map(m => m[1]);
  const seen = new Set();
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    const file = join(dist, 'assets', name);
    if (!existsSync(file)) continue;
    seen.add(name);
    for (const m of readFileSync(file, 'utf8').matchAll(CHUNK)) queue.push(m[1]);
  }
  return seen;
}

function markersIn(chunks) {
  const found = new Set();
  for (const name of chunks) {
    const text = readFileSync(join(dist, 'assets', name), 'utf8');
    for (const marker of MARKERS) if (text.includes(marker)) found.add(marker);
  }
  return found;
}

const main = chunksOf('index.html');
const admin = chunksOf('admin.html');
console.log(`main page: ${main.size} chunks; dashboard: ${admin.size} chunks`);
const present = markersIn(admin);
if (present.size !== MARKERS.length) {
  console.error(`check is blind: the dashboard's own chunks lack ${MARKERS.filter(m => !present.has(m)).join(', ')}`);
  process.exit(1);
}
const leaked = markersIn(main);
if (leaked.size) {
  console.error(`dashboard code in the main bundle: ${[...leaked].join(', ')}`);
  process.exit(1);
}
console.log('admin split ok: no dashboard code reachable from index.html');

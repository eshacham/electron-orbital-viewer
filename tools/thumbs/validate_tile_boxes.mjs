#!/usr/bin/env node
// Runs validate_tile_boxes.ts (rulings T10-core / T10-core-I2): every Bonds molecule × scan point
// × {90, 95, 99} %, no strip tile cut by its fitted box -- and (Task 15) every library molecule's
// frontier tiles, the Molecules strip's. First fetches every scan point's basis.json, and every
// library molecule's meta.json and basis.json, through its own Vite (the dev server serves the molecule data, from
// tools/molecules/out when it exists locally, else from the published site) into --data, once;
// then bundles the sweep with the repo's esbuild and runs it with node (~70 s). Foreground only:
// Vite is started and stopped inside this run, and never on the owner's ports.
//   node tools/thumbs/validate_tile_boxes.mjs [--data /tmp/eov-tile-box-data] [--port 5411] [--only c2]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOLECULE_DATA_VERSION } from '../../src/molecules/data_version.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OWNER_PORTS = new Set([5173, 5174, 5391, 5416, 5419, 8787]);
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const port = Number(arg('port', '5411'));
if (OWNER_PORTS.has(port)) throw new Error(`port ${port} is the owner's; use 5411-5415`);
const data = resolve(arg('data', join(tmpdir(), 'eov-tile-box-data', MOLECULE_DATA_VERSION)));
const only = arg('only', null);

const bundle = join(tmpdir(), 'eov-validate-tile-boxes.cjs');
const built = spawnSync(join(ROOT, 'node_modules/.bin/esbuild'),
  [join(ROOT, 'tools/thumbs/validate_tile_boxes.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${bundle}`, '--log-level=warning'],
  { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 2);
const run = extra => spawnSync(process.execPath, [bundle, '--data', data, ...extra], { stdio: 'inherit' }).status;

if (!existsSync(join(data, 'complete.json')) || !existsSync(join(data, 'library', 'complete.json'))) {
  const vite = spawn(join(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--clearScreen', 'false'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('Vite did not start within 30 s')), 30000);
      const watch = chunk => { if (String(chunk).includes(`localhost:${port}`)) { clearTimeout(timer); ok(); } };
      vite.stdout.on('data', watch);
      vite.stderr.on('data', watch);
      vite.on('exit', code => { clearTimeout(timer); fail(new Error(`Vite exited with ${code}`)); });
    });
    // The fetch runs in a child, so this process's event loop stays free while it waits.
    const fetched = await new Promise(done => {
      const child = spawn(process.execPath, [bundle, '--data', data, '--fetch', `http://localhost:${port}/molecules/${MOLECULE_DATA_VERSION}`], { stdio: 'inherit' });
      child.on('exit', code => done(code));
    });
    if (fetched !== 0) process.exit(fetched ?? 2);
  } finally {
    vite.kill('SIGTERM');
  }
}
process.exit(run(only ? ['--only', only] : []) ?? 2);

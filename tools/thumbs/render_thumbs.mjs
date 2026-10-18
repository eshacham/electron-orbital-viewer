#!/usr/bin/env node
// Build-time structure thumbnails for the molecule library (spec §12 item 2, ruling P11).
// Starts its own Vite on a free port and its own headless Chromium, opens the dev-only
// /thumbs.html for every libraryEntries() id of the published index.json, and writes
// the page's canvas -- the app's own ball-and-stick, transparent -- as a WebP to
// public/static/molecule-thumbs/<data version>/<id>.webp (served and shipped at
// /molecule-thumbs/<version>/<id>.webp, ruling T11-pub). Stops both in the same
// foreground run; never touches the owner's browser or servers.
//   node tools/thumbs/render_thumbs.mjs [--port 5411] [--gl metal]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOLECULE_DATA_VERSION } from '../../src/molecules/data_version.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'public/static/molecule-thumbs', MOLECULE_DATA_VERSION);
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR ?? '/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/';
const { chromium } = createRequire(PLAYWRIGHT)('playwright');
const OWNER_PORTS = new Set([5173, 5174, 5391, 8787]);
// §12: 264 × 264 shown at 2×. Resized only if sharp is installed -- it is not a
// dependency, and the page's 528 px canvas is that 2× already.
const SHOWN_PX = 264;
let sharp = null;
try { sharp = createRequire(join(ROOT, 'package.json'))('sharp'); } catch { /* not installed: ship the 528 px capture */ }

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const port = Number(arg('port', '5411'));
if (OWNER_PORTS.has(port)) throw new Error(`port ${port} is the owner's; use 5411-5419`);
// As tools/design/shoot.mjs: SwiftShader (software) by default, or the Mac's GPU through ANGLE's Metal.
const GL_ARGS = {
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  metal: ['--use-angle=metal', '--ignore-gpu-blocklist'],
};
const gl = arg('gl', 'swiftshader');
if (!GL_ARGS[gl]) throw new Error(`unknown --gl ${gl} (swiftshader | metal)`);

function startVite() {
  const vite = spawn(resolve(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--clearScreen', 'false'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('Vite did not start within 30 s')), 30000);
    const watch = chunk => { if (String(chunk).includes(`localhost:${port}`)) { clearTimeout(timer); ok(); } };
    vite.stdout.on('data', watch);
    vite.stderr.on('data', chunk => { process.stderr.write(chunk); watch(chunk); });
    vite.on('exit', code => { clearTimeout(timer); fail(new Error(`Vite exited with ${code}`)); });
  });
  return { vite, ready };
}

/** Waits for the page to set `flag` (or __thumbError), and returns the flag's value. */
async function waitFor(page, flag) {
  await page.waitForFunction(name => window[name] !== undefined || window.__thumbError !== undefined, flag, { timeout: 60000 });
  const [value, error] = await page.evaluate(name => [window[name], window.__thumbError], flag);
  if (error !== undefined) throw new Error(`${page.url()}: ${error}`);
  return value;
}

const { vite, ready } = startVite();
let browser;
try {
  await ready;
  browser = await chromium.launch({ args: GL_ARGS[gl] });
  const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  const base = `http://localhost:${port}/thumbs.html`;
  await page.goto(base);
  const ids = await waitFor(page, '__thumbIds');
  mkdirSync(OUT, { recursive: true });
  for (const id of ids) {
    await page.goto(`${base}?id=${encodeURIComponent(id)}`);
    await waitFor(page, '__thumbReady');
    // The canvas's own pixels, alpha included (Playwright's screenshot encodes PNG or JPEG only).
    const { dataUrl, width, height } = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return { dataUrl: canvas.toDataURL('image/webp', 0.9), width: canvas.width, height: canvas.height };
    });
    if (!dataUrl.startsWith('data:image/webp;')) throw new Error(`${id}: this browser did not encode WebP`);
    let bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    let side = `${width}x${height}`;
    if (sharp) {
      bytes = await sharp(bytes).resize(SHOWN_PX, SHOWN_PX).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
      side = `${SHOWN_PX}x${SHOWN_PX}`;
    }
    writeFileSync(join(OUT, `${id}.webp`), bytes);
    console.log(`${id} ${side} ${(bytes.length / 1024).toFixed(1)} KB`);
  }
  // The folder holds exactly the library (tests/molecules/thumb_files.test.ts).
  for (const name of readdirSync(OUT).filter(name => !ids.includes(name.replace(/\.webp$/, '')))) {
    rmSync(join(OUT, name));
    console.log(`removed ${name}`);
  }
  console.log(`${ids.length} written${sharp ? '' : ` (no sharp: ${SHOWN_PX * 2} px, the 2× capture)`}`);
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}

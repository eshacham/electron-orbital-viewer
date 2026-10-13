#!/usr/bin/env node
// Spec §13's keyboard check, live: its own Vite and headless Chromium (never
// the owner's), Tab through the Atom view at 1440 × 900, print every stop,
// and fail if any stop shows no 2 px focus ring. Composite MUI controls draw
// their ring on a wrapper, which is what is measured for them. A ring counts
// only if it is solid and in the theme's focus-ring colour (§13) -- the
// browser's own `outline: auto` is not the spec's ring.
//   node tools/design/keyboard_walk.mjs [--port 5411] [--theme dark|light]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR ?? '/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/';
const { chromium } = createRequire(PLAYWRIGHT)('playwright');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const port = Number(arg('port', '5411'));
const theme = arg('theme', 'dark');
if ([5173, 5391, 8787].includes(port)) throw new Error(`port ${port} is the owner's; use 5411-5419`);

const vite = spawn(resolve(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--clearScreen', 'false'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const ready = new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('Vite did not start within 30 s')), 30000);
  const watch = chunk => { if (String(chunk).includes(`localhost:${port}`)) { clearTimeout(timer); ok(); } };
  vite.stdout.on('data', watch);
  vite.stderr.on('data', watch);
  vite.on('exit', code => { clearTimeout(timer); fail(new Error(`Vite exited with ${code}`)); });
});

let browser;
let failures = 0;
try {
  await ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(theme => { try { window.localStorage.setItem('eov.theme', theme); } catch { /* ignore */ } }, theme);
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/#mode=atom&Z=6&level=orbital&n=2&l=1&ml=0`, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const host = element.closest('.global-search, .MuiSlider-thumb, .MuiInputBase-root, .MuiButtonBase-root') ?? element;
      const style = getComputedStyle(host);
      // The token as the browser resolves it, for comparing with the computed outline colour.
      const probe = document.createElement('span');
      probe.style.color = 'var(--ql-color-focus-ring)';
      document.body.appendChild(probe);
      const ring = getComputedStyle(probe).color;
      probe.remove();
      return {
        role: element.getAttribute('role') ?? element.tagName.toLowerCase(),
        name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 60),
        outline: style.outlineStyle,
        width: parseFloat(style.outlineWidth) || 0,
        colour: style.outlineColor,
        tokenColour: style.outlineColor === ring,
      };
    });
    if (!stop) continue;
    const ok = stop.outline === 'solid' && stop.width >= 2 && stop.tokenColour;
    if (!ok) failures++;
    console.log(`${String(i + 1).padStart(2)} ${ok ? 'ok  ' : 'FAIL'} ${stop.role} "${stop.name}" outline ${stop.outline} ${stop.width}px ${stop.colour}`);
  }
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
if (failures) {
  console.error(`keyboard walk: ${failures} stop(s) without a 2 px focus-ring outline`);
  process.exit(1);
}
console.log(`keyboard walk ok (${theme}): every stop showed a 2 px focus-ring outline`);

#!/usr/bin/env node
// The 6G live visual check (spec §14; the project's ruling D6). Starts its own
// Vite on a free port and its own headless Chromium, captures each scene in
// each theme and size, measures boxes, fonts and colours, then stops both in
// the same foreground run. It never touches the owner's browser or servers.
//   node tools/design/shoot.mjs --task T3 --scenes c-whole,c-2pz --themes dark,light --sizes desktop,phone [--port 5411] [--render '<eov.render JSON>'] [--gl metal] [--dpr 2] [--drawer open] [--crop <selector>]
// Writes /tmp/6g1-<task>-<scene>-<theme>-<size>.png and /tmp/6g1-<task>-metrics.json.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaE2000, hexToLab } from '../../src/design/colour_math.ts';
import { TOKENS } from '../../src/design/tokens.ts';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// --root runs another checkout's app (the `main` comparison of §14 check 5) with this tool and its scenes.
const ROOT = resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : DEFAULT_ROOT);
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR ?? '/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/';
const { chromium } = createRequire(PLAYWRIGHT)('playwright');
const OWNER_PORTS = new Set([5173, 5391, 8787]);
const SIZES = {
  desktop: { width: 1440, height: 900 },
  wide: { width: 1728, height: 1000 },
  tablet: { width: 1024, height: 768 },
  phone: { width: 390, height: 844, mobile: true },
  'phone-landscape': { width: 844, height: 390, mobile: true },
  // Ruling R9: a desktop browser at 200% zoom is 720 CSS px wide -- the phone layout must
  // apply there and nothing may clip. Not `mobile: true`: this is a desktop window, zoomed.
  zoom: { width: 720, height: 450 },
};

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const task = arg('task', 'adhoc');
const port = Number(arg('port', '5411'));
if (OWNER_PORTS.has(port)) throw new Error(`port ${port} is the owner's; use 5411-5419`);
const scenes = JSON.parse(readFileSync(resolve(DEFAULT_ROOT, 'tools/design/scenes.json'), 'utf8'));
const samplePoints = JSON.parse(readFileSync(resolve(DEFAULT_ROOT, 'tools/design/sample_points.json'), 'utf8'));
const sceneNames = arg('scenes', 'c-whole').split(',');
const themes = arg('themes', 'dark,light').split(',');
const sizes = arg('sizes', 'desktop,phone').split(',');
const extraWait = Number(arg('wait', '1500'));
// Optional presentation preferences (eov.render JSON), e.g. '{"finish":"solid"}'.
const renderPrefs = arg('render', null);
// The GL backend: SwiftShader (software, the default) or the Mac's GPU through
// ANGLE's Metal backend. On SwiftShader a Glow frame takes ~80 ms, so ruling
// R10's guard latches the mesh lines and halo off within seconds (ruling
// T15-softgl); on Metal the frames are a real device's and the look is the
// one a user sees. Headless either way, never the owner's browser.
const GL_ARGS = {
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  metal: ['--use-angle=metal', '--ignore-gpu-blocklist'],
};
const gl = arg('gl', 'swiftshader');
if (!GL_ARGS[gl]) throw new Error(`unknown --gl ${gl} (swiftshader | metal)`);
// Device pixel ratio for every shot; 1 by default (the composites), 2 shows what a Retina screen gets.
const dpr = Number(arg('dpr', '1'));
// At medium width the inspector is a folded drawer; `--drawer open` shoots it open (its Display section, ruling R20b-atoms).
const drawerOpen = arg('drawer', 'folded') === 'open';
// --crop <selector>: alongside the full-page shot, an element-only screenshot
// of that selector (at the run's --dpr), so a small, dense control -- the
// periodic-table miniature, ruling R23d -- can be checked for crispness
// without upscaling a raster after the fact.
const cropSelector = arg('crop', null);

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

/** Waits for the canvas to stop saying it is busy, and stay quiet for 2.5 s. */
async function settle(page) {
  const deadline = Date.now() + 60000;
  let quietSince = null;
  while (Date.now() < deadline) {
    const busy = await page.evaluate(() => Boolean(document.querySelector('.canvas-busy'))
      || document.querySelector('#canvas-container')?.getAttribute('data-busy') === 'true');
    if (busy) quietSince = null;
    else if (quietSince === null) quietSince = Date.now();
    else if (Date.now() - quietSince > 2500) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

function collectMetrics() {
  const box = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const font = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const s = getComputedStyle(el);
    return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, line: s.lineHeight };
  };
  const canvases = [...document.querySelectorAll('canvas')];
  return {
    theme: document.documentElement.dataset.theme ?? null,
    title: document.title,
    boxes: Object.fromEntries(['.app-topbar', '.app-rail', '.explore-panel', '#canvas-container', '.inspector', '.thumbnail-strip',
      '.viewport-title', '.viewport-toolbar', '.key-column', '.phone-topbar', '.phone-header', '.phone-sheet',
      '.element-tile', '.periodic-table-mini'].map(s => [s, box(s)])),
    fonts: { title: font('.viewport-title h1'), nav: font('.app-topbar-tab'), body: font('.explore-panel .ql-body') ?? font('.explore-panel'), caption: font('.ql-caption') },
    canvases: canvases.length,
    // DC9b: a canvas that ever received a WebGL context (wrapped in the init
    // script below) is only "the" renderer's canvas while that context is
    // still live -- still connected to the document, and not lost (a
    // disposed renderer calls WEBGL_lose_context, which the browser reflects
    // in gl.isContextLost()). §3.2 allows exactly one live one at a time;
    // webglContextsCreated is every context ever created, for information
    // (a React.StrictMode dev-mode double-invoke creates and disposes one
    // before the kept one, so that number alone over-counts).
    webglCanvases: [...(window.__eovWebglContexts?.entries() ?? [])]
      .filter(([c, gl]) => c.isConnected && !gl.isContextLost()).length,
    webglContextsCreated: window.__eovWebglContextsCreated ?? 0,
    insets: window.__eovInsets ?? null,
    text: {
      title: document.querySelector('.viewport-title')?.textContent ?? null,
      keys: document.querySelector('.key-column')?.textContent ?? null,
      enclosed: document.querySelector('#enclosed-select')?.closest('.MuiFormControl-root')?.textContent ?? null,
      phaseKey: [...document.querySelectorAll('[aria-label="surface colour key"]')].map(e => e.textContent),
      plotLegend: [...document.querySelectorAll('.radial-plot-legend-item')].map(e => e.textContent),
      enclosedNote: document.querySelector('#enclosed-select')?.closest('.MuiFormControl-root')?.querySelector('.MuiFormHelperText-root')?.textContent ?? null,
      subshellChips: [...document.querySelectorAll('.subshell-chip')].map(e => e.textContent),
      configuration: document.querySelector('.level-nav-configuration')?.textContent ?? null,
    },
  };
}

async function sampleColours(page, png, size) {
  const points = samplePoints[size.startsWith('phone') ? 'phone' : 'desktop'];
  return page.evaluate(async ({ b64, points }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0);
    const out = {};
    for (const p of points) {
      const el = document.querySelector(p.selector);
      if (!el) { out[p.name] = null; continue; }
      const r = el.getBoundingClientRect();
      // The screenshot is in device pixels (--dpr), the layout in CSS pixels.
      const k = window.devicePixelRatio || 1;
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round(k * (r.x + (p.px ?? p.x * r.width)))));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(k * (r.y + (p.py ?? p.y * r.height)))));
      const d = g.getImageData(x, y, 1, 1).data;
      out[p.name] = { x, y, token: p.token, hex: `#${[d[0], d[1], d[2]].map(c => c.toString(16).padStart(2, '0')).join('')}` };
    }
    return out;
  }, { b64: png.toString('base64'), points });
}

/** UI tokens within ΔE₀₀ 3; the canvas, drawn on and off, within 5 (the canvas must not paint its own backdrop). */
function judge(on, off, theme) {
  return Object.entries(on).map(([name, s]) => {
    if (!s) return { name, missing: true };
    if (s.token === 'canvas') {
      const dE = deltaE2000(hexToLab(s.hex), hexToLab(off[name].hex));
      return { name, hex: s.hex, canvasOff: off[name].hex, dE: Number(dE.toFixed(2)), pass: dE <= 5 };
    }
    const tokenHex = TOKENS[theme][s.token];
    if (!/^#[0-9a-f]{6}$/i.test(tokenHex)) return { name, hex: s.hex, token: s.token, note: 'token is not one flat colour' };
    const dE = deltaE2000(hexToLab(s.hex), hexToLab(tokenHex));
    return { name, hex: s.hex, token: s.token, tokenHex, dE: Number(dE.toFixed(2)), pass: dE <= 3 };
  });
}

const results = [];
const { vite, ready } = startVite();
let browser;
try {
  await ready;
  browser = await chromium.launch({ args: GL_ARGS[gl] });
  for (const scene of sceneNames) {
    if (!(scene in scenes)) throw new Error(`unknown scene ${scene} (tools/design/scenes.json)`);
    for (const theme of themes) {
      for (const size of sizes) {
        const spec = SIZES[size];
        if (!spec) throw new Error(`unknown size ${size}`);
        const context = await browser.newContext({
          viewport: { width: spec.width, height: spec.height }, isMobile: Boolean(spec.mobile), hasTouch: Boolean(spec.mobile),
          deviceScaleFactor: dpr, reducedMotion: 'reduce',
        });
        await context.addInitScript(({ choice, prefs }) => {
          try {
            window.localStorage.setItem('eov.theme', choice);
            if (prefs) window.localStorage.setItem('eov.render', prefs);
          } catch { /* storage refused: the app keeps its defaults */ }
        }, { choice: theme, prefs: renderPrefs });
        // DC9/DC9b: count WebGL contexts, not canvases by class name. Wraps
        // getContext before any page script runs, and keeps a canvas ->
        // context map for every canvas that receives a context whose type
        // starts with "webgl". collectMetrics (below) reads this map at
        // measurement time and counts only the contexts still live then
        // (§3.2's "one canvas" is about what's live, not what was ever
        // created -- a disposed renderer's canvas should not count).
        await context.addInitScript(() => {
          const contexts = new Map(); // canvas -> its most recent webgl* context
          const everSeen = new Set(); // canvases that ever got one, for webglContextsCreated
          window.__eovWebglContexts = contexts;
          window.__eovWebglContextsCreated = 0;
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            const context = original.call(this, type, ...args);
            if (context && typeof type === 'string' && type.startsWith('webgl')) {
              contexts.set(this, context);
              everSeen.add(this);
              window.__eovWebglContextsCreated = everSeen.size;
            }
            return context;
          };
        });
        const page = await context.newPage();
        const errors = [];
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('pageerror', error => errors.push(String(error)));
        await page.goto(`http://localhost:${port}/${scenes[scene]}`, { waitUntil: 'load' });
        const settled = await settle(page);
        await page.waitForTimeout(extraWait);
        // Ruling R20b-atoms: the Electron-enclosed note is in the inspector now
        // (the Atom Display section, Basic's view settings), so Explore's
        // Configuration tab stays open for the whole capture -- the old
        // Display-tab pass (DX3/DC5) is gone. At medium width the inspector
        // is a folded drawer: open it to read the note, then fold it again
        // unless `--drawer open` asked to shoot it open.
        const readNote = () => page.evaluate(() =>
          document.querySelector('#enclosed-select')?.closest('.MuiFormControl-root')?.querySelector('.MuiFormHelperText-root')?.textContent ?? null);
        const drawerBar = page.locator('.inspector-drawer.folded .inspector-bar-button').first();
        let enclosedNote;
        if (await drawerBar.count()) {
          await drawerBar.click();
          await page.waitForTimeout(400);
          enclosedNote = await readNote();
          if (!drawerOpen) {
            await page.locator('.inspector-drawer .inspector-bar-button[aria-expanded="true"]').first().click();
            await page.waitForTimeout(400);
          }
        } else {
          enclosedNote = await readNote();
        }
        const file = `/tmp/6g1-${task}-${scene}-${theme}-${size}.png`;
        const png = await page.screenshot({ path: file });
        const metrics = await page.evaluate(collectMetrics);
        metrics.text.enclosedNote = enclosedNote;
        const on = await sampleColours(page, png, size);
        let cropFile = null;
        if (cropSelector) {
          const crop = page.locator(cropSelector).first();
          if (await crop.count()) {
            cropFile = `/tmp/6g1-${task}-${scene}-${theme}-${size}-crop.png`;
            await crop.screenshot({ path: cropFile });
          }
        }
        await page.addStyleTag({ content: '#orbital-canvas-host canvas { visibility: hidden !important; }' });
        await page.waitForTimeout(150);
        const off = await sampleColours(page, await page.screenshot(), size);
        results.push({ scene, theme, size, file, cropFile, settled, metrics, colours: judge(on, off, theme), errors });
        console.log(`${file}  settled=${settled}  webgl=${metrics.webglCanvases}  webglCreated=${metrics.webglContextsCreated}  errors=${errors.length}${cropFile ? `  crop=${cropFile}` : ''}`);
        await context.close();
      }
    }
  }
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
writeFileSync(`/tmp/6g1-${task}-metrics.json`, JSON.stringify(results, null, 2));
console.log(`wrote /tmp/6g1-${task}-metrics.json (${results.length} shots)`);

#!/usr/bin/env node
// The 6G live visual check (spec §14; the project's ruling D6). Starts its own
// Vite on a free port and its own headless Chromium, captures each scene in
// each theme and size, measures boxes, fonts and colours, then stops both in
// the same foreground run. It never touches the owner's browser or servers.
//   node tools/design/shoot.mjs --task T3 --scenes c-whole,c-2pz --themes dark,light --sizes desktop,phone [--port 5411] [--render '<eov.render JSON>'] [--display '<eov.display JSON>'] [--gl metal] [--dpr 2] [--drawer open] [--crop <selector>] [--run <label>]
//     [--owner-session] [--jobs-stub [--preview-fixture preview_ok] [--preview-existing get_done]] [--click <name>] [--type <text>] [--press <key>] [--scroll <text>] ...
// Writes /tmp/6g1-<task>-<scene>-<theme>-<size>.png and /tmp/6g1-<task>-<run>-metrics.json
//
// Task 16 of 6G-2 (preflight D3 (a)): the owner's jobs UI, shot without any job server.
//   --owner-session  the dev server's owner: jobs on This Mac (eov.jobs.target = local), which is the owner without
//                    signing in -- the same dev owner src/App.jobs.test.tsx sets up (BUILD_ENV.dev); this build has
//                    no Cognito settings, so there is no session to inject beyond that.
//   --jobs-stub      every /api/... request the page makes is answered from tests/jobs/fixtures/api (the recorded
//                    responses tests/jobs/api_fixtures.ts reads) or aborted and reported as an error -- a submit
//                    (POST /v1/jobs) always is. metrics.api counts what was seen, answered, refused.
//   --jobs-down      (with --jobs-stub; owner R25-A1) the stub answers every /api request as Vite's proxy does when
//                    the local job server is not running: HTTP 500, empty body. Still nothing leaves the browser.
//   Every run (Task 16d): Vite's /api proxy points at a closed port and has no AWS route, so nothing -- stubbed or
//                    not -- can reach a real job server; without --jobs-stub the page's /api requests simply fail.
//   --click/--type/--press/--scroll  scripted steps, in the order given, after the scene settles and before the
//                    shot: click the one control with that accessible name (or that exact text), type into the
//                    focused text field, press a key, scroll an element with that text into view.
//   Guards (fix round 1, T16-M3): --owner-session and every scripted step need --jobs-stub (without it /api
//   has no answer at all). Nothing a step does may send a job: a click is refused when the name asked for,
//   or the control it actually lands on, reads Approve…/Run on…/Retry on…/Submit…; --press takes only keys that
//   cannot activate a control (Escape, Tab, Shift+Tab, arrows, Home, End, PageUp, PageDown -- never Enter or
//   Space); --type types only into a focused text field and never a line break. And the stub aborts POST
//   /v1/jobs whatever happens.
// (--run defaults to a timestamp, so a second invocation for the same --task never overwrites
// the first run's aggregated metrics -- final review B-I2).
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
// Final review B-I2: the metrics file used to be named by --task alone, so a
// second run for the same task (e.g. splitting sizes across invocations to
// keep one run short) silently overwrote the first run's results. --run adds
// a per-invocation label to the filename; it defaults to a timestamp, so two
// runs never collide unless the caller deliberately repeats --run.
const runId = arg('run', new Date().toISOString().replace(/[:.]/g, '-'));
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
// The same for eov.display (Task 14, preflight D15), e.g. '{"moleculeLabels":true}'; the app fills in the fields it omits.
const displayPrefs = arg('display', null);
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
const ownerSession = process.argv.includes('--owner-session');
const jobsStub = process.argv.includes('--jobs-stub');
const previewFixture = arg('preview-fixture', 'preview_ok');
const jobsDown = process.argv.includes('--jobs-down');
// A preview whose molecule is already on record: the preview fixture with a recorded job as its `existing`
// (what tests/jobs/request_panel.test.tsx composes), e.g. --preview-existing get_done → "Already computed — open it".
const previewExisting = arg('preview-existing', null);
// The scripted steps, in argv order.
const steps = [];
for (let i = 2; i < process.argv.length; i++) {
  const step = /^--(click|type|press|scroll)$/.exec(process.argv[i]);
  if (step) steps.push({ kind: step[1], value: process.argv[++i] });
}
// Fix round 1 (T16-M3): steps and the owner session only ever run against the stub.
if ((ownerSession || steps.length) && !jobsStub) {
  throw new Error('--owner-session and --click/--type/--press/--scroll need --jobs-stub: without it /api has no answer');
}
if (jobsDown && !jobsStub) throw new Error('--jobs-down is a mode of --jobs-stub');
// The check stops at the quote: nothing that would send a job is ever activated, even stubbed. "Already
// computed — open it" / "Already running — follow it" only open or follow a job, so they are allowed.
const SENDS_A_JOB = /^\s*(Approve|Run on|Retry on|Submit)/i;
// Keys that move focus or scroll or close, and cannot activate a control (Enter and Space would).
const SAFE_KEYS = new Set(['Escape', 'Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
for (const step of steps) {
  if (step.value === undefined) throw new Error(`--${step.kind} needs a value`);
  if (step.kind === 'click' && SENDS_A_JOB.test(step.value)) throw new Error(`--click "${step.value}" would send a job; the check stops at the quote`);
  if (step.kind === 'press' && !SAFE_KEYS.has(step.value)) throw new Error(`--press "${step.value}" could activate a control; only ${[...SAFE_KEYS].join(', ')}`);
  if (step.kind === 'type' && /[\r\n]/.test(step.value)) throw new Error('--type may not contain a line break');
}

const FIXTURES = resolve(DEFAULT_ROOT, 'tests/jobs/fixtures/api');
const fixture = name => JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8'));
const JOB_FIXTURES = ['get_done', 'get_running', 'get_failed', 'get_done_aws', 'get_absorbed_aws', 'get_legacy_aws', 'get_retried_aws'];
if (jobsStub) fixture(previewFixture);   // an unknown --preview-fixture fails here, before anything starts
if (previewExisting && !JOB_FIXTURES.includes(previewExisting)) throw new Error(`--preview-existing ${previewExisting}: not a job fixture`);
const previewAnswer = () => {
  const answer = fixture(previewFixture);
  return previewExisting ? { ...answer, body: { ...answer.body, existing: fixture(previewExisting).body } } : answer;
};

/** Answers the page's jobs API from the recorded fixtures only; anything else is aborted and logged (preflight D3 (a)). */
async function installJobsStub(context, log) {
  // A computed molecule's result files (/molecules/jobs/<key>/...) are a job's output, not the library: never
  // fetched under the stub (no CDN, no local results folder) -- the page says it could not load them.
  await context.route('**/molecules/jobs/**', route => {
    log.blockedResults.push(new URL(route.request().url()).pathname);
    return route.abort('blockedbyclient');
  });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();   // a module path that merely contains /api/
    const path = url.pathname.replace(/^\/api(\/aws)?/, '');
    const method = request.method();
    let name = null;
    if (method === 'POST' && path === '/v1/jobs/preview') name = previewFixture;
    else if (method === 'GET' && path === '/v1/jobs') name = url.searchParams.get('status') === 'DONE' ? 'list_done' : 'list_all';
    else if (method === 'GET' && path === '/v1/costs') name = 'costs';
    else if (method === 'GET' && path.startsWith('/v1/jobs/')) {
      const key = decodeURIComponent(path.slice('/v1/jobs/'.length));
      name = JOB_FIXTURES.find(n => fixture(n).body.key === key) ?? null;
    }
    const where = `${method} ${url.pathname}${url.search}`;
    // R25-A1: the local job server not running -- what Vite's proxy answers then (a POST /v1/jobs included).
    if (jobsDown) {
      log.stubbed.push(`${where} -> down (500)`);
      return route.fulfill({ status: 500, contentType: 'text/plain', body: '' });
    }
    if (!name) {
      log.refused.push(where);
      return route.abort('blockedbyclient');
    }
    const { status, body } = name === previewFixture ? previewAnswer() : fixture(name);
    log.stubbed.push(`${where} -> ${name} (${status})`);
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

/** The one control named `name` (button, link, tab, radio, ...), else the one element with exactly that text. */
async function findNamed(page, name) {
  for (const role of ['button', 'link', 'tab', 'radio', 'checkbox', 'option', 'menuitem', 'textbox']) {
    const found = page.getByRole(role, { name, exact: true });
    const count = await found.count();
    if (count === 1) return found;
    if (count > 1) throw new Error(`${count} ${role}s are named "${name}"`);
  }
  const text = page.getByText(name, { exact: true });
  const count = await text.count();
  if (count === 1) return text;
  throw new Error(count ? `${count} elements read "${name}"` : `nothing is named "${name}"`);
}

async function runSteps(page) {
  for (const step of steps) {
    if (step.kind === 'click') {
      const target = await findNamed(page, step.value);
      // The control the click actually lands on, not only the name asked for (a text match inside a button).
      const landsOn = await target.evaluate(el => {
        const control = el.closest('button, a, [role="button"], input, summary') ?? el;
        return `${control.getAttribute('aria-label') ?? ''} ${control.textContent ?? ''}`.trim();
      });
      if (SENDS_A_JOB.test(landsOn)) throw new Error(`--click "${step.value}" lands on "${landsOn}", which would send a job`);
      await target.click();
    }
    else if (step.kind === 'scroll') await (await findNamed(page, step.value)).scrollIntoViewIfNeeded();
    else if (step.kind === 'press') await page.keyboard.press(step.value);
    else {
      // A text field only: typed characters on a focused button or radio (a space) would activate it.
      const field = await page.evaluate(() => {
        const el = document.activeElement;
        const text = el?.tagName === 'TEXTAREA'
          || (el?.tagName === 'INPUT' && ['text', 'search', 'number', 'email', 'tel', 'url'].includes(el.type));
        return text ? (el.getAttribute('aria-label') ?? el.tagName) : null;
      });
      if (!field) throw new Error(`--type "${step.value}": no text field has focus`);
      await page.keyboard.type(step.value);
    }
    await page.waitForTimeout(300);
    await settle(page);
  }
}

// Task 16d item 15: in EVERY run -- stubbed or not -- Vite's own /api proxy points at a closed port (discard, 9)
// and has no AWS route. Only --jobs-stub answers /api (in the browser); a plain shot's /api requests fail at the
// proxy, so no run of this tool can ever reach a job server (never the owner's 8787) or the AWS API.
const DEAD_API = 'http://127.0.0.1:9';
const VITE_ENV = { ...process.env, JOBS_LOCAL_API_URL: DEAD_API, JOBS_AWS_API_URL: '' };

function startVite() {
  const env = VITE_ENV;
  const vite = spawn(resolve(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--clearScreen', 'false'],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
      '.element-tile', '.periodic-table-mini', '.request-workspace', '.scale-readout', '.first-view-hint'].map(s => [s, box(s)])),
    // 6G-2 Task 17 fix: overlap (w × h px, 0 when clear, null when either is absent) of what must never cover
    // another zone. `hint`: the first-view hint against every overlay zone (Fail 1, scale readout); `strip`: the
    // strip against the folded drawer bar at medium width (Fail 3).
    overlaps: (() => {
      const rect = selector => {
        const el = document.querySelector(selector);
        const r = el?.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0 ? r : null;
      };
      const overlap = (a, b) => {
        const A = rect(a), B = rect(b);
        if (!A || !B) return null;
        const w = Math.min(A.right, B.right) - Math.max(A.left, B.left);
        const h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        return w > 0 && h > 0 ? { w: Math.round(w), h: Math.round(h) } : 0;
      };
      return {
        hint: Object.fromEntries(['.scale-readout', '.key-column', '.thumbnail-strip', '.viewport-toolbar', '.viewport-title',
          '.inspector-drawer .inspector-bar', '.canvas-busy', '.canvas-unbound', '.phone-topbar', '.phone-header', '.phone-sheet']
          .map(s => [s, overlap('.first-view-hint', s)])),
        strip: { '.inspector-drawer .inspector-bar': overlap('.thumbnail-strip.overlay', '.inspector-drawer .inspector-bar') },
      };
    })(),
    // 6G-2 Task 17 round 2 (ruling T17-key, spec §3.3): the key column inside the canvas cell and on screen, and every
    // key in it whole -- a swatch item, heading or caption that runs past the column, the cell or the window, or is
    // cut inside itself, is listed in `hidden` by its text. `hidden` [] and `insideCell` true is the pass.
    keyColumn: (() => {
      const column = document.querySelector('.key-column');
      const cell = document.querySelector('#canvas-container');
      if (!column || !cell) return null;
      const C = column.getBoundingClientRect(), V = cell.getBoundingClientRect();
      const W = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const within = (r, b) => r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
      const keys = [...column.querySelectorAll('.phase-legend-item, .key-heading, .key-caption, .density-key, .esp-legend, .molecule-hover-caption')]
        .filter(e => !e.closest('.hidden'));
      const hidden = keys.filter(e => {
        const r = e.getBoundingClientRect();
        return !(r.width > 0 && r.height > 0) || !within(r, C) || !within(r, V) || !within(r, W) || e.scrollWidth > e.clientWidth + 1;
      }).map(e => e.textContent.trim());
      return { box: { x: Math.round(C.x), y: Math.round(C.y), width: Math.round(C.width), height: Math.round(C.height) },
        insideCell: within(C, V) && within(C, W), keys: keys.length, hidden };
    })(),
    // 6G-2 Task 17 fix (Fail 2): how much of the MO list's gap note is out of sight -- under the list's sticky key, or
    // past the list's bottom edge. 0 means the note is whole and readable. Owner R25-A4 moved the note (and the key)
    // under the list as its caption: then inList is false, nothing in the list may be sticky (stickyInList 0), the
    // note sits below the list's bottom edge (belowList), and nothing of it can be hidden by the list (hiddenPx 0).
    orbitalGapNote: (() => {
      const list = document.querySelector('.molecule-orbital-list');
      const note = list?.parentElement?.querySelector('.molecule-orbital-gap');
      if (!list || !note) return null;
      const L = list.getBoundingClientRect(), N = note.getBoundingClientRect();
      if (!(N.height > 0)) return null;
      const inList = list.contains(note);
      const stickyInList = [...list.querySelectorAll('*')].filter(e => getComputedStyle(e).position === 'sticky').length;
      const key = inList ? list.querySelector('.molecule-orbital-legend')?.getBoundingClientRect() : null;
      const visibleTop = Math.max(L.top, key ? key.bottom : L.top);
      const hidden = !inList ? 0
        : Math.max(0, Math.min(N.bottom, visibleTop) - N.top) + Math.max(0, N.bottom - Math.max(N.top, L.bottom));
      return { hiddenPx: Math.round(hidden), inList, stickyInList, belowList: N.top >= L.bottom - 0.5,
        noteTop: Math.round(N.top), noteHeight: Math.round(N.height),
        keyBottom: key ? Math.round(key.bottom) : null, listTop: Math.round(L.top), listBottom: Math.round(L.bottom) };
    })(),
    // Task 16: what has focus (Esc returns it to the entry), and anything in the request workspace wider than it.
    focused: (() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return `${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 60) ?? ''}`;
    })(),
    workspaceOverflow: (() => {
      const space = document.querySelector('.request-workspace-body');
      if (!space) return null;
      const r = space.getBoundingClientRect();
      const right = r.right - parseFloat(getComputedStyle(space).paddingRight) + 1;
      return [...space.querySelectorAll('*')].filter(e => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && (b.right > right || b.left < r.left);
      }).map(e => `${e.tagName.toLowerCase()}.${e.className}`).slice(0, 10);
    })(),
    quoteLines: [...document.querySelectorAll('.request-workspace .quote-line')].map(e => ({
      width: Math.round(e.getBoundingClientRect().width), clipped: e.scrollWidth > e.clientWidth + 1, text: e.textContent,
    })),
    // Final review B-I2: '.ql-caption' alone read null in every capture -- the only elements
    // that carry that literal class (orbital facts' notes, the energy table caption, a search
    // result's detail line) are gated behind a tab or a query that most scenes never open. The
    // key column's heading/caption spans (viewport.css) share the same --ql-type-caption-size
    // role and are real, visible text in virtually every scene (spec §3.3: every colour has a
    // key) -- fall back to '.ql-caption' only if a scene truly has neither.
    fonts: {
      title: font('.viewport-title h1'), nav: font('.app-topbar-tab'),
      body: font('.explore-panel .ql-body') ?? font('.explore-panel'),
      caption: font('.key-heading') ?? font('.key-caption') ?? font('.ql-caption'),
    },
    canvases: canvases.length,
    // D15: the strip's own tiles aren't WebGL -- their canvases are 2D, so they
    // don't show up in webglCanvases below. ThumbnailStrip.tsx (Task 8) marks
    // each one data-drawn="true" once its picture (not its glyph) is showing;
    // this counts how many of them have settled by the time the capture runs.
    thumbsDrawn: document.querySelectorAll('.thumb-canvas[data-drawn="true"]').length,
    url: location.href,
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
      // Task 14: the on-model labels shown (placed by a frame), and the large-molecule hint.
      modelLabels: [...document.querySelectorAll('.model-label')].filter(e => getComputedStyle(e).visibility === 'visible').map(e => e.textContent),
      modelLabelHint: document.querySelector('.model-label-hint')?.textContent ?? null,
      // Task 14 fix round 1 (ruling T14-I1): how many labels are hidden as overlapping, when any are.
      modelLabelOverlap: document.querySelector('.model-label-overlap:not([hidden])')?.textContent ?? null,
    },
  };
}

// Final review B-I2: 'zoom' (720 CSS px) used to fall into the 'desktop' bucket by elimination
// (its name does not start with 'phone'), even though ruling R9 makes NARROW_VIEWPORT match at
// that width -- the app renders its phone layout there, so desktop-only selectors like
// '.explore-panel' and the pre-R23a '.app-rail' sampled nothing. 'phone-landscape' and 'zoom'
// both render the phone layout; only their viewport dimensions differ.
const PHONE_LAYOUT_SIZES = new Set(['phone', 'phone-landscape', 'zoom']);

async function sampleColours(page, png, size) {
  const points = samplePoints[PHONE_LAYOUT_SIZES.has(size) ? 'phone' : 'desktop'];
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
      // `dx` (6G-2 Task 17 fix) shifts a fractional x by CSS px: x 1, dx 8 is 8 px past the element's right edge.
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round(k * (r.x + (p.px ?? p.x * r.width) + (p.dx ?? 0)))));
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
        await context.addInitScript(({ choice, prefs, display }) => {
          try {
            window.localStorage.setItem('eov.theme', choice);
            if (prefs) window.localStorage.setItem('eov.render', prefs);
            if (display) window.localStorage.setItem('eov.display', display);
          } catch { /* storage refused: the app keeps its defaults */ }
        }, { choice: theme, prefs: renderPrefs, display: displayPrefs });
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
        if (ownerSession) {
          await context.addInitScript(() => {
            try { window.localStorage.setItem('eov.jobs.target', 'local'); } catch { /* storage refused */ }
          });
        }
        const api = { seen: [], stubbed: [], refused: [], blockedResults: [] };
        if (jobsStub) await installJobsStub(context, api);
        const page = await context.newPage();
        const errors = [];
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('pageerror', error => errors.push(String(error)));
        page.on('request', request => {
          const url = new URL(request.url());
          if (url.pathname.startsWith('/api/')) api.seen.push(`${request.method()} ${url.pathname}${url.search}`);
        });
        await page.goto(`http://localhost:${port}/${scenes[scene]}`, { waitUntil: 'load' });
        let settled = await settle(page);
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
          // Final review B-I2 (deferred from Task 19): a blind 400 ms timeout, not an explicit
          // settle -- on a slower run the drawer's open transition (or a re-fit it triggers)
          // could still be in flight when the note was read or the open shot was taken. settle()
          // is the same wait the initial load uses: quiet for the canvas, not a guess at a duration.
          await settle(page);
          enclosedNote = await readNote();
          if (!drawerOpen) {
            await page.locator('.inspector-drawer .inspector-bar-button[aria-expanded="true"]').first().click();
            await settle(page);
          }
        } else {
          enclosedNote = await readNote();
        }
        // The scripted steps run last, after the drawer's own clicks, so what they leave (focus, hover) is what is shot.
        if (steps.length) {
          try {
            await runSteps(page);
          } catch (error) {
            errors.push(`step failed: ${error.message}`);
          }
          settled = await settle(page);
          await page.waitForTimeout(extraWait);
        }
        const file = `/tmp/6g1-${task}-${scene}-${theme}-${size}.png`;
        const png = await page.screenshot({ path: file });
        const metrics = await page.evaluate(collectMetrics);
        // 6G-2 Task 17: under ruling R24-3 the inspector opens its content section, so Display (and the note) is
        // folded at load; a run with `--click Display` reads it after the steps instead (collectMetrics' own read).
        metrics.text.enclosedNote = enclosedNote ?? metrics.text.enclosedNote;
        // Every /api request the page made, and what answered it; with --jobs-stub, notStubbed must be 0.
        metrics.api = {
          seen: api.seen.length, stubbed: api.stubbed, refused: api.refused, blockedResults: api.blockedResults,
          notStubbed: jobsStub ? api.seen.length - api.stubbed.length - api.refused.length : null,
        };
        for (const refused of api.refused) errors.push(`jobs stub refused ${refused}`);
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
        console.log(`${file}  settled=${settled}  webgl=${metrics.webglCanvases}  webglCreated=${metrics.webglContextsCreated}  errors=${errors.length}${cropFile ? `  crop=${cropFile}` : ''}${jobsStub ? `  api seen=${api.seen.length} stubbed=${api.stubbed.length} refused=${api.refused.length}` : ''}`);
        await context.close();
      }
    }
  }
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
const metricsFile = `/tmp/6g1-${task}-${runId}-metrics.json`;
writeFileSync(metricsFile, JSON.stringify(results, null, 2));
console.log(`wrote ${metricsFile} (${results.length} shots)`);

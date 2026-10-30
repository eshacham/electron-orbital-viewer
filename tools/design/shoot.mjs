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
//   --computed-meta <file>  (with --jobs-stub; Task 7b of the levels plan) a computed molecule to look at: its job's
//                    done.json and meta.json (/molecules/jobs/<meta.id>/...) are answered from this local meta file,
//                    so `#mode=molecule&job=<meta.id>` loads it; every other job file stays blocked (no grids: shoot it
//                    with show=none). Nothing is fetched from a real job's results. Opt-in: without the flag a stub
//                    run blocks every job file, as before. Given bare (no file), it uses the committed
//                    tools/design/computed_water_meta.json (water as a computed job: a PubChem single point, no
//                    references), the meta the `computed-water-structure` scene names.
//   --jobs-down      (with --jobs-stub; owner R25-A1) the stub answers every /api request as Vite's proxy does when
//                    the local job server is not running: HTTP 500, empty body. Still nothing leaves the browser.
//   Every run (Task 16d): Vite's /api proxy points at a closed port and has no AWS route, so nothing -- stubbed or
//                    not -- can reach a real job server; without --jobs-stub the page's /api requests simply fail.
//   --click/--type/--press/--scroll/--hover  scripted steps, in the order given, after the scene settles and before
//                    the shot: click the one control with that accessible name (or that exact text), type into the
//                    focused text field, press a key, scroll an element with that text into view, or rest the pointer
//                    on the one control so named (owner R26: a hover state, shot; it presses nothing).
//   Guards (fix round 1, T16-M3): --owner-session and every scripted step need --jobs-stub (without it /api
//   has no answer at all). Nothing a step does may send a job: a click is refused when the name asked for,
//   or the control it actually lands on, reads Approve…/Run on…/Retry on…/Submit…; --press takes only keys that
//   cannot activate a control (Escape, Tab, Shift+Tab, arrows, Home, End, PageUp, PageDown -- never Enter or
//   Space); --type types only into a focused text field and never a line break. And the stub aborts POST
//   /v1/jobs whatever happens.
// (--run defaults to a timestamp, so a second invocation for the same --task never overwrites
// the first run's aggregated metrics -- final review B-I2).
//
// Task 9 of the levels plan:
//   --level <basics|explore|advanced|research>  writes eov.level before the page loads (as the theme is), so a shot
//                    is at that learning level; omitted, the app's own default (Explore) applies. A checkout without
//                    levels (the `main` baseline) ignores the key, so the same flag shoots both sides of a diff.
//   --sweep          after the shot, reads the science text of every state the panels can show without changing
//                    what is drawn: each inspector section and each tab (Plot/Data, R(r)/|R|²/D(r), the Explore
//                    tabs, the phone sheet's tabs) is opened in turn and its text blocks collected into
//                    metrics.scienceText -- the "moved, not changed" input of science_diff.mjs.
//   Every shot also measures Info (metrics.info: height, its share of the inspector, whether it scrolls inside, where
//   "How this was computed" sits, whether a fact's (i) wrapped under its label) and metrics.plotHeaderVisible (the
//   "Plot and data" header on screen and on top: Review Focus 4); infoHeightPx is metrics.info.heightPx.
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
  // Picture-is-the-control, Task 5 Step 2: the left column's narrow and wide ends named in the brief (1280 and
  // 1920 px); 1440 is already `desktop`.
  '1280': { width: 1280, height: 900 },
  '1920': { width: 1920, height: 1080 },
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
if (process.argv.includes('--computed-meta') && !jobsStub) throw new Error('--computed-meta is a mode of --jobs-stub');
// Fix round 2 (N3): opt-in again -- a default --jobs-stub run answers no job file; a bare flag takes the committed fixture.
const computedMetaArg = process.argv.includes('--computed-meta') ? (arg('computed-meta', null) ?? null) : undefined; // ?? : a bare last flag has no next token
const computedMetaFile = computedMetaArg === undefined ? null
  : computedMetaArg && !computedMetaArg.startsWith('--') ? computedMetaArg
  : resolve(DEFAULT_ROOT, 'tools/design/computed_water_meta.json');
const computedMeta = computedMetaFile ? JSON.parse(readFileSync(resolve(computedMetaFile), 'utf8')) : null;
// A preview whose molecule is already on record: the preview fixture with a recorded job as its `existing`
// (what tests/jobs/request_panel.test.tsx composes), e.g. --preview-existing get_done → "Already computed — open it".
const previewExisting = arg('preview-existing', null);
// Task 9 (levels): the learning level, written as eov.level before load; null leaves the app's default.
const LEVELS = ['basics', 'explore', 'advanced', 'research'];
const level = arg('level', null);
if (level !== null && !LEVELS.includes(level)) throw new Error(`unknown --level ${level} (${LEVELS.join(' | ')})`);
const sweep = process.argv.includes('--sweep');
const infoWidth = Number(arg('info-width', '0'));
// The scripted steps, in argv order.
const steps = [];
for (let i = 2; i < process.argv.length; i++) {
  const step = /^--(click|type|press|scroll|hover)$/.exec(process.argv[i]);
  if (step) steps.push({ kind: step[1], value: process.argv[++i] });
}
// Fix round 1 (T16-M3): steps and the owner session only ever run against the stub.
if ((ownerSession || steps.length) && !jobsStub) {
  throw new Error('--owner-session and --click/--type/--press/--scroll/--hover need --jobs-stub: without it /api has no answer');
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
    const path = new URL(route.request().url()).pathname;
    // --computed-meta: that one job's done.json and meta.json, from the local file; nothing else.
    if (computedMeta && path === `/molecules/jobs/${computedMeta.id}/done.json`) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: { 'meta.json': 'stub' } }) });
    }
    if (computedMeta && path === `/molecules/jobs/${computedMeta.id}/meta.json`) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(computedMeta) });
    }
    log.blockedResults.push(path);
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
    else if (step.kind === 'hover') await (await findNamed(page, step.value)).hover();
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
  // Final review: a typeset label is its aria-hidden visual beside a visually hidden plain copy (subscripts.ts
  // typesetLabel); text is read as the eye reads it, the copies left out.
  const seen = el => {
    if (!el) return null;
    const copy = el.cloneNode(true);
    copy.querySelectorAll('.typeset-label > .visually-hidden').forEach(n => n.remove());
    return copy.textContent;
  };
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
  // An Info fact's value by its label's text (an (i) in the label adds no text), or null.
  const infoFact = label => [...document.querySelectorAll('.info-section .info-fact')]
    .find(f => seen(f.querySelector('dt'))?.trim() === label)?.querySelector('dd') ?? null;
  const infoFactText = label => seen(infoFact(label));
  return {
    theme: document.documentElement.dataset.theme ?? null,
    title: document.title,
    boxes: Object.fromEntries(['.app-topbar', '.app-rail', '.explore-panel', '#canvas-container', '.inspector', '.thumbnail-strip',
      '.viewport-title', '.viewport-toolbar', '.key-column', '.phone-topbar', '.phone-header', '.phone-sheet',
      '.element-tile', '.periodic-table-mini', '.request-workspace', '.scale-readout', '.first-view-hint',
      '.inspector-info', '.info-section', '.phone-caption'].map(s => [s, box(s)])),
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
        // Levels Task 9 (addendum item 5): the phone caption under the header against what shares the canvas's top.
        caption: Object.fromEntries(['.scale-readout', '.key-column', '.viewport-toolbar', '.phone-topbar', '.phone-header',
          '.first-view-hint', '.canvas-busy'].map(s => [s, overlap('.phone-caption', s)])),
      };
    })(),
    // Levels Task 9: Info as laid out. heightPx is the plan's infoHeightPx. `share` is its height over the inspector
    // column's (docked or drawer; addendum item 1: at most 0.45); `scrolls` says it scrolls inside itself, and
    // `scrollbarPx` whether a classic scrollbar shows it. `computed` places the "How this was computed" summary against
    // Info's visible bottom (addendum item 2: `cut` when it is below the fold or straddles it). `factButtons` lists every
    // fact label carrying an (i) and whether the (i) sits on a later line than the label's first (addendum item 3), and
    // whether the value went below the label. `lastNote` is the last note's place against the visible scroller (item 4).
    info: (() => {
      const section = document.querySelector('.info-section');
      if (!section) return null;
      const round = n => Math.round(n);
      // What scrolls Info: the docked/drawer slot, else the phone sheet's body (or a stacked inspector's scroller).
      const scrollerOf = el => {
        for (let e = el.parentElement; e; e = e.parentElement) {
          const s = getComputedStyle(e);
          if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > 0) return e;
        }
        return null;
      };
      const slot = section.closest('.inspector-info');
      const scroller = slot ?? scrollerOf(section);
      const S = (scroller ?? section).getBoundingClientRect();
      const visibleBottom = Math.min(S.bottom, innerHeight);
      const column = section.closest('.inspector-drawer-panel, .inspector');
      const summary = section.querySelector('.info-computed > summary');
      const place = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: round(r.top), bottom: round(r.bottom), belowFold: r.top >= visibleBottom - 0.5, cut: r.top < visibleBottom - 0.5 && r.bottom > visibleBottom + 0.5 };
      };
      const fade = scroller ? getComputedStyle(scroller) : null;
      const notes = section.querySelectorAll('.info-notes');
      return {
        heightPx: round(section.closest('.inspector-info')?.getBoundingClientRect().height ?? section.getBoundingClientRect().height),
        columnPx: column ? round(column.getBoundingClientRect().height) : null,
        share: slot && column ? Number((slot.getBoundingClientRect().height / column.getBoundingClientRect().height).toFixed(3)) : null,
        scroller: scroller ? scroller.className : null,
        scrolls: scroller ? scroller.scrollHeight > scroller.clientHeight + 1 : false,
        scrollHeight: scroller?.scrollHeight ?? null, clientHeight: scroller?.clientHeight ?? null,
        scrollbarPx: scroller ? scroller.offsetWidth - scroller.clientWidth : null,
        // Anything drawn to say there is more: a mask/fade on the scroller, or a shadow.
        moreCue: fade ? { mask: fade.maskImage ?? fade.webkitMaskImage ?? 'none', webkitMask: fade.webkitMaskImage ?? 'none', shadow: fade.boxShadow } : null,
        visibleBottom: round(visibleBottom),
        computed: summary ? { ...place(summary), open: summary.parentElement.open } : null,
        lastNote: notes.length ? { text: seen(notes[notes.length - 1]), ...place(notes[notes.length - 1]) } : null,
        title: seen(section.querySelector('.info-title')),
        topicChip: section.querySelector('.info-topic-chip')?.textContent ?? null,
        facts: [...section.querySelectorAll('.info-fact')].map(f => [seen(f.querySelector('dt')) ?? '', seen(f.querySelector('dd')) ?? '']),
        factButtons: [...section.querySelectorAll('.info-fact dt')].filter(dt => dt.querySelector('.info-button')).map(dt => {
          const button = dt.querySelector('.info-button').getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(dt);
          const firstLine = range.getClientRects()[0];
          const value = dt.parentElement.querySelector('dd')?.getBoundingClientRect();
          return {
            label: seen(dt),
            wrapped: Boolean(firstLine) && button.top >= firstLine.bottom - 1,
            labelLines: new Set([...range.getClientRects()].map(r => round(r.top))).size,
            valueBelow: Boolean(value) && value.top >= dt.getBoundingClientRect().bottom - 1,
          };
        }),
        text: [...section.querySelectorAll('.info-text')].map(seen),
        computedText: seen(section.querySelector('.info-computed-body')),
        // Task 9b (finish review, fix 5): the lead's laid-out lines (Basics and Explore: 3 at most at the inspector's
        // width), counted as the distinct tops of its text's line boxes; and every fact label's lines (fix 8: one each).
        // Lines are the box's height over its line height (a subscript's or an (i)'s own box would count twice by tops).
        leadLines: (() => {
          const lead = section.querySelector('.info-body > p.info-text');
          if (!lead) return null;
          return Math.round(lead.getBoundingClientRect().height / parseFloat(getComputedStyle(lead).lineHeight));
        })(),
        // A label's lines: its text's line boxes, a new line wherever one starts more than half a line below the last (a
        // dt stretches to its row, so its own box would count a wrapped value's lines; a subscript sits a little lower).
        factLabelLines: [...section.querySelectorAll('.info-fact dt')].map(dt => {
          const range = document.createRange();
          range.selectNodeContents(dt);
          const half = parseFloat(getComputedStyle(dt).lineHeight) / 2;
          const tops = [...range.getClientRects()].filter(r => r.height > 4).map(r => r.top).sort((a, b) => a - b);
          const lines = tops.reduce((n, top, i) => (i === 0 || top - tops[i - 1] > half ? n + 1 : n), 0);
          return [dt.textContent, lines];
        }),
        // Final polish F3: a fact whose label sits alone on its line -- its value starts on a later line than the label's
        // last line, or has no room beside it. `factRows` is every row's label/value top and bottom for the report; `labelAlone`
        // lists the rows that fail (0 is the pass). Lines are read from the text's own client rects, not the boxes.
        factLabelAlone: (() => {
          const rowsOf = el => { const range = document.createRange(); range.selectNodeContents(el); return [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0); };
          const rows = [...section.querySelectorAll('.info-fact')].map(row => {
            const dt = row.querySelector('dt');
            const dd = row.querySelector('dd');
            const label = rowsOf(dt);
            const value = rowsOf(dd);
            const labelLastTop = label.length ? Math.max(...label.map(r => r.top)) : 0;
            const labelBottom = label.length ? Math.max(...label.map(r => r.bottom)) : 0;
            const valueFirstTop = value.length ? Math.min(...value.map(r => r.top)) : Infinity;
            return {
              label: seen(dt) ?? '', value: seen(dd) ?? '',
              labelLines: new Set(label.map(r => round(r.top))).size, valueLines: new Set(value.map(r => round(r.top))).size,
              alone: value.length > 0 && valueFirstTop >= labelBottom - 1 && valueFirstTop > labelLastTop + 1,
              width: round(row.getBoundingClientRect().width),
            };
          });
          return { count: rows.filter(r => r.alone).length, alone: rows.filter(r => r.alone).map(r => r.label), rows };
        })(),
        // Fix 4: the scroll cue's class on whatever scrolls Info (shown only while more is below).
        moreBelow: scroller ? scroller.classList.contains('has-more-below') : null,
        // Task 9b review I2: nothing in Info runs out sideways. `scrollerX` is the scroller's horizontal overflow (px);
        // `factRows` lists each fact whose row, or its label or value, is wider than the row's box -- a dt or dd edge past
        // the row's, or the row's own scrollWidth past its clientWidth. Both [] / 0 is the pass. (factLabelLines counts a
        // label's lines; under nowrap that count was 1 by construction, so it could not see a label overflow.)
        overflow: {
          scrollerX: scroller ? Math.max(0, scroller.scrollWidth - scroller.clientWidth) : null,
          factRows: [...section.querySelectorAll('.info-fact')].map(row => {
            const R = row.getBoundingClientRect();
            const past = el => (el ? Math.max(0, round(el.getBoundingClientRect().right - R.right), round(R.left - el.getBoundingClientRect().left)) : 0);
            const dt = row.querySelector('dt');
            const dd = row.querySelector('dd');
            return { label: dt?.textContent ?? '', dt: past(dt), dd: past(dd), scroll: Math.max(0, row.scrollWidth - row.clientWidth) };
          }).filter(r => r.dt > 0 || r.dd > 0 || r.scroll > 0),
        },
      };
    })(),
    // Levels Task 9, Review Focus 4: the "Plot and data" header is on screen and is what is painted at its centre.
    plotHeaderVisible: (() => {
      const header = [...document.querySelectorAll('.inspector-section-toggle')].find(e => e.textContent.trim() === 'Plot and data');
      if (!header) return null;
      const r = header.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0) || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return false;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(top && header.contains(top));
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
    // 6G-2 Task 17 fix (Fail 2) measured how much of the gap note the list's sticky key hid. Owner R25-A4 moved the
    // note (and the key) under the list as its caption, so that measurement no longer applies (R25-A-M2: no hiddenPx).
    // What is measured now: whether the note sits in the list (inList, must be false) and below its bottom edge
    // (belowList), how many elements in the list are sticky (stickyInList, must be 0), and -- where the note's centre is
    // on screen -- whether the element painted there is the note itself (topmostAtCentre; null when off screen).
    orbitalGapNote: (() => {
      const list = document.querySelector('.molecule-orbital-list');
      const note = list?.parentElement?.querySelector('.molecule-orbital-gap');
      if (!list || !note) return null;
      const L = list.getBoundingClientRect(), N = note.getBoundingClientRect();
      if (!(N.height > 0)) return null;
      const cx = N.left + N.width / 2, cy = N.top + N.height / 2;
      const onScreen = cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight;
      const top = onScreen ? document.elementFromPoint(cx, cy) : null;
      return {
        inList: list.contains(note), belowList: N.top >= L.bottom - 0.5,
        stickyInList: [...list.querySelectorAll('*')].filter(e => getComputedStyle(e).position === 'sticky').length,
        topmostAtCentre: onScreen ? Boolean(top && note.contains(top)) : null,
        noteTop: Math.round(N.top), noteHeight: Math.round(N.height), listTop: Math.round(L.top), listBottom: Math.round(L.bottom),
      };
    })(),
    // Picture-is-the-control, Task 5 Step 2: the Orbitals strip's sideways scroll cue (useMoreSideways, Task 2) --
    // measured the same way as Info's own `moreCue` above -- and the Bond length block's fit in the left column
    // (Task 3), measured the same way as `workspaceOverflow` below.
    stripCue: (() => {
      const list = document.querySelector('.thumbnail-strip .strip-list.group-scroll');
      if (!list) return null;
      const style = getComputedStyle(list);
      // Task 5b (finish fixes 7, 8): where each group and its label stand in the list's view, px from its left edge,
      // and each group's snap margin -- the sticky label and the next group's peek, read rather than looked for.
      const at = list.getBoundingClientRect().left;
      const groups = [...list.querySelectorAll('.strip-group')].map(group => {
        const box = group.getBoundingClientRect();
        const label = group.querySelector('.strip-group-label');
        return {
          label: label?.textContent ?? null,
          left: Math.round(box.left - at), right: Math.round(box.right - at),
          labelLeft: label ? Math.round(label.getBoundingClientRect().left - at) : null,
          scrollMarginLeft: getComputedStyle(group).scrollMarginLeft,
        };
      }).filter(group => group.right > 0 && group.left < list.clientWidth);
      return {
        hasMoreBefore: list.classList.contains('has-more-before'),
        hasMoreAfter: list.classList.contains('has-more-after'),
        mask: style.maskImage ?? style.webkitMaskImage ?? 'none',
        scrollLeft: Math.round(list.scrollLeft), clientWidth: list.clientWidth, groups,
      };
    })(),
    bondsLength: (() => {
      const panel = document.querySelector('.side-panel');
      const block = document.querySelector('.bonds-length');
      if (!panel && !block) return null;
      const over = el => (el ? Math.max(0, el.scrollWidth - el.clientWidth) : null);
      // Task 5b (finish fixes 3, 4): the slider's thumb centre and the curve's marker, px from the block's left edge
      // (one instrument: they should agree to a pixel), and the marker's handle as drawn.
      const left = block ? block.getBoundingClientRect().left : 0;
      const centre = el => { if (!el) return null; const box = el.getBoundingClientRect(); return Math.round((box.left + box.width / 2 - left) * 10) / 10; };
      const handle = block?.querySelector('.potential-handle');
      const handleStyle = handle ? getComputedStyle(handle) : null;
      return {
        panelWidth: panel ? Math.round(panel.getBoundingClientRect().width) : null,
        blockWidth: block ? Math.round(block.getBoundingClientRect().width) : null,
        panelOverflowX: over(panel),
        blockOverflowX: over(block),
        thumbX: centre(block?.querySelector('.MuiSlider-thumb')),
        markerX: centre(block?.querySelector('.potential-marker')),
        handle: handle ? {
          x: centre(handle), width: Math.round(handle.getBoundingClientRect().width),
          border: handleStyle.borderTopColor, shadow: handleStyle.boxShadow, background: handleStyle.backgroundColor,
        } : null,
      };
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
      title: seen(document.querySelector('.viewport-title')),
      keys: seen(document.querySelector('.key-column')),
      enclosed: seen(document.querySelector('#enclosed-select')?.closest('.MuiFormControl-root')),
      phaseKey: [...document.querySelectorAll('[aria-label="surface colour key"]')].map(seen),
      plotLegend: [...document.querySelectorAll('.radial-plot-legend-item')].map(seen),
      // Levels Task 9: the ★ texts Tasks 5-7 moved into Info are read there when their old place is gone -- the
      // enclosed note's contour value is Info's "Iso value" fact, the configuration its "Configuration" fact.
      enclosedNote: document.querySelector('#enclosed-select')?.closest('.MuiFormControl-root')?.querySelector('.MuiFormHelperText-root')?.textContent
        ?? infoFactText('Iso value'),
      subshellChips: [...document.querySelectorAll('.subshell-chip')].map(e => e.textContent),
      configuration: document.querySelector('.level-nav-configuration')?.textContent ?? infoFactText('Configuration'),
      // Task 14: the on-model labels shown (placed by a frame), and the large-molecule hint.
      modelLabels: [...document.querySelectorAll('.model-label')].filter(e => getComputedStyle(e).visibility === 'visible').map(e => e.textContent),
      modelLabelHint: document.querySelector('.model-label-hint')?.textContent ?? null,
      // Task 14 fix round 1 (ruling T14-I1): how many labels are hidden as overlapping, when any are.
      modelLabelOverlap: document.querySelector('.model-label-overlap:not([hidden])')?.textContent ?? null,
    },
  };
}

/**
 * Levels Task 9 (--sweep): the text blocks of the panels, the canvas's title and key, the strip and the phone's caption
 * and sheet -- each the text of the nearest non-inline element around a text node, whitespace collapsed. A live region
 * kept for screen readers (.visually-hidden), SVG (plot axes) and aria-hidden decoration are left out; titles and
 * aria-labels are read too.
 */
function scienceBlocks() {
  const roots = [...document.querySelectorAll('.explore-panel, .inspector, .viewport-title, .key-column, .thumbnail-strip, .phone-header, .phone-caption, .phone-sheet')];
  const outer = roots.filter(r => !roots.some(o => o !== r && o.contains(r)));
  const inline = el => ['inline', 'contents'].includes(getComputedStyle(el).display);
  const blocks = new Set();
  for (const root of outer) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim()) continue;
      if (node.parentElement.closest('.visually-hidden, svg, [aria-hidden="true"], style, script')) continue;
      let block = node.parentElement;
      while (block !== root && inline(block)) block = block.parentElement;
      blocks.add(block);
    }
  }
  // Final review: a typeset label's visually hidden plain copy (typesetLabel) is for the ear; the block reads as seen.
  const seen = el => {
    const copy = el.cloneNode(true);
    copy.querySelectorAll('.typeset-label > .visually-hidden').forEach(n => n.remove());
    return copy.textContent;
  };
  const texts = [...blocks].map(b => seen(b).replace(/\s+/g, ' ').trim());
  // A tooltip's or an icon's text lives in its title or aria-label (main kept the ΔSCF method in a tooltip).
  for (const root of outer) {
    for (const el of [root, ...root.querySelectorAll('[title], [aria-label]')]) {
      if (el.closest('[aria-hidden="true"]')) continue;
      for (const name of ['title', 'aria-label']) if (el.getAttribute(name)?.trim()) texts.push(el.getAttribute(name).replace(/\s+/g, ' ').trim());
    }
  }
  return texts.filter(Boolean);
}

/**
 * Opens, one at a time, every tab and inspector section the page offers without changing what is drawn, collecting
 * scienceBlocks() in each state. Tabs go first, last in the document first, so a tab row nested under a tab (R(r) |
 * |R|² | D(r) under Plot) is read before its parent row moves on; then the folded sections and (on main) the
 * "How this was computed" disclosure. At most 40 presses.
 */
async function sweepText(page) {
  const texts = new Set(await page.evaluate(scienceBlocks));
  const visited = new Set();
  // .provenance-trigger: main's "How this was computed" disclosure (Info's own is open at Research).
  const SELECTOR = '.explore-panel [role="tab"], .inspector [role="tab"], .phone-sheet [role="tab"], .inspector-section-toggle, .provenance-trigger';
  for (let presses = 0; presses < 40; presses++) {
    const candidates = await page.evaluate(selector => [...document.querySelectorAll(selector)].map((el, index) => ({
      index,
      key: `${el.closest('.explore-panel') ? 'explore' : el.closest('.phone-sheet') ? 'sheet' : 'inspector'}|${el.getAttribute('role') ?? 'section'}|${el.textContent.trim()}`,
      on: el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-expanded') === 'true',
      tab: el.getAttribute('role') === 'tab',
    })), SELECTOR);
    for (const c of candidates) if (c.on) visited.add(c.key);
    const next = [...candidates.filter(c => c.tab).reverse(), ...candidates.filter(c => !c.tab)].find(c => !visited.has(c.key));
    if (!next) break;
    visited.add(next.key);
    await page.locator(SELECTOR).nth(next.index).click();
    await page.waitForTimeout(400);
    for (const text of await page.evaluate(scienceBlocks)) texts.add(text);
  }
  return [...texts];
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
        await context.addInitScript(({ choice, prefs, display, learning }) => {
          try {
            window.localStorage.setItem('eov.theme', choice);
            if (prefs) window.localStorage.setItem('eov.render', prefs);
            if (display) window.localStorage.setItem('eov.display', display);
            if (learning) window.localStorage.setItem('eov.level', learning);
          } catch { /* storage refused: the app keeps its defaults */ }
        }, { choice: theme, prefs: renderPrefs, display: displayPrefs, learning: level });
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
        // Levels Task 9: where the select has no note any more, the contour value is Info's "Iso value" fact (Info is
        // in the drawer at medium width, so it is read here, while the drawer is open).
        const readNote = () => page.evaluate(() =>
          document.querySelector('#enclosed-select')?.closest('.MuiFormControl-root')?.querySelector('.MuiFormHelperText-root')?.textContent
            ?? [...document.querySelectorAll('.info-section .info-fact')].find(f => f.querySelector('dt')?.textContent.trim() === 'Iso value')
              ?.querySelector('dd')?.textContent ?? null);
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
        // --info-width <px>: the Info section narrowed to that width (final polish F3: the facts at 241 and 200 px).
        if (infoWidth) {
          await page.addStyleTag({ content: `.info-section { width: ${infoWidth}px !important; max-width: ${infoWidth}px !important; }` });
          await page.waitForTimeout(300);
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
        // Levels Task 9: last, because it opens sections and tabs (the shot, metrics and colours are already taken).
        if (sweep) {
          try {
            metrics.scienceText = await sweepText(page);
          } catch (error) {
            errors.push(`sweep failed: ${error.message}`);
          }
        }
        results.push({ scene, theme, size, level, file, cropFile, settled, metrics, colours: judge(on, off, theme), errors });
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

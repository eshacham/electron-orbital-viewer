#!/usr/bin/env node
// Levels Task 9, live check item 6: what a screen reader is told, read without one. VoiceOver cannot be driven
// non-interactively here, so this reads what it would read: every live region (aria-live polite/assertive, role
// status/alert/log) is watched from before the page's first script, and each text change is logged with the region
// it came from; so is every focus move. Each mode is then put through the four events -- a selection change, an (i)
// opened and cleared, loading and done, and (Atoms) a relativity change -- and what each event made the page say is
// printed, so "announced exactly once" can be judged per event. Its own Vite and headless Chromium, as shoot.mjs; the
// /api proxy points at a dead port and every /api request is refused in the browser, so no job can be sent.
//   node tools/design/sr_pass.mjs [--root <checkout>] [--port 5413] [--level research] [--sizes desktop,phone] [--out /tmp/levels-sr.json]
// A region that appears with its text already in it is logged as `region-added`. Whether it is heard depends on the
// screen reader and browser (VoiceOver often reads an inserted role="status", NVDA with Chrome often does not), so this
// tool cannot count it either way: each event's tally keeps it apart as "uncertain" (Task 9 review M7), and the owner's
// local test spot-checks it with VoiceOver. A focus move logs the element's name and, Task 9 review I3, its description.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
// --root runs another checkout's app (the `main` baseline: what main announced) with this tool's scenarios.
const ROOT = resolve(arg('root', resolve(dirname(fileURLToPath(import.meta.url)), '../..')));
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR ?? '/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/';
const { chromium } = createRequire(PLAYWRIGHT)('playwright');
const port = Number(arg('port', '5413'));
if ([5173, 5174, 5391, 5416, 5419, 8787].includes(port)) throw new Error(`port ${port} is not this tool's; use 5411-5415`);
const level = arg('level', 'research');
const sizes = arg('sizes', 'desktop,phone').split(',');
const out = arg('out', '/tmp/levels-sr.json');
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844, mobile: true } };

const button = (page, name) => page.getByRole('button', { name, exact: true }).first();
const press = name => async page => button(page, name).click();
/** On a phone a control lives in one sheet tab; open that tab first (a tab press says nothing by itself). */
const inTab = (tab, step) => async (page, phone) => {
  if (phone) {
    const t = page.getByRole('tab', { name: tab, exact: true });
    if ((await t.getAttribute('aria-selected')) !== 'true') await t.click();
    await page.waitForTimeout(300);
  }
  return step(page, phone);
};
// The active (i) pressed again where it is still on screen; else Info's way back -- on a phone the (i) is in another tab
// now, and an (i) inside Info (Molecules' facts) is replaced by the term it opened.
const clearTopic = name => async (page, phone) => {
  const again = button(page, name);
  return !phone && await again.isVisible() ? again.click() : page.getByRole('button', { name: /^Back to / }).first().click();
};

const SCENARIOS = [
  { mode: 'Orbitals', hash: '#mode=basic&n=3&l=2&ml=0', events: [
    ['selection', inTab('Explore', press('3dxy orbital'))],
    ['(i) open', inTab('Explore', press('About Orbital'))],
    ['(i) clear', clearTopic('About Orbital')],
    ['loading and done (n = 4)', inTab('Explore', press('n = 4'))],
  ] },
  { mode: 'Atoms', hash: '#mode=atom&Z=6&level=orbital&n=2&l=1&ml=0', events: [
    ['selection', inTab('Explore', press('2py'))],
    ['(i) open', inTab('Explore', press('About Subshell'))],
    ['(i) clear', clearTopic('About Subshell')],
    ['loading and done (C → C⁺)', inTab('Explore', press('increase charge'))],
    ['relativity change (Scalar)', inTab('Explore', press('scalar relativistic'))],
  ] },
  { mode: 'Bonds', hash: '#mode=bonds&system=n2', events: [
    ['selection', inTab('Explore', press('One orbital'))],
    ['(i) open', inTab('Explore', press('About Bond order'))],
    ['(i) clear', clearTopic('About Bond order')],
    ['loading and done (R one step)', inTab('Explore', async page => {
      await page.getByRole('slider', { name: 'Internuclear distance R' }).focus();
      await page.keyboard.press('ArrowRight');
    })],
  ] },
  { mode: 'Molecules', hash: '#mode=molecule&id=h2o', events: [
    ['selection + loading (Orbitals)', inTab('Explore', press('Orbitals'))],
    ['(i) open', inTab('Info', press('About Point group'))],
    ['(i) clear', clearTopic('About Point group')],
    ['selection + loading (ESP)', inTab('Explore', press('Electrostatic potential'))],
  ] },
];

/** Installed before any page script: logs every live-region text change and every focus move. */
function watchSpeech() {
  const log = [];
  const last = new Map();
  window.__srLog = log;
  const label = el => el.getAttribute('aria-label') || `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')}`;
  const scan = () => {
    for (const el of document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]')) {
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      const hidden = Boolean(el.closest('[aria-hidden="true"], [hidden]'));
      if (!last.has(el)) {
        last.set(el, text);
        if (text) log.push({ t: Math.round(performance.now()), kind: 'region-added', region: label(el), text, hidden });
        continue;
      }
      if (last.get(el) !== text) {
        last.set(el, text);
        log.push({ t: Math.round(performance.now()), kind: 'live', region: label(el), text, hidden });
      }
    }
  };
  new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-live', 'role', 'aria-hidden', 'hidden'] });
  document.addEventListener('focusin', event => {
    const el = event.target;
    const describedBy = (el.getAttribute?.('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim();
    const name = (el.getAttribute?.('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 90);
    const text = describedBy ? `${name} (described: ${describedBy})` : name;
    log.push({ t: Math.round(performance.now()), kind: 'focus', region: `${el.tagName.toLowerCase()}${el.getAttribute?.('role') ? `[${el.getAttribute('role')}]` : ''}`, text });
  });
}

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

const vite = spawn(resolve(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--clearScreen', 'false'],
  { cwd: ROOT, env: { ...process.env, JOBS_LOCAL_API_URL: 'http://127.0.0.1:9', JOBS_AWS_API_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
const ready = new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('Vite did not start within 30 s')), 30000);
  const watch = chunk => { if (String(chunk).includes(`localhost:${port}`)) { clearTimeout(timer); ok(); } };
  vite.stdout.on('data', watch);
  vite.stderr.on('data', watch);
  vite.on('exit', code => { clearTimeout(timer); fail(new Error(`Vite exited with ${code}`)); });
});

const results = [];
let browser;
try {
  await ready;
  browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  for (const size of sizes) {
    for (const scenario of SCENARIOS) {
      const spec = SIZES[size];
      const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: Boolean(spec.mobile), hasTouch: Boolean(spec.mobile), reducedMotion: 'reduce' });
      await context.route('**/api/**', route => (new URL(route.request().url()).pathname.startsWith('/api/') ? route.abort('blockedbyclient') : route.continue()));
      await context.route('**/molecules/jobs/**', route => route.abort('blockedbyclient'));
      await context.addInitScript(learning => {
        try { localStorage.setItem('eov.theme', 'dark'); localStorage.setItem('eov.level', learning); } catch { /* storage refused */ }
      }, level);
      await context.addInitScript(watchSpeech);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`http://localhost:${port}/${scenario.hash}`, { waitUntil: 'load' });
      await settle(page);
      const load = await page.evaluate(() => window.__srLog.splice(0));
      const events = [];
      for (const [name, act] of scenario.events) {
        await page.evaluate(() => window.__srLog.splice(0));
        try {
          await act(page, size === 'phone');
        } catch (error) {
          errors.push(`${name}: ${error.message.split('\n')[0]}`);
        }
        await page.waitForTimeout(400);
        await settle(page);
        events.push({ event: name, said: await page.evaluate(() => window.__srLog.splice(0)) });
      }
      // The live regions at rest, and the Info region as the accessibility tree has it (subscripts read flat or not).
      const regions = await page.evaluate(() => [...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]')]
        .map(el => `${el.getAttribute('aria-label') || `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')}`} (${el.getAttribute('aria-live') ?? `role=${el.getAttribute('role')}`})`));
      results.push({ size, mode: scenario.mode, hash: scenario.hash, level, load, events, regions, errors });
      console.log(`\n=== ${scenario.mode} · ${size} · ${level}${errors.length ? `  ERRORS: ${errors.join(' | ')}` : ''}`);
      console.log(`  live regions: ${regions.join('; ')}`);
      console.log(`  on load: ${load.map(e => `[${e.kind} ${e.region}] ${JSON.stringify(e.text)}`).join(' · ') || '(nothing)'}`);
      for (const e of events) {
        // What the page tells a reader about the event: each live text change, and each focus move the page makes (onto
        // an element nobody operates, e.g. Info's heading) -- not the focus of the control the reader pressed, nor an
        // emptied region, which says nothing. A region inserted with its text is uncertain (see the header), so it is
        // counted apart and never folded into the told count.
        const operated = /^(button|input|select|textarea|a(\[|$)|div\[button\]|button\[tab\])/;
        const live = e.said.filter(s => s.kind === 'live' && !s.hidden && s.text).length;
        const moved = e.said.filter(s => s.kind === 'focus' && !operated.test(s.region)).length;
        e.tally = { told: live + moved, uncertain: e.said.filter(s => s.kind === 'region-added' && !s.hidden).length };
        console.log(`  ${e.event}:  told ${e.tally.told}${e.tally.uncertain ? ` · uncertain (inserted with text) ${e.tally.uncertain}` : ''}`);
        for (const s of e.said) console.log(`    ${s.kind.padEnd(12)} ${s.region.padEnd(28)} ${JSON.stringify(s.text)}${s.hidden ? '  (hidden)' : ''}`);
        if (!e.said.length) console.log('    (nothing)');
      }
      await context.close();
    }
  }
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`\nwrote ${out}`);

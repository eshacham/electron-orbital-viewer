// Renders /admin.html with the SYNTHETIC month answering /api (no real server is ever reached).
//   node .impeccable/demo/shoot_admin.mjs <out-prefix> <port> [page] [extra]
// With a 4th argument `extra`, also renders states: an open row and a lit mark, a followed running job on a phone,
// the billed-vs-meter explanation open in light, an empty month and a costs failure.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const { chromium } = await import('/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const [,, out = '/tmp/admin', port = '5411', page_ = 'admin.html', extra = ''] = process.argv;
// A running demo job is re-dated to "started 41 minutes ago", so the page shows a plausible elapsed time.
const listData = JSON.parse(readFileSync('.impeccable/demo/list.json', 'utf8'));
for (const j of listData.jobs) if (j.status === 'RUNNING' || j.status === 'QUEUED') {
  const t = Date.now() - 41 * 60 * 1000;
  j.submittedAt = new Date(t - 40 * 1000).toISOString(); j.startedAt = new Date(t).toISOString(); j.heartbeatAt = new Date(Date.now() - 20 * 1000).toISOString();
}
const list = JSON.stringify(listData), costs = readFileSync('.impeccable/demo/costs.json', 'utf8');
const emptyList = JSON.stringify({ ...JSON.parse(list), jobs: [] });
const emptyCosts = JSON.stringify({ ...JSON.parse(costs), spentUsd: 0, reservedUsd: 0, remainingUsd: 8.8, projectionUsd: 0, daily: [], billing: null });
const costsDown = { status: 503, body: JSON.stringify({ error: { code: 'unavailable', message: 'The cost meter did not answer (synthetic failure).' } }) };
const vite = spawn('node_modules/.bin/vite', ['--port', port, '--strictPort'], { stdio: 'ignore', env: { ...process.env, JOBS_LOCAL_API_URL: 'http://127.0.0.1:9' } });
await new Promise(r => setTimeout(r, 4000));
const b = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });

async function shoot({ scheme, w, h, tag, listBody = list, costsAnswer = { status: 200, body: costs }, act = null, fullPage = true, at = port, query = '' }) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: w < 500 });
  const p = await ctx.newPage(); const unstubbed = [];
  const jobs = JSON.parse(list).jobs;
  await p.route('**/api/**', r => {
    const u = r.request().url();
    if (/\/v1\/jobs(\?|$)/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: listBody });
    if (/\/v1\/costs/.test(u)) return r.fulfill({ status: costsAnswer.status, contentType: 'application/json', body: costsAnswer.body });
    const one = /\/v1\/jobs\/([0-9a-f]{64})/.exec(u);
    const job = one && jobs.find(j => j.key === one[1]);
    if (job) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(job) });
    unstubbed.push(u); return r.abort();
  });
  await p.route(/\.invalid\//, r => r.abort());   // the placeholder sign-in host below: never reached
  await p.goto(`http://localhost:${at}/${page_}${query}`); await p.waitForTimeout(3500);
  if (act) { await act(p); await p.waitForTimeout(600); }
  await p.screenshot({ path: `${out}-${scheme}-${tag}.png`, fullPage });
  console.log(scheme, tag, 'unstubbed', unstubbed.length, 'title', await p.title());
  await ctx.close();
}

try {
  for (const [scheme, w, h, tag] of [['dark', 1440, 900, 'desktop'], ['light', 1440, 900, 'desktop'], ['dark', 390, 844, 'phone']]) {
    await shoot({ scheme, w, h, tag });
  }
  if (extra === 'extra') {
    await shoot({ scheme: 'dark', w: 1440, h: 900, tag: 'desktop-open', act: async p => {
      await p.getByRole('button', { name: /^Theobromine C/ }).click();
      await p.getByRole('button', { name: /^Imidazole, / }).hover();
    } });
    await shoot({ scheme: 'dark', w: 390, h: 844, tag: 'phone-follow', act: async p => {
      await p.getByRole('button', { name: 'Follow Aspirin' }).click();
    } });
    await shoot({ scheme: 'light', w: 1440, h: 900, tag: 'desktop-why', act: async p => {
      await p.getByRole('button', { name: 'Why they differ' }).click();
      await p.getByRole('button', { name: 'Details for Ferrocene' }).click();
    } });
    await shoot({ scheme: 'dark', w: 1440, h: 900, tag: 'desktop-empty', listBody: emptyList, costsAnswer: { status: 200, body: emptyCosts } });
    await shoot({ scheme: 'dark', w: 1440, h: 900, tag: 'desktop-costserr', costsAnswer: costsDown });
    await shoot({ scheme: 'light', w: 820, h: 1180, tag: 'tablet' });
    await shoot({ scheme: 'dark', w: 390, h: 844, tag: 'phone-first', fullPage: false });
    // An hour-scale run, to check the run-time column holds "178h 24m so far of 39m 20s".
    const long = JSON.parse(list);
    for (const j of long.jobs) if (j.status === 'RUNNING') j.startedAt = new Date(Date.now() - (178 * 60 + 24) * 60 * 1000).toISOString();
    await shoot({ scheme: 'dark', w: 1440, h: 900, tag: 'desktop-long', listBody: JSON.stringify(long) });
    await shoot({ scheme: 'dark', w: 390, h: 844, tag: 'phone-long', listBody: JSON.stringify(long) });
    // A cancelled sign-in, by the app's own path: a build with sign-in settings, opened with ?error= as Cognito's
    // redirect would (no state, so nothing is exchanged). The settings are placeholders on .invalid: no server exists.
    const signin = spawn('node_modules/.bin/vite', ['--port', String(Number(port) + 1), '--strictPort'], { stdio: 'ignore', env: {
      ...process.env, JOBS_LOCAL_API_URL: 'http://127.0.0.1:9', VITE_COGNITO_AUTHORITY: 'https://cognito-idp.invalid/demo-pool',
      VITE_COGNITO_CLIENT_ID: 'demo-client', VITE_COGNITO_DOMAIN: 'https://auth.invalid' } });
    await new Promise(r => setTimeout(r, 4000));
    try {
      await shoot({ scheme: 'dark', w: 390, h: 844, tag: 'phone-signin', fullPage: false, at: Number(port) + 1, query: '?error=access_denied' });
    } finally { signin.kill(); }
  }
} finally { await b.close(); vite.kill(); }

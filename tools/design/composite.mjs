#!/usr/bin/env node
// §14 "Composites": a capture beside its concept crop, written to docs/quantumlab/checks/.
// Draws in its own headless Chromium from data URLs -- no server, never the owner's browser.
//   node tools/design/composite.mjs --shot /tmp/x.png --sheet theme-comparison --crop deep-space --out docs/quantumlab/checks/6G-1/x.png [--label '6G-2 build']
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR ?? '/Users/eyalshacham/.npm/_npx/e41f203b7505f1fb/node_modules/';
const { chromium } = createRequire(PLAYWRIGHT)('playwright');
const arg = name => { const i = process.argv.indexOf(`--${name}`); if (i < 0) throw new Error(`--${name} is required`); return process.argv[i + 1]; };
const crops = JSON.parse(readFileSync(resolve(ROOT, 'tools/design/concept_crops.json'), 'utf8'));
const sheet = crops[arg('sheet')];
const crop = sheet[arg('crop')];
// The right-hand header: which build the capture is of (6G-2 Task 17; 6G-1's composites were captioned '6G-1 build').
const label = process.argv.includes('--label') ? arg('label') : '6G-1 build';
const dataUrl = file => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body style="margin:0"></body>');
  const base64 = await page.evaluate(async ({ concept, shot, crop, label }) => {
    const load = src => new Promise((ok, fail) => { const image = new Image(); image.onload = () => ok(image); image.onerror = fail; image.src = src; });
    const [conceptImage, shotImage] = await Promise.all([load(concept), load(shot)]);
    const height = shotImage.height;
    const leftWidth = Math.round(crop.width * (height / crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = leftWidth + 24 + shotImage.width;
    canvas.height = height + 40;
    const g = canvas.getContext('2d');
    g.fillStyle = '#16181d';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(conceptImage, crop.x, crop.y, crop.width, crop.height, 0, 40, leftWidth, height);
    g.drawImage(shotImage, leftWidth + 24, 40);
    g.fillStyle = '#ffffff';
    g.font = '600 20px sans-serif';
    g.fillText('Concept', 8, 28);
    g.fillText(label, leftWidth + 32, 28);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { concept: dataUrl(resolve(ROOT, sheet.file)), shot: dataUrl(arg('shot')), crop, label });
  const out = resolve(ROOT, arg('out'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(base64, 'base64'));
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}

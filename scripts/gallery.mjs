// Gallery stills for the README: node scripts/gallery.mjs  ->  docs/media/*.jpg
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

mkdirSync('docs/media', { recursive: true });
const base = process.env.LANTERNS_URL ?? 'http://localhost:5396/';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
async function shot(name, query, w, h, dpr, wait = 3500) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await page.goto(base + (query ? `?${query}` : ''));
  await page.waitForFunction(() => window.__lanterns && !window.__lanterns.store.get().loading);
  await page.evaluate(() => window.__lanterns.store.set({ uiHidden: true }));
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `artifacts/g-${name}.png` });
  await page.close();
  execFileSync(ffmpeg, ['-y', '-i', `artifacts/g-${name}.png`, '-q:v', '3', `docs/media/${name}.jpg`], { stdio: 'ignore' });
  console.log(`docs/media/${name}.jpg`);
}
await shot('quiet-lake', 'empty', 1440, 900, 2);
await shot('full-sky', 'showcase', 1440, 900, 2);
await shot('phone', 'showcase', 390, 844, 3);
await browser.close();

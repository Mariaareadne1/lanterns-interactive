// GPU-synced frame benchmark with forty lanterns (rising, stars, floating): node scripts/perf.mjs [dpr=2]
// Renders back-to-back frames with a pixel readback after each (forces the GPU to finish),
// so the numbers are frame cost, not vsync. The dev machine is often busy: load is printed.
import { chromium } from '@playwright/test';
import { loadavg, cpus } from 'node:os';

const dpr = Number(process.argv[2] ?? 2);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
await page.goto((process.env.LANTERNS_URL ?? 'http://localhost:5396/') + '?empty');
await page.waitForFunction(() => window.__lanterns && !window.__lanterns.store.get().loading, null, { timeout: 90000 });
const res = await page.evaluate(async () => {
  const s = window.__lanterns, e = s.engine, gl = e.renderer.getContext();
  // forty lanterns: two showcase nights, one a little older, so some are still near the ground
  let doc = s.lib.showcaseDoc(Date.now());
  for (const l of s.lib.showcaseDoc(Date.now() - 8_000).lanterns) doc = s.lib.addLantern(doc, { ...l, id: `${l.id}-b`, seed: l.seed + 3 });
  s.app.loadDoc(doc);
  e.stop();
  e.adaptive = false;
  for (let i = 0; i < 30; i++) e.tick(1 / 60);
  const px = new Uint8Array(4);
  const times = [];
  for (let i = 0; i < 180; i++) {
    const t0 = performance.now();
    e.tick(1 / 60);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    times.push(performance.now() - t0);
  }
  e.start();
  times.sort((a, b) => a - b);
  const q = (p) => times[Math.floor(times.length * p)];
  return { median: +q(0.5).toFixed(2), p90: +q(0.9).toFixed(2), p99: +q(0.99).toFixed(2), lanterns: s.store.doc.lanterns.length, w: e.canvas.width, h: e.canvas.height, calls: e.renderer.info.render.calls };
});
console.log(JSON.stringify({ ...res, load: loadavg().map((l) => l.toFixed(1)).join(' '), cores: cpus().length }));
await browser.close();

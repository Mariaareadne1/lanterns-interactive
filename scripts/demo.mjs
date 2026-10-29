// Scripted ~20 s demo, recorded by the app's own ink-compositing recorder:
//   quiet dusk lake → a round lantern drawn on the jetty lights up and warms the boards →
//   a wish is written on it → let go, it rises with its reflection → two more drawn quickly,
//   one on the water that floats → lanterns go up all along the far shore → pull back as the
//   sky fills with tiny lights.
// node scripts/demo.mjs [width] [height]  ->  artifacts/lanterns-demo.(mp4|webm)
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const [W = '1600', H = '900'] = process.argv.slice(2);
mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5396/?empty');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__lanterns && !window.__lanterns.store.get().loading, null, { timeout: 90000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);
const sleep = (ms) => page.waitForTimeout(ms);

/** Screen point of the surface at world (x, z). */
const at = (x, z) => page.evaluate(([x, z]) => {
  const s = window.__lanterns, cam = s.engine.camera, r = s.engine.canvas.getBoundingClientRect();
  const v = cam.position.clone().set(x, s.lib.surfaceHeight(x, z), z).project(cam);
  return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
}, [x, z]);

/** A hand-drawn loop standing on (bx, by): up one side, over, down the other, a little wobble. */
function loop(bx, by, h, radius) {
  const pts = [];
  for (let i = 0; i <= 22; i++) { const t = i / 22; pts.push([bx + radius(t) * h + Math.sin(t * 9) * 1.2, by - t * h]); }
  for (let i = 22; i >= 0; i--) { const t = i / 22; pts.push([bx - radius(t) * h * (0.97 + 0.06 * t) + Math.sin(t * 7) * 1.2, by - t * h]); }
  pts.push([bx + radius(0) * h + 3, by - 3]);
  return pts;
}
const round = (t) => 0.38 * Math.sin(Math.PI * t) + 0.14;
const tall = (t) => 0.2 * Math.sin(Math.PI * Math.pow(t, 0.8)) + 0.06;
const squat = (t) => 0.55 * Math.sin(Math.PI * t) + 0.08;

async function draw(pts, ms) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  const t0 = Date.now();
  for (let i = 1; i < pts.length; i++) {
    const due = (ms * i) / (pts.length - 1) - (Date.now() - t0);
    if (due > 1) await sleep(due);
    await page.mouse.move(pts[i][0], pts[i][1]);
  }
  await page.mouse.up();
}

await page.evaluate(() => {
  const s = window.__lanterns, now = s.engine.now;
  // a few lights already high over the hills from earlier in the evening
  const old = s.lib.showcaseDoc(now - 400_000).lanterns.filter((l) => l.mode === 'sky').slice(0, 7);
  s.app.loadDoc({ version: 1, lanterns: old });
  s.store.set({ uiHidden: true, hasDrawn: true });
  s.engine.adaptive = false;
  window.__demoDone = new Promise((r) => (window.__finishDemo = r));
  window.__demo = import('/src/capture/recorder.ts').then(({ recordCanvas }) =>
    recordCanvas(s.engine.canvas, { seconds: 40, ink: s.input.ink, until: window.__demoDone }),
  );
});
await sleep(1500); // the quiet lake

// a round lantern on the jetty: it is painted in, catches, and warms the boards
const [jx, jy] = await at(-2.4, 3.1);
await draw(loop(jx, jy, 92, round), 1000);
await sleep(1200);

// a wish, written onto the paper letter by letter
const wish = 'for grandma';
for (let i = 1; i <= wish.length; i++) {
  await page.evaluate((w) => { const s = window.__lanterns; s.app.touchPending(); s.app.setWish(s.store.get().pending, w); }, wish.slice(0, i));
  await sleep(70);
}
await sleep(500);
await page.evaluate(() => window.__lanterns.app.letGo());
await sleep(1400); // it lifts, slowly and then steadily, its reflection following on the water

// all along the far shore, others light theirs and let them go
await page.evaluate(() => {
  const s = window.__lanterns, now = s.engine.now;
  const shapes = s.lib.showcaseDoc(now).lanterns.map((l) => l.profile);
  let doc = s.store.doc;
  const spots = [[-6.6, -2.6], [-4.4, -3.1], [-2.2, -3.4], [-0.6, -3.0], [1.2, -3.3], [2.8, -2.9], [4.0, -2.6], [5.8, -2.4], [6.9, -1.4], [-7.4, -1.0], [0.2, -4.4], [3.4, -4.6]];
  spots.forEach(([x, z], i) => {
    const born = now + i * 180;
    doc = s.lib.addLantern(doc, { id: `shore-${i}`, profile: shapes[i % shapes.length].map(([r, y]) => [r * 0.8, y * 0.8]), seed: 500 + i * 37, mode: 'sky', born, at: [x, s.lib.surfaceHeight(x, z), z], released: born + 1700 });
  });
  s.store.commit(doc);
});
await sleep(1800);

// two more, quickly: one on the bank, one on the water that floats
const [bx, by] = await at(3.8, 5.3);
await draw(loop(bx, by, 96, tall), 550);
await sleep(150);
const [lx, ly] = await at(1.4, 1.1);
await draw(loop(lx, ly, 62, squat), 500);
await sleep(900);
await page.evaluate(() => window.__lanterns.app.letGo());
await sleep(500);

// pull back as the sky fills with tiny lights
await page.evaluate(() => new Promise((done) => {
  const s = window.__lanterns, start = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / 4000);
    s.engine.setZoom(1 + 0.12 * (k * k * (3 - 2 * k)));
    if (k < 1) requestAnimationFrame(step);
    else done();
  };
  step();
}));
await sleep(900);
await page.evaluate(() => window.__finishDemo());
const out = await page.evaluate(async () => {
  const rec = await window.__demo;
  const buf = new Uint8Array(await rec.blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { b64: btoa(bin), ext: rec.extension, ms: rec.durationMs, type: rec.type };
});
const file = `artifacts/lanterns-demo.${out.ext}`;
writeFileSync(file, Buffer.from(out.b64, 'base64'));
console.log(file, out.type, `${(out.ms / 1000).toFixed(1)} s`);
await browser.close();

// Draw a lantern and film it: node scripts/draw.mjs <name> <worldX> <worldZ> [shape=round|tall|heart|squat] [px=150] [frames ms,...]
// Screenshots land in artifacts/<name>-<ms>.png. LANTERNS_URL overrides the server, DPR=2 for close crops.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [name = 'draw', X = '-2.4', Z = '3.4', shape = 'round', PX = '150', frames = '200,900,1600,3000'] = process.argv.slice(2);
const base = process.env.LANTERNS_URL ?? 'http://localhost:5396/';
mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
await page.goto(base + '?empty');
await page.waitForFunction(() => window.__lanterns && !window.__lanterns.store.get().loading, null, { timeout: 90000 });
await page.waitForTimeout(800);
const [bx, by] = await page.evaluate(([x, z]) => {
  const s = window.__lanterns, cam = s.engine.camera, r = s.engine.canvas.getBoundingClientRect();
  return import('/src/scene/lake.ts').then(({ surfaceHeight }) => {
    const v = cam.position.clone().set(x, surfaceHeight(x, z), z).project(cam);
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  });
}, [Number(X), Number(Z)]);
const H = Number(PX);
const radius = { round: (t) => 0.42 * Math.sin(Math.PI * t) + 0.08, tall: (t) => 0.22 * Math.sin(Math.PI * t) + 0.04, squat: (t) => 0.62 * Math.sin(Math.PI * t), heart: (t) => (t < 0.7 ? 0.45 * Math.sin((t / 0.7) * Math.PI * 0.5) : 0.45 * Math.cos(((t - 0.7) / 0.3) * Math.PI * 0.5) + 0.12 * Math.sin(((t - 0.7) / 0.3) * Math.PI)) }[shape];
// a loop: up the right side from the bottom ring, over the top, down the left, back to the start
const pts = [];
for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([bx + radius(t) * H, by - t * H]); }
for (let i = 40; i >= 0; i--) { const t = i / 40; pts.push([bx - radius(t) * H * (0.95 + 0.1 * t), by - t * H]); }
pts.push([bx + radius(0) * H + 2, by]);
await page.mouse.move(pts[0][0], pts[0][1]);
await page.mouse.down();
for (const [x, y] of pts.slice(1)) { await page.mouse.move(x, y); await page.waitForTimeout(8); }
await page.mouse.up();
const t0 = Date.now();
for (const f of frames.split(',').map(Number)) {
  const wait = f - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: `artifacts/${name}-${f}.png` });
  console.log(`artifacts/${name}-${f}.png`);
}
if (process.env.L_EVAL) console.log(await page.evaluate(process.env.L_EVAL));
await browser.close();

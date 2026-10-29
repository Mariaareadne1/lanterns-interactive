// Close-up of a lantern with a wish, then reading it: node scripts/wish.mjs [wish]
import { chromium } from '@playwright/test';
const [wish = 'for grandma, with love'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto((process.env.LANTERNS_URL ?? 'http://localhost:5396/') + '?empty');
await page.waitForFunction(() => window.__lanterns && !window.__lanterns.store.get().loading);
const [bx, by] = await page.evaluate(() => {
  const s = window.__lanterns, cam = s.engine.camera, r = s.engine.canvas.getBoundingClientRect();
  const v = cam.position.clone().set(-2.4, s.lib.surfaceHeight(-2.4, 3.2), 3.2).project(cam);
  return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
});
const H = 100, pts = [];
for (let i = 0; i <= 36; i++) pts.push([bx + (0.36 * Math.sin(Math.PI * i / 36) + 0.12) * H, by - (i / 36) * H]);
for (let i = 36; i >= 0; i--) pts.push([bx - (0.36 * Math.sin(Math.PI * i / 36) + 0.12) * H, by - (i / 36) * H]);
await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down();
for (const [x, y] of pts) { await page.mouse.move(x, y); await page.waitForTimeout(6); }
await page.mouse.up();
await page.getByRole('button', { name: 'Make a wish' }).click();
await page.keyboard.type(wish, { delay: 30 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'artifacts/wish-card.png', clip: { x: bx - 260, y: by - 220, width: 620, height: 320 } });
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const id = await page.evaluate(() => window.__lanterns.store.doc.lanterns[0].id);
await page.evaluate((id) => { window.__lanterns.store.set({ selection: { kind: 'lantern', id } }); window.__lanterns.app.readWish(id); }, id);
await page.waitForTimeout(900);
await page.screenshot({ path: 'artifacts/wish-read.png', clip: { x: bx - 300, y: by - 260, width: 700, height: 400 } });
console.log('artifacts/wish-card.png artifacts/wish-read.png');
await browser.close();

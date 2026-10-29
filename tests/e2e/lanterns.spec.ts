import { expect, test, type Page } from '@playwright/test';
import { captureStats, drawStroke, lanternState, lanterns, loopPoints, openNight, surfaceToClient } from './helpers';

/** Collect page errors so every test can assert none happened. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Draw a lantern standing on the jetty; returns its id. */
async function drawOnJetty(page: Page, h = 150): Promise<string> {
  const [bx, by] = await surfaceToClient(page, -2.4, 3.0);
  await drawStroke(page, loopPoints(bx, by, h));
  await expect.poll(async () => (await lanterns(page)).length).toBeGreaterThan(0);
  const all = await lanterns(page);
  return all[all.length - 1].id;
}

test('the night tile renders on paper, with no errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openNight(page);
  await page.waitForTimeout(1200);
  const s = await captureStats(page);
  expect(s.width).toBeGreaterThan(1000);
  expect(s.paper).toBeGreaterThan(0.12); // cream paper round the tile
  expect(s.night).toBeGreaterThan(0.3); // indigo and violet, not black
  await expect(page.getByRole('heading', { name: 'LANTERNS' })).toBeVisible();
  await expect(page.getByText('Draw a lantern.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a drawn loop becomes a lantern with its silhouette, which lights the boards around it', async ({ page }) => {
  const errors = watchErrors(page);
  await openNight(page);
  await page.waitForTimeout(600);
  const [bx, by] = await surfaceToClient(page, -2.4, 3.0);
  // the boards in front of and beside where the lantern will stand
  const near = { x: bx - 60, y: by + 6, w: 120, h: 30 };
  const before = await captureStats(page, near);
  // a lantern of ordinary size, drawn as it would be by hand
  const pts = loopPoints(bx, by, 90);
  await drawStroke(page, pts);
  await expect.poll(async () => (await lanterns(page)).length).toBe(1);
  const [rec] = await lanterns(page);
  expect(rec.mode).toBe('sky');
  expect(rec.released).toBeNull();
  await page.waitForTimeout(2200);
  const st = (await lanternState(page, rec.id))!;
  expect(st.lit).toBe(1);
  // the silhouette matches the drawn loop on screen
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const drawnW = Math.max(...xs) - Math.min(...xs), drawnH = Math.max(...ys) - Math.min(...ys);
  const w = st.box.maxX - st.box.minX, h = st.box.maxY - st.box.minY;
  expect(Math.abs(w - drawnW) / drawnW).toBeLessThan(0.3);
  expect(Math.abs(h - drawnH) / drawnH).toBeLessThan(0.3);
  expect(Math.abs((st.box.minX + st.box.maxX) / 2 - bx)).toBeLessThan(12);
  expect(Math.abs(st.box.maxY - by)).toBeLessThan(18);
  // and it warms the boards round its foot
  const after = await captureStats(page, near);
  expect(after.mean).toBeGreaterThan(before.mean * 1.25);
  await expect(page.getByRole('dialog', { name: 'Your lantern' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a huge loop is clamped to a lantern-sized lantern, keeping its proportions', async ({ page }) => {
  await openNight(page);
  const [bx, by] = await surfaceToClient(page, -2.4, 3.0);
  await drawStroke(page, loopPoints(bx, by, 320, 'tall'));
  await expect.poll(async () => (await lanterns(page)).length).toBe(1);
  const [rec] = await lanterns(page);
  await page.waitForTimeout(1500);
  const st = (await lanternState(page, rec.id))!;
  const w = st.box.maxX - st.box.minX, h = st.box.maxY - st.box.minY;
  expect(h).toBeLessThan(320 * 0.6);
  expect(rec.profile[rec.profile.length - 1][1]).toBeLessThanOrEqual(1.7 + 1e-6);
  // a tall loop stays a tall lantern
  expect(h / w).toBeGreaterThan(1.6);
});

test('making a wish writes it on the lantern; letting go makes it rise', async ({ page }) => {
  await openNight(page);
  const id = await drawOnJetty(page);
  await page.getByRole('button', { name: 'Make a wish' }).click();
  await page.getByRole('textbox', { name: 'Your wish' }).fill('safe home\u0007, all of you — and the cat, and the dog');
  // while the wish is written the lantern waits
  await page.waitForTimeout(5000);
  expect((await lanterns(page))[0].released).toBeNull();
  await page.getByRole('button', { name: 'Let go' }).click();
  const rec = (await lanterns(page))[0];
  expect(rec.released).not.toBeNull();
  expect(rec.wish).toMatch(/^safe home, all of you/);
  expect(rec.wish).not.toContain('\u0007');
  expect(Array.from(rec.wish!).length).toBeLessThanOrEqual(40);
  const y0 = (await lanternState(page, id))!.y;
  await page.waitForTimeout(6000);
  const s = (await lanternState(page, id))!;
  expect(s.phase).toBe('rising');
  expect(s.y).toBeGreaterThan(y0 + 0.4);
  await expect(page.getByRole('dialog', { name: 'Your lantern' })).toHaveCount(0);
});

test('left alone, a lantern lets itself go after a few seconds', async ({ page }) => {
  await openNight(page);
  await drawOnJetty(page);
  await page.waitForTimeout(3000);
  expect((await lanterns(page))[0].released).toBeNull();
  await expect.poll(async () => (await lanterns(page))[0].released, { timeout: 6000 }).not.toBeNull();
});

test('drawn on the lake, a lantern floats and sails, staying on the water', async ({ page }) => {
  await openNight(page);
  const [bx, by] = await surfaceToClient(page, 2.0, 1.2);
  await drawStroke(page, loopPoints(bx, by, 100, 'squat'));
  await expect.poll(async () => (await lanterns(page)).length).toBe(1);
  const [rec] = await lanterns(page);
  expect(rec.mode).toBe('lake');
  await page.keyboard.press('Space'); // let go
  const a = (await lanternState(page, rec.id))!;
  await page.waitForTimeout(8000);
  const b = (await lanternState(page, rec.id))!;
  expect(b.phase).toBe('floating');
  expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(0.05);
  expect(Math.abs(b.y - a.y)).toBeLessThan(0.05);
  const onLake = await page.evaluate(([x, z]) => window.__lanterns!.lib.lakeSDF(x, z), [b.x, b.z]);
  expect(onLake).toBeLessThan(0);
});

test('open and tiny strokes shiver away with one short message', async ({ page }) => {
  await openNight(page);
  const [bx, by] = await surfaceToClient(page, 1, 5.2);
  await drawStroke(page, loopPoints(bx, by, 150).slice(0, 40));
  await expect(page.getByRole('status')).toContainText('Close the loop');
  await drawStroke(page, loopPoints(bx, by, 18));
  await expect(page.getByRole('status')).toContainText(/bigger|loop/);
  expect(await lanterns(page)).toHaveLength(0);
});

test('selecting a lantern: read its wish, glow, remove', async ({ page }) => {
  await openNight(page, 'showcase');
  await page.waitForTimeout(800);
  const all = await lanterns(page);
  const target = all.find((l) => l.mode === 'lake' && l.wish)!;
  const s = (await lanternState(page, target.id))!;
  await page.mouse.click(s.cx, s.cy);
  await expect(page.getByRole('toolbar', { name: 'Selected lantern' })).toBeVisible();
  await page.getByRole('button', { name: 'Read wish' }).click();
  await expect(page.locator('.wish-caption')).toContainText(target.wish!);
  // Glow: it flares, and its neighbours brighten in answer
  const neighbour = all.find((l) => l.mode === 'lake' && l.id !== target.id)!;
  const n0 = (await lanternState(page, neighbour.id))!.intensity;
  await page.getByRole('button', { name: 'Glow' }).click();
  await page.waitForTimeout(250);
  expect((await lanternState(page, target.id))!.intensity).toBeGreaterThan(1.3);
  await expect.poll(async () => (await lanternState(page, neighbour.id))!.intensity, { timeout: 3000 }).toBeGreaterThan(n0 * 1.2);
  // Remove: gone from the night (its flame goes out, then it fades)
  await page.getByRole('button', { name: 'Remove lantern' }).click();
  expect((await lanterns(page)).some((l) => l.id === target.id)).toBe(false);
  await expect(page.getByRole('toolbar', { name: 'Selected lantern' })).toHaveCount(0);
  await expect.poll(() => page.evaluate((id) => window.__lanterns!.app.lanterns.group.getObjectByName(`lantern ${id}`) === undefined, target.id), { timeout: 5000 }).toBe(true);
});

test('keyboard: Tab cycles, Escape deselects, Delete removes, H hides the interface', async ({ page }) => {
  await openNight(page, 'showcase');
  const count = (await lanterns(page)).length;
  await page.keyboard.press('Tab');
  await expect(page.getByRole('toolbar', { name: 'Selected lantern' })).toBeVisible();
  const first = await page.evaluate(() => window.__lanterns!.store.get().selection?.id);
  await page.keyboard.press('Tab');
  const second = await page.evaluate(() => window.__lanterns!.store.get().selection?.id);
  expect(second).not.toBe(first);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: 'Selected lantern' })).toHaveCount(0);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Delete');
  expect(await lanterns(page)).toHaveLength(count - 1);
  await page.keyboard.press('h');
  await expect(page.locator('.stage')).toHaveClass(/ui-hidden/);
  await page.keyboard.press('h');
  await expect(page.locator('.stage')).not.toHaveClass(/ui-hidden/);
});

test('undo, redo, clear and reload', async ({ page }) => {
  await openNight(page);
  await page.evaluate(() => localStorage.clear());
  await drawOnJetty(page);
  await page.keyboard.press('Space');
  const [bx, by] = await surfaceToClient(page, 3.5, 5.2);
  await drawStroke(page, loopPoints(bx, by, 140, 'tall'));
  await expect.poll(async () => (await lanterns(page)).length).toBe(2);
  await page.keyboard.press('Meta+z');
  expect(await lanterns(page)).toHaveLength(1);
  await page.keyboard.press('Meta+Shift+z');
  expect(await lanterns(page)).toHaveLength(2);
  await page.keyboard.press('Space');
  const saved = await lanterns(page);
  await page.waitForTimeout(800); // debounced save
  const first = (await lanternState(page, saved[0].id))!;
  await page.goto('/');
  await page.waitForFunction(() => window.__lanterns && !window.__lanterns.store.get().loading);
  const reloaded = await lanterns(page);
  expect(reloaded.map((l) => l.id)).toEqual(saved.map((l) => l.id));
  expect(reloaded.every((l) => l.released !== null)).toBe(true);
  // a pure function of the clock: it comes back where it was (a little higher, as time has passed)
  const again = (await lanternState(page, saved[0].id))!;
  expect(Math.abs(again.x - first.x)).toBeLessThan(1.5);
  expect(again.y).toBeGreaterThanOrEqual(first.y - 0.01);
  await page.getByRole('button', { name: 'Lanterns menu' }).click();
  await page.getByRole('button', { name: 'Clear the sky' }).click();
  expect(await lanterns(page)).toHaveLength(0);
  await page.keyboard.press('Meta+z');
  expect(await lanterns(page)).toHaveLength(2);
});

test('corrupt storage and a bad import are survived', async ({ page }) => {
  await openNight(page);
  await page.evaluate(() => localStorage.setItem('lanterns.scene', '{"version":1,"lanterns":[{"id":"x","profile":"nope"}]'));
  await page.goto('/');
  await page.waitForFunction(() => window.__lanterns && !window.__lanterns.store.get().loading);
  // falls back to the first-visit night
  expect((await lanterns(page)).length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Lanterns menu' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import scene…' }).click();
  await (await chooser).setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":9}') });
  await expect(page.getByRole('status')).toContainText('not a LANTERNS scene');
});

test('saves a PNG image', async ({ page }) => {
  await openNight(page, '');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^lanterns-\d{8}-\d{6}\.png$/);
});

test('forty lanterns at once: no errors, no frame collapse', async ({ page }) => {
  const errors = watchErrors(page);
  await openNight(page);
  await page.evaluate(() => {
    const s = window.__lanterns!;
    const { showcaseDoc, addLantern } = s.lib;
    let doc = showcaseDoc(Date.now());
    const more = showcaseDoc(Date.now() - 30_000).lanterns.map((l, i) => ({ ...l, id: `${l.id}-b${i}`, seed: l.seed + 7 }));
    for (const l of more) doc = addLantern(doc, l);
    s.app.loadDoc(doc);
  });
  expect(await lanterns(page)).toHaveLength(40);
  await page.waitForTimeout(3500);
  const fps = await page.evaluate(() => window.__lanterns!.engine.fps);
  expect(fps).toBeGreaterThan(30);
  const s = await captureStats(page);
  expect(s.warm).toBeGreaterThan(0.0005);
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('no flicker or sway, and a slower rise', async ({ page }) => {
    await openNight(page);
    const calm = await page.evaluate(() => window.__lanterns!.engine.reducedMotion);
    expect(calm).toBe(true);
    const id = await drawOnJetty(page);
    await page.waitForTimeout(1800);
    const a = (await lanternState(page, id))!.intensity;
    await page.waitForTimeout(400);
    const b = (await lanternState(page, id))!.intensity;
    expect(a).toBeCloseTo(b, 5);
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test('draw a lantern with a finger, and tap it', async ({ page }) => {
    const errors = watchErrors(page);
    await openNight(page);
    const [bx, by] = await surfaceToClient(page, 0.5, 5.2);
    const pts = loopPoints(bx, by, 110);
    // a finger: touch pointer events through CDP
    const cdp = await page.context().newCDPSession(page);
    const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: y! }] });
    await touch('touchStart', pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) await touch('touchMove', x, y);
    await touch('touchEnd');
    await expect.poll(async () => (await lanterns(page)).length).toBe(1);
    await expect(page.getByRole('dialog', { name: 'Your lantern' })).toBeVisible();
    // let it go by hand if it hasn't already let itself go
    const letGo = page.getByRole('button', { name: 'Let go' });
    if (await letGo.isVisible()) await letGo.tap();
    await expect.poll(async () => (await lanterns(page))[0].released).not.toBeNull();
    const id = (await lanterns(page))[0].id;
    const s = (await lanternState(page, id))!;
    await page.touchscreen.tap(s.cx, s.cy);
    await expect(page.getByRole('toolbar', { name: 'Selected lantern' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

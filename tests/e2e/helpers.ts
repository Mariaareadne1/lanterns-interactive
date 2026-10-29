import type { Page } from '@playwright/test';

export async function openNight(page: Page, query = 'empty'): Promise<void> {
  await page.goto(query ? `/?${query}` : '/');
  await page.waitForFunction(() => window.__lanterns && !window.__lanterns.store.get().loading, null, { timeout: 90_000 });
}

/** A world point on whatever a lantern would stand on there, in client pixels. */
export async function surfaceToClient(page: Page, x: number, z: number): Promise<[number, number]> {
  return page.evaluate(([x, z]) => {
    const s = window.__lanterns!;
    const { surfaceHeight } = s.lib;
    const p = s.engine.camera.position.clone().set(x, surfaceHeight(x, z), z).project(s.engine.camera);
    const r = s.engine.canvas.getBoundingClientRect();
    return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height] as [number, number];
  }, [x, z]);
}

const RADIUS = {
  round: (t: number) => 0.42 * Math.sin(Math.PI * t) + 0.08,
  tall: (t: number) => 0.2 * Math.sin(Math.PI * t) + 0.05,
  squat: (t: number) => 0.62 * Math.sin(Math.PI * t) + 0.05,
};

/** A closed lantern loop standing on (bx, by), `h` pixels tall. */
export function loopPoints(bx: number, by: number, h = 150, shape: keyof typeof RADIUS = 'round'): [number, number][] {
  const r = RADIUS[shape];
  const pts: [number, number][] = [];
  for (let i = 0; i <= 36; i++) pts.push([bx + r(i / 36) * h, by - (i / 36) * h]);
  for (let i = 36; i >= 0; i--) pts.push([bx - r(i / 36) * h, by - (i / 36) * h]);
  pts.push([bx + r(0) * h + 2, by - 2]);
  return pts;
}

/** Draw a stroke with real pointer events. */
export async function drawStroke(page: Page, pts: [number, number][], stepMs = 6): Promise<void> {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) {
    await page.mouse.move(x, y);
    if (stepMs) await page.waitForTimeout(stepMs);
  }
  await page.mouse.up();
}

export async function lanterns(page: Page) {
  return page.evaluate(() => window.__lanterns!.store.doc.lanterns.map((l) => ({ id: l.id, mode: l.mode, wish: l.wish ?? null, released: l.released, at: l.at, profile: l.profile })));
}

/** Live state of a lantern: its screen box and pose. */
export async function lanternState(page: Page, id: string) {
  return page.evaluate((id) => {
    const s = window.__lanterns!;
    const l = s.app.lanterns.get(id);
    if (!l) return null;
    const cam = s.engine.camera, r = s.engine.canvas.getBoundingClientRect();
    const toScreen = (x: number, y: number, z: number) => {
      const v = cam.position.clone().set(x, y, z).project(cam);
      return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
    };
    // the silhouette's screen extent, from the paper's own vertices
    const mesh = l.group.children[0] as unknown as { geometry: { attributes: { position: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } }; matrixWorld: unknown };
    const pos = mesh.geometry.attributes.position;
    const v = cam.position.clone();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld as never).project(cam);
      const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
    const [cx, cy] = toScreen(l.center.x, l.center.y, l.center.z);
    return { cx, cy, box: { minX, maxX, minY, maxY }, y: l.group.position.y, x: l.group.position.x, z: l.group.position.z, phase: l.pose.phase, lit: l.pose.lit, intensity: l.intensity };
  }, id);
}

/** Render through the app's capture path; mean brightness in a client-pixel rectangle, plus overall colour stats. */
export async function captureStats(page: Page, region?: { x: number; y: number; w: number; h: number }) {
  return page.evaluate(async (region) => {
    const s = window.__lanterns!;
    const blob = await s.engine.capturePNG(1);
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let paper = 0, night = 0, warm = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      n++;
      if (r > 215 && g > 210 && Math.max(r, g, b) - Math.min(r, g, b) < 35) paper++;
      if (b > r + 15 && b > g && r + g + b < 330) night++;
      if (r > 200 && g > 110 && b < g) warm++;
    }
    let mean = -1;
    if (region) {
      const k = bmp.width / s.engine.canvas.clientWidth;
      let sum = 0, m = 0;
      for (let y = Math.round(region.y * k); y < Math.round((region.y + region.h) * k); y++) {
        for (let x = Math.round(region.x * k); x < Math.round((region.x + region.w) * k); x++) {
          const i = (y * bmp.width + x) * 4;
          sum += d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15;
          m++;
        }
      }
      mean = sum / Math.max(1, m);
    }
    return { width: bmp.width, height: bmp.height, size: blob.size, paper: paper / n, night: night / n, warm: warm / n, mean };
  }, region);
}

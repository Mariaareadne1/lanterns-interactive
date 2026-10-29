import * as THREE from 'three';
import type { LanternsApp } from '../LanternsApp';

/** A lantern's on-screen box (CSS pixels, relative to the canvas). */
export interface ScreenBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const corner = new THREE.Vector3();

/** Project a lantern's bounds — its paper, as posed now — to the screen. */
export function lanternBox(app: LanternsApp, id: string): ScreenBox | null {
  const l = app.lanterns.get(id);
  if (!l) return null;
  const cam = app.engine.camera;
  const rect = app.rect;
  const r = l.radius * l.pose.scale * 1.1;
  const h = l.height * l.pose.scale;
  const base = l.group.position;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(base.x + (i & 1 ? r : -r), base.y + (i & 2 ? h * 1.04 : -0.02), base.z + (i & 4 ? r : -r)).project(cam);
    const sx = ((corner.x + 1) / 2) * rect.width;
    const sy = ((1 - corner.y) / 2) * rect.height;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  // far-off stars are tiny: keep the box big enough to see and tap
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const half = 14;
  if (maxX - minX < half * 2) { minX = cx - half; maxX = cx + half; }
  if (maxY - minY < half * 2) { minY = cy - half; maxY = cy + half; }
  return { minX, minY, maxX, maxY };
}

/** Place a floating element beside a box: right of it if there's room, else left; clamped on screen. */
export function beside(el: HTMLElement, box: ScreenBox, rect: DOMRect, gap = 14): void {
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = box.maxX + gap;
  if (x + w > rect.width - 12) x = box.minX - gap - w;
  x = Math.max(12, Math.min(rect.width - w - 12, x));
  const y = Math.max(12, Math.min(rect.height - h - 84, (box.minY + box.maxY) / 2 - h / 2));
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}

import type { Pt } from '../interaction/stroke';
import { smooth, strokeLength } from '../interaction/stroke';

/**
 * A drawn loop becomes a lantern's silhouette. Pure 2D work, in screen
 * pixels: check the loop is closed and big enough, then read its half-width
 * row by row from top to bottom (a scanline through the polygon), so the
 * lantern is upright and symmetric about a vertical axis but keeps the
 * loop's personality — tall, squat, heart-ish, lopsided. The bottom is cut
 * where the shape is still fairly wide, leaving the open ring a sky lantern
 * has; the top is closed.
 */

/** A profile point: [radius, height], both relative to the lantern's height (y runs 0 → 1). */
export type ShapePoint = readonly [number, number];

export type LoopCheck =
  | { ok: true; bbox: Box; length: number }
  | { ok: false; reason: 'short' | 'small' | 'open'; bbox: Box; length: number };

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export const MIN_LOOP_LENGTH = 110;
export const MIN_LOOP_SIZE = 34;
const ROWS = 22;
/** Radius limits relative to height: thinner than this is a pole, wider a pancake. */
export const MIN_RADIUS = 0.17;
export const MAX_RADIUS = 0.72;

export function bbox(pts: readonly Pt[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Is this a closed loop, big enough to be a lantern? The ends must nearly meet. */
export function checkLoop(pts: readonly Pt[]): LoopCheck {
  const box = bbox(pts);
  const length = strokeLength(pts);
  if (pts.length < 3 || length < MIN_LOOP_LENGTH) return { ok: false, reason: 'short', bbox: box, length };
  if (Math.min(box.width, box.height) < MIN_LOOP_SIZE * 0.6 || Math.max(box.width, box.height) < MIN_LOOP_SIZE) return { ok: false, reason: 'small', bbox: box, length };
  const a = pts[0], b = pts[pts.length - 1];
  const gap = Math.hypot(a.x - b.x, a.y - b.y);
  // the ends may also cross over: closed if any late point comes back near the start
  let nearest = gap;
  for (let i = Math.floor(pts.length * 0.7); i < pts.length; i++) nearest = Math.min(nearest, Math.hypot(pts[i].x - a.x, pts[i].y - a.y));
  const tolerance = Math.max(28, 0.28 * Math.max(box.width, box.height));
  if (nearest > tolerance) return { ok: false, reason: 'open', bbox: box, length };
  return { ok: true, bbox: box, length };
}

/** Horizontal extent [left, right] of a closed polygon at height y, or null. */
function scan(poly: readonly Pt[], y: number): [number, number] | null {
  let left = Infinity, right = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y)) {
      const x = p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return left <= right ? [left, right] : null;
}

export interface LoopShape {
  /** Bottom (open ring) to top (closed), relative radii and heights. */
  shape: ShapePoint[];
  /** Screen pixels: the axis, the cut at the bottom ring, the top, and the widest half-width. */
  axisX: number;
  bottomY: number;
  topY: number;
  halfWidth: number;
}

/** Turn a closed loop (screen pixels, y down) into an upright, symmetric lantern profile. */
export function loopToShape(points: readonly Pt[]): LoopShape {
  const poly = smooth(smooth(points, 2), 2);
  const box = bbox(poly);
  const axisX = box.minX + box.width / 2;
  // half-widths, top row first
  const ys: number[] = [];
  const half: number[] = [];
  for (let i = 0; i < ROWS; i++) {
    const y = box.minY + ((i + 0.5) / ROWS) * box.height;
    const ext = scan(poly, y);
    ys.push(y);
    half.push(ext ? (ext[1] - ext[0]) / 2 : 0);
  }
  // soften the hand's wobble
  for (let pass = 0; pass < 2; pass++) {
    const prev = half.slice();
    for (let i = 1; i < ROWS - 1; i++) half[i] = (prev[i - 1] + 2 * prev[i] + prev[i + 1]) / 4;
  }
  const widest = half.indexOf(Math.max(...half));
  const maxHalf = half[widest];
  // the open bottom ring: the lowest row below the widest that is still at least half as wide
  let cut = ROWS - 1;
  while (cut > widest && half[cut] < maxHalf * 0.5) cut--;
  const topY = box.minY;
  const bottomY = ys[cut];
  const height = Math.max(1, bottomY - topY);
  const shape: ShapePoint[] = [];
  for (let i = cut; i >= 0; i--) shape.push([half[i] / height, (bottomY - ys[i]) / height]);
  // close the top over the last row
  const last = shape[shape.length - 1];
  shape.push([0, Math.min(1.04, last[1] + Math.max(0.02, last[0] * 0.35))]);
  return { shape: normaliseShape(shape), axisX, bottomY, topY, halfWidth: maxHalf };
}

/** Rescale so heights run 0 → 1 and the widest radius sits within [MIN_RADIUS, MAX_RADIUS]. */
export function normaliseShape(shape: readonly ShapePoint[]): ShapePoint[] {
  const top = Math.max(...shape.map((p) => p[1])) || 1;
  const maxR = Math.max(...shape.map((p) => p[0])) / top || MIN_RADIUS;
  const k = maxR < MIN_RADIUS ? MIN_RADIUS / maxR : maxR > MAX_RADIUS ? MAX_RADIUS / maxR : 1;
  return shape.map(([r, y]) => [round(Math.max(0, (r / top) * k)), round(y / top)] as const);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** World-sized profile [[r, y]...] from a shape, a height and a width scale (perspective differs across and up). */
export function scaleShape(shape: readonly ShapePoint[], height: number, widthScale = 1): [number, number][] {
  return shape.map(([r, y]) => [round(r * height * widthScale), round(y * height)]);
}

/** A shape from a radius function of height (0 bottom → 1 top): the built-in lanterns. */
export function shapeFrom(radius: (t: number) => number, rows = 18): ShapePoint[] {
  const out: ShapePoint[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    out.push([Math.max(0, radius(t)), t]);
  }
  return normaliseShape(out);
}

export const SHAPES = {
  round: () => shapeFrom((t) => 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.42) / 0.62, 2))) + 0.02 * (1 - t)),
  tall: () => shapeFrom((t) => 0.26 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.45) / 0.58, 4)))),
  squat: () => shapeFrom((t) => 0.66 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.35) / 0.7, 2)))),
  drop: () => shapeFrom((t) => 0.4 * Math.sin(Math.PI * Math.pow(Math.min(1, t * 0.98 + 0.12), 0.75)) * (1 - 0.15 * t)),
  heart: () => shapeFrom((t) => (t < 0.72 ? 0.12 + 0.36 * Math.sin((t / 0.72) * Math.PI * 0.5) : 0.48 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.72) / 0.3, 2))))),
  bell: () => shapeFrom((t) => 0.2 + 0.24 * Math.pow(1 - t, 1.6) - 0.2 * Math.pow(t, 6)),
} as const;

import { seededRandom } from './noise';

/**
 * The layout of the night tile, as plain analytic functions shared by
 * geometry, placement, picking and the shaders (whose GLSL twin is
 * `LAKE_GLSL`). One world unit is about two metres.
 *
 *   back   : a ring of soft hills with pines, three cottages on the far shore
 *   middle : the lake, almost still
 *   front  : a grassy bank, reeds, and a wooden jetty reaching out over the water
 */

export const TILE = { halfX: 9, halfZ: 6.5 } as const;
export const WORLD_SCALE = 2; // metres per world unit, for labels
export const WATER_Y = 0;

export const LAKE = { x: 0.4, z: 0.8, rx: 6.2, rz: 3.3 } as const;

export const JETTY = { x: -2.4, z0: 5.1, z1: 2.0, w: 0.62, deck: 0.24 } as const;

export interface Cottage {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  /** Seconds after opening when its window goes dark (Infinity: stays lit). */
  offAt: number;
}

export const COTTAGES: readonly Cottage[] = [
  { x: -5.3, z: -3.75, w: 1.3, d: 0.95, h: 0.72, rot: 0.16, offAt: Infinity },
  { x: -3.35, z: -4.35, w: 1.0, d: 0.85, h: 0.62, rot: -0.08, offAt: 95 },
  { x: 4.7, z: -3.55, w: 1.2, d: 0.9, h: 0.68, rot: -0.22, offAt: Infinity },
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Normalised elliptical radius from the lake's centre (1 = the mean shoreline). */
export function lakeRadius(x: number, z: number): number {
  return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
}

/** Signed distance (approximately, world units) to the shoreline: negative on the water. */
export function lakeSDF(x: number, z: number): number {
  const dx = (x - LAKE.x) / LAKE.rx;
  const dz = (z - LAKE.z) / LAKE.rz;
  const a = Math.atan2(dz, dx);
  const wobble = 0.09 * Math.sin(a * 3 + 1.3) + 0.05 * Math.sin(a * 5 + 0.4) + 0.025 * Math.sin(a * 9 + 2.1);
  return (Math.hypot(dx, dz) - 1 - wobble) * Math.min(LAKE.rx, LAKE.rz);
}

const BUMPS: readonly [number, number, number, number][] = [
  // x, z, height, radius
  [-6.8, -5.4, 1.35, 2.5],
  [-2.2, -6.1, 0.95, 2.3],
  [1.6, -5.9, 1.25, 2.4],
  [5.6, -5.6, 1.5, 2.6],
  [8.6, -3.4, 1.0, 2.2],
  [-8.7, -2.6, 0.95, 2.1],
  [8.9, 0.6, 0.55, 1.8],
  [-9.0, 0.9, 0.5, 1.7],
];

/** Soft hills round the back and sides of the tile. */
export function hillHeight(x: number, z: number): number {
  let h = 0;
  for (const [bx, bz, bh, br] of BUMPS) {
    const d2 = ((x - bx) ** 2 + (z - bz) ** 2) / (br * br);
    h += bh * Math.exp(-d2 * 1.6);
  }
  return h;
}

/** The painted ground: banks rising from the water, the lake bed beneath it, hills behind. */
export function groundHeight(x: number, z: number): number {
  const s = lakeSDF(x, z);
  const bank = s < 0 ? -0.04 - 0.36 * smooth(0, 1.2, -s) : 0.03 + 0.15 * smooth(0, 1.1, s);
  return bank + hillHeight(x, z) * smooth(0.3, 2.2, s);
}

export function onJetty(x: number, z: number, margin = 0): boolean {
  return Math.abs(x - JETTY.x) < JETTY.w / 2 + margin && z < JETTY.z0 + margin && z > JETTY.z1 - margin;
}

export function onWater(x: number, z: number): boolean {
  return lakeSDF(x, z) < 0 && !onJetty(x, z);
}

/** Whatever a lantern would stand on: the jetty's boards, the water, or the ground. */
export function surfaceHeight(x: number, z: number): number {
  if (onJetty(x, z)) return JETTY.deck;
  return Math.max(groundHeight(x, z), lakeSDF(x, z) < 0 ? WATER_Y : -Infinity);
}

/** Distance inside the tile's rectangle (negative outside). */
export function edgeDistance(x: number, z: number): number {
  return Math.min(TILE.halfX - Math.abs(x), TILE.halfZ - Math.abs(z));
}

export function insideCottage(x: number, z: number, margin = 0.15): boolean {
  return COTTAGES.some((c) => {
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * Math.cos(c.rot) - dz * Math.sin(c.rot);
    const lz = dx * Math.sin(c.rot) + dz * Math.cos(c.rot);
    return Math.abs(lx) < c.w / 2 + margin && Math.abs(lz) < c.d / 2 + margin;
  });
}

/** Where a cottage's window glows: world position, a little in front of its lake-facing wall. */
export function windowPosition(c: Cottage): [number, number, number] {
  const fx = Math.sin(c.rot), fz = Math.cos(c.rot);
  return [c.x + fx * (c.d / 2 + 0.05), groundHeight(c.x, c.z) + c.h * 0.48, c.z + fz * (c.d / 2 + 0.05)];
}

// --- planting -------------------------------------------------------------------------------

export interface Tree {
  x: number;
  z: number;
  s: number;
  kind: 'pine' | 'puff';
  v: number;
}

/** Pines on the hills, a few round trees by the cottages: seeded, so the same every visit. */
export const TREES: readonly Tree[] = (() => {
  const rnd = seededRandom(31);
  const out: Tree[] = [];
  const free = (x: number, z: number, r: number) =>
    !insideCottage(x, z, 0.35) && out.every((t) => Math.hypot(t.x - x, t.z - z) > (t.s + r) * 0.45) && lakeSDF(x, z) > 0.9;
  for (let i = 0; out.length < 40 && i < 2000; i++) {
    const x = (rnd() * 2 - 1) * (TILE.halfX - 0.5);
    const z = -TILE.halfZ + 0.4 + rnd() * 5.6;
    const backness = smooth(-0.5, -5.8, z) + smooth(6.6, 8.6, Math.abs(x)) * smooth(2.5, -1, z);
    if (rnd() > backness) continue;
    const s = 0.55 + rnd() * 0.45;
    if (free(x, z, s)) out.push({ x, z, s, kind: 'pine', v: Math.floor(rnd() * 3) });
  }
  for (const [x, z, s] of [[-6.3, -3.2, 0.62], [-4.3, -4.85, 0.55], [3.5, -4.1, 0.6], [5.95, -3.1, 0.5], [-1.6, -3.7, 0.45]] as const) {
    out.push({ x, z, s, kind: 'puff', v: out.length % 2 });
  }
  return out;
})();

/** Reed clumps on the shoreline, leaving the jetty's mouth clear. */
export const REEDS: readonly { x: number; z: number; n: number; h: number }[] = (() => {
  const rnd = seededRandom(7);
  const out: { x: number; z: number; n: number; h: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + rnd() * 0.06;
    // only some stretches of the shore are reedy
    const reedy = Math.sin(a * 2 + 0.6) + Math.sin(a * 5 + 2.0) * 0.6;
    if (reedy < 0.15) continue;
    // walk out from the centre to just short of the water's edge
    let r = 0.85;
    for (let k = 0; k < 40; k++) {
      const x = LAKE.x + Math.cos(a) * LAKE.rx * r, z = LAKE.z + Math.sin(a) * LAKE.rz * r;
      if (lakeSDF(x, z) > -0.12) break;
      r += 0.005;
    }
    const x = LAKE.x + Math.cos(a) * LAKE.rx * r, z = LAKE.z + Math.sin(a) * LAKE.rz * r;
    if (onJetty(x, z, 0.7) || edgeDistance(x, z) < 0.8) continue;
    out.push({ x, z, n: 5 + Math.floor(rnd() * 6), h: 0.45 + rnd() * 0.35 });
  }
  return out;
})();

/** The lake's GLSL twin (shoreline and banks), for the ground and water shaders. */
export const LAKE_GLSL = /* glsl */ `
const vec4 LAKE = vec4(${LAKE.x.toFixed(3)}, ${LAKE.z.toFixed(3)}, ${LAKE.rx.toFixed(3)}, ${LAKE.rz.toFixed(3)});
float lakeSDF(vec2 xz) {
  vec2 d = (xz - LAKE.xy) / LAKE.zw;
  float a = atan(d.y, d.x);
  float wobble = 0.09 * sin(a * 3.0 + 1.3) + 0.05 * sin(a * 5.0 + 0.4) + 0.025 * sin(a * 9.0 + 2.1);
  return (length(d) - 1.0 - wobble) * min(LAKE.z, LAKE.w);
}
const vec4 JETTY = vec4(${JETTY.x.toFixed(3)}, ${JETTY.z0.toFixed(3)}, ${JETTY.z1.toFixed(3)}, ${JETTY.w.toFixed(3)});
float jettyMask(vec2 xz, float m) {
  return step(abs(xz.x - JETTY.x), JETTY.w * 0.5 + m) * step(xz.y, JETTY.y + m) * step(JETTY.z - m, xz.y);
}
float tileEdge(vec2 xz) {
  vec2 q = abs(xz) - vec2(${TILE.halfX.toFixed(2)}, ${TILE.halfZ.toFixed(2)}) + 1.0;
  return -(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 1.0);
}
`;

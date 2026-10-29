import { LAKE, TILE, lakeRadius } from '../scene/lake';

/**
 * Where a lantern is, as a pure function of (when it was made, when it was
 * let go, its seed, now). Nothing is integrated frame to frame, so lanterns
 * reload in place, flights are testable by sampling, and a recording at a
 * fixed step plays back identically.
 *
 *   born → reveal (painted in) → lit (flame catches, glows up) → swell
 *   let go, sky: lifts slowly, then steadily, swaying on the breeze, drifting
 *     back over the hills; ends as a tiny warm star that stays in the sky
 *   let go, lake: sails slowly round the lake on a gentle current, bobbing
 */

export type Mode = 'sky' | 'lake';

export interface FlightInput {
  readonly at: readonly [number, number, number];
  readonly born: number;
  readonly released: number | null;
  readonly seed: number;
  readonly mode: Mode;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Uniform size factor: lanterns far up are drawn smaller still, like real distance. */
  scale: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  /** 0..1 brush-stroke paint-in. */
  reveal: number;
  /** 0..1 the flame caught and the paper glowing. */
  lit: number;
  /** A flare as the flame catches (0..~1, brief). */
  flare: number;
  /** 0 a lantern near the ground .. 1 a tiny warm star. */
  star: number;
  phase: 'waiting' | 'rising' | 'star' | 'floating';
}

export const REVEAL_S = 0.7;
export const LIGHT_S = 1.0;
/** Waiting on the ground this long with nothing done, a lantern lets itself go. */
export const AUTO_RELEASE_MS = 4000;

/** Deterministic per-lantern random numbers in [0, 1). */
export function rand(seed: number, k: number): number {
  const x = Math.sin(seed * 12.9898 + k * 78.233 + 0.5) * 43758.5453;
  return x - Math.floor(x);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Where a sky lantern ends up: high over the hills, spread across the sky above the tile. */
export function starTarget(input: FlightInput): [number, number, number] {
  const { at, seed } = input;
  const drift = 1.5 + rand(seed, 1) * 2.5; // the breeze carries them a little east
  const x = Math.max(-TILE.halfX * 0.8, Math.min(TILE.halfX * 0.8, at[0] * 0.55 + drift + (rand(seed, 2) - 0.5) * 11));
  // high enough to clear the pines, low enough to stay inside the painted sky
  const y = 2.9 + rand(seed, 3) * 2.1;
  const z = -TILE.halfZ - 2.2 + rand(seed, 4) * 2.6;
  return [x, y, z];
}

/** Distance risen along the flight after `t` seconds: slow at first, then steady. */
export function risen(t: number, calm: boolean): number {
  const v = calm ? 0.22 : 0.42;
  const tau = calm ? 4 : 2.5;
  if (t <= 0) return 0;
  return v * (t - tau * (1 - Math.exp(-t / tau)));
}

function intro(age: number, calm: boolean): Pick<Pose, 'reveal' | 'lit' | 'flare'> & { swell: number } {
  const reveal = clamp01(age / REVEAL_S);
  const lit = smoothstep(REVEAL_S * 0.8, REVEAL_S * 0.8 + LIGHT_S, age);
  const f = (age - REVEAL_S * 0.85) / 0.18;
  const flare = calm ? 0 : Math.exp(-f * f) * 0.9;
  // filling with warm air: a subtle swell
  const swell = 1 + 0.04 * smoothstep(REVEAL_S + 0.4, REVEAL_S + 2.4, age);
  return { reveal, lit, flare, swell };
}

export function lanternPose(input: FlightInput, now: number, calm = false): Pose {
  const { at, born, released, seed, mode } = input;
  const age = Math.max(0, (now - born) / 1000);
  const { reveal, lit, flare, swell } = intro(age, calm);
  const t = released === null ? 0 : Math.max(0, (now - released) / 1000);
  const motion = calm ? 0 : 1;
  const base: Pose = { x: at[0], y: at[1], z: at[2], scale: swell, yaw: rand(seed, 9) * 0.36 - 0.18, tiltX: 0, tiltZ: 0, reveal, lit, flare, star: 0, phase: 'waiting' };

  if (mode === 'lake') return floatPose(base, input, t, age, motion);

  if (released === null || t === 0) {
    // waiting: a lantern drawn up in the air hovers, one on the ground sits still
    base.y += at[1] > 1.2 ? 0.04 * Math.sin(age * 1.3 + seed) * motion : 0;
    return base;
  }

  const target = starTarget(input);
  const L = Math.hypot(target[0] - at[0], target[1] - at[1], target[2] - at[2]);
  const s = risen(t, calm);
  const k = 1 - Math.exp(-s / (L * 0.5));
  // up first, then the breeze takes it back over the hills
  const ky = Math.pow(k, 0.8);
  const kh = Math.pow(k, 1.35);
  // sway, tilt and turning ease in from stillness, so letting go never jumps
  const fade = (1 - k) * (1 - Math.exp(-t / 2.5));
  const sway = Math.sin(t * 0.85 + seed) * 0.16 * fade * motion;
  const swayZ = Math.sin(t * 0.63 + seed * 1.7) * 0.08 * fade * motion;
  const star = smoothstep(0.55, 0.92, k);
  return {
    x: at[0] + (target[0] - at[0]) * kh + sway,
    y: at[1] + (target[1] - at[1]) * ky,
    z: at[2] + (target[2] - at[2]) * kh + swayZ,
    scale: swell * (1 - 0.6 * smoothstep(0.05, 0.9, k)),
    yaw: base.yaw + (calm ? 0 : 0.5 * (Math.sin(t * 0.21 + seed) - Math.sin(seed)) + t * 0.06 * (1 - k)),
    tiltX: Math.cos(t * 0.63 + seed * 1.7) * 0.06 * fade * motion,
    tiltZ: -Math.cos(t * 0.85 + seed) * 0.1 * fade * motion,
    reveal,
    lit,
    flare,
    star,
    phase: star >= 0.999 ? 'star' : 'rising',
  };
}

/** Elliptical radius band a floating lantern keeps to: clear of the jetty and the reeds. */
export const ORBIT = { min: 0.16, max: 0.43 } as const;
const OMEGA = (Math.PI * 2) / 260; // one slow lap in a little over four minutes

function floatPose(base: Pose, input: FlightInput, t: number, age: number, motion: number): Pose {
  const { at, seed } = input;
  const e0 = lakeRadius(at[0], at[2]);
  const a0 = Math.atan2((at[2] - LAKE.z) / LAKE.rz, (at[0] - LAKE.x) / LAKE.rx);
  const eC = Math.min(ORBIT.max, Math.max(ORBIT.min, e0));
  // drift into its lane over the first few seconds, the current picking up gently
  const settle = 1 - Math.exp(-t / 14);
  const e = e0 + (eC - e0) * settle;
  const tau = 4;
  const a = a0 + OMEGA * (t - tau * (1 - Math.exp(-t / tau)));
  const bob = Math.sin(age * 1.7 + seed * 3) * 0.012 * motion;
  return {
    ...base,
    x: LAKE.x + Math.cos(a) * LAKE.rx * e,
    y: at[1] + bob,
    z: LAKE.z + Math.sin(a) * LAKE.rz * e,
    yaw: base.yaw + t * 0.05,
    tiltX: Math.sin(age * 1.3 + seed) * 0.03 * motion,
    tiltZ: Math.sin(age * 1.1 + seed * 2) * 0.03 * motion,
    phase: input.released === null ? 'waiting' : 'floating',
  };
}

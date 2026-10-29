import { SHAPES, scaleShape, type ShapePoint } from '../lantern/profile';
import { AUTO_RELEASE_MS, type Mode } from '../lantern/flight';
import { TILE, WATER_Y, JETTY, groundHeight } from '../scene/lake';

/**
 * The persisted night: plain, versioned, immutable data. Each lantern keeps
 * the silhouette it was drawn with, where it was set down, when it was made
 * and let go, its seed and its wish. Where it is right now — on the jetty,
 * halfway up, a star, sailing on the lake — is a pure function of these and
 * the clock, so the sky reloads exactly as it was.
 */

export interface LanternRecord {
  readonly id: string;
  /** Silhouette, bottom ring to top, in world units: [radius, height]. */
  readonly profile: readonly (readonly [number, number])[];
  readonly seed: number;
  readonly wish?: string;
  readonly mode: Mode;
  /** Epoch ms it was drawn. */
  readonly born: number;
  /** Where its bottom ring was set down (world units). */
  readonly at: readonly [number, number, number];
  /** Epoch ms it was let go; null while it waits. */
  readonly released: number | null;
}

export interface LanternsDoc {
  readonly version: 1;
  readonly lanterns: readonly LanternRecord[];
}

export const DOC_VERSION = 1;
export const MAX_LANTERNS = 40;
export const WISH_MAX = 40;
export const MAX_PROFILE_POINTS = 64;

export const emptyDoc = (): LanternsDoc => ({ version: DOC_VERSION, lanterns: [] });

let counter = 0;
export function newLanternId(): string {
  counter = (counter + 1) % 1e6;
  return `l${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 1e6);
}

/** A wish, made safe: no control or formatting characters, one line, at most 40 characters. */
export function cleanWish(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const flat = raw.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();
  return Array.from(flat).slice(0, WISH_MAX).join('');
}

export const findLantern = (doc: LanternsDoc, id: string) => doc.lanterns.find((l) => l.id === id) ?? null;

/** Add a lantern; past forty, the oldest gently gives up its place. */
export function addLantern(doc: LanternsDoc, lantern: LanternRecord): LanternsDoc {
  return { ...doc, lanterns: [...doc.lanterns, lantern].slice(-MAX_LANTERNS) };
}

export function removeLantern(doc: LanternsDoc, id: string): LanternsDoc {
  return { ...doc, lanterns: doc.lanterns.filter((l) => l.id !== id) };
}

export function updateLantern(doc: LanternsDoc, id: string, patch: Partial<Omit<LanternRecord, 'id'>>): LanternsDoc {
  return { ...doc, lanterns: doc.lanterns.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/** Let every waiting lantern go (on load: nobody is there to tend them). */
export function releaseWaiting(doc: LanternsDoc, now: number): LanternsDoc {
  if (doc.lanterns.every((l) => l.released !== null)) return doc;
  return { ...doc, lanterns: doc.lanterns.map((l) => (l.released === null ? { ...l, released: Math.min(now, l.born + AUTO_RELEASE_MS) } : l)) };
}

// --- validation -----------------------------------------------------------------------

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const LIMIT = { x: TILE.halfX + 2, z: TILE.halfZ + 4, y: 12 };
// a lantern's date must be plausible: after 2020, not far in the future
const MIN_TIME = Date.UTC(2020, 0, 1);

function parseProfile(raw: unknown): [number, number][] | null {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > MAX_PROFILE_POINTS) return null;
  const out: [number, number][] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [r, y] = p;
    if (!finite(r) || !finite(y) || r < 0 || r > 2 || y < -0.01 || y > 3) return null;
    out.push([r, y]);
  }
  for (let i = 1; i < out.length; i++) if (out[i][1] < out[i - 1][1] - 1e-6) return null;
  if (out[out.length - 1][1] - out[0][1] < 0.1) return null;
  return out;
}

function parseLantern(raw: unknown, now: number): LanternRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 64) return null;
  const profile = parseProfile(o.profile);
  if (!profile) return null;
  if (!finite(o.seed)) return null;
  if (o.mode !== 'sky' && o.mode !== 'lake') return null;
  if (!finite(o.born) || o.born < MIN_TIME || o.born > now + 86_400_000) return null;
  if (o.released !== null && o.released !== undefined && (!finite(o.released) || o.released < o.born)) return null;
  if (!Array.isArray(o.at) || o.at.length !== 3 || !o.at.every(finite)) return null;
  const [x, y, z] = o.at as number[];
  if (Math.abs(x) > LIMIT.x || Math.abs(z) > LIMIT.z || y < -1 || y > LIMIT.y) return null;
  const wish = cleanWish(o.wish);
  return {
    id: o.id,
    profile,
    seed: Math.floor(o.seed),
    ...(wish ? { wish } : {}),
    mode: o.mode,
    born: o.born,
    at: [x, y, z],
    released: finite(o.released) ? o.released : null,
  };
}

/** Validate untrusted JSON (storage or an imported file). Bad lanterns are dropped; a bad shape is rejected. */
export function parseDoc(raw: unknown, now = Date.now()): LanternsDoc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== DOC_VERSION || !Array.isArray(o.lanterns)) return null;
  const lanterns: LanternRecord[] = [];
  const ids = new Set<string>();
  for (const l of o.lanterns.slice(0, MAX_LANTERNS * 4)) {
    const lantern = parseLantern(l, now);
    if (lantern && !ids.has(lantern.id)) {
      ids.add(lantern.id);
      lanterns.push(lantern);
    }
  }
  return { version: DOC_VERSION, lanterns: lanterns.slice(-MAX_LANTERNS) };
}

// --- built-in nights ----------------------------------------------------------------------

type ShapeName = keyof typeof SHAPES;

function made(id: string, shape: ShapeName, height: number, mode: Mode, at: [number, number, number], agoS: number, seed: number, wish?: string, now = Date.now()): LanternRecord {
  const born = now - agoS * 1000;
  return {
    id,
    profile: scaleShape(SHAPES[shape](), height) as [number, number][],
    seed,
    ...(wish ? { wish } : {}),
    mode,
    born,
    at,
    released: born + 2500,
  };
}

const ground = (x: number, z: number): [number, number, number] => [x, groundHeight(x, z), z];
const water = (x: number, z: number): [number, number, number] => [x, WATER_Y, z];

/** First visit: a few lights already up over the hills, one sailing on the lake. */
export function defaultDoc(now = Date.now()): LanternsDoc {
  return {
    version: DOC_VERSION,
    lanterns: [
      made('first-1', 'round', 0.8, 'sky', ground(1.5, 5.4), 600, 101, 'for grandma', now),
      made('first-2', 'tall', 0.9, 'sky', ground(-5.5, 4.6), 900, 202, undefined, now),
      made('first-3', 'drop', 0.75, 'sky', ground(5.8, 5.2), 400, 303, 'safe travels', now),
      made('first-4', 'squat', 0.5, 'lake', water(2.2, 1.4), 30, 404, 'more nights like this', now),
    ],
  };
}

/** A full sky: lanterns at every stage, a few on the lake. */
export function showcaseDoc(now = Date.now()): LanternsDoc {
  const shapes: ShapeName[] = ['round', 'tall', 'squat', 'drop', 'heart', 'bell'];
  const wishes = ['for grandma', 'come home soon', 'more of this', 'let it rain', 'thank you', 'good luck, Sam', '', 'happy birthday', '', 'brave'];
  const out: LanternRecord[] = [];
  const stamp = now.toString(36);
  for (let i = 0; i < 20; i++) {
    const x = -7 + ((i * 3.7) % 14);
    const z = i % 2 ? 5.0 + (i % 3) * 0.4 : -4.0 + (i % 3) * 0.3;
    const at: [number, number, number] = i === 3 ? [JETTY.x, JETTY.deck, JETTY.z1 + 0.8] : ground(x, z);
    // spread over the last few minutes, so some are still climbing and most are stars
    out.push(made(`show-${i}-${stamp}`, shapes[i % shapes.length], 0.7 + (i % 4) * 0.12, 'sky', at, 6 + i * 11, 1000 + i * 17, wishes[i % wishes.length] || undefined, now));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    out.push(made(`float-${i}-${stamp}`, shapes[(i + 2) % shapes.length], 0.45 + (i % 2) * 0.1, 'lake', water(0.4 + Math.cos(a) * 2.2, 0.8 + Math.sin(a) * 1.1), 20 + i * 15, 2000 + i * 31, wishes[(i + 3) % wishes.length] || undefined, now));
  }
  return { version: DOC_VERSION, lanterns: out };
}

export type { ShapePoint };

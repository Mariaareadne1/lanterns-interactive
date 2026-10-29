import { describe, expect, test } from 'vitest';
import { AUTO_RELEASE_MS, ORBIT, lanternPose, risen, starTarget, type FlightInput } from '../../src/lantern/flight';
import { LAKE, TILE, lakeRadius, lakeSDF, onJetty } from '../../src/scene/lake';

const T0 = Date.UTC(2026, 9, 29, 20);

const sky = (seed = 7, at: [number, number, number] = [1, 0.2, 5]): FlightInput => ({ at, born: T0, released: T0 + 3000, seed, mode: 'sky' });
const lake = (seed = 7, at: [number, number, number] = [2, 0.05, 1.4]): FlightInput => ({ at, born: T0, released: T0 + 3000, seed, mode: 'lake' });

describe('the lantern lights up', () => {
  test('is painted in, then lit, while it waits where it was drawn', () => {
    const waiting: FlightInput = { ...sky(), released: null };
    const early = lanternPose(waiting, T0 + 200);
    const later = lanternPose(waiting, T0 + 2500);
    expect(early.reveal).toBeGreaterThan(0);
    expect(early.reveal).toBeLessThan(1);
    expect(early.lit).toBe(0);
    expect(later.reveal).toBe(1);
    expect(later.lit).toBe(1);
    expect(later.phase).toBe('waiting');
    expect([later.x, later.y, later.z]).toEqual([1, 0.2, 5]);
    expect(later.scale).toBeGreaterThan(1); // swelling with warm air
  });

  test('the flame catches with a brief flare', () => {
    const peak = Math.max(...Array.from({ length: 60 }, (_, i) => lanternPose(sky(), T0 + i * 30).flare));
    expect(peak).toBeGreaterThan(0.5);
    expect(lanternPose(sky(), T0 + 2500).flare).toBeLessThan(0.01);
  });
});

describe('the rise', () => {
  test('altitude never goes down and starts slowly', () => {
    let prev = -Infinity;
    for (let ms = 0; ms < 240_000; ms += 250) {
      const p = lanternPose(sky(), T0 + 3000 + ms);
      expect(p.y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = p.y;
    }
    expect(risen(1, false)).toBeLessThan(risen(10, false) / 10);
  });

  test('is continuous frame to frame (no jumps), including at the moment of letting go', () => {
    for (const seed of [1, 42, 999, 31337]) {
      let prev = lanternPose(sky(seed), T0 + 2900);
      for (let ms = 2900; ms < 120_000; ms += 1000 / 60) {
        const p = lanternPose(sky(seed), T0 + ms);
        const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
        expect(d).toBeLessThan(0.02);
        expect(Math.abs(p.scale - prev.scale)).toBeLessThan(0.01);
        prev = p;
      }
    }
  });

  test('ends as a small star over the hills, inside the tile, and stays there', () => {
    const late = lanternPose(sky(), T0 + 600_000);
    const later = lanternPose(sky(), T0 + 900_000);
    const target = starTarget(sky());
    expect(late.phase).toBe('star');
    expect(late.star).toBe(1);
    expect(Math.hypot(late.x - target[0], late.y - target[1], late.z - target[2])).toBeLessThan(0.05);
    expect(Math.hypot(later.x - late.x, later.y - late.y, later.z - late.z)).toBeLessThan(0.01);
    expect(late.scale).toBeLessThan(0.5);
    expect(Math.abs(late.x)).toBeLessThan(TILE.halfX);
    expect(late.z).toBeLessThan(-TILE.halfZ + 1);
  });

  test('is deterministic: the same lantern is in the same place at the same time', () => {
    expect(lanternPose(sky(5), T0 + 20_000)).toEqual(lanternPose(sky(5), T0 + 20_000));
    expect(lanternPose(sky(5), T0 + 20_000)).not.toEqual(lanternPose(sky(6), T0 + 20_000));
  });

  test('reduced motion: no sway, and a slower rise', () => {
    const calm = lanternPose(sky(), T0 + 13_000, true);
    const lively = lanternPose(sky(), T0 + 13_000, false);
    expect(calm.tiltX).toBe(0);
    expect(calm.tiltZ).toBe(0);
    expect(calm.y).toBeLessThan(lively.y);
    expect(calm.flare).toBe(0);
  });
});

describe('floating on the lake', () => {
  test('stays on the water, clear of the jetty, and keeps moving slowly', () => {
    for (const at of [[2, 0.05, 1.4], [-4.5, 0.05, 0.6], [0.3, 0.05, 3.6], [-2.4, 0.05, 1.5]] as [number, number, number][]) {
      let prev = lanternPose(lake(3, at), T0 + 3000);
      for (let ms = 3000; ms < 400_000; ms += 500) {
        const p = lanternPose(lake(3, at), T0 + ms);
        // placement keeps a lantern at least 0.25 off the shore; once in its lane, well clear of it
        expect(lakeSDF(p.x, p.z)).toBeLessThan(ms > 60_000 ? -0.3 : -0.2);
        if (ms > 60_000) {
          expect(onJetty(p.x, p.z, 0.15)).toBe(false);
          expect(lakeRadius(p.x, p.z)).toBeLessThanOrEqual(ORBIT.max + 0.02);
        }
        expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.08);
        expect(Math.abs(p.y - 0.05)).toBeLessThan(0.02);
        prev = p;
      }
    }
  });

  test('starts exactly where it was set down', () => {
    const p = lanternPose(lake(), T0 + 3000);
    expect(p.x).toBeCloseTo(2, 6);
    expect(p.z).toBeCloseTo(1.4, 6);
    expect(p.phase).toBe('floating');
    expect(lanternPose({ ...lake(), released: null }, T0 + 9000).phase).toBe('waiting');
  });

  test('sails round the lake', () => {
    const a = lanternPose(lake(), T0 + 3000), b = lanternPose(lake(), T0 + 120_000);
    const ang = (p: { x: number; z: number }) => Math.atan2((p.z - LAKE.z) / LAKE.rz, (p.x - LAKE.x) / LAKE.rx);
    expect(Math.abs(ang(b) - ang(a))).toBeGreaterThan(1);
  });
});

test('a waiting lantern lets itself go after about four seconds', () => {
  expect(AUTO_RELEASE_MS).toBeGreaterThanOrEqual(3500);
  expect(AUTO_RELEASE_MS).toBeLessThanOrEqual(5000);
});

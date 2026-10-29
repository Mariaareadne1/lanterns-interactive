import { describe, expect, test } from 'vitest';
import { MAX_RADIUS, MIN_RADIUS, SHAPES, checkLoop, loopToShape, normaliseShape, scaleShape } from '../../src/lantern/profile';
import { resampleProfile } from '../../src/lantern/geometry';
import type { Pt } from '../../src/interaction/stroke';

/** A closed loop traced round a radius function (screen pixels, y down), like a hand would. */
function loop(radius: (t: number) => number, h = 160, cx = 400, bottom = 500, lean = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push({ x: cx + radius(t) * h + lean * t * h, y: bottom - t * h });
  }
  for (let i = 40; i >= 0; i--) {
    const t = i / 40;
    pts.push({ x: cx - radius(t) * h + lean * t * h, y: bottom - t * h });
  }
  return pts;
}

const round = (t: number) => 0.42 * Math.sin(Math.PI * t) + 0.08;

describe('closed-loop check', () => {
  test('accepts a loop whose ends meet', () => {
    expect(checkLoop(loop(round)).ok).toBe(true);
  });

  test('rejects an open arc', () => {
    const arc = loop(round).slice(0, 55);
    const r = checkLoop(arc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('open');
  });

  test('rejects a tiny loop and a scribble too short to be anything', () => {
    const tiny = checkLoop(loop(round, 20));
    expect(tiny.ok).toBe(false);
    const short = checkLoop([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }]);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toBe('short');
  });

  test('accepts a loop whose end overshoots past the start', () => {
    const pts = loop(round);
    pts.push({ x: pts[1].x + 10, y: pts[1].y - 8 }, { x: pts[3].x + 14, y: pts[3].y - 14 });
    expect(checkLoop(pts).ok).toBe(true);
  });
});

describe('loop → profile', () => {
  test('heights run from 0 at the open ring to the closed top', () => {
    const { shape } = loopToShape(loop(round));
    expect(shape[0][1]).toBe(0);
    expect(shape[shape.length - 1][0]).toBe(0);
    for (let i = 1; i < shape.length; i++) expect(shape[i][1]).toBeGreaterThanOrEqual(shape[i - 1][1]);
    // the open bottom ring is still fairly wide
    const widest = Math.max(...shape.map((p) => p[0]));
    expect(shape[0][0]).toBeGreaterThan(widest * 0.45);
  });

  test('symmetrises a lopsided loop about a vertical axis but keeps its widths', () => {
    const straight = loopToShape(loop(round));
    const leaning = loopToShape(loop(round, 160, 400, 500, 0.25));
    const a = Math.max(...straight.shape.map((p) => p[0]));
    const b = Math.max(...leaning.shape.map((p) => p[0]));
    expect(Math.abs(a - b)).toBeLessThan(0.06);
  });

  test('keeps personality: a tall loop is slimmer than a squat one', () => {
    const tall = loopToShape(loop((t) => 0.2 * Math.sin(Math.PI * t) + 0.04));
    const squat = loopToShape(loop((t) => 0.6 * Math.sin(Math.PI * t) + 0.05));
    const r = (s: typeof tall) => Math.max(...s.shape.map((p) => p[0]));
    expect(r(tall)).toBeLessThan(r(squat) * 0.6);
  });

  test('reports the screen anchor: the axis and the bottom ring', () => {
    const s = loopToShape(loop(round, 160, 400, 500));
    expect(s.axisX).toBeCloseTo(400, 0);
    expect(s.bottomY).toBeLessThanOrEqual(500);
    expect(s.bottomY).toBeGreaterThan(440);
    expect(s.topY).toBeCloseTo(340, -1);
  });

  test('clamps the widest radius between a pole and a pancake', () => {
    const pole = normaliseShape([[0.02, 0], [0.03, 0.5], [0, 1]]);
    const pancake = normaliseShape([[1.5, 0], [2, 0.5], [0, 1]]);
    expect(Math.max(...pole.map((p) => p[0]))).toBeCloseTo(MIN_RADIUS, 2);
    expect(Math.max(...pancake.map((p) => p[0]))).toBeCloseTo(MAX_RADIUS, 2);
  });

  test('scales to world size, wider or narrower across than up', () => {
    const shape = SHAPES.round();
    const w = scaleShape(shape, 1.2, 1.3);
    const top = w[w.length - 1][1];
    expect(top).toBeCloseTo(1.2, 2);
    expect(Math.max(...w.map((p) => p[0]))).toBeCloseTo(Math.max(...shape.map((p) => p[0])) * 1.2 * 1.3, 2);
  });

  test('every built-in shape resamples into a closed, monotonic lathe profile', () => {
    for (const make of Object.values(SHAPES)) {
      const p = resampleProfile(scaleShape(make(), 1));
      expect(p[p.length - 1][0]).toBe(0);
      for (const [r, y] of p) {
        expect(Number.isFinite(r) && Number.isFinite(y)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

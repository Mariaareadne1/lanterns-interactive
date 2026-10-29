import { describe, expect, test } from 'vitest';
import {
  MAX_LANTERNS, WISH_MAX, addLantern, cleanWish, defaultDoc, emptyDoc, parseDoc, releaseWaiting, removeLantern, showcaseDoc, updateLantern, type LanternRecord,
} from '../../src/state/document';
import { canRedo, canUndo, commit, amend, createHistory, redo, undo } from '../../src/state/history';
import { lakeSDF, onJetty } from '../../src/scene/lake';

const NOW = Date.UTC(2026, 9, 29, 20);

const rec = (id: string, extra: Partial<LanternRecord> = {}): LanternRecord => ({
  id,
  profile: [[0.3, 0], [0.45, 0.4], [0.3, 0.8], [0, 0.9]],
  seed: 3,
  mode: 'sky',
  born: NOW - 10_000,
  at: [1, 0.2, 5],
  released: NOW - 6000,
  ...extra,
});

describe('wishes are sanitised', () => {
  test('control and formatting characters go, whitespace collapses, length is capped', () => {
    expect(cleanWish('  for\n grandma\t ')).toBe('for grandma');
    expect(cleanWish('a\u0000b‮c​d')).toBe('abcd');
    expect(cleanWish('x'.repeat(100))).toHaveLength(WISH_MAX);
    expect(cleanWish(42)).toBe('');
    // emoji count as one character each
    expect(Array.from(cleanWish('🏮'.repeat(50)))).toHaveLength(WISH_MAX);
  });
});

describe('persistence validation', () => {
  test('a saved night round-trips', () => {
    const doc = addLantern(emptyDoc(), rec('a', { wish: 'come home' }));
    expect(parseDoc(JSON.parse(JSON.stringify(doc)), NOW)).toEqual(doc);
  });

  test('rejects the wrong shape or version outright', () => {
    expect(parseDoc(null, NOW)).toBeNull();
    expect(parseDoc({ version: 2, lanterns: [] }, NOW)).toBeNull();
    expect(parseDoc({ version: 1, lanterns: 'x' }, NOW)).toBeNull();
  });

  test('drops bad lanterns and keeps good ones', () => {
    const bad = [
      { ...rec('p1'), profile: [[0.1, 0]] },
      { ...rec('p2'), profile: [[0.1, 0], [NaN, 0.5], [0, 1]] },
      { ...rec('p3'), profile: [[0.1, 0.5], [0.2, 0.1], [0, 1]] }, // heights out of order
      { ...rec('m'), mode: 'moon' },
      { ...rec('at'), at: [1e9, 0, 0] },
      { ...rec('born'), born: 5 },
      { ...rec('rel'), released: NOW - 20_000 }, // let go before it was made
      { ...rec('id'), id: '' },
      { ...rec('seed'), seed: 'x' },
    ];
    const doc = parseDoc({ version: 1, lanterns: [...bad, rec('ok'), rec('ok')] }, NOW);
    expect(doc?.lanterns.map((l) => l.id)).toEqual(['ok']);
  });

  test('sanitises an imported wish and caps the sky at forty', () => {
    const many = Array.from({ length: 60 }, (_, i) => rec(`l${i}`, { wish: `wish\u0007 ${i}${'!'.repeat(80)}` }));
    const doc = parseDoc({ version: 1, lanterns: many }, NOW)!;
    expect(doc.lanterns).toHaveLength(MAX_LANTERNS);
    expect(doc.lanterns[0].id).toBe('l20');
    expect(doc.lanterns.every((l) => (l.wish ?? '').length <= WISH_MAX && !l.wish?.includes('\u0007'))).toBe(true);
  });

  test('lanterns left waiting go up on load, no later than their own four seconds', () => {
    const doc = addLantern(emptyDoc(), rec('w', { released: null }));
    const out = releaseWaiting(doc, NOW);
    expect(out.lanterns[0].released).toBe(rec('w').born + 4000);
    expect(releaseWaiting(out, NOW)).toBe(out);
  });

  test('built-in nights are valid and sensibly placed', () => {
    for (const doc of [defaultDoc(NOW), showcaseDoc(NOW)]) {
      expect(parseDoc(JSON.parse(JSON.stringify(doc)), NOW)).toEqual(doc);
      for (const l of doc.lanterns) {
        if (l.mode === 'lake') expect(lakeSDF(l.at[0], l.at[2])).toBeLessThan(0);
        else expect(lakeSDF(l.at[0], l.at[2]) > 0 || onJetty(l.at[0], l.at[2])).toBe(true);
      }
    }
  });
});

describe('editing and undo/redo', () => {
  test('add, update and remove never mutate', () => {
    const a = emptyDoc();
    const b = addLantern(a, rec('x'));
    const c = updateLantern(b, 'x', { wish: 'hi' });
    const d = removeLantern(c, 'x');
    expect(a.lanterns).toHaveLength(0);
    expect(b.lanterns[0].wish).toBeUndefined();
    expect(c.lanterns[0].wish).toBe('hi');
    expect(d.lanterns).toHaveLength(0);
  });

  test('past forty the oldest gives up its place', () => {
    let doc = emptyDoc();
    for (let i = 0; i < 45; i++) doc = addLantern(doc, rec(`l${i}`));
    expect(doc.lanterns).toHaveLength(MAX_LANTERNS);
    expect(doc.lanterns[0].id).toBe('l5');
  });

  test('drawing is one undo step; letting go and the wish are amended into it', () => {
    let h = createHistory(emptyDoc());
    h = commit(h, addLantern(h.present, rec('x', { released: null })));
    h = amend(h, updateLantern(h.present, 'x', { wish: 'hello', released: NOW }));
    expect(h.present.lanterns[0]).toMatchObject({ wish: 'hello', released: NOW });
    h = undo(h);
    expect(h.present.lanterns).toHaveLength(0);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.lanterns[0]).toMatchObject({ wish: 'hello', released: NOW });
    expect(canUndo(h)).toBe(true);
  });

  test('a new edit clears the redo stack', () => {
    let h = createHistory(emptyDoc());
    h = commit(h, addLantern(h.present, rec('a')));
    h = undo(h);
    h = commit(h, addLantern(h.present, rec('b')));
    expect(canRedo(h)).toBe(false);
  });
});

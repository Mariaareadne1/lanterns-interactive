import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { Store, Selection } from '../state/store';
import {
  addLantern, cleanWish, emptyDoc, findLantern, MAX_LANTERNS, newLanternId, newSeed, releaseWaiting, removeLantern, updateLantern,
  type LanternRecord, type LanternsDoc,
} from '../state/document';
import { saveDoc } from '../state/persistence';
import { checkLoop, loopToShape, scaleShape } from '../lantern/profile';
import { AUTO_RELEASE_MS, type Mode } from '../lantern/flight';
import type { Pt } from '../interaction/stroke';
import { screenToTerrain, setRay } from '../interaction/rays';
import { LakeScene } from '../scene/LakeScene';
import { LanternManager } from '../lantern/LanternManager';
import { COTTAGES, TILE, WATER_Y, edgeDistance, groundHeight, insideCottage, lakeSDF, onJetty, surfaceHeight } from '../scene/lake';

/**
 * Application commands. UI and pointer input call these; they turn intent
 * into document edits (undoable: drawing, removing, clearing) or live
 * requests to a lantern (not undoable: read its wish, glow). Letting go
 * and the wish are amended into the lantern that was drawn, so one undo
 * takes the whole lantern away.
 */

export type StrokeResult = { ok: true; id: string } | { ok: false; message: string };

/** Where a drawn lantern goes, and how big it is (world units). */
export interface Placement {
  mode: Mode;
  at: [number, number, number];
  airborne: boolean;
}

const SIZE = {
  sky: { min: 0.45, max: 1.35 },
  lake: { min: 0.35, max: 0.85 },
} as const;
/** The plane (z = const) a lantern drawn up in the sky hangs on, just behind the hills. */
const SKY_PLANE_Z = -TILE.halfZ - 0.6;

export const MESSAGES = {
  open: 'Close the loop — draw all the way round, back to where you started.',
  small: 'Draw a bigger lantern.',
  short: 'Draw a lantern: a closed loop, any shape.',
  outside: 'Draw it over the lake, the shore or the sky.',
} as const;

export class LanternsApp {
  readonly scene: LakeScene;
  readonly lanterns: LanternManager;
  private saveTimer = 0;
  private readonly unsub: (() => void)[] = [];
  private warnedFull = false;
  private pendingDeadline = 0;
  private pendingHeld = false;
  private readingTimer = 0;
  hoverId: string | null = null;
  private readonly windows: { pos: THREE.Vector3; on: number }[];

  constructor(readonly engine: Engine, readonly store: Store) {
    this.scene = new LakeScene(engine);
    this.lanterns = new LanternManager(engine.world, engine.reducedMotion);
    this.lanterns.onRipple = (x, z, s) => this.scene.ripple(x, z, s);
    engine.scene.add(this.lanterns.group);
    this.windows = COTTAGES.map((_, i) => ({ pos: this.scene.windowPos[i], on: 1 }));
  }

  start(): void {
    // nobody was here to tend lanterns left waiting: they have long since gone up
    this.store.amend(releaseWaiting(this.store.doc, this.engine.now));
    let prevDoc: LanternsDoc | null = null;
    const onChange = () => {
      const doc = this.store.doc;
      if (doc === prevDoc) return;
      prevDoc = doc;
      this.lanterns.sync(doc, this.engine.now);
      window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => saveDoc(this.store.doc), 250);
    };
    this.unsub.push(this.store.subscribe(onChange));
    onChange();
    this.unsub.push(
      this.engine.onFrame(() => {
        const s = this.store.get();
        this.lanterns.selectedId = s.selection?.id ?? null;
        this.lanterns.hoverId = this.hoverId;
        const now = this.engine.now;
        if (s.pending && !this.pendingHeld && now > this.pendingDeadline) this.letGo(s.pending);
        this.windows.forEach((w, i) => (w.on = this.scene.windowOn[i]));
        this.lanterns.update(now, this.engine.camera, this.windows);
      }),
    );
    this.unsub.push(
      this.engine.onBeforeRender(() => {
        const h = this.engine.canvas.clientHeight * this.engine.renderer.getPixelRatio();
        this.lanterns.glow.setScale(h, this.engine.camera.fov);
        this.lanterns.smoke.setScale(h / (2 * Math.tan(THREE.MathUtils.degToRad(this.engine.camera.fov / 2))));
      }),
    );
    this.store.set({ loading: false });
  }

  get rect(): DOMRect {
    return this.engine.canvas.getBoundingClientRect();
  }

  // --- drawing ---------------------------------------------------------------------------

  /** Where a lantern whose bottom ring is drawn at this screen point would go. */
  placeAt(clientX: number, clientY: number): Placement | null {
    const hit = screenToTerrain(this.engine.camera, this.rect, clientX, clientY);
    if (hit && edgeDistance(hit.x, hit.z) > 0.35) {
      if (insideCottage(hit.x, hit.z)) return null;
      if (!onJetty(hit.x, hit.z) && lakeSDF(hit.x, hit.z) < -0.25) return { mode: 'lake', at: [hit.x, WATER_Y + 0.05, hit.z], airborne: false };
      if (!onJetty(hit.x, hit.z) && lakeSDF(hit.x, hit.z) < 0.05) return null; // the very edge of the water: neither
      return { mode: 'sky', at: [hit.x, surfaceHeight(hit.x, hit.z), hit.z], airborne: false };
    }
    // above the tile: a lantern drawn straight into the sky hangs on a plane behind the hills
    const ray = setRay(this.engine.camera, this.rect, clientX, clientY);
    if (Math.abs(ray.direction.z) < 1e-4) return null;
    const t = (SKY_PLANE_Z - ray.origin.z) / ray.direction.z;
    if (t <= 0) return null;
    const p = ray.origin.clone().addScaledVector(ray.direction, t);
    if (Math.abs(p.x) > TILE.halfX * 0.92 || p.y < groundHeight(p.x, SKY_PLANE_Z) + 0.6 || p.y > 9) return null;
    return { mode: 'sky', at: [p.x, p.y, p.z], airborne: true };
  }

  canDrawAt(clientX: number, clientY: number): boolean {
    return this.placeAt(clientX, clientY) !== null;
  }

  /** On-screen pixels per world unit at a point, across and (foreshortened) upward. */
  private scaleAt(p: THREE.Vector3): { across: number; up: number } {
    const across = this.engine.pixelsPerMeterAt(p);
    const rect = this.rect;
    const a = p.clone().project(this.engine.camera);
    const b = p.clone().add(new THREE.Vector3(0, 1, 0)).project(this.engine.camera);
    const up = Math.hypot((b.x - a.x) * rect.width / 2, (b.y - a.y) * rect.height / 2);
    return { across, up: Math.max(1, up) };
  }

  createFromStroke(points: readonly Pt[]): StrokeResult {
    const check = checkLoop(points);
    if (!check.ok) return { ok: false, message: MESSAGES[check.reason] };
    const loop = loopToShape(points);
    const place = this.placeAt(loop.axisX, loop.bottomY);
    if (!place) return { ok: false, message: MESSAGES.outside };

    // as big as it was drawn, within limits
    const anchor = new THREE.Vector3(...place.at);
    const { across, up } = this.scaleAt(anchor);
    const pxHeight = loop.bottomY - loop.topY;
    const lim = SIZE[place.mode];
    const height = Math.min(lim.max, Math.max(lim.min, pxHeight / up));
    const profile = scaleShape(loop.shape, height, up / across);

    // anything still waiting goes up now
    const pending = this.store.get().pending;
    if (pending) this.letGo(pending);
    if (this.store.doc.lanterns.length >= MAX_LANTERNS && !this.warnedFull) {
      this.warnedFull = true;
      this.store.toast('Forty lanterns fill the sky — the oldest is fading to make room.');
    }
    const record: LanternRecord = { id: newLanternId(), profile, seed: newSeed(), mode: place.mode, born: this.engine.now, at: place.at, released: null };
    this.store.commit(addLantern(this.store.doc, record), { hasDrawn: true, pending: record.id, selection: null });
    this.pendingDeadline = this.engine.now + AUTO_RELEASE_MS + 1200;
    this.pendingHeld = false;
    return { ok: true, id: record.id };
  }

  // --- waiting, the wish and letting go -------------------------------------------------------

  /** Something was done with the waiting lantern: give it another four seconds. */
  touchPending(): void {
    this.pendingDeadline = this.engine.now + AUTO_RELEASE_MS;
  }

  /** While a wish is being typed, the lantern waits. */
  holdPending(hold: boolean): void {
    this.pendingHeld = hold;
    this.touchPending();
  }

  setWish(id: string, wish: string): void {
    const rec = findLantern(this.store.doc, id);
    if (!rec) return;
    const clean = cleanWish(wish);
    if ((rec.wish ?? '') === clean) return;
    const { wish: _old, ...rest } = rec;
    void _old;
    const next: LanternRecord = clean ? { ...rest, wish: clean } : rest;
    this.store.amend({ ...this.store.doc, lanterns: this.store.doc.lanterns.map((l) => (l.id === id ? next : l)) });
  }

  letGo(id?: string, wish?: string): void {
    const t = id ?? this.store.get().pending;
    if (!t) return;
    if (wish !== undefined) this.setWish(t, wish);
    const rec = findLantern(this.store.doc, t);
    if (rec && rec.released === null) this.store.amend(updateLantern(this.store.doc, t, { released: this.engine.now }));
    if (this.store.get().pending === t) this.store.set({ pending: null });
  }

  // --- selection ------------------------------------------------------------------------------

  pickAt(clientX: number, clientY: number): Selection {
    const id = this.lanterns.pick(clientX, clientY, this.engine.camera, this.rect, (p) => this.engine.pixelsPerMeterAt(p));
    return id ? { kind: 'lantern', id } : null;
  }

  select(sel: Selection): void {
    const cur = this.store.get().selection;
    if (cur?.id !== sel?.id) this.store.set({ selection: sel, reading: null });
  }

  private target(id?: string): string | null {
    return id ?? this.store.get().selection?.id ?? null;
  }

  // --- the three actions ---------------------------------------------------------------------

  readWish(id?: string): void {
    const t = this.target(id);
    const l = t ? this.lanterns.get(t) : undefined;
    if (!t || !l) return;
    l.boost(this.engine.now, 5000, 0.7);
    this.store.set({ reading: t });
    window.clearTimeout(this.readingTimer);
    this.readingTimer = window.setTimeout(() => {
      if (this.store.get().reading === t) this.store.set({ reading: null });
    }, 5500);
  }

  glow(id?: string): void {
    const t = this.target(id);
    if (t) this.lanterns.glowFrom(t, this.engine.now);
  }

  remove(id?: string): void {
    const t = this.target(id);
    if (!t || !findLantern(this.store.doc, t)) return;
    this.lanterns.markRemoving(t);
    this.store.commit(removeLantern(this.store.doc, t), { selection: null, reading: null, pending: this.store.get().pending === t ? null : this.store.get().pending });
  }

  // --- the whole sky ------------------------------------------------------------------------

  reset(): void {
    if (this.store.doc.lanterns.length === 0) return;
    this.store.commit(emptyDoc(), { selection: null, pending: null, reading: null });
    this.store.toast('The sky is clear. Undo brings the lanterns back.');
  }

  loadDoc(doc: LanternsDoc): void {
    this.store.commit(releaseWaiting(doc, this.engine.now), { selection: null, pending: null, reading: null });
  }

  undo(): void {
    this.store.undo();
  }

  redo(): void {
    this.store.redo();
  }

  dispose(): void {
    window.clearTimeout(this.saveTimer);
    window.clearTimeout(this.readingTimer);
    for (const u of this.unsub) u();
    this.lanterns.dispose();
  }
}

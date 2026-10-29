import * as THREE from 'three';
import { Lantern } from './Lantern';
import { GlowLayer, Smoke, type GlowPoint } from './GlowLayer';
import type { LanternsDoc } from '../state/document';
import { MAX_LIGHTS, MAX_REFLECTIONS, type WorldUniforms } from '../scene/world';
import { groundHeight } from '../scene/lake';

/**
 * Keeps the live lanterns in step with the document and lets their light
 * into the painting. Each frame it poses every lantern for the clock, then:
 *   - the brightest few near the ground become the scene's point lights
 *     (warm pools on the jetty, shore and water), alongside the windows;
 *   - every lantern is written to the lake's reflection list;
 *   - every lantern gets a halo (or, far up, a star) in the glow layer.
 */

const LANTERN_LIGHTS = MAX_LIGHTS - 3;
const WARM = new THREE.Color('#ffa24d');
const WINDOW = new THREE.Color('#ffb25e');

export interface WindowLight {
  pos: THREE.Vector3;
  on: number;
}

export class LanternManager {
  readonly group = new THREE.Group();
  readonly glow: GlowLayer;
  readonly smoke: Smoke;
  private readonly live = new Map<string, Lantern>();
  private readonly leaving = new Set<Lantern>();
  selectedId: string | null = null;
  hoverId: string | null = null;
  /** A lantern touched the water (released on the lake): ripple there. */
  onRipple: ((x: number, z: number, strength: number) => void) | null = null;
  private readonly glowList: GlowPoint[] = [];
  private readonly lightColor = new THREE.Color();
  private lastRipple = new Map<string, number>();

  constructor(private readonly world: WorldUniforms, private readonly calm: boolean) {
    this.group.name = 'lanterns';
    this.glow = new GlowLayer(MAX_REFLECTIONS + 8);
    this.smoke = new Smoke(world.uTime);
    this.group.add(this.glow.points, this.smoke.points);
  }

  get(id: string): Lantern | undefined {
    return this.live.get(id);
  }

  all(): Lantern[] {
    return [...this.live.values()];
  }

  get count(): number {
    return this.live.size;
  }

  sync(doc: LanternsDoc, now: number): void {
    const ids = new Set(doc.lanterns.map((l) => l.id));
    // the oldest fade gently when the sky is full; a removed one goes out (the app says which)
    for (const [id, lantern] of this.live) {
      if (ids.has(id)) continue;
      lantern.leave(now, this.removing.has(id) ? 'out' : 'fade');
      if (this.removing.has(id)) this.smokeFrom(lantern);
      this.removing.delete(id);
      this.leaving.add(lantern);
      this.live.delete(id);
    }
    for (const rec of doc.lanterns) {
      const lantern = this.live.get(rec.id);
      if (!lantern) {
        const l = new Lantern(rec, this.world, { calm: this.calm }, now);
        this.live.set(rec.id, l);
        this.group.add(l.group);
        continue;
      }
      if (rec.wish !== lantern.record.wish) lantern.setWish(rec.wish);
      if (rec.mode === 'lake' && rec.released !== null && lantern.record.released === null) this.onRipple?.(rec.at[0], rec.at[2], 0.9);
      lantern.record = rec;
    }
  }

  private readonly removing = new Set<string>();
  /** The next sync removes this one with its flame going out (not a quiet fade). */
  markRemoving(id: string): void {
    this.removing.add(id);
  }

  private smokeFrom(l: Lantern): void {
    this.smoke.puff(l.flame.x, l.flame.y + l.height * 0.2 * l.pose.scale, l.flame.z, this.world.uTime.value + 0.25);
  }

  /** Glow: this one flares; every nearby lantern brightens in answer, a ripple of light. */
  glowFrom(id: string, now: number): void {
    const src = this.live.get(id);
    if (!src) return;
    src.boost(now, 2600, 1.6);
    for (const l of this.live.values()) {
      if (l === src) continue;
      const d = l.center.distanceTo(src.center);
      if (d > 9) continue;
      l.boost(now + 250 + d * 140, 2200, 1.0 * (1 - d / 9) + 0.2);
    }
  }

  update(now: number, camera: THREE.Camera, windows: readonly WindowLight[]): void {
    for (const l of this.live.values()) {
      l.highlight = l.id === this.selectedId ? 1 : l.id === this.hoverId ? 0.45 : 0;
      l.update(now);
      // floating lanterns stir the water now and then
      if (l.record.mode === 'lake' && l.record.released !== null && !this.calm) {
        const last = this.lastRipple.get(l.id) ?? 0;
        if (now - last > 3800 + (l.record.seed % 1700)) {
          this.lastRipple.set(l.id, now);
          this.onRipple?.(l.pose.x, l.pose.z, 0.35);
        }
      }
    }
    for (const l of this.leaving) {
      l.update(now);
      if (l.gone) {
        this.group.remove(l.group);
        l.dispose();
        this.leaving.delete(l);
      }
    }
    this.writeLight(windows);
    this.writeGlow(camera);
  }

  /** The brightest lanterns near the ground light the scene; far ones only glow. */
  private writeLight(windows: readonly WindowLight[]): void {
    const all = [...this.live.values(), ...this.leaving];
    const near = all
      .map((l) => {
        const above = l.flame.y - Math.max(0, groundHeight(l.flame.x, l.flame.z));
        const reach = 1 - THREE.MathUtils.smoothstep(above, 1.2, 4.5);
        return { l, w: l.intensity * reach * Math.min(1, l.pose.scale * 1.2) };
      })
      .filter((c) => c.w > 0.01)
      .sort((a, b) => b.w - a.w)
      .slice(0, LANTERN_LIGHTS);
    const lights = this.world.uLights.value;
    const colors = this.world.uLightColors.value;
    for (let i = 0; i < LANTERN_LIGHTS; i++) {
      const c = near[i];
      if (!c) {
        lights[i].w = 0;
        continue;
      }
      lights[i].set(c.l.flame.x, c.l.flame.y + c.l.height * 0.3 * c.l.pose.scale, c.l.flame.z, c.w * Math.min(1.4, 0.6 + c.l.height * 0.6));
      colors[i].copy(c.l.tint).lerp(WARM, 0.55);
    }
    windows.forEach((w, i) => {
      const k = LANTERN_LIGHTS + i;
      if (k >= lights.length) return;
      lights[k].set(w.pos.x, w.pos.y, w.pos.z + 0.15, 0.32 * w.on);
      colors[k].copy(WINDOW);
    });

    // reflections: every lantern, then the windows
    const refl = this.world.uRefl.value;
    const reflColors = this.world.uReflColors.value;
    let r = 0;
    for (const l of all) {
      if (r >= MAX_REFLECTIONS - windows.length) break;
      const p = l.center;
      const strength = l.intensity * (0.5 + 0.5 * l.pose.scale) * (1 - 0.65 * l.pose.star);
      refl[r].set(p.x, p.y, p.z, strength);
      reflColors[r].copy(l.tint).lerp(WARM, 0.35);
      r++;
    }
    for (const w of windows) {
      refl[r].set(w.pos.x, w.pos.y, w.pos.z, 0.5 * w.on);
      reflColors[r].copy(WINDOW);
      r++;
    }
    for (; r < MAX_REFLECTIONS; r++) refl[r].w = 0;
  }

  private writeGlow(_camera: THREE.Camera): void {
    const list = this.glowList;
    list.length = 0;
    const push = (g: GlowPoint) => list.push(g);
    for (const l of [...this.live.values(), ...this.leaving]) {
      if (l.intensity <= 0.01) continue;
      const p = l.pose;
      const s = p.star;
      this.lightColor.copy(l.tint).lerp(WARM, 0.3);
      // halo round a lantern near the ground; a small hot star far up
      push({
        x: l.center.x,
        y: l.center.y,
        z: l.center.z,
        size: THREE.MathUtils.lerp(l.height * 3.4 * p.scale, 0.5, s),
        color: this.lightColor.clone(),
        strength: l.intensity * THREE.MathUtils.lerp(0.26, 1.1, s),
        core: s,
      });
      if (p.flare > 0.02) {
        push({ x: l.flame.x, y: l.flame.y, z: l.flame.z, size: l.height * 2.2 * p.scale, color: new THREE.Color(1, 0.75, 0.4), strength: p.flare * 1.6, core: 0.6 });
      }
    }
    this.glow.write(list);
  }

  /** The lantern under a screen point: nearest centre within its on-screen radius (generous for stars). */
  pick(clientX: number, clientY: number, camera: THREE.Camera, rect: DOMRect, pixelsPerMeter: (p: THREE.Vector3) => number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    const v = new THREE.Vector3();
    for (const l of this.live.values()) {
      v.copy(l.center).project(camera);
      if (v.z > 1) continue;
      const sx = rect.left + ((v.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - v.y) / 2) * rect.height;
      const d = Math.hypot(sx - clientX, sy - clientY);
      const r = Math.max(16, pixelsPerMeter(l.center) * l.worldRadius * 1.05);
      if (d < r && d < bestD) {
        bestD = d;
        best = l.id;
      }
    }
    return best;
  }

  dispose(): void {
    for (const l of [...this.live.values(), ...this.leaving]) l.dispose();
    this.live.clear();
    this.leaving.clear();
    this.glow.dispose();
    this.smoke.dispose();
  }
}

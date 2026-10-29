import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import { createGround, createWater } from './terrain';
import { createProps, type Props } from './props';
import { createBackdrop, type Backdrop } from './backdrop';
import { createFireflies } from './fireflies';
import { COTTAGES, LAKE, onJetty, windowPosition } from './lake';
import { MAX_REFLECTIONS, MAX_RIPPLES } from './world';

/**
 * The tile's fixed furniture — sky, ground, lake, jetty, cottages, trees,
 * reeds, fireflies — and its small life: a slow ripple ring now and then,
 * and one cottage window that goes dark a while after you arrive.
 */
export class LakeScene {
  readonly props: Props;
  readonly backdrop: Backdrop;
  private readonly fireflies: THREE.ShaderMaterial;
  private nextRipple = 0;
  private rippleSlot = 0;
  /** 0..1 per cottage window, eased. */
  readonly windowOn: number[] = COTTAGES.map(() => 1);
  readonly windowPos = COTTAGES.map((c) => new THREE.Vector3(...windowPosition(c)));

  constructor(private readonly engine: Engine) {
    const { world, scene } = engine;
    this.backdrop = createBackdrop(world);
    scene.add(this.backdrop.mesh, createGround(world), createWater(world, MAX_RIPPLES, MAX_REFLECTIONS));
    this.props = createProps(world);
    scene.add(this.props.group);
    const ff = createFireflies(world);
    this.fireflies = ff.material;
    scene.add(ff.points);
    engine.onFrame((dt, t) => this.update(dt, t));
    engine.onBeforeRender(() => {
      this.backdrop.update(engine.camera);
      const h = engine.canvas.clientHeight * engine.renderer.getPixelRatio();
      this.fireflies.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2)));
    });
  }

  /** A ripple ring spreading on the water from (x, z). */
  ripple(x: number, z: number, strength = 1): void {
    this.engine.world.uRipples.value[this.rippleSlot].set(x, z, this.engine.world.uTime.value, strength);
    this.rippleSlot = (this.rippleSlot + 1) % MAX_RIPPLES;
  }

  private update(_dt: number, t: number): void {
    COTTAGES.forEach((c, i) => {
      const target = t > c.offAt ? 0 : 1;
      this.windowOn[i] += (target - this.windowOn[i]) * Math.min(1, _dt * 3);
      this.props.windows[i].uniforms.uOn.value = this.windowOn[i];
    });
    // now and then a fish, or a falling leaf: one faint ring somewhere on the lake
    if (t > this.nextRipple && this.engine.world.uMotion.value > 0) {
      const a = Math.sin(t * 12.9898) * 43758.5453;
      const u = a - Math.floor(a);
      const r = 0.25 + 0.6 * ((u * 7.13) % 1);
      const x = LAKE.x + Math.cos(u * 6.283) * LAKE.rx * r, z = LAKE.z + Math.sin(u * 6.283) * LAKE.rz * r;
      if (!onJetty(x, z, 0.4)) this.ripple(x, z, 0.45);
      this.nextRipple = t + 5 + u * 7;
    }
  }
}

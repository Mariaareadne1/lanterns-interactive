import * as THREE from 'three';

/**
 * Every lantern's halo, drawn as one batch of additive point sprites: a soft
 * warm bloom round a lantern near the ground, shrinking to a tiny bright
 * core with a faint halo for one far up — a warm star. The same layer
 * carries the flare as a flame catches and the wisps of smoke when one goes
 * out (smoke uses a separate normally-blended batch).
 */

const vertex = /* glsl */ `
uniform float uScale;
attribute float aSize;
attribute vec3 aColor;
attribute float aCore;
varying vec3 vColor;
varying float vCore;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / -mv.z, 5.0, 900.0);
  vColor = aColor;
  vCore = aCore;
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vCore;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float halo = exp(-r * r * 5.0) * (1.0 - r);
  float core = exp(-r * r * 90.0) * vCore;
  gl_FragColor = vec4(vColor * (halo * (1.0 - 0.6 * vCore) + core * 6.0), 1.0);
}
`;

export interface GlowPoint {
  x: number;
  y: number;
  z: number;
  size: number;
  color: THREE.Color;
  strength: number;
  core: number;
}

export class GlowLayer {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly color: Float32Array;
  private readonly core: Float32Array;

  constructor(private readonly capacity: number) {
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    this.core = new Float32Array(capacity);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCore', new THREE.BufferAttribute(this.core, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.name = 'lantern glow';
  }

  setScale(pixelsHigh: number, fovDeg: number): void {
    this.material.uniforms.uScale.value = pixelsHigh / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)));
  }

  write(list: readonly GlowPoint[]): void {
    const n = Math.min(list.length, this.capacity);
    for (let i = 0; i < n; i++) {
      const g = list[i];
      this.pos.set([g.x, g.y, g.z], i * 3);
      this.size[i] = g.size;
      this.color.set([g.color.r * g.strength, g.color.g * g.strength, g.color.b * g.strength], i * 3);
      this.core[i] = g.core;
    }
    const geo = this.points.geometry;
    for (const name of ['position', 'aSize', 'aColor', 'aCore']) geo.getAttribute(name).needsUpdate = true;
    geo.setDrawRange(0, n);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// --- smoke: soft grey-lavender wisps curling up from a flame that's gone out ------------------

const smokeVertex = /* glsl */ `
uniform float uScale;
uniform float uTime;
attribute vec4 aSeed; // x, y, z of the flame, start time
attribute float aPhase;
varying float vAlpha;
void main() {
  float age = uTime - aSeed.w;
  float life = clamp(age / 2.4, 0.0, 1.0);
  vec3 p = aSeed.xyz;
  p.y += age * 0.22 + aPhase * 0.05;
  p.x += sin(age * 2.2 + aPhase * 6.28) * 0.06 * (0.3 + life);
  p.z += cos(age * 1.7 + aPhase * 6.28) * 0.05 * (0.3 + life);
  vAlpha = age < 0.0 ? 0.0 : (1.0 - life) * smoothstep(0.0, 0.25, age) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.05 + life * 0.22) * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const smokeFragment = /* glsl */ `
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, r) * vAlpha;
  gl_FragColor = vec4(vec3(0.62, 0.6, 0.72) * a, a);
}
`;

export class Smoke {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly seeds: Float32Array;
  private next = 0;
  private static readonly COUNT = 48;

  constructor(time: THREE.IUniform<number>) {
    this.seeds = new Float32Array(Smoke.COUNT * 4).fill(-1000);
    const phase = new Float32Array(Smoke.COUNT).map((_, i) => (i * 0.618) % 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Smoke.COUNT * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 }, uTime: time },
      vertexShader: smokeVertex,
      fragmentShader: smokeFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 21;
  }

  setScale(scale: number): void {
    this.material.uniforms.uScale.value = scale;
  }

  /** A curl of smoke from (x, y, z), starting at time t (engine seconds). */
  puff(x: number, y: number, z: number, t: number): void {
    for (let i = 0; i < 6; i++) {
      this.seeds.set([x, y, z, t + i * 0.12], this.next * 4);
      this.next = (this.next + 1) % Smoke.COUNT;
    }
    this.points.geometry.getAttribute('aSeed').needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

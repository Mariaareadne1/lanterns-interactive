import * as THREE from 'three';
import { latheGeometry, measure } from './geometry';
import { lanternPose, rand, type Pose } from './flight';
import type { LanternRecord } from '../state/document';
import { NOISE_GLSL, WORLD_UNIFORMS_GLSL, LIGHTING_GLSL } from '../scene/shaderChunks';
import type { WorldUniforms } from '../scene/world';
import { wishTexture } from './wishTexture';

/**
 * One paper sky lantern: a shell turned from the drawn silhouette, thin
 * bamboo ribs, an open bamboo ring at the bottom, a small flame inside —
 * and, on the lake, a folded paper boat to sit on. The paper glows from
 * within: brighter where the fibres are thin, hottest just above the flame,
 * deeper and warmer toward its edges, flickering gently. A wish is written
 * on it in a loose hand.
 */

/** Seeded paper tints: warm apricot, rose, butter, soft white. */
export const TINTS = ['#ffb06e', '#ff9c8c', '#ffd47a', '#fff0d6'] as const;
const RIBS = 8;

const paperVertex = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vLocal = position;
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const paperFragment = /* glsl */ `
${WORLD_UNIFORMS_GLSL}
${NOISE_GLSL}
${LIGHTING_GLSL}
uniform vec3 uTint;
uniform float uLit;
uniform float uReveal;
uniform float uFlicker;
uniform float uBoost;
uniform float uFade;
uniform float uHeight;
uniform float uSeed;
uniform float uHighlight;
uniform float uHasWish;
uniform sampler2D uWish;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec2 vUv;

void main() {
  // the brush paints the paper in from the bottom up, with a ragged leading edge
  float sweep = vUv.y * 0.85 + (vnoise(vUv * vec2(9.0, 5.0) + uSeed) - 0.5) * 0.3 + 0.1;
  if (sweep > uReveal * 1.15) discard;
  float wet = smoothstep(uReveal * 1.15 - 0.12, uReveal * 1.15, sweep) * (1.0 - step(0.999, uReveal));

  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float inside = gl_FrontFacing ? 0.0 : 1.0;
  if (inside > 0.5) N = -N;
  float facing = abs(dot(N, V));

  // paper: fibres and thin patches let more light through
  float fibre = vnoise(vUv * vec2(26.0, 40.0) + uSeed) * 0.55 + vnoise(vUv * vec2(70.0, 9.0)) * 0.45;
  float thin = smoothstep(0.35, 0.8, fibre);
  // the flame sits low; the hot spot is the paper just above it
  float h = vLocal.y / uHeight;
  float hot = exp(-pow((h - 0.38) / 0.28, 2.0)) * (0.7 + 0.3 * facing);
  float glow = uLit * uFlicker * (0.62 + 0.38 * thin) * (0.55 + 0.95 * hot) * (1.0 + uBoost);
  glow *= 1.0 - 0.45 * smoothstep(0.75, 1.0, h); // the closed crown is a little dimmer

  // lit paper: deeper and more saturated toward the silhouette, nearly white-hot in the middle
  // warm paper: the tint pushed toward candle orange, deepest at the silhouette, paler only at the hot spot
  vec3 warmTint = uTint * vec3(1.0, 0.78, 0.55);
  vec3 deep = pow(warmTint, vec3(2.2)) * vec3(1.0, 0.7, 0.5);
  vec3 bright = mix(warmTint, vec3(1.0, 0.86, 0.62), 0.45 * hot);
  vec3 litCol = mix(deep, bright, smoothstep(0.05, 0.9, facing)) * glow * 1.35;
  if (inside > 0.5) litCol = warmTint * glow * 1.6;

  // unlit paper by moonlight (before the flame catches)
  vec3 dim = moonLight(uTint * 0.32, N, 1.0, 0.3);
  vec3 col = dim * (1.0 - uLit * 0.85) + litCol;

  // bamboo ribs: dark lines up the sides, a ring round the shoulders
  float ru = fract(vUv.x * ${RIBS}.0 + 0.5 / ${RIBS}.0);
  float rib = smoothstep(0.03, 0.0, min(ru, 1.0 - ru) - 0.004);
  rib = max(rib, smoothstep(0.018, 0.0, abs(h - 0.04)) * 0.9);
  col = mix(col, col * 0.28 + vec3(0.03, 0.015, 0.01), rib * (0.55 + 0.4 * uLit));

  // the wish, written in a loose hand on the side facing out: dark ink, faintly glowing
  if (uHasWish > 0.5) {
    float u = fract(vUv.x + 0.5) - 0.5;
    vec2 tuv = vec2(u / 0.36 + 0.5, (h - 0.6) / 0.3 + 0.5);
    if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0 && inside < 0.5) {
      float ink = texture2D(uWish, tuv).a;
      // dark ink with the glow just showing through it
      vec3 inkCol = col * 0.16 + vec3(0.09, 0.03, 0.01) * uLit;
      col = mix(col, inkCol, ink * 0.88);
    }
  }

  // wet paint at the brush's leading edge
  col = mix(col, uTint * 0.9, wet * 0.6);
  col += vec3(0.12, 0.3, 0.75) * uHighlight * pow(1.0 - facing, 2.0) * 0.7;
  gl_FragColor = vec4(col, uFade);
}
`;

const plainVertex = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// bamboo, the flame, the boat: lit warmly by the flame above or beside them
const plainFragment = /* glsl */ `
${WORLD_UNIFORMS_GLSL}
${NOISE_GLSL}
${LIGHTING_GLSL}
uniform vec3 uColor;
uniform vec3 uWarm;
uniform float uLit;
uniform float uEmissive;
uniform float uFade;
uniform float uReveal;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  if (uReveal < 0.15) discard;
  vec3 N = normalize(vNormalW);
  if (!gl_FrontFacing) N = -N;
  vec3 col = moonLight(uColor, N, 1.0, 0.3) + uWarm * uLit * (0.5 + 0.5 * max(N.y, 0.0)) + uColor * uEmissive * uLit;
  gl_FragColor = vec4(col, uFade);
}
`;

export interface LanternOptions {
  calm: boolean;
}

export class Lantern {
  readonly group = new THREE.Group();
  readonly id: string;
  record: LanternRecord;
  readonly tint: THREE.Color;
  readonly height: number;
  readonly radius: number;
  pose: Pose;
  /** Current light (0..~2): what the scene and the reflections receive. */
  intensity = 0;
  highlight = 0;
  /** Transient brightening (Glow, Read wish, answering a neighbour), as [start, end, strength] in epoch ms. */
  private boosts: [number, number, number][] = [];
  private leaving: { kind: 'out' | 'fade'; at: number } | null = null;
  gone = false;
  private readonly paper: THREE.ShaderMaterial;
  private readonly plain: THREE.ShaderMaterial[] = [];
  private readonly mesh: THREE.Mesh;
  private wishTex: THREE.Texture | null = null;
  private readonly flameLocal: THREE.Vector3;
  /** The flame in world space (light position). */
  readonly flame = new THREE.Vector3();
  /** Middle of the paper in world space (selection, picking, glow). */
  readonly center = new THREE.Vector3();

  constructor(record: LanternRecord, private readonly world: WorldUniforms, private readonly opts: LanternOptions, now: number) {
    this.id = record.id;
    this.record = record;
    const m = measure(record.profile);
    this.height = m.height;
    this.radius = m.radius;
    this.tint = new THREE.Color(TINTS[Math.floor(rand(record.seed, 5) * TINTS.length)]);
    this.paper = new THREE.ShaderMaterial({
      uniforms: {
        ...world,
        uTint: { value: this.tint },
        uLit: { value: 0 },
        uReveal: { value: 0 },
        uFlicker: { value: 1 },
        uBoost: { value: 0 },
        uFade: { value: 1 },
        uHeight: { value: m.height },
        uSeed: { value: (record.seed % 97) * 1.37 },
        uHighlight: { value: 0 },
        uHasWish: { value: 0 },
        uWish: { value: null },
      },
      vertexShader: paperVertex,
      fragmentShader: paperFragment,
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(latheGeometry(record.profile), this.paper);
    this.mesh.position.y = -record.profile[0][1];
    this.group.add(this.mesh);

    // the bamboo ring at the open bottom, two cross wires and the flame on them
    const ring = m.ring;
    const bamboo = this.plainMaterial('#3c2c26', '#ffb066', 0);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(ring, Math.max(0.008, m.height * 0.014), 6, 36).rotateX(Math.PI / 2), bamboo);
    this.group.add(torus);
    for (const a of [0, Math.PI / 2]) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, ring * 2, 4).rotateZ(Math.PI / 2).rotateY(a), bamboo);
      this.group.add(wire);
    }
    const flame = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.018, m.height * 0.035), 10, 8).scale(1, 1.6, 1), this.plainMaterial('#ffc777', '#000000', 3.2));
    this.flameLocal = new THREE.Vector3(0, m.height * 0.06, 0);
    flame.position.copy(this.flameLocal);
    this.group.add(flame);

    if (record.mode === 'lake') {
      // a little folded paper boat: a low eight-sided tray
      const boatMat = this.plainMaterial('#d9d2c4', '#ffb070', 0.05);
      const r = Math.max(ring * 1.35, m.radius * 0.8);
      const walls = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.78, m.height * 0.12, 8, 1, true).translate(0, -m.height * 0.04, 0), boatMat);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, 8).rotateX(-Math.PI / 2).translate(0, -m.height * 0.1, 0), boatMat);
      this.group.add(walls, floor);
    }
    this.setWish(record.wish);
    this.group.name = `lantern ${record.id}`;
    this.pose = lanternPose(record, now, opts.calm);
  }

  private plainMaterial(color: string, warm: string, emissive: number): THREE.ShaderMaterial {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        ...this.world,
        uColor: { value: new THREE.Color(color) },
        uWarm: { value: new THREE.Color(warm) },
        uLit: { value: 0 },
        uEmissive: { value: emissive },
        uFade: { value: 1 },
        uReveal: { value: 0 },
      },
      vertexShader: plainVertex,
      fragmentShader: plainFragment,
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.plain.push(m);
    return m;
  }

  setWish(wish: string | undefined): void {
    this.wishTex?.dispose();
    this.wishTex = wish ? wishTexture(wish) : null;
    this.paper.uniforms.uWish.value = this.wishTex;
    this.paper.uniforms.uHasWish.value = this.wishTex ? 1 : 0;
  }

  /** Brighten for a while (Glow, Read wish, answering a neighbour). */
  boost(start: number, durationMs: number, strength: number): void {
    this.boosts = [...this.boosts.filter(([, end]) => end > start), [start, start + durationMs, strength]];
  }

  /** Remove: the flame goes out with a curl of smoke, then the paper fades. Cap: just fade. */
  leave(now: number, kind: 'out' | 'fade'): void {
    if (!this.leaving) this.leaving = { kind, at: now };
  }

  get isLeaving(): boolean {
    return this.leaving !== null;
  }

  /** How far it has got through leaving, 0..1 (for the smoke). */
  leavingAge(now: number): number {
    return this.leaving ? (now - this.leaving.at) / 1000 : -1;
  }

  update(now: number): void {
    const p = (this.pose = lanternPose(this.record, now, this.opts.calm));
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.set(p.tiltX, p.yaw, p.tiltZ, 'YXZ');
    this.group.scale.setScalar(p.scale);

    // a gentle candle flicker, stilled for reduced motion
    const t = now / 1000;
    const s = this.record.seed;
    const flicker = this.opts.calm ? 1 : 1 + 0.06 * Math.sin(t * 7.3 + s) + 0.04 * Math.sin(t * 13.1 + s * 2.1) + 0.03 * Math.sin(t * 2.3 + s);
    let boost = 0;
    for (const [start, end, strength] of this.boosts) {
      if (now < start || now > end) continue;
      const k = (now - start) / (end - start);
      boost = Math.max(boost, strength * Math.min(1, k * 8) * (1 - k * k));
    }
    let lit = p.lit;
    let fade = 1;
    if (this.leaving) {
      const age = (now - this.leaving.at) / 1000;
      if (this.leaving.kind === 'out') {
        lit *= Math.max(0, 1 - age / 0.5);
        fade = 1 - Math.min(1, Math.max(0, (age - 0.6) / 1.2));
      } else {
        lit *= Math.max(0, 1 - age / 2.5);
        fade = 1 - Math.min(1, age / 2.5);
      }
      if (fade <= 0) this.gone = true;
    }
    this.intensity = lit * flicker * (1 + boost) + p.flare;

    const u = this.paper.uniforms;
    u.uLit.value = lit;
    u.uReveal.value = p.reveal;
    u.uFlicker.value = flicker;
    u.uBoost.value = boost + p.flare * 0.6;
    u.uFade.value = fade;
    u.uHighlight.value = this.highlight;
    for (const m of this.plain) {
      m.uniforms.uLit.value = lit * flicker * (1 + boost);
      m.uniforms.uFade.value = fade;
      m.uniforms.uReveal.value = p.reveal;
    }
    // a far-off lantern is just a star: the glow layer draws it
    this.group.visible = p.star < 0.995 && fade > 0.01;

    this.group.updateMatrixWorld(true);
    this.flame.copy(this.flameLocal).applyMatrix4(this.group.matrixWorld);
    this.center.set(0, this.height * 0.5, 0).applyMatrix4(this.group.matrixWorld);
  }

  /** World radius it occupies now (for picking and the selection box). */
  get worldRadius(): number {
    return Math.max(this.radius, this.height * 0.5) * this.pose.scale;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.paper.dispose();
    for (const m of this.plain) m.dispose();
    this.wishTex?.dispose();
  }
}

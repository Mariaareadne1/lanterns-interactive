import * as THREE from 'three';
import { LIGHTING_GLSL, NOISE_GLSL, WORLD_UNIFORMS_GLSL } from './shaderChunks';
import type { WorldUniforms } from './world';

/**
 * The painted material shared by the tile's furniture (jetty, cottages,
 * trees, reeds): a night albedo from a uniform or per-vertex colour, turned
 * by the moon, warmed by the lanterns' pools of light, with pigment grain and
 * — for foliage — a dry-brush silhouette that breaks into specks.
 * Instanced meshes (trees, reeds) work too; reeds sway in the breeze.
 */

export interface PaintOptions {
  color?: string;
  vertexColors?: boolean;
  ragged?: boolean;
  softness?: number;
  side?: THREE.Side;
  /** Bend with the breeze, by height above the instance's root (reeds). */
  sway?: boolean;
}

const vertex = /* glsl */ `
${WORLD_UNIFORMS_GLSL}
attribute float aAO;
#ifdef VCOLOR
attribute vec3 color;
varying vec3 vColor;
#endif
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
varying float vAO;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
#endif
  vec3 p = position;
#ifdef SWAY
  float root = m[3].x * 1.7 + m[3].z * 1.3;
  float bend = p.y * p.y * 0.12 * uWind;
  p.x += bend * sin(uTime * 1.1 + root) ;
  p.z += bend * 0.6 * sin(uTime * 0.8 + root * 1.3);
#endif
  vec4 wp = m * vec4(p, 1.0);
  vWorld = wp.xyz;
  vLocal = position;
  vNormalW = normalize(mat3(m) * normal);
  vAO = aAO;
#ifdef VCOLOR
  vColor = color;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
${WORLD_UNIFORMS_GLSL}
${NOISE_GLSL}
${LIGHTING_GLSL}
uniform vec3 uColor;
uniform float uSoftness;
uniform float uSeed;
#ifdef VCOLOR
varying vec3 vColor;
#endif
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
varying float vAO;
void main() {
  vec3 N = normalize(vNormalW);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
#ifdef RAGGED
  float facing = max(dot(N, V), 0.0);
  if (hash13(floor(vWorld * 34.0) + uSeed) > smoothstep(0.0, 0.3, facing) * 1.1) discard;
#endif
#ifdef VCOLOR
  vec3 base = vColor;
#else
  vec3 base = uColor;
#endif
  float grain = vnoise3(vLocal * 14.0 + uSeed) * 0.6 + vnoise3(vLocal * 40.0) * 0.4;
  vec3 albedo = base * (0.9 + 0.18 * grain);
  float ao = mix(0.45, 1.0, vAO);
  vec3 col = moonLight(albedo, N, ao, uSoftness) + lanternLight(vWorld, N, albedo) * ao;
  gl_FragColor = vec4(col, 1.0);
}
`;

let seedCounter = 0;

export function paintMaterial(world: WorldUniforms, opts: PaintOptions = {}): THREE.ShaderMaterial {
  const defines: Record<string, number> = {};
  if (opts.vertexColors) defines.VCOLOR = 1;
  if (opts.ragged) defines.RAGGED = 1;
  if (opts.sway) defines.SWAY = 1;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...world,
      uColor: { value: new THREE.Color(opts.color ?? '#ffffff') },
      uSoftness: { value: opts.softness ?? 0.15 },
      uSeed: { value: (seedCounter++ * 7.31) % 97 },
    },
    defines,
    vertexShader: vertex,
    fragmentShader: fragment,
    side: opts.side ?? THREE.FrontSide,
  });
}

/** Give a plain geometry a flat ambient-occlusion attribute (paintMaterial expects one). */
export function withAO(geo: THREE.BufferGeometry, value = 1): THREE.BufferGeometry {
  if (!geo.getAttribute('aAO')) {
    geo.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count).fill(value), 1));
  }
  return geo;
}

/** Paint every vertex of a geometry one colour (for merging parts with different colours). */
export function tint(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return withAO(geo);
}

import * as THREE from 'three';
import { REEDS, WATER_Y, groundHeight } from './lake';
import { seededRandom } from './noise';
import type { WorldUniforms } from './world';

/**
 * A handful of fireflies drifting low over the reeds: tiny warm-green
 * points that wander, pulse on and off, and catch the bloom. With reduced
 * motion they hang still and glow steadily.
 */

const vertex = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uScale;
attribute float aPhase;
varying float vOn;
void main() {
  float t = uTime * uMotion;
  vec3 p = position;
  p.x += sin(t * 0.37 + aPhase * 6.0) * 0.35 + sin(t * 0.91 + aPhase) * 0.1;
  p.z += cos(t * 0.29 + aPhase * 4.0) * 0.3;
  p.y += sin(t * 0.53 + aPhase * 9.0) * 0.12;
  // a slow pulse: mostly dark, then a soft blink
  float pulse = pow(max(0.0, sin(t * (0.7 + fract(aPhase * 7.3) * 0.6) + aPhase * 20.0)), 6.0);
  vOn = mix(0.55, pulse, uMotion);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = max(2.0, 0.09 * uScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
varying float vOn;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float core = exp(-r * r * 9.0);
  gl_FragColor = vec4(vec3(1.4, 1.9, 0.55) * core * vOn * 1.6, 1.0);
}
`;

export function createFireflies(world: WorldUniforms, count = 14): { points: THREE.Points; material: THREE.ShaderMaterial } {
  const rnd = seededRandom(91);
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = REEDS[Math.floor(rnd() * REEDS.length)] ?? { x: 0, z: 4 };
    const x = r.x + (rnd() - 0.5) * 1.2, z = r.z + (rnd() - 0.5) * 0.8;
    pos.set([x, Math.max(WATER_Y, groundHeight(x, z)) + 0.35 + rnd() * 0.4, z], i * 3);
    phase[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: world.uTime, uMotion: world.uMotion, uScale: { value: 800 } },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.name = 'fireflies';
  return { points, material };
}

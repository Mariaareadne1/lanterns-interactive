import * as THREE from 'three';
import { NOISE_GLSL } from './shaderChunks';
import { TILE } from './lake';
import { MOON_POS, type WorldUniforms } from './world';

/**
 * The sky, painted straight onto the paper behind the tile: a blue-hour wash
 * — a faint rose afterglow low behind the hills, violet, then deep indigo
 * overhead — with a ragged dry-brush edge that lets the cream paper show
 * round it, so the tile still reads as a little painting on a desk. The first
 * stars twinkle very gently; a pale moon hangs to one side. Drawn in screen
 * space (it is a painting on the page, not a dome), behind everything.
 */

const vertex = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const lin = (hex: string) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

const fragment = /* glsl */ `
${NOISE_GLSL}
uniform float uTime;
uniform float uMotion;
uniform float uAspect;
uniform float uHorizon;
uniform vec2 uMoon;
uniform float uMoonR;
uniform vec3 uPaper;
varying vec2 vNdc;

void main() {
  vec2 p = vec2(vNdc.x * uAspect, vNdc.y);
  // the wash is a broad arch: its lower edge tucks behind the hills in the middle and
  // lifts toward the sides, so paper shows beside the tile; a brushy, uneven edge
  float nx = vNdc.x;
  float rough = (fbm2(p * 2.2 + 4.0) - 0.5) * 0.11 + (vnoise(p * 14.0) - 0.5) * 0.025;
  float bottom = uHorizon - 0.14 + 0.42 * nx * nx;
  float top = 0.85 - 0.05 * nx * nx;
  float inside = min(min(vNdc.y - bottom, top - vNdc.y), (0.95 - abs(nx)) * 1.4) + rough;
  if (inside < 0.0) discard;
  // dry brush: a few bare specks of paper just inside the edge
  if (inside < 0.05 && hash12(floor(gl_FragCoord.xy / 3.0)) > inside / 0.05 + 0.25) discard;
  float cover = smoothstep(0.0, 0.07, inside);
  // the wash: afterglow at the horizon, violet, indigo overhead
  float h = clamp((vNdc.y - uHorizon) / (1.0 - uHorizon), 0.0, 1.0);
  vec3 col = mix(${lin('#7c6a94')}, ${lin('#4a4683')}, smoothstep(0.0, 0.3, h));
  col = mix(col, ${lin('#2a2d63')}, smoothstep(0.25, 0.75, h));
  col = mix(col, ${lin('#1e2150')}, smoothstep(0.7, 1.0, h));
  col = mix(col, ${lin('#a7869a')}, smoothstep(0.12, 0.0, h) * 0.55);
  // soft watercolour blooms within the wash
  float bloom = fbm2(p * 1.6 + 3.0);
  col *= 0.9 + 0.2 * bloom;

  // stars: sparse, small, a very gentle twinkle; fewer near the glow at the horizon
  vec2 g = p * 46.0;
  vec2 cell = floor(g);
  float pick = hash12(cell);
  if (pick > 0.93) {
    vec2 c = vec2(hash12(cell + 3.1), hash12(cell + 7.7)) * 0.7 + 0.15;
    float d = length(fract(g) - c);
    float tw = 0.75 + 0.25 * sin(uTime * uMotion * (0.6 + pick * 1.4) + pick * 40.0);
    float size = 0.035 + 0.06 * hash12(cell + 1.3);
    float star = smoothstep(size, 0.0, d) * tw * smoothstep(0.08, 0.35, h);
    col += vec3(0.9, 0.88, 1.0) * star * 0.85;
  }

  // the moon: a pale disc with a painted, slightly uneven edge, a soft halo and faint maria
  vec2 mp = vec2(uMoon.x * uAspect, uMoon.y);
  vec2 dm = p - mp;
  float r = length(dm) / uMoonR;
  float wob = (vnoise(normalize(dm + 1e-4) * 3.0 + 2.0) - 0.5) * 0.06;
  float disc = smoothstep(1.0 + wob, 0.94 + wob, r);
  float halo = exp(-max(r - 1.0, 0.0) * 1.6) * (1.0 - disc);
  col += ${lin('#c9c4e8')} * halo * 0.22;
  vec3 moon = ${lin('#f2ecd6')} * (0.92 + 0.08 * vnoise(dm / uMoonR * 2.5 + 5.0));
  moon *= 1.0 - 0.1 * smoothstep(0.45, 0.6, vnoise(dm / uMoonR * 1.6 + 1.0));
  col = mix(col, moon, disc);

  col = mix(uPaper, col, 0.55 + 0.45 * cover);
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface Backdrop {
  mesh: THREE.Mesh;
  /** Keep the painted sky registered to the camera (horizon line, the moon's place). */
  update(camera: THREE.PerspectiveCamera): void;
}

export function createBackdrop(world: WorldUniforms): Backdrop {
  const uniforms = {
    uTime: world.uTime,
    uMotion: world.uMotion,
    uPaper: world.uPaper,
    uAspect: { value: 1 },
    uHorizon: { value: 0.2 },
    uMoon: { value: new THREE.Vector2(0.5, 0.7) },
    uMoonR: { value: 0.05 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  const v = new THREE.Vector3();
  return {
    mesh,
    update(camera) {
      uniforms.uAspect.value = camera.aspect;
      // the horizon: the far edge of the tile, under the hills
      v.set(0, 0.4, -TILE.halfZ).project(camera);
      uniforms.uHorizon.value = v.y;
      v.copy(MOON_POS).project(camera);
      uniforms.uMoon.value.set(v.x, v.y);
      // a moon about 1.2 world units across at its distance
      const d = MOON_POS.distanceTo(camera.position);
      uniforms.uMoonR.value = 0.62 / (d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    },
  };
}

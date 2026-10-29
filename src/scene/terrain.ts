import * as THREE from 'three';
import { LAKE_GLSL, TILE, WATER_Y, groundHeight } from './lake';
import { LIGHTING_GLSL, NOISE_GLSL, WORLD_UNIFORMS_GLSL } from './shaderChunks';
import type { WorldUniforms } from './world';

/**
 * The painted ground and the lake, at blue hour. Gouache night: slate
 * blue-green grass laid in long dry-brush strokes, violet hills, a pale
 * moonlit path along the bank, the wet dark line where the water starts —
 * and the ragged paper edge where the paint runs out. The water is a deep
 * indigo wash that carries long, broken reflections of every light.
 */

// sRGB hex to the linear vec3 GLSL wants
const lin = (hex: string) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

const vertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const EDGE_GLSL = /* glsl */ `
// the dry-brush edge: paint thins, then breaks into specks on the paper
float paintEdge(vec2 xz) {
  float rough = (vnoise(xz * 1.1) - 0.5) * 0.5 + (vnoise(xz * 4.0) - 0.5) * 0.24;
  return tileEdge(xz) + rough;
}
`;

const groundFragment = /* glsl */ `
${WORLD_UNIFORMS_GLSL}
${NOISE_GLSL}
${LIGHTING_GLSL}
${LAKE_GLSL}
${EDGE_GLSL}
varying vec3 vWorld;
varying vec3 vNormal;

vec3 groundPaint(vec2 xz, float h) {
  float s = lakeSDF(xz);
  // grass: three slate greens, laid in long sideways strokes
  float big = fbm2(xz * 0.22);
  float stroke = vnoise(vec2(xz.x * 0.7 + xz.y * 0.25, xz.y * 5.5));
  vec3 grass = mix(${lin('#29395a')}, ${lin('#354a66')}, smoothstep(0.3, 0.7, big));
  grass = mix(grass, ${lin('#45586a')}, smoothstep(0.62, 0.85, stroke) * 0.5);
  grass = mix(grass, ${lin('#222e4c')}, smoothstep(0.55, 0.25, stroke) * 0.35);
  // hills turn violet as they rise, with a moonlit crest
  float hill = smoothstep(0.25, 1.1, h);
  vec3 hills = mix(${lin('#3a3c6c')}, ${lin('#4e4a86')}, smoothstep(0.3, 0.75, big));
  vec3 col = mix(grass, hills, hill);
  // a pale footpath along the front bank, with a spur onto the jetty
  float pz = 5.65 + 0.32 * sin(xz.x * 0.55 + 0.8);
  float path = smoothstep(0.2, 0.1, abs(xz.y - pz) + (vnoise(xz * 6.0) - 0.5) * 0.08);
  float spur = smoothstep(0.24, 0.14, abs(xz.x - JETTY.x)) * step(JETTY.y - 0.2, xz.y) * step(xz.y, pz);
  col = mix(col, ${lin('#6c6a88')} * (0.9 + 0.2 * vnoise(xz * 9.0)), max(path, spur) * 0.85);
  // the bank: a pale moonlit band of mud just above the water, then the dark wet line
  float bank = smoothstep(0.55, 0.12, s) * step(0.0, s);
  col = mix(col, ${lin('#5b5878')}, bank * 0.6);
  col = mix(col, ${lin('#232744')}, smoothstep(0.14, 0.0, s));
  // under the water: dark
  col = mix(col, ${lin('#181c38')}, step(s, 0.0));
  return col;
}

void main() {
  vec2 xz = vWorld.xz;
  float edge = paintEdge(xz);
  float cover = smoothstep(-0.05, 0.55, edge);
  if (hash12(floor(xz * 26.0)) > cover * 1.08) discard;

  vec3 albedo = groundPaint(xz, vWorld.y);
  // pigment grain and the odd pale fleck of dry brush
  albedo *= 0.94 + 0.12 * vnoise(xz * 30.0);
  float fleck = step(0.988, hash12(floor(xz * 13.0)));
  albedo = mix(albedo, albedo * 1.35 + vec3(0.01, 0.012, 0.02), fleck * 0.7);

  vec3 N = normalize(vNormal);
  vec3 col = moonLight(albedo, N, 1.0, 0.25) + lanternLight(vWorld, N, albedo);
  // where the paint thins at the edge, the paper shows through
  col = mix(uPaper, col, 0.6 + 0.4 * smoothstep(0.0, 0.7, edge));
  gl_FragColor = vec4(col, 1.0);
}
`;

const waterFragment = /* glsl */ `
${WORLD_UNIFORMS_GLSL}
${NOISE_GLSL}
${LIGHTING_GLSL}
${LAKE_GLSL}
${EDGE_GLSL}
varying vec3 vWorld;

// A light's reflection: where the (rippled) mirror direction points at it.
// Narrow across, long along the view — the streaky vertical smear of a light
// on still water — then broken into dashes by slow ripples.
// Returns (across, up): how far the mirror direction misses the light, sideways and vertically.
vec2 miss(vec3 wp, vec3 R, vec3 L) {
  vec3 D = normalize(L - wp);
  return vec2(1.0 - dot(normalize(R.xz), normalize(D.xz)), R.y - D.y);
}
float reflection(vec3 wp, vec3 R, vec3 L, float wide, float tall) {
  vec2 m = miss(wp, R, L);
  return exp(-m.x / (wide * wide) - (m.y * m.y) / (tall * tall));
}

void main() {
  vec2 xz = vWorld.xz;
  float s = lakeSDF(xz);
  if (s > 0.0) discard;
  float edge = paintEdge(xz);
  if (edge < 0.05) discard;

  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(V.y, 0.0), 2.0);
  float t = uTime * uMotion;

  // the wash: deep indigo, picking up the dusk sky toward the far side
  float far = smoothstep(2.8, -2.4, xz.y);
  vec3 col = mix(${lin('#1a2150')}, ${lin('#2a3068')}, fres * 0.8 + far * 0.3);
  col = mix(col, ${lin('#5a4d7e')}, far * fres * 0.55);
  // the far shore's dark reflection, hugging the bank with a wavy lower edge
  float shoreRefl = smoothstep(-1.1 - 0.25 * vnoise(vec2(xz.x * 1.3, 0.0)), -0.15, s) * smoothstep(1.5, -1.5, xz.y);
  col = mix(col, ${lin('#141836')}, shoreRefl * 0.75);
  // long slow brush streaks lying across the water
  float streak = vnoise(vec2(xz.x * 0.35 + t * 0.02, xz.y * 3.2));
  col *= 0.92 + 0.16 * smoothstep(0.35, 0.8, streak);

  // ripples: slow wobble plus rings from anything touching the water
  vec2 grad = vec2(vnoise(vec2(xz.x * 1.4, xz.y * 5.0 + t * 0.35)) - 0.5, vnoise(vec2(xz.x * 0.9 - t * 0.2, xz.y * 7.0)) - 0.5) * 0.08;
  float crest = 0.0;
  for (int i = 0; i < ${'$'}{RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 4.0 || r.w <= 0.0) continue;
    float life = 1.0 - age / 4.0;
    float rad = 0.08 + age * 0.32;
    vec2 d = xz - r.xy;
    float dl = length(d);
    float w = 0.03 + age * 0.02;
    float ring = exp(-pow((dl - rad) / w, 2.0)) * r.w * life * life;
    crest += ring;
    grad += d / max(dl, 1e-3) * ring * 0.12;
  }
  vec3 N = normalize(vec3(grad.x, 1.0, grad.y));
  vec3 R = reflect(-V, N);
  float breakup = smoothstep(0.25, 0.75, vnoise(vec2(xz.x * 3.0, xz.y * 16.0 + t * 0.6)));

  // the moon's reflection: a wide, pale, broken column
  float moon = reflection(vWorld, R, uMoonPos, 0.07, 0.5);
  col += uMoonColor * moon * (0.12 + 0.22 * breakup);

  // every light's reflection
  vec3 refl = vec3(0.0);
  for (int i = 0; i < ${'$'}{REFLECTIONS}; i++) {
    vec4 L = uRefl[i];
    if (L.w <= 0.001) continue;
    vec2 m = miss(vWorld, R, L.xyz);
    if (m.x > 0.02) continue; // nowhere near this light's column
    float g = exp(-m.x / (0.035 * 0.035) - (m.y * m.y) / (0.3 * 0.3));
    float core = exp(-m.x / (0.012 * 0.012) - (m.y * m.y) / (0.1 * 0.1));
    refl += uReflColors[i] * L.w * (g * (0.25 + 0.75 * breakup) * 0.55 + core * 0.9);
  }
  col += refl;
  // warm pools on the water round floating lanterns
  col += lanternLight(vWorld, vec3(0.0, 1.0, 0.0), ${lin('#3a3a66')}) * 0.6;
  col += vec3(0.55, 0.55, 0.75) * crest * 0.08;

  // the wet line where water meets bank
  col = mix(col, ${lin('#11142a')}, smoothstep(-0.18, 0.0, s) * 0.5);
  col = mix(uPaper, col, 0.6 + 0.4 * smoothstep(0.0, 0.7, edge));
  gl_FragColor = vec4(col, 1.0);
}
`;

function buildGround(): THREE.BufferGeometry {
  const step = 0.08;
  const cols = Math.round((TILE.halfX * 2) / step);
  const rows = Math.round((TILE.halfZ * 2) / step);
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  let k = 0;
  for (let r = 0; r <= rows; r++) {
    const z = -TILE.halfZ + r * step;
    for (let c = 0; c <= cols; c++) {
      const x = -TILE.halfX + c * step;
      positions[k] = x;
      positions[k + 1] = groundHeight(x, z);
      positions[k + 2] = z;
      k += 3;
    }
  }
  const index = new Uint32Array(cols * rows * 6);
  let o = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + cols + 1;
      index.set([a, b, a + 1, a + 1, b, b + 1], o);
      o += 6;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export function createGround(world: WorldUniforms): THREE.Mesh {
  const material = new THREE.ShaderMaterial({ uniforms: world, vertexShader: vertex, fragmentShader: groundFragment });
  const mesh = new THREE.Mesh(buildGround(), material);
  mesh.name = 'ground';
  return mesh;
}

export function createWater(world: WorldUniforms, maxRipples: number, maxReflections: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(TILE.halfX * 2, TILE.halfZ * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, WATER_Y, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: world,
    vertexShader: vertex.replace('vNormal = normal;', ''),
    fragmentShader: waterFragment.replace('${RIPPLES}', String(maxRipples)).replace('${REFLECTIONS}', String(maxReflections)),
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'water';
  return mesh;
}

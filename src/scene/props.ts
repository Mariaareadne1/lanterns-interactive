import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { meshSDF, sdEllipsoid } from './sdf';
import { woolField } from './wool';
import { seededRandom } from './noise';
import { COTTAGES, JETTY, REEDS, TREES, WATER_Y, groundHeight, type Cottage } from './lake';
import { paintMaterial, tint, withAO } from './paint';
import type { WorldUniforms } from './world';

/**
 * The tile's still life: a wooden jetty reaching out over the lake, three
 * cottages with one warm window each, pines on the hills and a few round
 * trees, reeds along the shore. All of it painted in night colours and
 * warmed wherever a lantern's light falls on it.
 */

/** Merge painted parts: same attributes everywhere (no uvs), non-indexed. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return n;
  }));
}

// --- the jetty --------------------------------------------------------------------------------

function jetty(world: WorldUniforms): THREE.Mesh {
  const rnd = seededRandom(5);
  const parts: THREE.BufferGeometry[] = [];
  const len = JETTY.z0 - JETTY.z1;
  const tones = ['#574858', '#4c3f50', '#5f4f5c', '#52444f'];
  // planks across the deck, each a little different, with small gaps between
  for (let z = JETTY.z1 + 0.08; z < JETTY.z0; z += 0.155) {
    const w = JETTY.w * (0.96 + rnd() * 0.08);
    const g = new THREE.BoxGeometry(w, 0.035, 0.135).translate(JETTY.x + (rnd() - 0.5) * 0.03, JETTY.deck - 0.018 + (rnd() - 0.5) * 0.008, z);
    parts.push(tint(g, tones[Math.floor(rnd() * tones.length)]));
  }
  // two stringers under the planks
  for (const s of [-1, 1]) {
    parts.push(tint(new THREE.BoxGeometry(0.06, 0.07, len).translate(JETTY.x + s * JETTY.w * 0.36, JETTY.deck - 0.07, (JETTY.z0 + JETTY.z1) / 2), '#3a3040'));
  }
  // posts in pairs, down into the water (and the bank)
  for (let z = JETTY.z1 + 0.06; z < JETTY.z0 - 0.3; z += 0.85) {
    for (const s of [-1, 1]) {
      const x = JETTY.x + s * (JETTY.w / 2 + 0.01);
      const bottom = Math.min(WATER_Y, groundHeight(x, z)) - 0.25;
      const top = JETTY.deck + (z < JETTY.z1 + 0.2 ? 0.12 : 0.02);
      parts.push(tint(new THREE.CylinderGeometry(0.04, 0.045, top - bottom, 7).translate(x, (top + bottom) / 2, z), '#3f3445'));
    }
  }
  const geo = merge(parts);
  const mesh = new THREE.Mesh(geo, paintMaterial(world, { vertexColors: true, softness: 0.2 }));
  mesh.name = 'jetty';
  return mesh;
}

// --- cottages ---------------------------------------------------------------------------------

const windowVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const windowFragment = /* glsl */ `
uniform float uOn;
uniform float uTime;
varying vec2 vUv;
void main() {
  // four panes behind glazing bars, warmest low in the middle
  vec2 q = abs(vUv - 0.5);
  float bars = step(0.035, abs(vUv.x - 0.5)) * step(0.04, abs(vUv.y - 0.5)) * step(q.x, 0.43) * step(q.y, 0.42);
  vec3 warm = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.82, 0.45), smoothstep(0.6, 0.1, length(vUv - vec2(0.5, 0.35))));
  float flicker = 0.95 + 0.05 * sin(uTime * 3.1 + vUv.x * 2.0);
  vec3 lit = warm * 2.1 * flicker;
  vec3 dark = vec3(0.06, 0.06, 0.12);
  vec3 frame = vec3(0.12, 0.1, 0.16);
  gl_FragColor = vec4(mix(frame, mix(dark, lit, uOn), bars), 1.0);
}
`;

export interface CottageMesh {
  group: THREE.Group;
  windows: THREE.ShaderMaterial[];
}

function gable(w: number, d: number, rise: number): THREE.BufferGeometry {
  // a ridge running along x: two sloped faces and two gable ends, with a little overhang
  const ow = w / 2 + 0.07, od = d / 2 + 0.08;
  const v = [
    -ow, 0, od, ow, 0, od, ow, rise, 0, -ow, 0, od, ow, rise, 0, -ow, rise, 0,
    ow, 0, -od, -ow, 0, -od, -ow, rise, 0, ow, 0, -od, -ow, rise, 0, ow, rise, 0,
    -ow, 0, -od, -ow, 0, od, -ow, rise, 0,
    ow, 0, od, ow, 0, -od, ow, rise, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

function cottage(world: WorldUniforms, c: Cottage, wallTone: string, roofTone: string): { group: THREE.Group; win: THREE.ShaderMaterial } {
  const group = new THREE.Group();
  group.position.set(c.x, groundHeight(c.x, c.z) - 0.04, c.z);
  group.rotation.y = c.rot;
  const walls = tint(new THREE.BoxGeometry(c.w, c.h, c.d).translate(0, c.h / 2, 0), wallTone);
  const roof = tint(gable(c.w, c.d, c.h * 0.62).translate(0, c.h, 0), roofTone);
  const chimney = tint(new THREE.BoxGeometry(0.12, 0.3, 0.12).translate(c.w * 0.28, c.h + c.h * 0.5, -c.d * 0.12), '#4a4262');
  const door = tint(new THREE.BoxGeometry(0.17, 0.3, 0.02).translate(c.w * 0.26, 0.15, c.d / 2 + 0.005), '#2c2740');
  const geo = merge([walls, roof, chimney, door]);
  group.add(new THREE.Mesh(geo, paintMaterial(world, { vertexColors: true, softness: 0.1 })));
  const win = new THREE.ShaderMaterial({ uniforms: { uOn: { value: 1 }, uTime: world.uTime }, vertexShader: windowVertex, fragmentShader: windowFragment });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.2), win);
  pane.position.set(-c.w * 0.14, c.h * 0.5, c.d / 2 + 0.006);
  group.add(pane);
  return { group, win };
}

function cottages(world: WorldUniforms): CottageMesh {
  const group = new THREE.Group();
  group.name = 'cottages';
  const walls = ['#6b6893', '#75709a', '#66648c'];
  const roofs = ['#3b3258', '#463a5e', '#352f52'];
  const windows = COTTAGES.map((c, i) => {
    const m = cottage(world, c, walls[i % 3], roofs[i % 3]);
    group.add(m.group);
    return m.win;
  });
  return { group, windows };
}

// --- trees: pines on the hills, round puffs by the cottages ----------------------------------

function pineShape(seed: number): THREE.BufferGeometry {
  // three tiers, each a squat ellipsoid, narrowing to a point
  const tiers = [
    [0, 0.42, 0, 0.42, 0.3],
    [0, 0.78, 0, 0.32, 0.28],
    [0, 1.08, 0, 0.2, 0.25],
    [0, 1.3, 0, 0.09, 0.16],
  ];
  const base = (x: number, y: number, z: number) => Math.min(...tiers.map(([cx, cy, cz, r, h]) => sdEllipsoid(x, y, z, cx, cy, cz, r, h, r)));
  const ext: [number, number, number] = [0.6, 1.55, 0.6];
  const crown = meshSDF(
    woolField(base, { seed, min: [-ext[0], 0.05, -ext[2]], max: ext, inset: 0.04, layers: [{ count: 40, rMin: 0.07, rMax: 0.12 }], blend: 0.05, curl: 0.004 }),
    { min: [-ext[0], 0.0, -ext[2]], max: ext, cell: 0.035, ao: true },
  );
  tint(crown, '#22364a');
  const trunk = tint(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 6).translate(0, 0.15, 0), '#33293c');
  return merge([crown, trunk]);
}

function puffShape(seed: number): THREE.BufferGeometry {
  const base = (x: number, y: number, z: number) => sdEllipsoid(x, y, z, 0, 0.75, 0, 0.45, 0.4, 0.45);
  const crown = meshSDF(
    woolField(base, { seed, min: [-0.6, 0.2, -0.6], max: [0.6, 1.3, 0.6], inset: 0.06, layers: [{ count: 30, rMin: 0.12, rMax: 0.18 }, { count: 30, rMin: 0.07, rMax: 0.1 }], blend: 0.06, curl: 0.004 }),
    { min: [-0.7, 0.15, -0.7], max: [0.7, 1.4, 0.7], cell: 0.035, ao: true },
  );
  tint(crown, '#2d4254');
  const trunk = tint(new THREE.CylinderGeometry(0.04, 0.06, 0.45, 6).translate(0, 0.22, 0), '#352b3e');
  return merge([crown, trunk]);
}

function trees(world: WorldUniforms): THREE.Group {
  const group = new THREE.Group();
  group.name = 'trees';
  const mat = paintMaterial(world, { vertexColors: true, ragged: true, softness: 0.3 });
  const kinds: { kind: 'pine' | 'puff'; v: number; geo: () => THREE.BufferGeometry }[] = [
    { kind: 'pine', v: 0, geo: () => pineShape(3) },
    { kind: 'pine', v: 1, geo: () => pineShape(8) },
    { kind: 'pine', v: 2, geo: () => pineShape(13) },
    { kind: 'puff', v: 0, geo: () => puffShape(2) },
    { kind: 'puff', v: 1, geo: () => puffShape(9) },
  ];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (const k of kinds) {
    const list = TREES.filter((t) => t.kind === k.kind && t.v === k.v);
    if (!list.length) continue;
    const inst = new THREE.InstancedMesh(k.geo(), mat, list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.x * 3.1 + t.z);
      const s = t.s * (k.kind === 'pine' ? 1 : 1.25);
      m.compose(new THREE.Vector3(t.x, groundHeight(t.x, t.z) - 0.03, t.z), q, new THREE.Vector3(s, s * (k.kind === 'pine' ? 1.05 : 1), s));
      inst.setMatrixAt(i, m);
    });
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}

// --- reeds --------------------------------------------------------------------------------------

function blade(h: number, lean: number): THREE.BufferGeometry {
  // a tapered strip of four segments, curving over a little at the top
  const pts: number[] = [];
  const seg = 4;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const w = 0.022 * (1 - t * 0.85);
    const x = lean * t * t * h;
    pts.push(x - w, t * h, 0, x + w, t * h, 0);
  }
  const index: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return withAO(g);
}

function reeds(world: WorldUniforms): THREE.InstancedMesh {
  const rnd = seededRandom(19);
  const total = REEDS.reduce((n, r) => n + r.n, 0);
  const inst = new THREE.InstancedMesh(blade(1, 0.18), paintMaterial(world, { color: '#3b4c4c', side: THREE.DoubleSide, sway: true, softness: 0.3 }), total);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let k = 0;
  for (const r of REEDS) {
    for (let i = 0; i < r.n; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 0.22;
      const x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
      const h = r.h * (0.6 + rnd() * 0.6);
      m.compose(new THREE.Vector3(x, Math.max(WATER_Y, groundHeight(x, z)) - 0.02, z), q, new THREE.Vector3(1, h, 1));
      inst.setMatrixAt(k++, m);
    }
  }
  inst.computeBoundingSphere();
  inst.name = 'reeds';
  return inst;
}

export interface Props {
  group: THREE.Group;
  windows: THREE.ShaderMaterial[];
}

export function createProps(world: WorldUniforms): Props {
  const group = new THREE.Group();
  group.name = 'props';
  const c = cottages(world);
  group.add(jetty(world), c.group, trees(world), reeds(world));
  return { group, windows: c.windows };
}

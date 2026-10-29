import * as THREE from 'three';

/**
 * A paper shell turned from a profile, like a lathe: the profile's points
 * (radius, height) are resampled evenly along their length, closed over the
 * top, and swept round the vertical axis. Normals come from the profile's
 * own slope, so there is no seam. u runs round (0 faces +z), v up.
 */

export const SEGMENTS = 40;
const ROWS = 26;

/** Evenly spaced points along the profile, with the top closed onto the axis. */
export function resampleProfile(profile: readonly (readonly [number, number])[], rows = ROWS): [number, number][] {
  const pts = profile.map(([r, y]) => [r, y] as [number, number]);
  const last = pts[pts.length - 1];
  if (last[0] > 1e-3) pts.push([0, last[1] + last[0] * 0.3]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const out: [number, number][] = [];
  let k = 0;
  for (let i = 0; i <= rows; i++) {
    const s = (i / rows) * total;
    while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const t = (s - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    out.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]);
  }
  out[out.length - 1][0] = 0;
  return out;
}

export function latheGeometry(profile: readonly (readonly [number, number])[]): THREE.BufferGeometry {
  const prof = resampleProfile(profile);
  const top = prof[prof.length - 1][1] || 1;
  const n = prof.length;
  const positions = new Float32Array(n * (SEGMENTS + 1) * 3);
  const normals = new Float32Array(n * (SEGMENTS + 1) * 3);
  const uvs = new Float32Array(n * (SEGMENTS + 1) * 2);
  for (let i = 0; i < n; i++) {
    const [r, y] = prof[i];
    // slope from neighbours: outward normal in the (r, y) plane is (dy, -dr)
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(n - 1, i + 1)];
    let nr = b[1] - a[1], ny = -(b[0] - a[0]);
    const l = Math.hypot(nr, ny) || 1;
    nr /= l;
    ny /= l;
    if (i === n - 1) {
      nr = 0;
      ny = 1;
    }
    for (let j = 0; j <= SEGMENTS; j++) {
      const th = (j / SEGMENTS) * Math.PI * 2;
      const s = Math.sin(th), c = Math.cos(th);
      const o = i * (SEGMENTS + 1) + j;
      positions.set([r * s, y, r * c], o * 3);
      normals.set([nr * s, ny, nr * c], o * 3);
      uvs.set([j / SEGMENTS, y / top], o * 2);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const a = i * (SEGMENTS + 1) + j;
      const b = a + SEGMENTS + 1;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

/** Profile measures: height, widest radius, bottom ring radius. */
export function measure(profile: readonly (readonly [number, number])[]): { height: number; radius: number; ring: number } {
  const height = profile[profile.length - 1][1] - profile[0][1];
  return { height, radius: Math.max(...profile.map((p) => p[0])), ring: profile[0][0] };
}

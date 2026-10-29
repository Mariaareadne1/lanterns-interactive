import * as THREE from 'three';
import { TILE } from './lake';

/**
 * MEADOW's elevated three-quarter view, a little lower so there is sky above
 * the hills for the lanterns to rise into. A real perspective camera whose
 * distance is solved so the tile and its sky fit any aspect ratio; tall
 * screens look a little more steeply and let the tile's sides run off.
 */

const PITCH = THREE.MathUtils.degToRad(-37);
const PITCH_PORTRAIT = THREE.MathUtils.degToRad(-42);
const FOV = 36;
const NUDGE = 0.4;
const MARGIN_LANDSCAPE = 0.94;
const MARGIN_PORTRAIT_Y = 0.84;

export function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 400);
  camera.rotation.set(PITCH, 0, 0, 'YXZ');
  return camera;
}

// the tile, plus the sky above its far edge where lanterns end as stars
const CORNERS = [
  new THREE.Vector3(-TILE.halfX, 0, -TILE.halfZ),
  new THREE.Vector3(TILE.halfX, 0, -TILE.halfZ),
  new THREE.Vector3(-TILE.halfX, 0, TILE.halfZ),
  new THREE.Vector3(TILE.halfX, 0, TILE.halfZ),
  new THREE.Vector3(-TILE.halfX * 0.75, 6.2, -TILE.halfZ - 1),
  new THREE.Vector3(TILE.halfX * 0.75, 6.2, -TILE.halfZ - 1),
];
const tmp = new THREE.Vector3();

function place(camera: THREE.PerspectiveCamera, portrait: boolean, distance: number): void {
  const euler = new THREE.Euler(portrait ? PITCH_PORTRAIT : PITCH, 0, 0, 'YXZ');
  const back = new THREE.Vector3(0, 0, 1).applyEuler(euler);
  camera.position.set(0, 1.2, NUDGE).addScaledVector(back, distance);
  camera.rotation.copy(euler);
  camera.updateMatrixWorld(true);
}

function extent(camera: THREE.PerspectiveCamera): { x: number; y: number } {
  let x = 0, y = 0;
  for (const c of CORNERS) {
    tmp.copy(c).project(camera);
    x = Math.max(x, Math.abs(tmp.x));
    y = Math.max(y, Math.abs(tmp.y));
  }
  return { x, y };
}

/** Frame the tile; `zoom` > 1 pulls the camera back (the demo's closing shot). */
export function frameCamera(camera: THREE.PerspectiveCamera, width: number, height: number, zoom = 1): void {
  const aspect = width / Math.max(1, height);
  camera.aspect = aspect;
  camera.fov = FOV;
  camera.updateProjectionMatrix();
  const portrait = aspect < 1;
  let lo = 4;
  let hi = 200;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    place(camera, portrait, mid);
    const e = extent(camera);
    const fits = portrait ? e.y <= MARGIN_PORTRAIT_Y && e.x <= 2.15 : e.x <= MARGIN_LANDSCAPE && e.y <= MARGIN_LANDSCAPE;
    if (fits) hi = mid;
    else lo = mid;
  }
  place(camera, portrait, hi * zoom);
}

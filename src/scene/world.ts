import * as THREE from 'three';

/**
 * One light rig shared by every material, painted rather than physical.
 * At blue hour the only "sun" is a cool, pale moon: form turns from a
 * moonlit lavender into deep indigo shade. Warm light comes from point
 * lights — the brightest lanterns near the ground and the cottage windows —
 * which paint soft pools with a brushy falloff. Colours are linear-light.
 */

// THREE.Color parses hex as sRGB and stores linear values (ColorManagement is on).
const linear = (hex: string) => new THREE.Color(hex);

export const PAPER_HEX = '#f4efe4';

/** Point lights the ground, water, jetty and reeds can receive. */
export const MAX_LIGHTS = 11;
/** Lights the lake reflects (every lantern, plus the windows). */
export const MAX_REFLECTIONS = 48;
export const MAX_RIPPLES = 10;

export const MOON_DIR = new THREE.Vector3(0.42, 0.62, -0.66).normalize();
/** Where the moon hangs, far behind the hills (its reflection is computed from here). */
export const MOON_POS = new THREE.Vector3(6.2, 11.5, -15);

export interface WorldUniforms {
  [name: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uMoonDir: THREE.IUniform<THREE.Vector3>;
  uMoonPos: THREE.IUniform<THREE.Vector3>;
  uMoonColor: THREE.IUniform<THREE.Color>;
  uShadeColor: THREE.IUniform<THREE.Color>;
  uPaper: THREE.IUniform<THREE.Color>;
  uLights: THREE.IUniform<THREE.Vector4[]>;
  uLightColors: THREE.IUniform<THREE.Color[]>;
  uRefl: THREE.IUniform<THREE.Vector4[]>;
  uReflColors: THREE.IUniform<THREE.Color[]>;
  uRipples: THREE.IUniform<THREE.Vector4[]>;
  uWind: THREE.IUniform<number>;
  /** 0 calm .. 1 normal: reduced motion stills flicker and sway. */
  uMotion: THREE.IUniform<number>;
}

export function createWorldUniforms(): WorldUniforms {
  return {
    uTime: { value: 0 },
    uMoonDir: { value: MOON_DIR.clone() },
    uMoonPos: { value: MOON_POS.clone() },
    uMoonColor: { value: linear('#e9e8ff') },
    uShadeColor: { value: linear('#9a93cf') },
    uPaper: { value: linear(PAPER_HEX) },
    uLights: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -50, 0, 0)) },
    uLightColors: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(1, 0.6, 0.3)) },
    uRefl: { value: Array.from({ length: MAX_REFLECTIONS }, () => new THREE.Vector4(0, -50, 0, 0)) },
    uReflColors: { value: Array.from({ length: MAX_REFLECTIONS }, () => new THREE.Color(1, 0.6, 0.3)) },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
    uWind: { value: 1 },
    uMotion: { value: 1 },
  };
}

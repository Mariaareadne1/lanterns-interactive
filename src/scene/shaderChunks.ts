// GLSL shared by every world material: noise, the painted moonlight and the
// painted warm point lights the lanterns and windows throw.
import { MAX_LIGHTS, MAX_REFLECTIONS, MAX_RIPPLES } from './world';

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x),
                 mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x),
                 mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y), u.z);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
  return s / 0.9375;
}
`;

export const WORLD_UNIFORMS_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uMoonPos;
uniform vec3 uMoonColor;
uniform vec3 uShadeColor;
uniform vec3 uPaper;
uniform vec4 uLights[${MAX_LIGHTS}];
uniform vec3 uLightColors[${MAX_LIGHTS}];
uniform vec4 uRefl[${MAX_REFLECTIONS}];
uniform vec3 uReflColors[${MAX_REFLECTIONS}];
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform float uWind;
uniform float uMotion;
`;

export const LIGHTING_GLSL = /* glsl */ `
// Painted moonlight: the albedos are already night colours, so light only
// turns form between a pale lavender lit side and a deeper indigo shade.
vec3 moonLight(vec3 albedo, vec3 N, float ao, float softness) {
  float ndl = dot(N, uMoonDir);
  float form = smoothstep(-0.3 - softness, 0.5 + softness, ndl);
  vec3 shade = albedo * uShadeColor * 0.82;
  vec3 lit = albedo * uMoonColor * (1.0 + 0.08 * smoothstep(0.55, 1.0, ndl));
  return mix(shade, lit, form) * mix(0.72, 1.0, ao);
}

// Warm pools of light from the lanterns near the ground and the cottage
// windows: a soft disc with a brushy edge, not an inverse-square falloff.
// w is the light's strength; its reach grows with it.
vec3 lanternLight(vec3 wp, vec3 N, vec3 albedo) {
  vec3 sum = vec3(0.0);
  float brush = 0.8 + 0.4 * vnoise(wp.xz * 2.6 + wp.y);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 L = uLights[i];
    if (L.w <= 0.001) continue;
    vec3 d = L.xyz - wp;
    float dist = length(d);
    float reach = 1.0 + 1.9 * sqrt(L.w);
    float f = 1.0 - smoothstep(0.0, reach * brush, dist);
    f *= f;
    float wrap = 0.4 + 0.6 * max(dot(N, d / max(dist, 1e-3)), 0.0);
    sum += uLightColors[i] * (L.w * f * wrap);
  }
  // warm light reveals the day colour under the night wash
  return sum * (albedo * 4.0 + vec3(0.1, 0.06, 0.025));
}
`;

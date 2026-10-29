import * as THREE from 'three';

/**
 * Final pass: a soft bloom on the lantern glow only (nothing else in the
 * night painting is brighter than paper, so a threshold above paper white
 * catches just the lights), then exposure, a gentle tone curve, a little
 * restraint on saturation, MEADOW's grain and dither. The scene renders
 * linear HDR into a multisampled target; this writes sRGB.
 */

const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const brightFragment = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  // a 4-tap box while downsampling keeps the threshold from shimmering
  vec3 c = vec3(0.0);
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float peak = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.9, peak);
  gl_FragColor = vec4(min(c * k, vec3(12.0)), 1.0);
}
`;

const blurFragment = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270;
  c += (texture2D(tSrc, vUv + uDir * 1.3846).rgb + texture2D(tSrc, vUv - uDir * 1.3846).rgb) * 0.3162;
  c += (texture2D(tSrc, vUv + uDir * 3.2308).rgb + texture2D(tSrc, vUv - uDir * 3.2308).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}
`;

const finalFragment = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloomA;
uniform sampler2D tBloomB;
uniform float uBloom;
uniform float uExposure;
uniform float uTime;
uniform float uGrain;
uniform vec2 uResolution;
varying vec2 vUv;

// Khronos PBR Neutral: keeps albedo hues honest, rolls off highlights gently.
vec3 neutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 hdr = texture2D(tScene, vUv).rgb;
  vec3 bloom = texture2D(tBloomA, vUv).rgb * 0.6 + texture2D(tBloomB, vUv).rgb * 0.75;
  vec3 c = neutral((hdr + bloom * uBloom) * uExposure);
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, 0.95);
  vec3 outc = toSRGB(clamp(c, 0.0, 1.0));
  float n = hash(vUv * uResolution + fract(uTime) * 91.7) - 0.5;
  outc += n * uGrain + (hash(vUv * uResolution * 1.37) - 0.5) / 255.0;
  gl_FragColor = vec4(outc, 1.0);
}
`;

const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;

export class PostPass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly final: THREE.ShaderMaterial;
  private readonly bright: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  // two bloom levels (¼ and ⅛ resolution), each blurred through a ping-pong pair
  private readonly levels = [0, 1].map(() => [new THREE.WebGLRenderTarget(1, 1, rtOpts), new THREE.WebGLRenderTarget(1, 1, rtOpts)]);

  constructor(samples: number) {
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer: true });
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.15 } },
      vertexShader: vertex,
      fragmentShader: brightFragment,
      depthTest: false,
      depthWrite: false,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: vertex,
      fragmentShader: blurFragment,
      depthTest: false,
      depthWrite: false,
    });
    this.final = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        tBloomA: { value: this.levels[0][0].texture },
        tBloomB: { value: this.levels[1][0].texture },
        uBloom: { value: 0.55 },
        uExposure: { value: 1.08 },
        uTime: { value: 0 },
        uGrain: { value: 0.014 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: vertex,
      fragmentShader: finalFragment,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get bloomStrength(): number {
    return this.final.uniforms.uBloom.value;
  }

  set bloomStrength(v: number) {
    this.final.uniforms.uBloom.value = v;
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    this.final.uniforms.uResolution.value.set(width, height);
    this.levels[0].forEach((t) => t.setSize(Math.max(1, Math.round(width / 4)), Math.max(1, Math.round(height / 4))));
    this.levels[1].forEach((t) => t.setSize(Math.max(1, Math.round(width / 8)), Math.max(1, Math.round(height / 8))));
  }

  private pass(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial, out: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    renderer.setRenderTarget(out);
    renderer.render(this.scene, this.camera);
  }

  render(renderer: THREE.WebGLRenderer, time: number, output: THREE.WebGLRenderTarget | null = null): void {
    let src: THREE.Texture = this.target.texture;
    let srcW = this.target.width, srcH = this.target.height;
    for (const [a, b] of this.levels) {
      this.bright.uniforms.tSrc.value = src;
      this.bright.uniforms.uTexel.value.set(1 / srcW, 1 / srcH);
      // the second level downsamples the first's blurred result without thresholding again
      this.bright.uniforms.uThreshold.value = src === this.target.texture ? 1.15 : -1;
      this.pass(renderer, this.bright, a);
      this.blur.uniforms.tSrc.value = a.texture;
      this.blur.uniforms.uDir.value.set(1 / a.width, 0);
      this.pass(renderer, this.blur, b);
      this.blur.uniforms.tSrc.value = b.texture;
      this.blur.uniforms.uDir.value.set(0, 1 / a.height);
      this.pass(renderer, this.blur, a);
      src = a.texture;
      srcW = a.width;
      srcH = a.height;
    }
    this.final.uniforms.uTime.value = time;
    this.pass(renderer, this.final, output);
  }

  dispose(): void {
    this.target.dispose();
    for (const l of this.levels) l.forEach((t) => t.dispose());
    this.final.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.quad.geometry.dispose();
  }
}

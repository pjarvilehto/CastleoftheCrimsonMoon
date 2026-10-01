// explore/ssao.js — screen-space ambient occlusion (0.147): the dark
// contact shadows where things meet — a sarcophagus on the floor, a
// shelf against a wall, the crease of a vault — from the depth buffer
// alone. At half resolution: each pixel's position comes back from depth,
// its normal from how depth changes across the screen, and 12 points in
// the hemisphere above it (turned by a per-pixel angle) are tested
// against the depth there; then a small blur hides the sampling noise.
// The paint pass darkens the scene's light by it before tone mapping.
// createSSAO(renderer, camera, cfg) -> { setSize(w, h), render(depthTexture) -> texture }

import * as THREE from 'three';
import { fxPass, fxTarget } from './fxpass.js';

const N = 12;
const AO = `precision highp float; varying vec2 vUv;
uniform sampler2D tDepth; uniform mat4 proj, invProj; uniform float radius, bias;
uniform vec3 kernel[${N}];
vec3 viewPos(vec2 uv) { float d = texture2D(tDepth, uv).r; vec4 p = invProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  if (texture2D(tDepth, vUv).r >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec3 Nn = normalize(cross(dFdx(P), dFdy(P)));
  float a = hash(gl_FragCoord.xy) * 6.2831853;
  vec3 r = vec3(cos(a), sin(a), 0.0);
  vec3 T = normalize(r - Nn * dot(r, Nn)), B = cross(Nn, T);
  float occ = 0.0;
  for (int i = 0; i < ${N}; i++) {
    vec3 s = P + (T * kernel[i].x + B * kernel[i].y + Nn * kernel[i].z) * radius;
    vec4 c = proj * vec4(s, 1.0);
    vec2 suv = c.xy / c.w * 0.5 + 0.5;
    float sz = viewPos(suv).z;
    float near = smoothstep(0.0, 1.0, radius / max(abs(P.z - sz), 1e-3)); // (far-off depth does not occlude)
    occ += (sz >= s.z + bias ? 1.0 : 0.0) * near;
  }
  gl_FragColor = vec4(vec3(1.0 - occ / float(${N})), 1.0);
}`;
const BLUR = `precision highp float; varying vec2 vUv;
uniform sampler2D src; uniform vec2 texel;
void main() {
  float s = 0.0;
  for (int x = -2; x <= 1; x++) for (int y = -2; y <= 1; y++) s += texture2D(src, vUv + (vec2(float(x), float(y)) + 0.5) * texel).r;
  gl_FragColor = vec4(vec3(s / 16.0), 1.0);
}`;

// sample points in the unit hemisphere (z up), more of them close in
function kernel() {
  let seed = 97;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: N }, (_, i) => {
    const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, 0.15 + rnd() * 0.85).normalize();
    const k = i / N;
    return v.multiplyScalar(0.15 + 0.85 * k * k);
  });
}

export function createSSAO(renderer, camera, cfg) {
  const S = cfg.post.ssao;
  const ao = fxPass(renderer, AO, {
    tDepth: { value: null }, proj: { value: new THREE.Matrix4() }, invProj: { value: new THREE.Matrix4() },
    radius: { value: S.radius }, bias: { value: S.bias }, kernel: { value: kernel() },
  });
  const blur = fxPass(renderer, BLUR, { src: { value: null }, texel: { value: new THREE.Vector2() } });
  const raw = fxTarget(), soft = fxTarget();
  return {
    setSize(w, h) { raw.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); soft.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); },
    render(depth) {
      ao.uniforms.tDepth.value = depth;
      ao.uniforms.proj.value.copy(camera.projectionMatrix);
      ao.uniforms.invProj.value.copy(camera.projectionMatrixInverse);
      ao.render(raw);
      blur.uniforms.src.value = raw.texture; blur.uniforms.texel.value.set(1 / raw.width, 1 / raw.height);
      blur.render(soft);
      return soft.texture;
    },
  };
}

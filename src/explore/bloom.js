// explore/bloom.js — bloom (0.147): what is brighter than `threshold` (the
// flames, the embers, stained glass, a lit window) bleeds a soft glow
// into the dark around it. The bright part is cut out at half resolution
// with a soft knee, halved `levels` times (each a 4-tap average, so the
// blur widens cheaply), then built back up level by level with a tent
// filter, each level adding the one below. The paint pass adds the result
// to the scene's light before tone mapping.
// 0.149: what it reads is capped at render.maxLight (and NaN read as 0):
// one overflowed pixel used to spread into stepped black blocks.
// createBloom(renderer, cfg) -> { setSize(w, h), render(hdrTexture) -> texture }

import * as THREE from 'three';
import { fxPass, fxTarget } from './fxpass.js';

const PREFILTER = `precision highp float; varying vec2 vUv;
uniform sampler2D src; uniform vec2 texel; uniform float threshold, knee, maxLight;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) { vec2 o = vec2(i == 0 || i == 2 ? -0.5 : 0.5, i < 2 ? -0.5 : 0.5) * texel; c += min(max(texture2D(src, vUv + o).rgb, vec3(0.0)), vec3(maxLight)); }
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - threshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;
const DOWN = `precision highp float; varying vec2 vUv;
uniform sampler2D src; uniform vec2 texel;
void main() {
  vec3 c = texture2D(src, vUv + vec2(-1.0, -1.0) * texel).rgb + texture2D(src, vUv + vec2(1.0, -1.0) * texel).rgb
         + texture2D(src, vUv + vec2(-1.0, 1.0) * texel).rgb + texture2D(src, vUv + vec2(1.0, 1.0) * texel).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;
const UP = `precision highp float; varying vec2 vUv;
uniform sampler2D src, below; uniform vec2 texel;
void main() {
  vec3 c = texture2D(below, vUv).rgb * 4.0;
  c += (texture2D(below, vUv + vec2(texel.x, 0.0)).rgb + texture2D(below, vUv - vec2(texel.x, 0.0)).rgb
      + texture2D(below, vUv + vec2(0.0, texel.y)).rgb + texture2D(below, vUv - vec2(0.0, texel.y)).rgb) * 2.0;
  c += texture2D(below, vUv + texel).rgb + texture2D(below, vUv - texel).rgb
     + texture2D(below, vUv + vec2(texel.x, -texel.y)).rgb + texture2D(below, vUv + vec2(-texel.x, texel.y)).rgb;
  gl_FragColor = vec4(texture2D(src, vUv).rgb + c / 16.0, 1.0);
}`;

export function createBloom(renderer, cfg) {
  const B = cfg.post.bloom, L = B.levels;
  const pre = fxPass(renderer, PREFILTER, { src: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: B.threshold }, knee: { value: B.knee }, maxLight: { value: cfg.render.maxLight } });
  const down = fxPass(renderer, DOWN, { src: { value: null }, texel: { value: new THREE.Vector2() } });
  const up = fxPass(renderer, UP, { src: { value: null }, below: { value: null }, texel: { value: new THREE.Vector2() } });
  const chain = Array.from({ length: L }, () => fxTarget());   // [0] half size, then halving
  const ups = Array.from({ length: L - 1 }, () => fxTarget()); // built back up
  let size = [1, 1];
  return {
    setSize(w, h) {
      size = [w, h];
      chain.forEach((t, i) => t.setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))));
      ups.forEach((t, i) => t.setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))));
    },
    render(src) {
      pre.uniforms.src.value = src; pre.uniforms.texel.value.set(1 / size[0], 1 / size[1]);
      pre.render(chain[0]);
      for (let i = 1; i < L; i++) {
        down.uniforms.src.value = chain[i - 1].texture;
        down.uniforms.texel.value.set(0.5 / chain[i - 1].width, 0.5 / chain[i - 1].height);
        down.render(chain[i]);
      }
      // up: level i = chain[i] + the tent-filtered level below
      let below = chain[L - 1].texture;
      for (let i = L - 2; i >= 0; i--) {
        up.uniforms.src.value = chain[i].texture; up.uniforms.below.value = below;
        up.uniforms.texel.value.set(1 / chain[i + 1].width, 1 / chain[i + 1].height);
        up.render(ups[i]);
        below = ups[i].texture;
      }
      return below;
    },
  };
}

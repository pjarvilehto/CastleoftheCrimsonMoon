// explore/post.js — the ink-and-paint pass (0.139; after Darkest Dungeon 2).
// The scene renders into an HDR target with a depth texture; one full-screen
// shader turns it into a painting: ink outlines from depth (silhouettes AND
// creases — the depth Laplacian), tone mapping, light in soft bands, a
// muted grade with olive-black shadows and warm highlights, the deepest
// shadows as hatched ink, canvas grain, a vignette. One pass, a few texture
// reads per pixel — cheap enough for laptops. 0.145: haze — the light each
// nearby source scatters in the dusty air along the view ray, in closed
// form (the integral of 1/d^2 along a line is an arctangent: no marching),
// so every torch and window hangs in a soft glow of its own colour.
// 0.147, the post stack: SSAO (ssao.js) darkens the light where things
// meet and bloom (bloom.js) adds the glow of the brightest parts, both
// before tone mapping; the depth tier's grade (lut.js, a 32³ table) is
// the last colour step, before the grain. The quality ladder can switch
// SSAO and bloom off (setFeature).

import * as THREE from 'three';
import { createBloom } from './bloom.js';
import { createSSAO } from './ssao.js';
import { gradeTable, LUT_N, LUT_GLSL } from './lut.js';

const VERT = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = () => `precision highp float;
#define HAZE_N __HAZE_N__
varying vec2 vUv;
uniform sampler2D tColor, tDepth, tBloom, tAO, tLUT;
uniform float bloomAmt, aoAmt, lutAmt, hiWhite, maxLight;
uniform vec2 res;
uniform mat4 invProj;
uniform vec3 hazePos[HAZE_N], hazeCol[HAZE_N];
uniform float hazeAmt, hazeReach;
uniform float near, far, edge, edgeWidth, bands, bandMix, desat, inkBelow, grain, vignette, exposure, dim, fade;
uniform vec3 shadowTint, highTint, ink;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
${LUT_GLSL}
void main() {
  vec2 px = edgeWidth / res;
  float d = lin(texture2D(tDepth, vUv).r);
  float dl = lin(texture2D(tDepth, vUv - vec2(px.x, 0.0)).r), dr = lin(texture2D(tDepth, vUv + vec2(px.x, 0.0)).r);
  float du = lin(texture2D(tDepth, vUv + vec2(0.0, px.y)).r), dd = lin(texture2D(tDepth, vUv - vec2(0.0, px.y)).r);
  // relative depth curvature: jumps (silhouettes) and folds (wall meets floor)
  float lap = (abs(dl + dr - 2.0 * d) + abs(du + dd - 2.0 * d)) / max(d, 0.001);
  float e = smoothstep(0.015, 0.06, lap) * edge * (1.0 - smoothstep(14.0, 30.0, d)); // fades into the dark distance

  // haze: light scattered toward the eye along the ray to this pixel
  vec4 vp = invProj * vec4(vUv * 2.0 - 1.0, texture2D(tDepth, vUv).r * 2.0 - 1.0, 1.0);
  vec3 ray = vp.xyz / vp.w;
  float len = min(length(ray), hazeReach * 3.0);
  vec3 dir = normalize(ray), scatter = vec3(0.0);
  for (int i = 0; i < HAZE_N; i++) {
    float b = dot(hazePos[i], dir), h = sqrt(max(dot(hazePos[i], hazePos[i]) - b * b, 0.04));
    float through = (atan((len - b) / h) - atan(-b / h)) / h;
    scatter += hazeCol[i] * through * (1.0 - smoothstep(hazeReach * 0.5, hazeReach, h));
  }
  // the scene's light, darkened where things meet (SSAO), the glow of the
  // brightest parts added (bloom) and the haze
  // (capped, NaN read as 0: an overflowed pixel stays a bright one, 0.149)
  vec3 hdr = min(max(texture2D(tColor, vUv).rgb, vec3(0.0)), vec3(maxLight)) * mix(1.0, texture2D(tAO, vUv).r, aoAmt) + texture2D(tBloom, vUv).rgb * bloomAmt + scatter * hazeAmt;
  // tone-map, then grade in display space, where a painter's values live
  vec3 col = aces(hdr * exposure);
  float peak = max(col.r, max(col.g, col.b));                 // bright colours bleach toward white,
  col = mix(col, vec3(peak), smoothstep(0.55, 1.0, peak) * hiWhite); // as fire does (no solid orange-red)
  col = pow(col, vec3(1.0 / 2.2));
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float b = lum * bands;                                       // light in painted steps
  float banded = (floor(b) + smoothstep(0.3, 0.7, fract(b))) / bands;
  col *= mix(1.0, (banded + 0.003) / (lum + 0.003), bandMix);
  lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(lum), desat);                            // muted palette
  col *= mix(shadowTint, highTint, smoothstep(0.08, 0.7, lum)); // olive-black shadows, warm light
  float hatch = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 5.0));
  float inked = 1.0 - smoothstep(inkBelow * 0.5, inkBelow * 1.5, lum);
  col = mix(col, ink, inked * mix(0.8, 1.0, hatch));          // the deepest shadows: hatched ink
  col = mix(col, ink, e);                                      // ink outlines
  col = mix(col, gradeLut(tLUT, col), lutAmt);                // the depth tier's colour grade
  col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))) * 0.4, dim); // behind a fight: dark and grey
  vec2 q = vUv - 0.5;
  col *= 1.0 - vignette * dot(q, q) * 1.8;
  col += (hash(floor(gl_FragCoord.xy / 1.5)) - 0.5) * grain;  // canvas grain
  col *= 1.0 - fade;                                           // to black (the way down)
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// tint colour -> a multiplier with its brightest channel at 1 (keeps value)
const tint = (hex, amount) => {
  const c = new THREE.Color(hex), m = Math.max(c.r, c.g, c.b) || 1;
  return new THREE.Vector3(1, 1, 1).lerp(new THREE.Vector3(c.r / m, c.g / m, c.b / m), amount);
};

export function createPaintPass(renderer, camera, cfg) {
  const p = cfg.paint;
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: cfg.render.samples, depthTexture: new THREE.DepthTexture(1, 1) });
  const N = cfg.light.pool;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG().replace('__HAZE_N__', String(N)), depthTest: false, depthWrite: false,
    uniforms: {
      tColor: { value: target.texture }, tDepth: { value: target.depthTexture }, res: { value: new THREE.Vector2(1, 1) },
      near: { value: camera.near }, far: { value: camera.far },
      edge: { value: p.edge }, edgeWidth: { value: p.edgeWidth }, bands: { value: p.bands }, bandMix: { value: p.bandMix },
      desat: { value: p.desat }, inkBelow: { value: p.inkBelow }, grain: { value: p.grain }, vignette: { value: p.vignette },
      exposure: { value: cfg.render.exposure }, dim: { value: 0 }, fade: { value: 0 },
      invProj: { value: new THREE.Matrix4() }, hazeAmt: { value: p.haze }, hazeReach: { value: p.hazeReach },
      hazePos: { value: Array.from({ length: N }, () => new THREE.Vector3()) }, hazeCol: { value: Array.from({ length: N }, () => new THREE.Vector3()) },
      shadowTint: { value: tint(p.shadow, 0.55) }, highTint: { value: tint(p.highlight, 0.35) },
      ink: { value: new THREE.Color(p.ink) },
      tBloom: { value: null }, tAO: { value: null }, tLUT: { value: null },
      bloomAmt: { value: cfg.post.bloom.strength }, aoAmt: { value: cfg.post.ssao.strength }, lutAmt: { value: 1 }, hiWhite: { value: cfg.post.highlightWhite }, maxLight: { value: cfg.render.maxLight },
    },
  });
  const P = cfg.post, bloom = createBloom(renderer, cfg), ssao = createSSAO(renderer, camera, cfg);
  const on = { bloom: P.bloom.strength > 0, ssao: P.ssao.strength > 0 };
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;
  const lut = new THREE.DataTexture(gradeTable(P.grade), LUT_N * LUT_N, LUT_N);
  lut.magFilter = lut.minFilter = THREE.LinearFilter; lut.needsUpdate = true;
  material.uniforms.tLUT.value = lut;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene(); scene.add(quad);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    setSize(w, h) { target.setSize(w, h); material.uniforms.res.value.set(w, h); bloom.setSize(w, h); ssao.setSize(w, h); },
    // the lights' haze (lights.js update): world positions -> the camera's view
    setHaze(list) {
      const U = material.uniforms;
      U.invProj.value.copy(camera.projectionMatrixInverse);
      U.hazePos.value.forEach((v, i) => {
        const h = list[i];
        if (!h) { U.hazeCol.value[i].set(0, 0, 0); v.set(0, 0, 1e4); return; }
        v.copy(h.position).applyMatrix4(camera.matrixWorldInverse);
        U.hazeCol.value[i].set(h.color.r, h.color.g, h.color.b).multiplyScalar(h.intensity);
      });
    },
    render(world) {
      renderer.setRenderTarget(target);
      renderer.render(world, camera);
      const U = material.uniforms;
      U.tAO.value = on.ssao ? ssao.render(target.depthTexture) : white;
      U.tBloom.value = on.bloom ? bloom.render(target.texture) : black;
      renderer.setRenderTarget(null);
      renderer.render(scene, ortho);
    },
    // the quality ladder: switch SSAO or bloom off (or back on)
    setFeature(name, value) { on[name] = value; },
    feature: (name) => on[name],
    // a depth tier's grade (lut.js): rebake the table
    setGrade(G) { lut.image.data.set(gradeTable(G)); lut.needsUpdate = true; },
    uniforms: material.uniforms,
    // a depth tier's mood (0.142): the colour of its shadows
    setShadow(hex) { material.uniforms.shadowTint.value.copy(tint(hex, 0.55)); },
  };
}

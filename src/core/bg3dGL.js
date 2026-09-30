// core/bg3dGL.js — WebGL plumbing for the 3D backgrounds (0.098: split out
// of bg3d.js, which keeps the scene: layers, camera, frame loop, tuning).
// Shaders, program/buffer helpers, image + depth-map loading, texture upload.

import { WISPS, fogNoise } from './bg3dFog.js';

export const VS = `
attribute vec2 aGrid; attribute float aDepth;
uniform mat4 uMVP; uniform vec2 uUvScale, uPlane; uniform float uDepthScale, uPivot;
varying vec2 vUv; varying float vDepth; varying vec3 vWorld;
void main() {
  vUv = vec2(0.5) + (aGrid - 0.5) * uUvScale;
  vDepth = aDepth;
  // the focal-plane point (distance 1) behind this screen position, pushed
  // along its own ray by depth: no shift at rest, parallax once it sways
  vec3 p = vec3((aGrid.x * 2.0 - 1.0) * uPlane.x, (1.0 - aGrid.y * 2.0) * uPlane.y, -1.0);
  // (floor 0.4: nothing may come nearer than 40% of the focal distance —
  // strong depth + a far focus otherwise folds geometry past the camera)
  vec3 w = p * max(0.4, 1.0 + uDepthScale * (uPivot - aDepth));
  vWorld = w; // the surface point in the scene (the fog's ray end, 0.099)
  gl_Position = uMVP * vec4(w, 1.0);
}`;

// Fog (0.099, see core/bg3dFog.js): distance haze + three drifting wisp
// sheets. A sheet at distance L shows where this pixel's ray crosses it
// IN FRONT of the surface (t < 1), fading out as it meets the surface, so
// nearer objects hide it softly and it parallaxes with the camera.
const f = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));
const wispCalls = WISPS.map((w, i) => `    fog += wisp(${f(w.dist)}, ${f(w.scale)}, uDrift[${2 * i}], uDrift[${2 * i + 1}]) * ${f(w.weight)};`).join('\n');
export const FS = `
precision mediump float;
uniform sampler2D uTex, uNoise; uniform float uAlpha, uShowDepth, uFog;
uniform vec3 uFogColor, uCam; uniform vec2 uDrift[${WISPS.length * 2}];
varying vec2 vUv; varying float vDepth; varying vec3 vWorld;
// mist hangs low: full near the ground, gone by the top of the frame
float low(float y) { return clamp(0.55 - y * 1.1, 0.0, 1.0); }
float wisp(float dist, float scale, vec2 drift, vec2 drift2) {
  vec3 d = vWorld - uCam;
  float t = (-dist - uCam.z) / d.z;   // ray param where it crosses z = -dist (1 = the surface)
  if (t <= 0.0) return 0.0;
  vec2 q = (uCam + d * t).xy;
  float n = texture2D(uNoise, q * scale + drift).r * 0.6 + texture2D(uNoise, q * scale * 1.9 + drift2).r * 0.4;
  return smoothstep(0.48, 0.78, n) * mix(0.35, 1.0, low(q.y)) * clamp((1.0 - t) * 6.0, 0.0, 1.0);
}
void main() {
  vec3 c = uShowDepth > 0.5 ? vec3(vDepth) : texture2D(uTex, clamp(vUv, 0.0, 1.0)).rgb;
  if (uFog > 0.0) {
    // haze: air thickens with distance (exponential, like real air), a bit
    // less high up; then the drifting wisp sheets
    float fog = (1.0 - exp(-2.2 * pow(1.0 - vDepth, 1.3))) * mix(0.6, 1.0, low(vWorld.y)) * 0.9;
${wispCalls}
    c = mix(c, uFogColor, clamp(fog * 0.6 * uFog, 0.0, 0.85));
  }
  gl_FragColor = vec4(c, uAlpha);
}`;

// The wisps' noise: a tileable 128x128 luminance texture (REPEAT wrap).
export function makeNoiseTexture(gl) {
  const size = 128;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, size, size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, fogNoise(size));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

// The art at 64x36 for the fog colour (bg3dFog.js fogColor).
export function smallPixels(img, w = 64, h = 36) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  return cx.getImageData(0, 0, w, h).data;
}

export function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

export function buffer(gl, target, data) {
  const b = gl.createBuffer();
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return b;
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img));
    img.onerror = () => reject(new Error(`image ${url}`));
    img.src = url;
  });
}

// Read a grayscale depth map back to the CPU (depth goes in per vertex):
// { w, h, data: Uint8Array } — 0 = far .. 255 = near.
export function readDepth(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, c.width, c.height).data;
  const data = new Uint8Array(c.width * c.height);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
  return { w: c.width, h: c.height, data };
}

// Upload the art as a texture: mipmapped on WebGL2 (NPOT mips need it;
// smoother when the canvas is smaller than the art), clamped edges.
export function makeTexture(gl, img) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (webgl2) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, webgl2 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

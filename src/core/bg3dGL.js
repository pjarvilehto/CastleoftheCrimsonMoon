// core/bg3dGL.js — WebGL plumbing for the 3D backgrounds (0.098: split out
// of bg3d.js, which keeps the scene: layers, camera, frame loop, tuning).
// Shaders, program/buffer helpers, image + depth-map loading, texture upload.
// The fog puffs have their own (core/bg3dPuffGL.js).

import { MAX_LIGHTS } from './bg3dLights.js';

// Flash lights (0.100, core/bg3dLights.js): by true 3D distance — surfaces
// near the light flare, the far wall barely catches it. Shared by the
// background and the fog puffs (core/bg3dPuffGL.js).
export const LIGHT_GLSL = `
uniform vec3 uLightPos[${MAX_LIGHTS}], uLightCol[${MAX_LIGHTS}]; uniform float uLightR2;
vec3 lightAt(vec3 p) {
  vec3 l = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) { vec3 d = p - uLightPos[i]; l += uLightCol[i] * exp(-dot(d, d) / uLightR2); }
  return l;
}`;

// The vignette (0.00222): the darkening toward the edges that styles.css
// #vignette draws over the flat backgrounds — a full-screen composited
// layer blended over the canvas on every frame (3 MP a frame on a phone).
// Under the live canvas the shaders multiply the same falloff in instead
// (the CSS layer is hidden there, styles.css #bg-stack.gl ~ #vignette):
// the CSS ellipse at the centre reaching the farthest corner (radii W/sqrt2,
// H/sqrt2), its stops 0 at 30%, 0.55 at 75%, 0.9 at 100% of black. The
// look, not tuning (rule 2) — change both together.
export const VIGNETTE_GLSL = `
uniform vec2 uRes;
float vignette() {
  vec2 n = gl_FragCoord.xy / uRes - 0.5;
  float d = length(n) * 1.41421356;
  float a = d < 0.3 ? 0.0 : d < 0.75 ? (d - 0.3) / 0.45 * 0.55 : 0.55 + (min(d, 1.0) - 0.75) / 0.25 * 0.35;
  return 1.0 - a;
}`;

// The haze (0.099) and the flash lights vary slowly across the scene, so
// since 0.101 the ~37k vertices carry them instead of every pixel: the
// pixel shader is one texture read and a blend (fill rate is what weak
// GPUs run out of).
export const VS = `
attribute vec2 aGrid; attribute float aDepth;
uniform mat4 uMVP; uniform vec2 uUvScale, uPlane; uniform float uDepthScale, uPivot, uFog, uHazeMax;
uniform vec4 uHaze; // density, curve, high, strength (parallax.haze, 0.164)
${LIGHT_GLSL}
varying vec2 vUv; varying float vDepth, vHaze; varying vec3 vLit;
void main() {
  vUv = vec2(0.5) + (aGrid - 0.5) * uUvScale;
  vDepth = aDepth;
  // the focal-plane point (distance 1) behind this screen position, pushed
  // along its own ray by depth: no shift at rest, parallax once it sways
  vec3 p = vec3((aGrid.x * 2.0 - 1.0) * uPlane.x, (1.0 - aGrid.y * 2.0) * uPlane.y, -1.0);
  // (floor 0.4: nothing may come nearer than 40% of the focal distance —
  // strong depth + a far focus otherwise folds geometry past the camera)
  vec3 w = p * max(0.4, 1.0 + uDepthScale * (uPivot - aDepth));
  // haze: air thickens with distance (exponential, like real air), a bit
  // less high up (mist hangs low: full near the ground, gone by the top)
  float low = clamp(0.55 - w.y * 1.1, 0.0, 1.0);
  vHaze = clamp((1.0 - exp(-uHaze.x * pow(1.0 - aDepth, uHaze.y))) * mix(uHaze.z, 1.0, low) * uHaze.w * uFog, 0.0, uHazeMax);
  vLit = lightAt(w);
  gl_Position = uMVP * vec4(w, 1.0);
}`;

export const FS = `
precision mediump float;
uniform sampler2D uTex; uniform float uAlpha, uShowDepth; uniform vec3 uFogColor;
varying vec2 vUv; varying float vDepth, vHaze; varying vec3 vLit;
${VIGNETTE_GLSL}
void main() {
  vec3 c = uShowDepth > 0.5 ? vec3(vDepth) : texture2D(uTex, clamp(vUv, 0.0, 1.0)).rgb;
  c += c * vLit * 2.2 + vLit * 0.05;           // the art brightens where lit (keeps its texture) + a faint glow
  c = mix(c, uFogColor + vLit * 0.7, vHaze);   // lit mist glows
  gl_FragColor = vec4(c * vignette(), uAlpha);
}`;

// The art at 64x36 for the fog colour (bg3dFog.js fogColor).
export const SMALL = { w: 64, h: 36 };
export function smallPixels(img, w = SMALL.w, h = SMALL.h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  return { data: cx.getImageData(0, 0, w, h).data, w, h };
}

// A linked program, or null. 0.00223: the shader objects are deleted once
// linked (GL keeps them while the program lives) and everything built so
// far is deleted on a failure — they used to leak with every program.
export function program(gl, vs, fs) {
  const p = gl.createProgram();
  const shaders = [];
  const fail = () => { for (const s of shaders) gl.deleteShader(s); gl.deleteProgram(p); return null; };
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    shaders.push(s);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return fail();
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  for (const s of shaders) gl.deleteShader(s);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : (gl.deleteProgram(p), null);
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

// A picture decoded off the main thread (0.00222): fetch + createImageBitmap
// — texImage2D then copies pixels instead of re-decoding the JPEG on the
// main thread (an <img> handed to it decodes there, ~100 ms for a 2048x1152
// painting, in the room change's own task). The bitmap must be close()d
// once uploaded. Falls back to the <img> path where the browser has no
// createImageBitmap, or when the fetch fails (an opaque cache miss).
export function loadPicture(url) {
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return loadImage(url);
  return fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`image ${url}`))))
    .then((blob) => createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })) // (0.00313: 'from-image' — Chrome deprecated 'none'; the paintings carry no EXIF orientation, and the <img> fallback honours one anyway)
    .catch(() => loadImage(url));
}

// Read a grayscale depth map back to the CPU (depth goes in per vertex):
// { w, h, data: Uint8Array } — 0 = far .. 255 = near.
export function readDepth(img) { // (an <img> or an ImageBitmap, 0.00222)
  const c = document.createElement('canvas');
  c.width = img.naturalWidth ?? img.width; c.height = img.naturalHeight ?? img.height;
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

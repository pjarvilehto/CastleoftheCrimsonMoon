// core/bg3d.js — living backgrounds (0.083). Each painted background gets
// a depth map (assets/bg/depth/<name>.png, Depth Anything V2 Small via
// tools/gen-depth.py; white = near). The image is drawn onto a grid mesh
// whose vertices sit at their depth along the camera ray, so at rest it
// lines up exactly with the flat CSS background; a camera then sways
// slowly around the mid-depth "pivot" plane, and near things slide
// against far things with real perspective.
//
// Cheap on purpose (TVs): ~15k vertices, one texture read per pixel,
// capped at maxFps. The CSS layers in #bg-stack keep running underneath,
// so anything that goes wrong (no WebGL, software-only GL, context loss,
// prefers-reduced-motion) simply leaves the flat backgrounds showing.
// Tuning: backgrounds.json `parallax` (+ per-file `overrides`).

import { DATA } from '../shared/data.js';
import { coverScale, sampleDepth, orbit, buildGrid, mvp, requiredOverscan, joltOffset, withJoltReserve, JOLT_MAX, JOLT_LIFE_MS, swayOffset, SWAY_MAX, SWAY_LIFE_MS } from './bg3dMath.js';

const DEFAULTS = {
  enabled: true, depthScale: 0.5, pivot: 0.5, yawDeg: 2.5, pitchDeg: 1.2,
  yawPeriodS: 22, pitchPeriodS: 31, speed: 1, joltDeg: 0.6, swayPan: 0.04, swayHitShare: 0.15, fovDeg: 40, overscan: 0.14,
  grid: [256, 144], maxFps: 30, fadeMs: 2000,
};

// ?debug tuning sliders (ui/bgTuner.js, 0.084) adjust these live; "Save"
// keeps them in this browser's localStorage (they apply here even without
// ?debug). The shipped values for everyone stay in backgrounds.json.
export const TUNABLE = ['depthScale', 'speed', 'yawDeg', 'pitchDeg', 'pivot'];
const SAVE_KEY = 'castle-bg-tuning';
let live = {};
try { live = JSON.parse(globalThis.localStorage?.getItem(SAVE_KEY) || '{}') || {}; } catch { live = {}; }

export function tuning(file) {
  const p = DATA.backgrounds?.parallax ?? {};
  return { ...DEFAULTS, ...p, ...(p.overrides?.[file] ?? {}), ...live };
}

// Depth map by naming convention, unless backgrounds.json parallax.depthFiles
// names a newer file (a regenerated map gets a NEW name — asset cache rule).
export const depthUrl = (file) =>
  `assets/bg/depth/${DATA.backgrounds?.parallax?.depthFiles?.[file] ?? `${file.replace(/\.[^.]+$/, '')}.png`}`;

export { coverScale, sampleDepth, orbit, buildGrid, mvp } from './bg3dMath.js';

const VS = `
attribute vec2 aGrid; attribute float aDepth;
uniform mat4 uMVP; uniform vec2 uUvScale, uPlane; uniform float uDepthScale, uPivot;
varying vec2 vUv; varying float vDepth;
void main() {
  vUv = vec2(0.5) + (aGrid - 0.5) * uUvScale;
  vDepth = aDepth;
  // the focal-plane point (distance 1) behind this screen position, pushed
  // along its own ray by depth: no shift at rest, parallax once it sways
  vec3 p = vec3((aGrid.x * 2.0 - 1.0) * uPlane.x, (1.0 - aGrid.y * 2.0) * uPlane.y, -1.0);
  // (floor 0.4: nothing may come nearer than 40% of the focal distance —
  // strong depth + a far focus otherwise folds geometry past the camera)
  gl_Position = uMVP * vec4(p * max(0.4, 1.0 + uDepthScale * (uPivot - aDepth)), 1.0);
}`;
const FS = `
precision mediump float;
uniform sampler2D uTex; uniform float uAlpha, uShowDepth;
varying vec2 vUv; varying float vDepth;
void main() {
  vec3 c = uShowDepth > 0.5 ? vec3(vDepth) : texture2D(uTex, clamp(vUv, 0.0, 1.0)).rgb;
  gl_FragColor = vec4(c, uAlpha);
}`;

let gl = null, canvas = null, loc = null, gridBuf = null, idxBuf = null, grid = null;
let layers = []; // bottom -> top: { file, tex, depthBuf, depth, img, uvScale, born }
let view = '3d'; // '3d' | 'flat' | 'depth' (debug)
let t0 = null, lastDraw = 0, wanted = null, cfg = DEFAULTS;
let tau = 0;     // sway clock: seconds x speed, accumulated per frame so a
                 // speed change never jumps the camera
let gridM = -1;  // overscan the current grid was built with
let jolts = [];  // active camera kicks: { t0, amp (rad), dir }
let sways = [];  // active big-hit sways: { t0, amp (pan), dir }

// A big hit kicks the background camera (0.088). strength 1 = joltDeg.
export function bgJolt(strength = 1) {
  if (!gl || view === 'flat' || !(cfg.joltDeg > 0)) return;
  const amp = (cfg.joltDeg * Math.min(JOLT_MAX, strength) * Math.PI) / 180;
  jolts.push({ t0: performance.now(), amp, dir: Math.random() < 0.5 ? -1 : 1 });
}

// The heaviest blows shove the background sideways (0.092): dir +1 = the
// art swings right (the knight's hits), -1 = left (hits on the knight).
export function bgSway(strength = 1, dir = 1) {
  if (!gl || view === 'flat' || !(cfg.swayPan > 0)) return;
  sways.push({ t0: performance.now(), amp: cfg.swayPan * Math.min(SWAY_MAX, strength), dir: dir < 0 ? -1 : 1 });
}
let watchdog = null; // { frames, since } — first seconds' frame rate check

export const isBg3dActive = () => !!gl;
export const bgView = () => view;
export function setBgView(v) { view = v; }

// Returns true when the 3D renderer is running. allowSoftware: accept
// software-rendered GL (debug/headless only — too slow for real players).
export function initBg3d({ allowSoftware = false } = {}) {
  cfg = tuning('');
  if (!cfg.enabled || gl) return !!gl;
  if (!allowSoftware && globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  canvas = document.createElement('canvas');
  canvas.id = 'bg3d';
  const opts = { alpha: false, antialias: false, depth: true, premultipliedAlpha: false,
    powerPreference: 'low-power', failIfMajorPerformanceCaveat: !allowSoftware };
  gl = canvas.getContext?.('webgl2', opts) || canvas.getContext?.('webgl', opts) || null;
  if (!gl) return false;
  // Weak devices: if the first seconds can't hold ~20fps, go back to the
  // flat CSS backgrounds rather than make the whole game stutter.
  watchdog = allowSoftware ? null : { frames: 0, since: null };
  const prog = program(VS, FS);
  if (!prog) { gl = null; return false; }
  gl.useProgram(prog);
  loc = {};
  for (const n of ['aGrid', 'aDepth']) loc[n] = gl.getAttribLocation(prog, n);
  for (const n of ['uMVP', 'uUvScale', 'uPlane', 'uDepthScale', 'uPivot', 'uTex', 'uAlpha', 'uShowDepth']) loc[n] = gl.getUniformLocation(prog, n);
  gridBuf = gl.createBuffer();
  refit(); // builds the grid
  idxBuf = buffer(gl.ELEMENT_ARRAY_BUFFER, grid.idx);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  document.getElementById('bg-stack').append(canvas);
  canvas.addEventListener('webglcontextlost', shutdown);
  globalThis.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
  return true;
}

// Background changed (scene.js onBackgroundChange). Loads async; only the
// most recent request becomes visible. First one appears instantly.
export async function showBackground3d(file) {
  if (!gl) return;
  wanted = file;
  let layer;
  try { layer = await loadLayer(file); } catch { return; } // flat CSS keeps showing
  if (!gl || wanted !== file) { if (layer) dropLayer(layer); return; }
  layer.born = layers.length ? performance.now() : -Infinity; // first: no fade
  layers.push(layer);
  while (layers.length > 2) dropLayer(layers.shift());
}

async function loadLayer(file) {
  const [img, dimg] = await Promise.all([loadImage(`assets/bg/${file}`), loadImage(depthUrl(file)).catch(() => null)]);
  if (!gl) return null;
  let depth = null;
  if (dimg) { // read the grayscale map back to CPU: depth goes in per vertex
    const c = document.createElement('canvas');
    c.width = dimg.naturalWidth; c.height = dimg.naturalHeight;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(dimg, 0, 0);
    const px = cx.getImageData(0, 0, c.width, c.height).data;
    const data = new Uint8Array(c.width * c.height);
    for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
    depth = { w: c.width, h: c.height, data };
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (webgl2) gl.generateMipmap(gl.TEXTURE_2D); // NPOT mips need WebGL2; smoother when the canvas is smaller than the art
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, webgl2 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const layer = { file, tex, depth, img: { w: img.naturalWidth, h: img.naturalHeight }, depthBuf: gl.createBuffer(), tune: tuning(file) };
  fillDepth(layer);
  return layer;
}

// Per-vertex depth at each vertex's cover-mapped uv (redone on resize).
function fillDepth(L) {
  L.uvScale = coverScale(canvas.width, canvas.height, L.img.w, L.img.h);
  const n = grid.g.length / 2;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = 0.5 + (grid.g[i * 2] - 0.5) * L.uvScale[0];
    const v = 0.5 + (grid.g[i * 2 + 1] - 0.5) * L.uvScale[1];
    a[i] = L.depth ? sampleDepth(L.depth, u, v) : L.tune.pivot; // no map: flat
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, L.depthBuf);
  gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
}

function frame(now) {
  if (!gl) return;
  requestAnimationFrame(frame);
  jolts = jolts.filter((j) => now - j.t0 < JOLT_LIFE_MS);
  sways = sways.filter((s) => now - s.t0 < SWAY_LIFE_MS);
  // full frame rate while a jolt/sway plays — at 30fps it would stutter
  if (!layers.length || (!jolts.length && !sways.length && now - lastDraw < 1000 / cfg.maxFps - 2)) return;
  lastDraw = now;
  if (t0 === null) { t0 = now; canvas.classList.add('ready'); } // rest pose = the CSS image
  else tau += ((now - t0) / 1000) * cfg.speed;
  t0 = now;
  if (watchdog) {
    watchdog.since ??= now;
    watchdog.frames++;
    const elapsed = now - watchdog.since;
    if (elapsed > 4000) {
      const fps = ((watchdog.frames - 1) * 1000) / elapsed;
      watchdog = null;
      if (fps < (cfg.minFps ?? 20)) { shutdown(); return; }
    }
  }
  const o = view === 'flat' ? { yaw: 0, pitch: 0 } : orbit(tau, cfg);
  const j = joltOffset(jolts, now);
  o.yaw += j.yaw;
  o.pitch += j.pitch;
  const fov = (cfg.fovDeg * Math.PI) / 180;
  const aspect = canvas.width / canvas.height;
  gl.uniformMatrix4fv(loc.uMVP, false, mvp(o.yaw, o.pitch, fov, aspect, swayOffset(sways, now)));
  gl.uniform2f(loc.uPlane, Math.tan(fov / 2) * aspect, Math.tan(fov / 2));
  gl.uniform1f(loc.uShowDepth, view === 'depth' ? 1 : 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  layers.forEach((L, i) => {
    // crossfade like the CSS layers (2s ease-in-out): new layer over old
    const t = i === 0 ? 1 : Math.min(1, (now - L.born) / cfg.fadeMs);
    gl.clear(gl.DEPTH_BUFFER_BIT); // each layer is its own 3D scene
    draw(L, t * t * (3 - 2 * t));
  });
  if (layers.length > 1 && now - layers[layers.length - 1].born >= cfg.fadeMs) {
    while (layers.length > 1) dropLayer(layers.shift());
  }
}

function draw(L, alpha) {
  gl.uniform2f(loc.uUvScale, L.uvScale[0], L.uvScale[1]);
  gl.uniform1f(loc.uDepthScale, view === 'flat' ? 0 : L.tune.depthScale);
  gl.uniform1f(loc.uPivot, L.tune.pivot);
  gl.uniform1f(loc.uAlpha, alpha);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, L.tex);
  gl.uniform1i(loc.uTex, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
  gl.enableVertexAttribArray(loc.aGrid);
  gl.vertexAttribPointer(loc.aGrid, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, L.depthBuf);
  gl.enableVertexAttribArray(loc.aDepth);
  gl.vertexAttribPointer(loc.aDepth, 1, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.drawElements(gl.TRIANGLES, grid.idx.length, gl.UNSIGNED_SHORT, 0);
}

function resize() {
  if (!gl) return;
  // Backing store: device pixels, capped near the art's own width (2048) —
  // rendering past it only costs fill rate.
  const s = Math.min(globalThis.devicePixelRatio || 1, 2560 / Math.max(1, canvas.clientWidth));
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * s));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * s));
  gl.viewport(0, 0, canvas.width, canvas.height);
  refit();
  layers.forEach(fillDepth);
}

// (Re)build the screen grid when the needed skirt changes: the shipped
// overscan, or more when the sliders ask for more sway/depth.
function refit() {
  const m = Math.max(cfg.overscan, requiredOverscan(withJoltReserve(cfg), canvas.width / canvas.height || 16 / 9));
  if (Math.abs(m - gridM) < 0.005) return false;
  gridM = m;
  grid = buildGrid(cfg.grid[0], cfg.grid[1], m);
  gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
  gl.bufferData(gl.ARRAY_BUFFER, grid.g, gl.STATIC_DRAW);
  return true;
}

// ---- live tuning (?debug sliders) ----
export function liveTuning() {
  return Object.fromEntries(TUNABLE.map((k) => [k, cfg[k]]));
}

export function setLiveTuning(partial) {
  live = { ...live, ...partial };
  cfg = tuning('');
  layers.forEach((L) => { L.tune = tuning(L.file); });
  if (gl && refit()) layers.forEach(fillDepth);
}

// Keep the current values in this browser; returns them as JSON (the
// sliders copy it to the clipboard so it can be sent over as the default).
export function saveLiveTuning() {
  const values = liveTuning();
  try { globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify(values)); } catch { /* private mode */ }
  return JSON.stringify(values);
}

export function resetLiveTuning() {
  live = {};
  try { globalThis.localStorage?.removeItem(SAVE_KEY); } catch { /* private mode */ }
  setLiveTuning({});
}

// Context lost (GPU reset, driver hiccup): give up, the CSS layers show.
function shutdown(e) {
  e?.preventDefault?.();
  gl = null;
  layers = [];
  canvas?.remove();
}

function dropLayer(L) {
  if (!gl || !L) return;
  gl.deleteTexture(L.tex);
  gl.deleteBuffer(L.depthBuf);
}

function program(vs, fs) {
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

function buffer(target, data) {
  const b = gl.createBuffer();
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return b;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img));
    img.onerror = () => reject(new Error(`image ${url}`));
    img.src = url;
  });
}

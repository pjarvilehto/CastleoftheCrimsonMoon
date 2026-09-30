// core/bg3d.js — living backgrounds (0.083). Each painted background gets
// a depth map (assets/bg/depth/<name>.png, Depth Anything V2 Small via
// tools/gen-depth.py; white = near). The image is drawn onto a grid mesh
// whose vertices sit at their depth along the camera ray, so at rest it
// lines up exactly with the flat CSS background; a camera then sways
// slowly around the mid-depth "pivot" plane, and near things slide
// against far things with real perspective.
//
// Cheap on purpose (TVs): ~37k vertices (256x144 grid), one texture read per pixel,
// capped at maxFps. The CSS layers in #bg-stack keep running underneath,
// so anything that goes wrong (no WebGL, software-only GL, context loss,
// prefers-reduced-motion) simply leaves the flat backgrounds showing.
// Tuning: backgrounds.json `parallax` (+ per-file `overrides`).

import { DATA } from '../shared/data.js';
import { coverScale, sampleDepth, orbit, buildGrid, mvp, requiredOverscan, joltOffset, withJoltReserve, JOLT_MAX, JOLT_LIFE_MS, swayOffset, SWAY_MAX, SWAY_LIFE_MS } from './bg3dMath.js';
import { VS, FS, program, buffer, loadImage, readDepth, makeTexture, makeNoiseTexture, smallPixels } from './bg3dGL.js';
import { cameraPos, driftOffsets, fogColor } from './bg3dFog.js';
import { LIGHT_DEFAULTS, flashAt, activeLights } from './bg3dLights.js';

const DEFAULTS = {
  enabled: true, depthScale: 0.5, pivot: 0.5, yawDeg: 2.5, pitchDeg: 1.2,
  yawPeriodS: 22, pitchPeriodS: 31, speed: 1, joltDeg: 0.6, swayDeg: 1.6, swayHitShare: 0.15, fovDeg: 40, overscan: 0.09,
  grid: [256, 144], maxFps: 30, fadeMs: 2000,
  // fog (0.099, core/bg3dFog.js): amount per background (overrides), a
  // global multiplier (the ?debug slider), drift speed, fade-in on handover
  fog: 0.36, fogScale: 1, fogSpeed: 1, fogFadeMs: 2500,
  minFps: 20, fogMinFps: 26, // weak devices: drop the fog below fogMinFps, then the 3D below minFps
  lights: LIGHT_DEFAULTS, // flash lights (0.100, core/bg3dLights.js)
};

// ?debug tuning sliders (ui/bgTuner.js, 0.084) adjust these live; "Save"
// keeps them in this browser's localStorage (they apply here even without
// ?debug). The shipped values for everyone stay in backgrounds.json.
export const TUNABLE = ['depthScale', 'speed', 'yawDeg', 'pitchDeg', 'pivot', 'fogScale'];
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

let gl = null, canvas = null, loc = null, gridBuf = null, idxBuf = null, grid = null;
let layers = []; // bottom -> top: { file, tex, depthBuf, depth, img, uvScale, born }
let view = '3d'; // '3d' | 'flat' | 'depth' (debug)
let t0 = null, lastDraw = 0, wanted = null, cfg = DEFAULTS;
let tau = 0;     // sway clock: seconds x speed, accumulated per frame so a
                 // speed change never jumps the camera
let gridM = -1;  // overscan the current grid was built with
let jolts = [];  // active camera kicks: { t0, amp (rad), dir }
let sways = [];  // active big-hit sways: { t0, amp (rad), dir }
let noiseTex = null;  // the fog wisps' tileable noise (0.099)
let fogIn = 0;        // 0..1 fog fade-in after the handover from the CSS image
let fogOn = true;     // false once the watchdog gave the fog up on a weak device
let firstFrame = null;
let flashes = [];     // live flash lights: { t0, pos, color, strength, fade, life }

// A big hit kicks the background camera (0.088). strength 1 = joltDeg.
export function bgJolt(strength = 1) {
  if (!gl || view === 'flat' || !(cfg.joltDeg > 0)) return;
  const amp = (cfg.joltDeg * Math.min(JOLT_MAX, strength) * Math.PI) / 180;
  jolts.push({ t0: performance.now(), amp, dir: Math.random() < 0.5 ? -1 : 1 });
}

// A crit, potion or revive lights the scene around the character (0.100):
// kind = a key of parallax.lights; rect = the character's card on screen.
export function bgLight(kind, rect) {
  if (!gl || view !== '3d') return;
  const f = flashAt(kind, rect, canvas.clientWidth || 1, canvas.clientHeight || 1, cfg.fovDeg, cfg.lights, performance.now());
  if (f) flashes.push(f);
}

// The heaviest blows rock the background about its depth centre (0.092,
// a rotation since 0.093): dir +1 = the near art swings right (the
// knight's hits), -1 = left (hits on the knight).
export function bgSway(strength = 1, dir = 1) {
  if (!gl || view === 'flat' || !(cfg.swayDeg > 0)) return;
  const amp = (cfg.swayDeg * Math.min(SWAY_MAX, strength) * Math.PI) / 180;
  sways.push({ t0: performance.now(), amp, dir: dir < 0 ? -1 : 1 });
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
  const prog = program(gl, VS, FS);
  if (!prog) { gl = null; return false; }
  gl.useProgram(prog);
  loc = {};
  for (const n of ['aGrid', 'aDepth']) loc[n] = gl.getAttribLocation(prog, n);
  for (const n of ['uMVP', 'uUvScale', 'uPlane', 'uDepthScale', 'uPivot', 'uTex', 'uAlpha', 'uShowDepth',
    'uNoise', 'uFog', 'uFogColor', 'uCam', 'uDrift', 'uLightPos', 'uLightCol', 'uLightR2']) loc[n] = gl.getUniformLocation(prog, n);
  noiseTex = makeNoiseTexture(gl);
  gridBuf = gl.createBuffer();
  refit(); // builds the grid
  idxBuf = buffer(gl, gl.ELEMENT_ARRAY_BUFFER, grid.idx);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  document.getElementById('bg-stack').append(canvas);
  canvas.addEventListener('webglcontextlost', shutdown);
  // Debounced (0.097): every resize re-samples ~37k vertex depths per layer,
  // and a window drag fires dozens of events a second.
  let resizeTimer = null;
  globalThis.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });
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
  const depth = dimg ? readDepth(dimg) : null;
  const tune = tuning(file);
  // the mist takes the colour of the scene's own distance (0.099)
  const mist = tune.fogColor ?? fogColor(smallPixels(img), 64, 36, (u, v) => (depth ? sampleDepth(depth, u, v) : 0.5));
  const tex = makeTexture(gl, img);
  const layer = { file, tex, depth, mist, img: { w: img.naturalWidth, h: img.naturalHeight }, depthBuf: gl.createBuffer(), tune };
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
  flashes = flashes.filter((f) => now - f.t0 < f.life * 1000);
  // full frame rate while a jolt/sway/flash plays — at 30fps it would stutter
  if (!layers.length || (!jolts.length && !sways.length && !flashes.length && now - lastDraw < 1000 / cfg.maxFps - 2)) return;
  lastDraw = now;
  if (t0 === null) { t0 = now; firstFrame = now; canvas.classList.add('ready'); } // rest pose = the CSS image
  else tau += ((now - t0) / 1000) * cfg.speed;
  t0 = now;
  if (watchdog) {
    watchdog.since ??= now;
    watchdog.frames++;
    const elapsed = now - watchdog.since;
    if (elapsed > 4000) {
      const fps = ((watchdog.frames - 1) * 1000) / elapsed;
      if (fogOn && fps < cfg.fogMinFps) {
        fogOn = false; // first give up the mist (0.099) and measure again
        watchdog = { frames: 0, since: null };
      } else {
        watchdog = null;
        if (fps < cfg.minFps) { shutdown(); return; }
      }
    }
  }
  const o = view === 'flat' ? { yaw: 0, pitch: 0 } : orbit(tau, cfg);
  const j = joltOffset(jolts, now);
  o.yaw += j.yaw + swayOffset(sways, now);
  o.pitch += j.pitch;
  const fov = (cfg.fovDeg * Math.PI) / 180;
  const aspect = canvas.width / canvas.height;
  gl.uniformMatrix4fv(loc.uMVP, false, mvp(o.yaw, o.pitch, fov, aspect));
  gl.uniform2f(loc.uPlane, Math.tan(fov / 2) * aspect, Math.tan(fov / 2));
  gl.uniform1f(loc.uShowDepth, view === 'depth' ? 1 : 0);
  // fog: the camera for the wisps' rays, their drift, and a fade-in so the
  // mist rises after the handover instead of popping in
  gl.uniform3fv(loc.uCam, cameraPos(o.yaw, o.pitch));
  gl.uniform2fv(loc.uDrift, new Float32Array(driftOffsets((now / 1000) * cfg.fogSpeed).flat()));
  fogIn = Math.min(1, (now - firstFrame) / cfg.fogFadeMs);
  const lit = activeLights(view === '3d' ? flashes : [], now);
  gl.uniform3fv(loc.uLightPos, lit.pos);
  gl.uniform3fv(loc.uLightCol, lit.col);
  gl.uniform1f(loc.uLightR2, (cfg.lights?.radius ?? 0.45) ** 2);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, noiseTex);
  gl.uniform1i(loc.uNoise, 1);
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
  gl.uniform1f(loc.uFog, fogOn && view === '3d' ? L.tune.fog * cfg.fogScale * fogIn : 0);
  gl.uniform3fv(loc.uFogColor, L.mist);
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

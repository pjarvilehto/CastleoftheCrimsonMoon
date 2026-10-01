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

import { coverScale, sampleDepth, orbit, buildGrid, mvp, requiredOverscan, joltOffset, withJoltReserve, JOLT_MAX, JOLT_LIFE_MS, swayOffset, SWAY_MAX, SWAY_LIFE_MS } from './bg3dMath.js';
import { VS, FS, program, buffer, loadImage, readDepth, makeTexture, smallPixels } from './bg3dGL.js';
import { fogColor } from './bg3dFog.js';
import { makePuffs, puffFrame, seedOf } from './bg3dPuffs.js';
import { TUNABLE, tuning, depthUrl, setLive, storeLive } from './bg3dTuning.js';
import { createPuffRenderer, depthTexture } from './bg3dPuffGL.js';
import { flashAt, activeLights } from './bg3dLights.js';
import { LADDER, SLOW_WINDOWS, backingSize, fpsWindow } from './bg3dQuality.js';

export { TUNABLE, tuning, depthUrl } from './bg3dTuning.js';

let gl = null, canvas = null, loc = null, gridBuf = null, idxBuf = null, grid = null;
let layers = []; // bottom -> top: { file, tex, depth, depthBuf, depthTex, img, uvScale, mist, tune, puffs, born }
let view = '3d'; // '3d' | 'flat' | 'depth' (debug)
let t0 = null, lastDraw = 0, wanted = null, cfg = null; // cfg: tuning(''), from initBg3d on
let tau = 0;     // sway clock: seconds x speed, accumulated per frame so a
                 // speed change never jumps the camera
let gridM = -1;  // overscan the current grid was built with
let jolts = [];  // active camera kicks: { t0, amp (rad), dir }
let sways = [];  // active big-hit sways: { t0, amp (rad), dir }
let mainProg = null, puffR = null; // the background program; the fog puffs' renderer (0.101)
let fogT = 0;         // fog clock: seconds x fogSpeed (accumulated, like tau)
let fogIn = 0;        // 0..1 fog fade-in after the handover from the CSS image
let fogOn = true;     // false once the quality ladder gave the fog up
let level = 0;        // quality ladder step (core/bg3dQuality.js)
let fpsW = null;      // frame-rate window; monitor = false: never degrade (debug/headless)
let monitor = false;
let held = false;      // holdQuality(): the benchmark measures without stepping down (0.131)
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

export const isBg3dActive = () => !!gl;
// The quality ladder step (0 = full; core/bg3dQuality.js) — the particles
// drop their resolution with it (0.129).
export const bgQualityLevel = () => level;
// The benchmark (0.131) holds the quality ladder: it measures this machine
// as it is, and a slow stretch under test must not lower the quality for
// the rest of the session.
export function holdQuality(on) { held = !!on; fpsW = null; }

// The GPU's name for the play stats (0.130, core/perfMonitor.js), or null.
export function gpuName() {
  if (!gl) return null;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '') || null;
  } catch { return null; }
}
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
  // Weak devices: the quality ladder steps down while the frame rate stays
  // under minFps — resolution, then fog, then the flat CSS backgrounds.
  monitor = !allowSoftware;
  const prog = program(gl, VS, FS);
  if (!prog) { gl = null; return false; }
  mainProg = prog;
  loc = {};
  for (const n of ['aGrid', 'aDepth']) loc[n] = gl.getAttribLocation(prog, n);
  for (const n of ['uMVP', 'uUvScale', 'uPlane', 'uDepthScale', 'uPivot', 'uTex', 'uAlpha', 'uShowDepth',
    'uFog', 'uFogColor', 'uHaze', 'uHazeMax', 'uLightPos', 'uLightCol', 'uLightR2']) loc[n] = gl.getUniformLocation(prog, n);
  puffR = createPuffRenderer(gl); // null: the haze alone
  gl.useProgram(prog);
  gridBuf = gl.createBuffer();
  refit(); // builds the grid
  idxBuf = buffer(gl, gl.ELEMENT_ARRAY_BUFFER, grid.idx);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  document.getElementById('bg-stack').append(canvas);
  canvas.addEventListener('webglcontextlost', shutdown);
  globalThis.addEventListener('resize', onResize);
  resize();
  requestAnimationFrame(frame);
  return true;
}

// Background changed (scene.js onBackgroundChange). Loads async; only the
// most recent request becomes visible. First one appears instantly.
// Resolves once the new layer has fully faded in (0.154: the windows wait
// for it, scene.js transitionTo).
export async function showBackground3d(file) {
  if (!gl) return;
  wanted = file;
  let layer;
  try { layer = await loadLayer(file); } catch { return; } // flat CSS keeps showing
  if (!gl || wanted !== file) { if (layer) dropLayer(layer); return; }
  layer.born = layers.length ? performance.now() : -Infinity; // first: no fade
  layers.push(layer);
  while (layers.length > 2) dropLayer(layers.shift());
  if (layer.born !== -Infinity) await new Promise((resolve) => setTimeout(resolve, cfg.fadeMs));
}

async function loadLayer(file) {
  const [img, dimg] = await Promise.all([loadImage(`assets/bg/${file}`), loadImage(depthUrl(file)).catch(() => null)]);
  if (!gl) return null;
  const depth = dimg ? readDepth(dimg) : null;
  const tune = tuning(file);
  // the mist takes the colour of the scene's own distance (0.099)
  const mist = tune.fogColor ?? fogColor(smallPixels(img), 64, 36, (u, v) => (depth ? sampleDepth(depth, u, v) : 0.5));
  const tex = makeTexture(gl, img);
  const layer = { file, tex, depth, mist, img: { w: img.naturalWidth, h: img.naturalHeight }, depthBuf: gl.createBuffer(), tune,
    depthTex: depthTexture(gl, dimg, tune.pivot), puffs: makePuffs(seedOf(file), tune.puffs) };
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

// A gap longer than this between frames (a hidden tab, a sleeping laptop)
// is a pause, not motion: the sway and fog clocks skip it instead of
// jumping the camera (0.157; the frame-rate windows treat it the same way).
const PAUSE_S = 0.4;

function frame(now) {
  if (!gl) return;
  requestAnimationFrame(frame);
  // (filtered only while something plays: the quiet frame makes no garbage)
  if (jolts.length) jolts = jolts.filter((j) => now - j.t0 < JOLT_LIFE_MS);
  if (sways.length) sways = sways.filter((s) => now - s.t0 < SWAY_LIFE_MS);
  if (flashes.length) flashes = flashes.filter((f) => now - f.t0 < f.life * 1000);
  // full frame rate while a jolt/sway/flash plays — at 30fps it would stutter
  if (!layers.length || (!jolts.length && !sways.length && !flashes.length && now - lastDraw < 1000 / cfg.maxFps - 2)) return;
  lastDraw = now;
  if (t0 === null) { t0 = now; firstFrame = now; canvas.classList.add('ready'); } // rest pose = the CSS image
  else { const dt = Math.min(PAUSE_S, (now - t0) / 1000); tau += dt * cfg.speed; fogT += dt * cfg.fogSpeed; }
  t0 = now;
  if (monitor && !held) {
    fpsW = fpsWindow(fpsW, now, cfg.minFps);
    if (fpsW.slow >= SLOW_WINDOWS && !degrade()) return;
  }
  const o = view === 'flat' ? { yaw: 0, pitch: 0 } : orbit(tau, cfg);
  const j = joltOffset(jolts, now);
  o.yaw += j.yaw + swayOffset(sways, now);
  o.pitch += j.pitch;
  const fov = (cfg.fovDeg * Math.PI) / 180;
  const aspect = canvas.width / canvas.height;
  const f = { mvp: mvp(o.yaw, o.pitch, fov, aspect), plane: [Math.tan(fov / 2) * aspect, Math.tan(fov / 2)],
    lights: activeLights(view === '3d' ? flashes : [], now), r2: cfg.lights.radius ** 2 };
  gl.uniformMatrix4fv(loc.uMVP, false, f.mvp);
  gl.uniform2fv(loc.uPlane, f.plane);
  gl.uniform1f(loc.uShowDepth, view === 'depth' ? 1 : 0);
  fogIn = Math.min(1, (now - firstFrame) / cfg.fogFadeMs); // the mist rises after the handover
  gl.uniform3fv(loc.uLightPos, f.lights.pos);
  gl.uniform3fv(loc.uLightCol, f.lights.col);
  gl.uniform1f(loc.uLightR2, f.r2);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  layers.forEach((L, i) => {
    // crossfade like the CSS layers (2s ease-in-out): new layer over old
    const t = i === 0 ? 1 : Math.min(1, (now - L.born) / cfg.fadeMs), ease = t * t * (3 - 2 * t);
    gl.clear(gl.DEPTH_BUFFER_BIT); // each layer is its own 3D scene
    draw(L, ease);
    drawPuffs(L, ease, f);
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
  gl.uniform1f(loc.uFog, fogAmount(L));
  gl.uniform3fv(loc.uFogColor, L.mist);
  const H = L.tune.haze;
  gl.uniform4f(loc.uHaze, H.density, H.curve, H.high, H.strength);
  gl.uniform1f(loc.uHazeMax, H.max);
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
  gl.disableVertexAttribArray(loc.aGrid); // the puffs' program has other attributes
  gl.disableVertexAttribArray(loc.aDepth);
}

const fogAmount = (L) => (fogOn && view === '3d' ? L.tune.fog * cfg.fogScale * fogIn : 0);

// The scene's fog puffs over it (0.101, core/bg3dPuffGL.js).
function drawPuffs(L, alpha, f) {
  const amount = fogAmount(L);
  if (!puffR || !(amount > 0)) return;
  const P = L.tune.puffs;
  puffR.draw(puffFrame(L.puffs, fogT, P, L.tune.fogWind), { ...f, uvScale: L.uvScale, depthScale: L.tune.depthScale,
    pivot: L.tune.pivot, depthTex: L.depthTex, artTex: L.tex, mist: L.mist, soft: P.soft, amount: amount * P.opacity, alpha,
    flow: [fogT * P.flow, P.flowScale, P.flowAmount], light: L.tune.mist,
    width: canvas.width, height: canvas.height });
  gl.useProgram(mainProg);
}

// Too slow: one step down the quality ladder (core/bg3dQuality.js).
// false = past the last step, back to the flat backgrounds.
function degrade() {
  level++;
  fpsW = null; // measure the new step afresh
  if (level >= LADDER.length) { shutdown(); return false; }
  fogOn = LADDER[level].fog;
  resize();
  return true;
}

// Debounced (0.097): every resize re-samples ~37k vertex depths per layer,
// and a window drag fires dozens of events a second.
let resizeTimer = null;
function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); }

function resize() {
  if (!gl) return;
  // Backing store: device pixels, but at most maxPixels (the art is 2048
  // wide), times the quality ladder's scale (core/bg3dQuality.js).
  [canvas.width, canvas.height] = backingSize(canvas.clientWidth, canvas.clientHeight,
    globalThis.devicePixelRatio, cfg.maxPixels, LADDER[level].scale);
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
  setLive(partial);
  cfg = tuning('');
  layers.forEach((L) => {
    const was = JSON.stringify(L.tune.puffs);
    L.tune = tuning(L.file);
    // a changed puff block re-rolls the set (the same seed: the puffs keep
    // their places, only the changed ranges show — the Fog Lab, 0.164)
    if (JSON.stringify(L.tune.puffs) !== was) L.puffs = makePuffs(seedOf(L.file), L.tune.puffs);
  });
  if (gl && refit()) layers.forEach(fillDepth);
}

// Keep the current values in this browser; returns them as JSON (the
// sliders copy it to the clipboard so it can be sent over as the default).
export function saveLiveTuning() {
  const values = liveTuning();
  storeLive(values);
  return JSON.stringify(values);
}

export function resetLiveTuning() {
  storeLive(null);
  setLiveTuning({});
}

// Give up — the CSS layers show: context lost (GPU reset, driver hiccup;
// nothing restores it, so the event's default stands), or the quality
// ladder's last step. 0.157: frees the programs, buffers and textures and
// releases the context (a leaked one counted against the browser's cap),
// and forgets its clocks so a later initBg3d starts clean.
function shutdown() {
  if (gl) {
    if (!gl.isContextLost()) {
      layers.forEach(dropLayer);
      puffR?.dispose();
      gl.deleteProgram(mainProg);
      gl.deleteBuffer(gridBuf);
      gl.deleteBuffer(idxBuf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    canvas.removeEventListener('webglcontextlost', shutdown);
    globalThis.removeEventListener?.('resize', onResize);
    clearTimeout(resizeTimer);
  }
  gl = null; puffR = null; mainProg = null; layers = []; grid = null; gridM = -1;
  t0 = null; firstFrame = null; fpsW = null; jolts = []; sways = []; flashes = [];
  canvas?.remove();
  canvas = null;
}

function dropLayer(L) {
  if (!gl || !L) return;
  gl.deleteTexture(L.tex);
  gl.deleteTexture(L.depthTex);
  gl.deleteBuffer(L.depthBuf);
}

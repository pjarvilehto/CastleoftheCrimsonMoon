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
import { VS, FS, program, buffer, loadPicture, readDepth, makeTexture, smallPixels } from './bg3dGL.js';
import { fogColor } from './bg3dFog.js';
import { makePuffs, puffFrame, seedOf } from './bg3dPuffs.js';
import { TUNABLE, tuning, depthUrl, setLive, storeLive } from './bg3dTuning.js';
import { createPuffRenderer, depthTexture } from './bg3dPuffGL.js';
import { flashAt, activeLights, screenToWorld } from './bg3dLights.js';
import { LADDER, backingSize, fpsWindow, slowAt, nextStep } from './bg3dQuality.js';
import { reducedMotion } from '../shared/motion.js';
import { span } from './perfSpans.js';

export { TUNABLE, tuning, depthUrl } from './bg3dTuning.js';

let gl = null, canvas = null, loc = null, gridBuf = null, idxBuf = null, grid = null;
let layers = []; // bottom -> top: { file, tex, depth, depthBuf, depthTex, img, uvScale, mist, tune, puffs, born }
let view = '3d'; // '3d' | 'flat' | 'depth' (debug)
let t0 = null, lastDraw = 0, wanted = null, cfg = null; // cfg: tuning(''), from initBg3d on
let gridM = -1;  // overscan the current grid was built with
let jolts = [];  // active camera kicks: { t0, amp (rad), dir }
let sways = [];  // active big-hit sways: { t0, amp (rad), dir }
let mainProg = null, puffR = null; // the background program; the fog puffs' renderer (0.101)
let fogIn = 0;        // 0..1 fog fade-in after the handover from the CSS image
let fogOn = true;     // false once the quality ladder gave the fog up
let level = 0;        // quality ladder step (core/bg3dQuality.js)
let fpsW = null;      // frame-rate window; monitor = false: never degrade (debug/headless)
let monitor = false;
let held = false;      // holdQuality(): the benchmark measures without stepping down (0.131)
let firstFrame = null;
let flashes = [];     // live flash lights: { t0, pos, color, strength, fade, life }
let push = null;      // the room transition's camera push (0.171): { t0, rel } — rel: eased back, no new painting came

// The windows started fading for a room change (scene.js transitionTo):
// the camera starts pushing into the painting now, so the new one can
// appear pushed in and pull back — one movement (parallax.push).
export function bgPush() {
  if (!gl || !layers.length || view === 'flat' || !(cfg.push.dist > 0)) return; // no painting on screen yet (the boot's first transition, or a first layer that failed to load): nothing to push through — the flat fallback skips it too (scene.js, activeBg null); 0.00223: the title painting zoomed in 16% and back out over eight seconds
  push = { t0: performance.now(), rel: null };
}

// The title's fly-in hands over to the painting (0.00310, ui/titleIntro.js):
// called as the film's fade begins, while it still covers the canvas. The
// camera goes back to the rest pose — orbit's t = 0, pixel-identical to the
// flat painting the film ends on (by the hand-over the sway had reached its
// full 2.5°, a parallax jump under the fade) — any kick, sway or push is
// dropped, and the mist and the haze rise again over fogFadeMs, the picture
// coming alive as the film goes.
export function bgArrive() {
  if (!gl) return;
  layers.forEach((L) => { L.tau = 0; }); jolts = []; sways = []; push = null;
  arrived = performance.now();
  if (firstFrame !== null) firstFrame = arrived;
}
let arrived = null; // the hand-over's moment while the sway ramps in (fogFadeMs), else null

const easeIn = (t) => t * t, easeOut = (t) => 1 - (1 - t) * (1 - t);
const unit = (t) => Math.min(1, Math.max(0, t));
// How far the camera is into layer L's picture right now.
function dollyOf(L, now, last) {
  if (!push) return 0;
  const { dist, inMs, outMs } = cfg.push;
  if (last && L.born > push.t0 && !(push.rel && L.born >= push.rel)) return dist * (1 - easeOut(unit((now - L.born) / outMs))); // the new painting pulls back to rest (one that came after the ease-back began rides it with the old one, 0.00223: it used to appear at full depth over a painting at rest and pull back a second time — transitionTo gives the windows back at BG_WAIT_MAX_MS, the push eases back at inMs + fadeMs, and a streaming room painting can land between)
  const d = dist * easeIn(unit((now - push.t0) / inMs));
  return push.rel ? d * (1 - easeOut(unit((now - push.rel) / outMs))) : d; // the old one keeps going in (or eases back)
}
// Over? (the new painting is at rest, or the old one eased back)
function settlePush(now) {
  const { inMs, outMs } = cfg.push;
  const top = layers[layers.length - 1];
  if (!push.rel && top?.born > push.t0) { if (now - top.born >= outMs) push = null; return; } // (a layer born after the ease-back began no longer restarts the push's life, 0.00223)
  if (!push.rel && now - push.t0 > inMs + cfg.fadeMs) push.rel = now; // no new painting came: ease back
  if (push.rel && now - push.rel >= outMs) push = null;
}

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

// A light that follows an element across the screen (0.00319: a find's card
// rising, held and flying into the LOOT row): rectOf() is read every frame
// (a card's live rect, its animation included; a removed card's 0x0 keeps
// the last place), full strength for holdMs, then the kind's fade — its
// life counted from the hold's end.
export function bgTrackLight(kind, rectOf, holdMs) {
  if (!gl || view !== '3d') return;
  const f = flashAt(kind, rectOf(), canvas.clientWidth || 1, canvas.clientHeight || 1, cfg.fovDeg, cfg.lights, performance.now());
  if (!f) return;
  f.track = rectOf; f.hold = holdMs / 1000; f.life += f.hold;
  flashes.push(f);
}
const trackFlashes = () => {
  for (const f of flashes) {
    if (!f.track) continue;
    const r = f.track();
    if (r && r.width > 0) f.pos = screenToWorld(r.left + r.width / 2, r.top + r.height / 2, canvas.clientWidth || 1, canvas.clientHeight || 1, cfg.fovDeg, cfg.lights.dist);
  }
};

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
  if (!allowSoftware && reducedMotion()) return false;
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
    'uFog', 'uFogColor', 'uHaze', 'uHazeMax', 'uLightPos', 'uLightCol', 'uLightR2', 'uRes']) loc[n] = gl.getUniformLocation(prog, n);
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
// null when the renderer is off (shut down, never started): scene.js then waits for its CSS layer instead (0.00209)
export function showBackground3d(file) { return gl ? show3d(file) : null; }
async function show3d(file) {
  wanted = file;
  let layer;
  try { layer = await loadLayer(file); } catch { return; } // flat CSS keeps showing
  if (!gl || wanted !== file) { if (layer) dropLayer(layer); return; }
  layer.born = layers.length ? performance.now() : -Infinity; // first: no fade
  const top = layers.at(-1); // (0.00311: each painting keeps its own clocks — its speed and fog drift its own — and a new one carries the last one's on, so nothing jumps)
  layer.tau = top?.tau ?? 0; layer.fogT = top?.fogT ?? 0;
  layers.push(layer);
  while (layers.length > 2) dropLayer(layers.shift());
  if (refit()) layers.forEach(fillDepth); // (0.00311: a painting with more depth or sway of its own wants a wider skirt)
  if (layer.born !== -Infinity) await new Promise((resolve) => setTimeout(resolve, cfg.fadeMs));
}

// 0.00222: the painting and its depth map arrive decoded (bg3dGL.js
// loadPicture: createImageBitmap off the main thread where the browser
// has it — an <img> handed to texImage2D re-decoded the 2048x1152 JPEG on
// the main thread, in the same task as the 9 MB upload, the depth read,
// the fog colour and the 37k-vertex fill: a quarter-second stall while the
// push dolly played), and that task is split in two: the uploads first,
// the vertex fill and the puffs on the next frame.
async function loadLayer(file) {
  const [img, dimg] = await Promise.all([loadPicture(`assets/bg/${file}`), loadPicture(depthUrl(file)).catch(() => null)]);
  if (!gl) return null;
  const depth = dimg ? readDepth(dimg) : null;
  const tune = tuning(file);
  // the mist takes the colour of the scene's own distance (0.099)
  const small = smallPixels(img);
  const mist = tune.fogColor ?? fogColor(small.data, small.w, small.h, (u, v) => (depth ? sampleDepth(depth, u, v) : tune.pivot)); // (no map: the pivot depth, as fillDepth)
  const tex = makeTexture(gl, img);
  const layer = { file, tex, depth, mist, img: { w: img.naturalWidth ?? img.width, h: img.naturalHeight ?? img.height }, depthBuf: gl.createBuffer(), tune,
    depthTex: depthTexture(gl, dimg, tune.pivot), puffs: null };
  img.close?.(); dimg?.close?.(); // the bitmaps' pixels are on the GPU now
  await new Promise((resolve) => requestAnimationFrame(resolve)); // the rest in a task of its own
  if (!gl) { dropLayer(layer); return null; }
  layer.puffs = makePuffs(seedOf(file), tune.puffs);
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

// A gap longer than parallax.quality.gapMs between frames (a hidden tab, a
// sleeping laptop) is a pause, not motion: the sway and fog clocks skip it
// instead of jumping the camera (0.157; the frame-rate windows treat it
// the same way — one knob since 0.00197).

// The screen's own frame rate, from the rAF calls (0.00197): the ladder
// measures the drawn rate against what the maxFps throttle can reach on
// this screen — a 40 Hz display draws every other frame = 20 fps, which
// used to count as "slow" (minFps 22) and walked a capable machine down
// to the flat backgrounds within seconds.
let rafT0 = 0, rafN = 0, rafRate = 0;
function slowBelow(now) {
  rafN++;
  if (now - rafT0 >= 1000) { if (rafT0) rafRate = (rafN * 1000) / (now - rafT0); rafT0 = now; rafN = 0; }
  return slowAt(rafRate, cfg); // (core/bg3dQuality.js, 0.00222: a struggling device is judged against minFps, not 0.9 of its own rate)
}

function frame(now) {
  if (!gl) return;
  requestAnimationFrame(frame);
  const slowRate = slowBelow(now); // (counts this rAF call, drawn or not)
  // (filtered only while something plays: the quiet frame makes no garbage)
  if (jolts.length) jolts = jolts.filter((j) => now - j.t0 < JOLT_LIFE_MS);
  if (sways.length) sways = sways.filter((s) => now - s.t0 < SWAY_LIFE_MS);
  if (flashes.length) { flashes = flashes.filter((f) => now - f.t0 < f.life * 1000); trackFlashes(); }
  // maxFps when nothing moves; motionMaxFps while a jolt / sway / push
  // plays (at 30 fps those stutter; uncapped, 0.00197, they ran the whole
  // scene at the display's rate through most of a fight). A flash light
  // alone does not lift the cap (0.00222): its slow exponential fade reads
  // the same at the rest rate, and it used to hold 60 fps for up to 2.8 s
  // after every crit and potion.
  const cap = push || jolts.length || sways.length || flashes.some((f) => f.track) ? cfg.motionMaxFps : cfg.maxFps; // (0.00319: a light following a card moves with it)
  if (!layers.length || now - lastDraw < 1000 / cap - 2) return;
  lastDraw = now;
  const endSpan = span('bg'); // the draw's main-thread time, for the device report (0.00225)
  if (t0 === null) { t0 = now; firstFrame = now; canvas.classList.add('ready'); document.getElementById('bg-stack')?.classList.add('gl'); } // rest pose = the CSS image; the CSS layers go dark under the canvas (styles.css)
  else { const dt = Math.min(cfg.quality.gapMs / 1000, (now - t0) / 1000); for (const L of layers) { L.tau += dt * L.tune.speed; L.fogT += dt * L.tune.fogSpeed; } } // (0.00311: per painting — the sway clock, seconds x speed, accumulated so a speed change never jumps the camera; the fog clock likewise)
  t0 = now;
  if (monitor && !held) {
    fpsW = fpsWindow(fpsW, now, slowRate, cfg.quality);
    if (fpsW.slow >= cfg.quality.slowWindows && !degrade()) { endSpan(); return; }
  }
  let arrive = 1;
  if (arrived !== null) { // 0.00310: after the fly-in's hand-over the sway comes in with the mist (a sine leaves rest at its fastest: 1.4° within the first second, a drift the fade used to carry)
    const r = Math.min(1, (now - arrived) / cfg.fogFadeMs);
    arrive = r * r * (3 - 2 * r);
    if (r >= 1) arrived = null;
  }
  const j = joltOffset(jolts, now), sw = swayOffset(sways, now);
  // each painting sways by its own amplitudes (0.00311: per-file overrides of yawDeg / pitchDeg — the title's own)
  const orbitOf = (L) => {
    const o = view === 'flat' ? { yaw: 0, pitch: 0 } : orbit(L.tau, L.tune);
    return { yaw: o.yaw * arrive + j.yaw + sw, pitch: o.pitch * arrive + j.pitch };
  };
  const fov = (cfg.fovDeg * Math.PI) / 180;
  const aspect = canvas.width / canvas.height;
  if (push) settlePush(now);
  const f = { mvp: null, plane: [Math.tan(fov / 2) * aspect, Math.tan(fov / 2)],
    lights: activeLights(view === '3d' ? flashes : [], now), r2: cfg.lights.radius ** 2 };
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
    const o = orbitOf(L);
    f.mvp = mvp(o.yaw, o.pitch, fov, aspect, dollyOf(L, now, i === layers.length - 1)); // each layer its own camera distance (the push)
    gl.uniformMatrix4fv(loc.uMVP, false, f.mvp);
    gl.clear(gl.DEPTH_BUFFER_BIT); // each layer is its own 3D scene
    draw(L, ease);
    drawPuffs(L, ease, f);
  });
  if (layers.length > 1 && now - layers[layers.length - 1].born >= cfg.fadeMs) {
    while (layers.length > 1) dropLayer(layers.shift());
  }
  endSpan();
}

// The renderer as it stands, for the device report (0.00225): the quality
// step, the fog, the backing store, the mist buffer's divisor, the caps in
// force (the phone profile's on a phone), the rAF rate seen, the GL facts.
export function rendererState() {
  if (!gl) return { bg: 'flat', q: -1 };
  const L = layers[layers.length - 1];
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  let maxTex = 0;
  try { maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE); } catch { /* lost */ }
  return {
    bg: '3d', q: level, fog: fogOn, view, held, saver: saverFrom >= 0, layers: layers.length, painting: L?.file ?? null,
    canvas: [canvas.width, canvas.height], css: [canvas.clientWidth || 0, canvas.clientHeight || 0], puffDiv: L?.tune.puffDiv ?? null,
    rafRate: Math.round(rafRate), caps: { maxFps: cfg.maxFps, motionMaxFps: cfg.motionMaxFps, maxDpr: cfg.maxDpr, maxPixels: cfg.maxPixels, minFps: cfg.minFps },
    gl: { webgl2, maxTex, renderer: gpuName() },
  };
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

const fogAmount = (L) => (fogOn && view === '3d' ? L.tune.fog * L.tune.fogScale * fogIn : 0);

// The scene's fog puffs over it (0.101, core/bg3dPuffGL.js).
function drawPuffs(L, alpha, f) {
  const amount = fogAmount(L);
  if (!puffR || !(amount > 0)) return;
  const P = L.tune.puffs;
  puffR.draw(puffFrame(L.puffs, L.fogT, P, L.tune.fogWind), { ...f, uvScale: L.uvScale, depthScale: L.tune.depthScale,
    pivot: L.tune.pivot, depthTex: L.depthTex, artTex: L.tex, mist: L.mist, soft: P.soft, amount: amount * P.opacity, alpha,
    flow: [L.fogT * P.flow, P.flowScale, P.flowAmount], light: L.tune.mist,
    width: canvas.width, height: canvas.height, div: L.tune.puffDiv });
  gl.useProgram(mainProg);
}

// BATTERY SAVER (0.00222, the corner column): the ladder's last 3D rung
// (the smallest canvas, no mist) as the player's own choice — on from any
// rung, and OFF back to where the ladder had got on its own (the ladder's
// "never back up" is for its own steps). The particles follow the rung as
// always (1x), the card light its own saverFps (ui/cardFx.js).
let saverFrom = -1; // the rung the saver was switched on from, -1 = off
export function setPowerSaver(on) {
  if (!gl) { saverFrom = on ? Math.max(saverFrom, 0) : -1; return; }
  const last = LADDER.length - 1;
  if (on && saverFrom < 0) { saverFrom = level; level = last; }
  else if (!on && saverFrom >= 0) { level = saverFrom; saverFrom = -1; }
  else return;
  fpsW = null;
  fogOn = LADDER[level].fog;
  resize();
}
export const powerSaver = () => saverFrom >= 0;
// 'saver' | 'phone' | 'full': what the picture is drawn under, for the
// stats (core/perfMonitor.js, the benchmark; the dashboard shows it).
export const powerMode = (phone = false) => (saverFrom >= 0 ? 'saver' : phone ? 'phone' : 'full');
// The room push has settled (the benchmark starts a phase's clock only then, 0.00222).
export const whenPushSettled = () => new Promise((resolve) => { const check = () => (push ? requestAnimationFrame(check) : resolve()); check(); });

// Too slow: one step down the quality ladder (core/bg3dQuality.js).
// false = past the last step, back to the flat backgrounds.
function degrade() {
  const step = nextStep(++level);
  fpsW = null; // measure the new step afresh
  if (!step) { shutdown(); return false; } // past the last step: back to the flat backgrounds
  fogOn = step.fog;
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
    Math.min(globalThis.devicePixelRatio || 1, cfg.maxDpr), cfg.maxPixels, LADDER[level].scale); // (maxDpr, 0.00209: a DPR-3 phone drew 1080p's pixels at 60 fps and never stepped down)
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(mainProg);
  gl.uniform2f(loc.uRes, canvas.width, canvas.height); // the vignette's frame (bg3dGL.js VIGNETTE_GLSL)
  refit();
  layers.forEach(fillDepth);
}

// (Re)build the screen grid when the needed skirt changes: the shipped
// overscan, or more when the sliders ask for more sway/depth.
function refit() {
  const aspect = canvas.width / canvas.height || 16 / 9; // the skirt the most demanding painting shown needs (0.00311: a painting's own depth and sway)
  const m = Math.max(cfg.overscan, ...[cfg, ...layers.map((L) => L.tune)].map((c) => requiredOverscan(withJoltReserve(c), aspect)));
  if (Math.abs(m - gridM) < 0.005) return false;
  gridM = m;
  grid = buildGrid(cfg.grid[0], cfg.grid[1], m);
  gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
  gl.bufferData(gl.ARRAY_BUFFER, grid.g, gl.STATIC_DRAW);
  return true;
}

// ---- live tuning (?debug sliders) ----
export function liveTuning() {
  const c = layers.at(-1)?.tune ?? cfg; // the painting on screen (0.00311: its own overrides)
  return Object.fromEntries(TUNABLE.map((k) => [k, c[k]]));
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
  t0 = null; firstFrame = null; fpsW = null; jolts = []; sways = []; flashes = []; push = null; arrived = null;
  level = 0; fogOn = true; view = '3d'; held = false; monitor = false; lastDraw = 0; rafT0 = 0; rafN = 0; rafRate = 0; saverFrom = -1; // (0.00197: clean for a later initBg3d, as promised)
  document.getElementById('bg-stack')?.classList.remove('gl'); // the CSS layers show again
  canvas?.remove();
  canvas = null;
}

function dropLayer(L) {
  if (!gl || !L) return;
  gl.deleteTexture(L.tex);
  gl.deleteTexture(L.depthTex);
  gl.deleteBuffer(L.depthBuf);
}

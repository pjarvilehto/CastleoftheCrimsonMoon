// ui/cardFx.js — the shader light behind every card's portrait (0.183, the
// owner's picks from the Card Lab): slow fog, blood, flames, embers or ether
// by the enemy's particle material, ADDED over the frame's dark plate (the
// card's canvas blends with mix-blend-mode: screen, styles.css .card-fx) and
// masked to the frame's window. Every lit card draws on a WebGL canvas of
// its own, from a small POOL (0.00226): at most POOL_MAX canvases are made
// in a session and handed from one room's cards to the next room's as they
// come and go, so the browser's ceiling on live contexts (about 16 a page;
// the renderer holds one) is never reached. Before 0.00226 one hidden
// context drew every card in turn and each card's 2D canvas took its
// picture as an ImageBitmap; the first device report (0.00225, the owner's
// iPhone) put that at 13.5 ms of main thread per tick at rest and 6-8 ms in
// the fights, twenty times a second: Safari serves createImageBitmap() of a
// WebGL canvas as a GPU readback, one per lit card per tick. That copy
// path stays for the cards past the pool (never a fight's: at most six
// enemies and the knight) and where the pool cannot be made. Drawn at
// fx.scale of the card's pixels at fx.fps (cards.json; soft looks need no
// sharp pixels); a fallen card stays lit until its unit leaves the row
// (0.00216), then tick's isConnected filter returns its canvas to the pool
// (and a new room's card that found the pool held by the last room's gets
// its canvas on that tick: attachCardFx / place).
// Off when the 3D background is (no WebGL, software GL, the quality
// ladder's flat step — the renderer's weak-device signal, as for the
// particles) and under reduced motion: the cards then look as before 0.183.
// The Card Lab (labs/cards/cardFx.js) imports this shader: one copy.

import { DATA } from '../shared/data.js';
import { isBg3dActive } from '../core/bg3d.js';
import { MATERIAL } from './particleLooks.js';
import { reducedMotion } from '../shared/motion.js';
import { program } from '../core/bg3dGL.js';
import { deviceBlock } from '../shared/platform.js';
import { span } from '../core/perfSpans.js';

export const VS = `attribute vec2 a; varying vec2 v; void main() { v = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;
export const FS = `
precision mediump float;
varying vec2 v; uniform float uT, uAmt, uLook, uAspect; uniform vec2 uWin; uniform vec3 uTint;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 19.19)); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.0, w = 0.55; for (int i = 0; i < 4; i++) { a += w * noise(p); p = p * 2.03 + 17.0; w *= 0.5; } return a; }
// the card's window, in units of the card's height: uWin = (inset, corner
// radius). A battle card's frame art has its grey border 1.0-1.3% of the
// height in from every edge (measured on card_enemy.png and card_player.png:
// 11-14 px of 1106), corners rounded by 4%, and the plate behind the
// portrait reaches the border, so the light must too: the window's edge sits
// on the middle of the border and is full 0.3% in, i.e. right where the
// plate starts (0.184; a softer edge starting at the plate left a dark rim
// a few pixels wide, plain on a Retina screen). A shrine or treasure card
// is lit to its rounded edge (inset 0).
float window(vec2 uv) {
  vec2 halfSize = vec2(uAspect, 1.0) * 0.5; float r = uWin.y;
  vec2 c = abs(vec2(uv.x * uAspect, uv.y) - halfSize) - (halfSize - uWin.x) + r;
  float d = length(max(c, 0.0)) - r;
  return 1.0 - smoothstep(-0.003, 0.003, d);
}
void main() {
  vec2 uv = v; vec2 p = vec2(uv.x * uAspect, uv.y); float t = uT;
  vec3 c = vec3(0.0);
  if (uLook < 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  if (uLook < 1.5 || (uLook > 1.5 && uLook < 2.5)) { // fog / blood: two drifting layers, hanging low
    float n = fbm(p * 1.7 + vec2(t * 0.045, -t * 0.02)) * 0.7 + fbm(p * 3.3 - vec2(t * 0.08, t * 0.012)) * 0.3;
    float low = smoothstep(1.05, 0.15, uv.y);
    float a = smoothstep(0.38, 0.86, n) * mix(0.3, 1.0, low);
    if (uLook > 1.5) a *= 0.85 + 0.15 * sin(t * 0.9 + uv.y * 3.0); // blood: a slow pulse, like breathing
    c = uTint * a;
  } else if (uLook < 3.5) { // flames: noise streaming up, a heat ramp from the floor
    vec2 q = vec2(p.x * 2.4, uv.y * 3.2 - t * 1.15);
    float n = fbm(q) * 0.75 + fbm(q * 2.1 + vec2(0.0, -t * 0.7)) * 0.25;
    float base = pow(max(0.0, 1.0 - uv.y), 1.9) * 1.7;
    float f = clamp(n * 1.35 + base - 0.85, 0.0, 1.0) * smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.88, uv.x);
    vec3 heat = mix(vec3(0.55, 0.04, 0.0), vec3(1.0, 0.42, 0.05), smoothstep(0.0, 0.6, f));
    heat = mix(heat, vec3(1.0, 0.85, 0.35), smoothstep(0.65, 1.0, f));
    c = mix(heat, heat * uTint * 1.6, 0.35) * f;
  } else if (uLook < 4.5) { // embers: sparks rising through a faint heat haze
    float haze = smoothstep(0.4, 0.9, fbm(p * 2.0 + vec2(t * 0.03, -t * 0.09))) * smoothstep(1.0, 0.2, uv.y) * 0.35;
    c = uTint * haze;
    for (int k = 0; k < 2; k++) {
      float layer = float(k);
      vec2 g = vec2(p.x * (7.0 + layer * 3.0), uv.y * (11.0 + layer * 4.0) - t * (0.55 + layer * 0.35));
      vec2 cell = floor(g), f = fract(g), o = hash2(cell + layer * 31.0);
      float lit = step(0.62, hash(cell + 3.3 + layer));
      float d = length((f - o) * vec2(1.0, 1.4));
      float tw = 0.55 + 0.45 * sin(t * (4.0 + 3.0 * o.x) + o.y * 40.0);
      float s = smoothstep(0.075, 0.0, d) * lit * tw * smoothstep(1.0, 0.75, uv.y);
      c += vec3(1.0, 0.6, 0.2) * s;
    }
  } else { // ether: ridged wisps, cool and quick
    vec2 q = vec2(p.x * 1.3, uv.y * 2.6) + vec2(t * 0.05, -t * 0.12);
    float r = 1.0 - abs(2.0 * fbm(q) - 1.0); r = pow(r, 3.2);
    float r2 = 1.0 - abs(2.0 * fbm(q * 1.9 + 5.0 - vec2(0.0, t * 0.2)) - 1.0); r2 = pow(r2, 4.0);
    float a = (r * 0.7 + r2 * 0.5) * smoothstep(1.05, 0.2, uv.y);
    c = uTint * a * 1.3;
  }
  // premultiplied: the light inside the window, transparent outside it
  // (0.185: an opaque black outside showed as a rim where the frame art is
  // transparent — screen blending has nothing to blend with there)
  float w = window(uv);
  gl_FragColor = vec4(c * uAmt * w, w);
}`;

export const LOOKS = ['none', 'fog', 'blood', 'flames', 'embers', 'ether']; // the shader's uLook order
export const TINTS = { fog: [0.62, 0.66, 0.72], blood: [0.85, 0.12, 0.1], flames: [1.0, 0.5, 0.2], embers: [0.9, 0.35, 0.1], ether: [0.55, 0.45, 1.0], gold: [0.95, 0.75, 0.35] };

// What a card shows: a look (the shader's motion) and a tint.
const STYLE = {
  fog: { look: 'fog', tint: TINTS.fog }, blood: { look: 'blood', tint: TINTS.blood }, flames: { look: 'flames', tint: TINTS.flames },
  embers: { look: 'embers', tint: TINTS.embers }, ether: { look: 'ether', tint: TINTS.ether },
  goldFog: { look: 'fog', tint: TINTS.gold }, goldEmbers: { look: 'embers', tint: TINTS.gold },
  boss: { look: 'flames', tint: [0.9, 0.25, 0.15] }, knight: { look: 'ether', tint: [0.5, 0.55, 1.0] },
};
export const styleNamed = (name) => STYLE[name] ?? STYLE.fog;
// By particle material (particleLooks.js MATERIAL): flesh blood, bone fog,
// embers flames, wisps ether; the boss flames, the knight ether.
const BY_MATERIAL = { embers: 'flames', wisps: 'ether', dust: 'fog' };
export function cardStyle(id, boss = false) {
  if (id === 'player') return STYLE.knight;
  if (boss) return STYLE.boss;
  return STYLE[BY_MATERIAL[MATERIAL[id]] ?? 'blood'];
}
// The shrine's boons (shrines.json offers[].id) and the treasure room's chests.
export const SHRINE_STYLE = { dmg: 'blood', crit: 'embers', armor: 'fog', leech: 'blood', bulwark: 'fog', secondwind: 'goldFog', quicken: 'ether', greed: 'goldEmbers', glasscannon: 'flames' };
export const CHEST_STYLE = { coffer: 'goldFog', gilded: 'goldEmbers', reliquary: 'ether' };
// The lit window per card kind: [inset, corner radius] in card heights.
export const WINDOW = { frame: [0.0113, 0.04], panel: [0, 0.037] };

const SIZE = 512; // a card's light is never drawn larger than this
const GRAIN = 16; // the overflow canvas grows in steps of this many px (sized to the largest card on it, 0.00222)
// The pool's ceiling: every fight fits (difficulty.json maxEnemies 6 + the
// knight; the boss, its three summons and the knight), well under the
// browser's context limit with the renderer's one context beside it.
const POOL_MAX = 8;
const WARM = 4; // made behind the title (warmCardFx): the knight and the first room's enemies; the rest as a room is built, behind the faded windows
let pool = [], free = []; // { canvas, gl, loc, lost }: every canvas made, and the ones no card holds
let poolDead = false; // a canvas of its own could not be made (no WebGL, or the browser's limit): cards go on the overflow path
let shared = null, failed = false; // the overflow context { canvas, gl, loc }; failed: no WebGL at all
// cards.json fx, the phone's block merged on a phone (0.00222) — read once
let F = null;
const fxKnobs = () => (F ??= deviceBlock(DATA.cards.fx));
// BATTERY SAVER (0.00222): the light at fx.saverFps
let saver = false;
export function setCardFxSaver(on) { saver = !!on; }
let entries = [], running = false, last = 0;
// each card's size, kept by one observer (0.00209: clientWidth/Height per card per tick was a layout read 30 times a second — the pattern particles.js dropped in 0.135)
const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver((recs) => { for (const r of recs) { const e = entries.find((x) => x.card === r.target); if (e) { e.w = r.contentRect.width; e.h = r.contentRect.height; } } }) : null;

const enabled = () => isBg3dActive() && !reducedMotion();

// A WebGL context on `canvas` with the shader compiled and the quad bound;
// null where the browser gives none. (The one place a context is made:
// the pool's canvases and the overflow canvas alike.)
function setup(canvas) {
  const gl = canvas.getContext?.('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const prog = program(gl, VS, FS); // (bg3dGL.js: the renderer's own helper, 0.00197)
  if (!prog) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const loc = Object.fromEntries(['uT', 'uAmt', 'uLook', 'uAspect', 'uWin', 'uTint'].map((n) => [n, gl.getUniformLocation(prog, n)]));
  return { canvas, gl, loc, lost: false };
}

// The pool. make(): one more canvas of its own, up to POOL_MAX; acquire():
// a free one, else a new one, else null (the card goes on the overflow
// path); release(): cleared, out of its card and back in the pool. A lost
// context (a GPU reset) leaves the pool for good: its card goes unlit for
// the rest of the room, and the next room's card gets another canvas.
function make() {
  if (poolDead || pool.length >= POOL_MAX) return null;
  let slot = null;
  try { const c = document.createElement('canvas'); c.width = c.height = 8; slot = setup(c); } catch { slot = null; }
  if (!slot) { poolDead = true; return null; }
  slot.canvas.className = 'card-fx';
  slot.canvas.addEventListener?.('webglcontextlost', () => { slot.lost = true; pool = pool.filter((s) => s !== slot); free = free.filter((s) => s !== slot); });
  pool.push(slot);
  return slot;
}
const acquire = () => free.pop() ?? make();
function release(slot) {
  try { slot.canvas.remove(); slot.gl.clearColor(0, 0, 0, 0); slot.gl.clear(slot.gl.COLOR_BUFFER_BIT); } catch { /* lost */ } // transparent until its next card's first draw
  if (!slot.lost) free.push(slot);
}

// The overflow context, made on first need: a hidden canvas every card past
// the pool is drawn on in turn, its picture copied to the card (as every
// card was before 0.00226).
function sharedGl() {
  if (shared || failed) return shared;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = GRAIN; // grown to the largest card on it (fitShared)
    shared = setup(canvas);
    if (!shared) { failed = true; return null; }
    canvas.addEventListener?.('webglcontextlost', (e) => { e.preventDefault(); shared = null; failed = true; }); // (the next tick drops the cards on it)
  } catch { failed = true; shared = null; }
  return shared;
}
// A card's canvas on the overflow path: it takes the picture as an
// ImageBitmap where the browser can (a bitmaprenderer context, GPU-side
// where the browser keeps it so), else by a 2D drawImage.
function copyCanvas() {
  if (!sharedGl()) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'card-fx';
  const bmp = typeof createImageBitmap === 'function' ? canvas.getContext?.('bitmaprenderer') : null;
  const ctx = bmp ? null : canvas.getContext?.('2d');
  if (!bmp && !ctx) return null;
  canvas.width = 8; canvas.height = 8;
  if (ctx) ctx.globalCompositeOperation = 'copy'; // each frame replaces the last, alpha included
  return { canvas, bmp, ctx };
}

// Light a card: its canvas goes into `into` — the card's plate layer
// (battleLine.js .card-frame, shrineUI.js .card-plate: the art or gradient
// behind everything, with the card's see-through opacity on it, so the
// light and the plate fade together and the plate stays as transparent as
// the Card Lab's; 0.195 — a canvas screened straight over the card made
// the plate opaque), else the card itself. style: { look, tint }
// (cardStyle / styleNamed); window: 'frame' | 'panel'; amt: the light
// (default fx.amt). Returns the entry (null when off: the card is left as
// it is), with set(o) to change its look.
// A room is built in the task that tears the last one down (the scenes
// mount the new battle line, then clear the root), so the last room's
// cards still hold their canvases when the new room's ask: a card that
// finds the pool full waits, and place() gives it a canvas on the next
// tick, after the tick's filter has returned the last room's — else every
// room change overflowed the pool (0.00226, seen in the benchmark's own
// report: eight made, two cards copying all phase). Nothing shows in
// between: the units are hidden until the deal, the panels until the
// windows return.
export function attachCardFx(card, style, { window = 'frame', amt, into } = {}) {
  const host = into ?? card;
  if (!host?.insertBefore || !enabled()) return null;
  const own = acquire();
  const e = { card, host, canvas: own?.canvas ?? null, own, bmp: null, ctx: null, look: style.look, tint: style.tint, win: WINDOW[window] ?? WINDOW.frame, amt: amt ?? fxKnobs().amt, t: Math.random() * 100 };
  if (!own && poolDead && !place(e)) return null; // no pool at all: the overflow path now, or nothing
  if (e.canvas) mount(e);
  entries.push(e);
  sizes?.observe(card);
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  return e;
}

const mount = (e) => e.host.insertBefore(e.canvas, e.host.children[0] ?? null); // under everything in the plate layer
// A canvas for a card that waited: a pooled one, else the overflow path;
// false when there is none to be had (no WebGL for the overflow either).
function place(e) {
  const own = acquire();
  if (own) { e.own = own; e.canvas = own.canvas; return true; }
  const copy = copyCanvas();
  if (!copy) return false;
  Object.assign(e, copy);
  return true;
}

// A card's light is over: its pooled canvas back to the pool, an overflow
// canvas cleared and out of the card.
function drop(e) {
  sizes?.unobserve(e.card);
  if (e.own) { release(e.own); return; }
  if (!e.canvas) return; // it waited for one to the end
  try { e.canvas.remove(); if (e.bmp) e.bmp.transferFromImageBitmap(null); else e.ctx.clearRect(0, 0, e.canvas.width, e.canvas.height); } catch { /* gone */ }
}

function stop() {
  for (const e of entries) drop(e);
  sizes?.disconnect(); // (tidying: the browsers hold observed elements weakly)
  entries = []; running = false;
}

// Still lit: its canvas in the document on a context that is still there;
// a card still waiting for a canvas, in the document itself.
const alive = (e) => (e.canvas ? !!e.canvas.isConnected && (e.own ? !e.own.lost : !!shared) : !!e.card.isConnected && !e.unlit);

function tick(now) {
  if (!running) return;
  entries = entries.filter((e) => alive(e) || (drop(e), false)); // the last room's cards: their canvases back to the pool first
  if (!entries.length) { running = false; return; }
  if (!enabled()) { stop(); return; } // the background fell back to flat mid-session
  requestAnimationFrame(tick); // (after the check: nothing pending once stopped, 0.00223)
  for (const e of entries) if (!e.canvas) { if (place(e)) mount(e); else e.unlit = true; } // the cards that waited (dropped next tick when nothing can light them)
  const F = fxKnobs();
  if (now - last < 1000 / (saver ? F.saverFps : F.fps) - 2) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const endSpan = span('cards'); // (the device report, 0.00225)
  for (const e of entries) {
    if (!e.canvas) continue;
    if (sizes && e.w === undefined) continue; // not measured yet (0.00222: a clientWidth read here forced a layout on the room's first tick); the observer's first report is a tick away
    const w = Math.min(SIZE, Math.max(8, Math.round((e.w ?? e.card.clientWidth) * F.scale) || 8));
    const h = Math.min(SIZE, Math.max(8, Math.round((e.h ?? e.card.clientHeight) * F.scale) || 8));
    e.t += dt * F.speed;
    const { gl, loc } = e.own ?? shared;
    if (e.canvas.width !== w || e.canvas.height !== h) { e.canvas.width = w; e.canvas.height = h; if (e.ctx) e.ctx.globalCompositeOperation = 'copy'; } // (a resize resets a 2D context)
    if (e.own) gl.viewport(0, 0, w, h); // the card's own drawing buffer, shown as it is
    else { fitShared(w, h); gl.viewport(0, shared.canvas.height - h, w, h); } // the top-left corner of the overflow canvas, as an image
    gl.uniform1f(loc.uT, e.t); gl.uniform1f(loc.uAmt, e.amt);
    gl.uniform1f(loc.uLook, LOOKS.indexOf(e.look)); gl.uniform1f(loc.uAspect, w / h);
    gl.uniform2f(loc.uWin, e.win[0], e.win[1]); gl.uniform3fv(loc.uTint, e.tint);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (e.own) continue;
    // the overflow path: the picture is taken now, in this task, before the next card draws over the region
    if (e.bmp) createImageBitmap(shared.canvas, 0, 0, w, h).then((b) => e.bmp.transferFromImageBitmap(b), () => {});
    else e.ctx.drawImage(shared.canvas, 0, 0, w, h, 0, 0, w, h);
  }
  endSpan();
}

// The card light as it runs, for the device report (0.00225): lit cards,
// how many draw on a canvas of their own, the pool's size, the rate and
// the scale, BATTERY SAVER, the overflow canvas's size (null until a card
// needed it) and whether the overflow cards take ImageBitmaps.
export function cardFxState() {
  const F = fxKnobs();
  const own = entries.filter((e) => e.own).length;
  return { lit: entries.length, own, pool: pool.length, fps: saver ? F.saverFps : F.fps, scale: F.scale, saver, shared: shared ? [shared.canvas.width, shared.canvas.height] : null, bitmap: entries.some((e) => !!e.bmp) };
}

// The overflow canvas grows to the largest card on it, in GRAIN steps
// (0.00222: it was 512x512 always, and every card's picture was a snapshot
// of the whole of it — 1 MB a card a tick for 31x88 px of light on a phone).
function fitShared(w, h) {
  const c = shared.canvas, W = Math.min(SIZE, Math.ceil(w / GRAIN) * GRAIN), H = Math.min(SIZE, Math.ceil(h / GRAIN) * GRAIN);
  if (W > c.width) c.width = W;
  if (H > c.height) c.height = H;
}

// Boot (main.js): make the first WARM canvases of the pool and compile the
// shader on each behind the title, every look drawn once, so the first
// fight's cards do not pay the pipeline build in the hub-to-dungeon
// transition (0.00222). Harmless without WebGL; true when the pool has a
// canvas.
export function warmCardFx() {
  if (!enabled()) return false;
  while (pool.length < WARM) {
    const s = make();
    if (!s) break;
    const { gl, loc } = s;
    gl.viewport(0, 0, 8, 8);
    for (let i = 0; i < LOOKS.length; i++) {
      gl.uniform1f(loc.uT, 0); gl.uniform1f(loc.uAmt, 0); gl.uniform1f(loc.uLook, i); gl.uniform1f(loc.uAspect, 1);
      gl.uniform2f(loc.uWin, WINDOW.frame[0], WINDOW.frame[1]); gl.uniform3f(loc.uTint, 0, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    free.push(s);
  }
  return pool.length > 0;
}

// Tests and the lab: what is lit right now, and the pool's canvases.
export const litCards = () => entries.length;
export const pooledCanvases = () => pool.length;

// ui/cardFx.js — the shader light behind every card's portrait (0.183, the
// owner's picks from the Card Lab): slow fog, blood, flames, embers or ether
// by the enemy's particle material, ADDED over the frame's dark plate (the
// card's canvas blends with mix-blend-mode: screen, styles.css .card-fx) and
// masked to the frame's window. One WebGL context for the whole session
// draws every card in turn into a hidden canvas; each card holds a plain 2D
// canvas that copies its picture out (one drawImage, GPU to GPU). Cards are
// built and torn down every room, and a WebGL context each would run the
// browser out of them (about 16). Drawn at fx.scale of the card's pixels at
// fx.fps (cards.json; soft looks need no sharp pixels), dead cards frozen.
// Off when the 3D background is (no WebGL, software GL, the quality
// ladder's flat step — the renderer's weak-device signal, as for the
// particles) and under reduced motion: the cards then look as before 0.183.
// The Card Lab (labs/cards/cardFx.js) imports this shader: one copy.

import { DATA } from '../shared/data.js';
import { isBg3dActive } from '../core/bg3d.js';
import { MATERIAL } from './particleLooks.js';

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

const SIZE = 512; // the hidden canvas: a card is never drawn larger than this
let shared = null, failed = false; // { canvas, gl, loc }
let entries = [], running = false, last = 0;

const enabled = () => isBg3dActive() && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function compile(gl) {
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// The one GL context, made on first use; null when the browser has none.
function sharedGl() {
  if (shared || failed) return shared;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const gl = canvas.getContext?.('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) { failed = true; return null; }
    const prog = compile(gl);
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const loc = Object.fromEntries(['uT', 'uAmt', 'uLook', 'uAspect', 'uWin', 'uTint'].map((n) => [n, gl.getUniformLocation(prog, n)]));
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); shared = null; failed = true; stop(); });
    shared = { canvas, gl, loc };
  } catch { failed = true; shared = null; }
  return shared;
}

// Light a card: its 2D canvas goes in under everything else in it. style:
// { look, tint } (cardStyle / styleNamed); window: 'frame' | 'panel'; amt:
// the light (default fx.amt). Returns the entry (null when off: the card
// is left as it is), with set(o) to change its look.
export function attachCardFx(card, style, { window = 'frame', amt } = {}) {
  if (!card?.insertBefore || !enabled()) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'card-fx';
  const ctx = canvas.getContext?.('2d');
  if (!ctx || !sharedGl()) return null;
  canvas.width = 8; canvas.height = 8;
  ctx.globalCompositeOperation = 'copy'; // each frame replaces the last, alpha included
  card.insertBefore(canvas, card.children[0] ?? null);
  const e = { card, canvas, ctx, look: style.look, tint: style.tint, win: WINDOW[window] ?? WINDOW.frame, amt: amt ?? DATA.cards.fx.amt, t: Math.random() * 100, set(o) { Object.assign(e, o); } };
  entries.push(e);
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  return e;
}

function stop() {
  for (const e of entries) e.ctx.clearRect(0, 0, e.canvas.width, e.canvas.height);
  entries = []; running = false;
}

function tick(now) {
  if (!running) return;
  entries = entries.filter((e) => e.canvas.isConnected); // the last room's cards
  if (!entries.length) { running = false; return; }
  requestAnimationFrame(tick);
  if (!enabled() || !shared) { stop(); return; } // the background fell back to flat mid-session
  const F = DATA.cards.fx;
  if (now - last < 1000 / F.fps - 2) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const { gl, loc, canvas: src } = shared;
  for (const e of entries) {
    if (e.card.classList.contains('dead')) continue; // a dead card keeps its last frame (faint anyway)
    const w = Math.min(SIZE, Math.max(8, Math.round(e.card.clientWidth * F.scale) || 8));
    const h = Math.min(SIZE, Math.max(8, Math.round(e.card.clientHeight * F.scale) || 8));
    if (e.canvas.width !== w || e.canvas.height !== h) { e.canvas.width = w; e.canvas.height = h; e.ctx.globalCompositeOperation = 'copy'; } // (a resize resets the context)
    e.t += dt * F.speed;
    gl.viewport(0, SIZE - h, w, h); // the top-left corner of the hidden canvas, as an image
    gl.uniform1f(loc.uT, e.t); gl.uniform1f(loc.uAmt, e.amt);
    gl.uniform1f(loc.uLook, LOOKS.indexOf(e.look)); gl.uniform1f(loc.uAspect, w / h);
    gl.uniform2f(loc.uWin, e.win[0], e.win[1]); gl.uniform3fv(loc.uTint, e.tint);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    e.ctx.drawImage(src, 0, 0, w, h, 0, 0, w, h);
  }
}

// Tests and the lab: what is lit right now.
export const litCards = () => entries.length;

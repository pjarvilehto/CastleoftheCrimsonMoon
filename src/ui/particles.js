// ui/particles.js — combat particle bursts (0.089): one shared <canvas> in
// the fx layer; its animation loop runs ONLY while particles are alive and
// stops when the last one fades. No assets: everything is drawn in code.
// What a burst contains — materials, looks, sizes — is ui/particleLooks.js
// (0.136); this file spawns them through a budget, moves and draws them.
// Off under prefers-reduced-motion, and when the 3D background has fallen
// back to flat (the renderer's own weak-device signal).

import { isBg3dActive, bgQualityLevel } from '../core/bg3d.js';
import { spawnParticles, spawnClassBurst, R, rr } from './particleLooks.js';
import { reducedMotion } from '../shared/motion.js';
import { DATA } from '../shared/data.js';
import { deviceBlock } from '../shared/platform.js';
import { span } from '../core/perfSpans.js';

export { MATERIAL, materialOf, STYLE_OF, spawnParticles, spawnClassBurst, CLASS_LOOKS, CLASS_PAL } from './particleLooks.js';

// cards.json particles (0.00222: budget, max, keepFloor and the DPR cap were numbers here; a phone has its own block)
let P = null;
const knobs = () => (P ??= deviceBlock(DATA.cards.particles));
const THINNABLE = new Set(['streak', 'blob', 'dot', 'puff']);
let canvas = null, ctx2d = null, parts = [], running = false, last = 0, scale = 1;
let box = null; // last frame's painted area, device px: [x0, y0, x1, y1]

function particlesEnabled() {
  return isBg3dActive() && !reducedMotion();
}

// Attach the canvas to a combat room's fx layer. One canvas for the whole
// session (0.129): a new full-screen one per room cost a ~10 ms hitch on
// each room's first hit (allocating its backing store).
let shared = null;
// The particles' knobs and load, for the device report (0.00225).
export const particleState = () => { const { _doc, phone, ...k } = knobs(); return { ...k, live: parts.length, canvas: canvas ? [canvas.width, canvas.height] : null }; }; // (the knobs in force; the data's note and the phone block stay out)

export function attachParticles(layer) {
  parts = []; box = null;
  canvas = null;
  if (!layer || !particlesEnabled()) return;
  if (!shared) {
    shared = document.createElement('canvas');
    shared.className = 'fx-particles';
    ctx2d = shared.getContext?.('2d') ?? null;
    if (!ctx2d) { shared = null; return; }
  }
  canvas = shared;
  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.clearRect(0, 0, canvas.width, canvas.height); // the last room's splats
  canvas.style.opacity = '0'; // nothing lives yet (0.00222)
  layer.prepend(canvas);
}

// Burst at screen point (x, y). dir: -1 sprays left, 1 right, 0 all round.
// size: the card height, so bursts scale with the cards. kind: 'hit' |
// 'crit' | 'kill' (big: true = a kill). floor: the card's bottom edge,
// where ink drops land.
export function burst(material, x, y, opts = {}) {
  if (!canvas?.isConnected) return;
  push(spawnParticles(material, x, y, opts));
}
// A class's own trace (0.00268, particleLooks.js spawnClassBurst): the
// same canvas, the same budget.
export function burstClass(look, x, y, opts = {}) {
  if (!canvas?.isConnected) return;
  push(spawnClassBurst(look, x, y, opts));
}
function push(list) {
  // Crowded (OVERKILL: a kill burst on every card at once): past BUDGET
  // live particles a new burst keeps its rings, flashes and slashes but
  // only some of its streaks, blobs and sparks (0.129).
  const { budget, max, keepFloor } = knobs();
  const keep = Math.min(1, Math.max(keepFloor, (budget - parts.length) / list.length));
  for (const p of list) {
    if (parts.length >= max) break;
    if (keep < 1 && THINNABLE.has(p.kind) && R() > keep) continue;
    parts.push(p);
  }
  if (!running) { running = true; last = performance.now(); canvas.style.opacity = ''; requestAnimationFrame(tick); } // (0.00222: shown again — see tick)
}

// ---- drawing (0.129: batched) ----
// Each frame the particles are sorted into buckets by how they paint —
// composite mode, colour, an alpha step (ALPHA_STEPS levels) and line
// width — and each bucket is ONE fill or stroke of a Path2D. A burst of
// 50 streaks is a handful of draw calls instead of 50 state changes; the
// ink pass (source-over) runs before the glow pass ('lighter'). Only the
// area painted last frame is cleared.
const TAU = Math.PI * 2, ALPHA_STEPS = 12;
const qa = (a) => Math.round(Math.min(1, a) * ALPHA_STEPS) / ALPHA_STEPS;

function step(p, dt) {
  if (p.vx === undefined) return;
  if (p.pull) { // a wisp seeking a point (the soul drain): pulled harder as it goes, gone when it arrives
    const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy) || 1, k = p.pull * (0.4 + p.age / p.life) * dt;
    p.vx += (dx / dist) * k; p.vy += (dy / dist) * k;
    if (dist < 14) p.age = p.life;
  }
  const d = Math.exp(-p.drag * dt);
  p.vx *= d;
  p.vy = p.vy * d + p.g * dt;
  p.x += p.vx * dt + (p.wobble ? Math.sin(p.age * 5 + p.wobble) * 0.6 : 0);
  p.y += p.vy * dt;
  if (p.floor && p.y > p.floor && p.kind === 'blob') { // lands: a splat that fades slowly
    Object.assign(p, { kind: 'splat', y: p.floor + rr(-3, 3), vx: undefined, age: 0, life: rr(1.4, 2.2), w: p.size * rr(2.2, 3.4) });
  }
}

// bucket: one Path2D per (pass, fill/stroke, colour, alpha step, width)
function bucket(buckets, glow, stroke, rgb, a, w = 0) {
  const key = `${glow ? 1 : 0}${stroke ? 1 : 0}${rgb}|${a}|${w}`;
  let b = buckets.get(key);
  if (!b) buckets.set(key, (b = { glow, stroke, style: `rgba(${rgb},${a})`, w, path: new Path2D() }));
  return b.path;
}

// What one particle adds to its bucket; returns its reach (CSS px) for the
// dirty box, or -1 when it is drawn on its own (slash, ring, flash).
function add(buckets, p, k) {
  switch (p.kind) {
    case 'dot': {
      const a = qa(0.55 * k * (p.flicker ? 0.55 + 0.45 * Math.sin(p.age * 38 + p.wobble * 9) : 1));
      if (a <= 0) return 0;
      const r = Math.max(0.5, p.size * (0.6 + k * 0.4)), path = bucket(buckets, p.glow, false, p.color, a);
      path.moveTo(p.x + r, p.y); path.arc(p.x, p.y, r, 0, TAU);
      return r;
    }
    case 'blob': {
      const a = qa(0.95 * Math.min(1, k * 1.6));
      if (a <= 0) return 0;
      const st = Math.min(3.2, 1 + Math.hypot(p.vx, p.vy) / 260); // stretched along its flight, like a brush flick
      const rx = p.size * st, ry = p.size / Math.sqrt(st), rot = Math.atan2(p.vy, p.vx), path = bucket(buckets, false, false, p.color, a);
      path.moveTo(p.x + rx * Math.cos(rot), p.y + rx * Math.sin(rot)); path.ellipse(p.x, p.y, rx, ry, rot, 0, TAU);
      return rx;
    }
    case 'streak': {
      const a = qa(k * 1.4);
      if (a <= 0) return 0;
      const sp = Math.hypot(p.vx, p.vy) || 1, len = Math.min(70, sp * 0.05) + 3;
      const path = bucket(buckets, true, true, k > 0.6 ? p.hot : p.mid, a, Math.max(1, Math.round(p.size))); // white-hot, then cooling
      path.moveTo(p.x, p.y); path.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
      return len + p.size;
    }
    default: return -1;
  }
}

// The few one-off shapes, drawn directly (a handful per burst).
function drawOne(c, p, k) {
  switch (p.kind) {
    // Splats (0.132) fade slowly and overlap on the floor: batched, two
    // overlapping splats were filled once while they shared an alpha step
    // and twice when they didn't, so the pool flickered as it faded. Each
    // one is drawn on its own, with smooth alpha.
    case 'splat':
      c.globalAlpha = 0.85 * k; c.fillStyle = `rgb(${p.color})`;
      c.beginPath(); c.ellipse(p.x, p.y, p.w, p.w * 0.28, 0, 0, TAU); c.fill();
      return p.w;
    case 'slash': {
      const t = p.age / p.life, L = p.len * Math.min(1, t * 4), x0 = -p.len / 2, cos = Math.cos(p.rot), sin = Math.sin(p.rot);
      c.setTransform(scale * cos, scale * sin, -scale * sin, scale * cos, p.x * scale, p.y * scale);
      c.globalAlpha = 0.92 * (1 - t); c.fillStyle = `rgb(${p.color})`;
      c.beginPath(); c.moveTo(x0, 0); c.quadraticCurveTo(x0 + L / 2, -p.w, x0 + L, 0); c.quadraticCurveTo(x0 + L / 2, p.w * 0.35, x0, 0); c.fill();
      // a thin hot edge along the cut, so the dark ink reads on dark rooms
      c.globalAlpha = 0.85 * (1 - t); c.strokeStyle = `rgb(${p.edge})`; c.lineWidth = Math.max(1, p.w * 0.14);
      c.beginPath(); c.moveTo(x0, 0); c.quadraticCurveTo(x0 + L / 2, -p.w, x0 + L, 0); c.stroke();
      c.setTransform(scale, 0, 0, scale, 0, 0);
      return p.len / 2 + p.w;
    }
    case 'ring': {
      const t = p.age / p.life, r = p.r0 + (p.r1 - p.r0) * (1 - (1 - t) ** 3);
      c.globalAlpha = 0.9 * (1 - t); c.strokeStyle = `rgb(${p.color})`; c.lineWidth = Math.max(1, 7 * (1 - t));
      c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
      return r + 4;
    }
    case 'flash': // a cached soft sprite, not a new gradient every frame
      c.globalAlpha = 0.9 * k;
      c.drawImage(glowSprite(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      return p.size;
    // the classes' kinds (0.00268)
    case 'puff': { // soft smoke: the glow sprite drawn source-over, thin, growing as it fades
      const t = p.age / p.life, s = p.size * (1 + t * p.grow);
      c.globalAlpha = p.alpha * Math.sin(Math.PI * Math.min(1, t)) ;
      c.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
      return s;
    }
    case 'sigil': { // a pentagram turning inside a ring, fading in and out
      const t = p.age / p.life, a = Math.sin(Math.PI * Math.min(1, t)), rot = p.spin * p.age, r = p.r * (0.85 + 0.15 * t);
      c.globalAlpha = 0.9 * a; c.strokeStyle = `rgb(${p.edge})`; c.lineWidth = 2.2;
      c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
      c.strokeStyle = `rgb(${p.color})`; c.lineWidth = Math.max(1, 1.6);
      c.beginPath();
      for (let i = 0; i <= 5; i++) { const ang = rot + ((i * 2) % 5) * (TAU / 5) - Math.PI / 2; const px = p.x + Math.cos(ang) * r * 0.92, py = p.y + Math.sin(ang) * r * 0.92; if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }
      c.stroke();
      return r + 3;
    }
    case 'arc': { // a crescent swung across the figure: the stroke grows along its sweep, then thins and fades
      const t = p.age / p.life, done = Math.min(1, t * 2.4), a0 = p.a0, a1 = p.a0 + p.sweep * done;
      c.globalAlpha = 0.85 * (1 - t); c.lineCap = 'round';
      c.strokeStyle = `rgb(${p.color})`; c.lineWidth = Math.max(1, p.w * (1 - t * 0.7));
      c.beginPath(); c.arc(p.x, p.y, p.r, Math.min(a0, a1), Math.max(a0, a1)); c.stroke();
      c.strokeStyle = `rgb(${p.edge})`; c.lineWidth = Math.max(1, p.w * 0.3 * (1 - t));
      c.beginPath(); c.arc(p.x, p.y, p.r * 1.04, Math.min(a0, a1), Math.max(a0, a1)); c.stroke();
      return p.r + p.w;
    }
    default: return 0;
  }
}

const sprites = new Map();
function glowSprite(rgb) {
  let s = sprites.get(rgb);
  if (!s) {
    s = document.createElement('canvas'); s.width = s.height = 64;
    const g2 = s.getContext('2d'), g = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`);
    g2.fillStyle = g; g2.fillRect(0, 0, 64, 64);
    sprites.set(rgb, s);
  }
  return s;
}

function render(c) {
  // clear only what was painted last frame
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  if (box) c.clearRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
  c.setTransform(scale, 0, 0, scale, 0, 0);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (p, r) => { if (p.x - r < x0) x0 = p.x - r; if (p.y - r < y0) y0 = p.y - r; if (p.x + r > x1) x1 = p.x + r; if (p.y + r > y1) y1 = p.y + r; };
  const buckets = new Map(), floor = [], ink = [], glow = [];
  for (const p of parts) {
    if (p.age < 0) continue; // a delayed ring
    const k = Math.max(0, 1 - p.age / p.life);
    const r = add(buckets, p, k);
    if (r >= 0) grow(p, r);
    else (p.kind === 'splat' ? floor : p.kind === 'slash' || p.kind === 'puff' ? ink : glow).push(p); // (0.00268: a puff is smoke — source-over, under the glow pass)
  }
  // pass 1: ink (source-over); pass 2: glow ('lighter')
  for (const pass of [false, true]) {
    c.globalCompositeOperation = pass ? 'lighter' : 'source-over';
    if (!pass) for (const p of floor) grow(p, drawOne(c, p, Math.max(0, 1 - p.age / p.life))); // under the flying ink
    c.globalAlpha = 1;
    for (const b of buckets.values()) {
      if (b.glow !== pass) continue;
      if (b.stroke) { c.strokeStyle = b.style; c.lineWidth = b.w; c.lineCap = 'round'; c.stroke(b.path); }
      else { c.fillStyle = b.style; c.fill(b.path); }
    }
    for (const p of pass ? glow : ink) grow(p, drawOne(c, p, Math.max(0, 1 - p.age / p.life)));
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  box = x1 < x0 ? null : [
    Math.max(0, Math.floor(x0 * scale) - 2), Math.max(0, Math.floor(y0 * scale) - 2),
    Math.min(canvas.width, Math.ceil(x1 * scale) + 2), Math.min(canvas.height, Math.ceil(y1 * scale) + 2)];
}

function tick(now) {
  if (!canvas?.isConnected) { running = false; parts = []; box = null; return; }
  const endSpan = span('particles'); // (the device report, 0.00225)
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (fit()) box = null; // a resized canvas starts blank
  // age, step and drop the dead in place (no new array every frame)
  let n = 0;
  for (const p of parts) {
    p.age += dt;
    if (p.age < p.life) { step(p, dt); parts[n++] = p; }
  }
  parts.length = n;
  render(ctx2d);
  endSpan();
  if (parts.length) requestAnimationFrame(tick);
  else { running = false; canvas.style.opacity = '0'; } // render() already cleared the last painted area; 0.00222: an opacity-0 layer is skipped by the compositor between bursts (the backing store stays, so the first hit's hitch of 0.129 does not return)
}

// Backing store at up to particles.dprCap device pixels per CSS px (0.129:
// 1.25, was 1.5 — particles are fast and soft, 1.5 cost ~20% more raster
// for no visible gain; a phone's own cap is 1, 0.00222), and 1x once the
// 3D background has had to step down its quality (0.129: the device is
// struggling). true = the canvas was resized.
function fit() {
  scale = Math.min(globalThis.devicePixelRatio || 1, bgQualityLevel() > 0 ? 1 : knobs().dprCap);
  // the canvas fills the viewport (.fx-layer is fixed, inset 0): the window
  // size, not clientWidth — reading layout every frame forced a reflow
  // after each DOM change (0.135)
  const w = Math.round(globalThis.innerWidth * scale), h = Math.round(globalThis.innerHeight * scale);
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w; canvas.height = h;
  return true;
}

// ui/particles.js — combat particle bursts (0.089; looks 0.128). One shared
// <canvas> in the fx layer; its animation loop runs ONLY while particles
// are alive and stops when the last one fades. No assets: every particle
// is drawn in code.
//
// What comes out of a hit depends on what the target is made of
// (MATERIAL, by enemy id), and each material has its look (STYLE_OF,
// picked in the Particle Lab, particle-lab/):
//   blood (flesh, the knight) — Ink & Gore: few heavy dark blobs stretched
//     along their flight, an ink slash across the target, drops that land
//     on the card floor as splats and fade slowly.
//   dust (bone, stone), embers (the Cinderborn), wisps (the wraith) —
//     Spark & Streak: additive streaks stretched by their speed, white-hot
//     cooling to the material colour, an impact ring (two on a crit); fire
//     on a yellow ramp with cinders floating up after the hit.
// Bursts come in three sizes: hit, crit (heavy too), kill.
// Off under prefers-reduced-motion, and when the 3D background has fallen
// back to flat (the renderer's own weak-device signal).

import { isBg3dActive, bgQualityLevel } from '../core/bg3d.js';

export const MATERIAL = {
  ghoul: 'embers',            // "Cinderborn"
  wraith: 'wisps',
  skeleton: 'dust', gargoyle: 'dust',
};
export const materialOf = (who) => (who === 'player' ? 'blood' : MATERIAL[who] ?? 'blood');
export const STYLE_OF = { blood: 'ink', dust: 'spark', embers: 'spark', wisps: 'spark', heal: 'heal' };

// Colour ramps (r,g,b): dark, mid, hot; fall = which way gravity pulls.
const PAL = {
  blood: { dark: '58,0,0', mid: '150,12,12', hot: '255,96,72', fall: 1 },
  dust: { dark: '62,54,42', mid: '190,178,155', hot: '255,244,215', fall: 1 },
  embers: { dark: '130,44,0', mid: '255,178,40', hot: '255,247,196', fall: -1 }, // fire: yellow-white core, amber tail
  wisps: { dark: '20,60,80', mid: '150,220,255', hot: '235,252,255', fall: -1 },
};
const MULT = { hit: 1, crit: 1.8, kill: 2.4 };
const MAX = 450, BUDGET = 300;
const THINNABLE = new Set(['streak', 'blob', 'dot']);
const R = Math.random, rr = (a, b) => a + R() * (b - a);
let canvas = null, ctx2d = null, parts = [], running = false, last = 0, scale = 1;
let box = null; // last frame's painted area, device px: [x0, y0, x1, y1]

export function particlesEnabled() {
  return isBg3dActive() && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Attach the canvas to a combat room's fx layer. One canvas for the whole
// session (0.129): a new full-screen one per room cost a ~10 ms hitch on
// each room's first hit (allocating its backing store).
let shared = null;
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
  layer.prepend(canvas);
}

// Burst at screen point (x, y). dir: -1 sprays left, 1 right, 0 all round.
// size: the card height, so bursts scale with the cards. kind: 'hit' |
// 'crit' | 'kill' (big: true = a kill). floor: the card's bottom edge,
// where ink drops land.
export function burst(material, x, y, opts = {}) {
  if (!canvas?.isConnected) return;
  // Crowded (OVERKILL: a kill burst on every card at once): past BUDGET
  // live particles a new burst keeps its rings, flashes and slashes but
  // only some of its streaks, blobs and sparks (0.129).
  const list = spawnParticles(material, x, y, opts);
  const keep = Math.min(1, Math.max(0.35, (BUDGET - parts.length) / list.length));
  for (const p of list) {
    if (parts.length >= MAX) break;
    if (keep < 1 && THINNABLE.has(p.kind) && R() > keep) continue;
    parts.push(p);
  }
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
}

// The particles of one burst (pure; the smoke suite checks the looks).
export function spawnParticles(material, x, y, { dir = 0, size = 400, big = false, kind = big ? 'kill' : 'hit', floor = null } = {}) {
  const h = { x, y, dir, kind, mult: MULT[kind] ?? 1, floor, mat: material };
  if (material === 'heal') return heal(h, size / 400);
  // the looks were tuned in the lab on a card ~290px tall at u = 1
  h.u = size / 290;
  return STYLE_OF[material] === 'spark' ? spark(h) : ink(h);
}

// Ink & Gore (after Darkest Dungeon).
function ink(h) {
  const out = [], P = PAL.blood, u = h.u, side = h.dir < 0 ? -1 : 1;
  out.push({ kind: 'slash', x: h.x, y: h.y, age: 0, life: h.kind === 'hit' ? 0.2 : 0.3, len: (h.kind === 'hit' ? 150 : 210) * u,
    w: (h.kind === 'crit' ? 16 : 11) * u, color: P.dark, edge: P.hot, rot: side * rr(-0.75, -0.45) });
  const n = Math.round(12 * h.mult);
  for (let i = 0; i < n; i++) {
    // a spray away from the blow (a kill bursts all round)
    const a = h.dir === 0 && h.kind === 'kill' ? R() * Math.PI * 2 - Math.PI : rr(-0.9, 0.5), s = rr(160, 460) * u;
    out.push({ kind: 'blob', x: h.x + rr(-14, 14) * u, y: h.y + rr(-14, 14) * u, vx: side * Math.cos(a) * s, vy: Math.sin(a) * s - 120 * u,
      g: 1100 * u, drag: 0.9, age: 0, life: rr(0.7, 1.1), size: rr(3, 8) * u * (h.kind === 'kill' ? 1.25 : 1),
      color: R() < 0.55 ? P.dark : P.mid, floor: h.floor });
  }
  return out;
}

// Spark & Streak (after Hades).
function spark(h) {
  const out = [], P = PAL[h.mat] ?? PAL.dust, u = h.u;
  out.push({ kind: 'ring', x: h.x, y: h.y, age: 0, life: 0.28, r0: 10 * u, r1: (h.kind === 'hit' ? 70 : 115) * u, color: P.hot });
  if (h.kind !== 'hit') out.push({ kind: 'ring', x: h.x, y: h.y, age: -0.06, life: 0.34, r0: 6 * u, r1: 165 * u, color: P.mid });
  out.push({ kind: 'flash', x: h.x, y: h.y, age: 0, life: 0.12, size: (h.kind === 'hit' ? 46 : 80) * u, color: P.hot });
  const n = Math.round(20 * h.mult);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, s = rr(380, 980) * u;
    out.push({ kind: 'streak', x: h.x, y: h.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 300 * u * P.fall, drag: 6, age: 0,
      life: rr(0.22, 0.42), size: rr(1.6, 3) * u, hot: P.hot, mid: P.mid });
  }
  if (h.mat === 'embers') { // cinders float up and flicker after the hit
    const c = Math.round(8 * h.mult);
    for (let i = 0; i < c; i++) {
      out.push({ kind: 'dot', x: h.x + rr(-30, 30) * u, y: h.y + rr(-20, 30) * u, vx: rr(-40, 40) * u, vy: -rr(60, 160) * u, g: -40 * u,
        drag: 0.9, age: 0, life: rr(0.7, 1.4), size: rr(1.2, 2.4) * u, color: R() < 0.5 ? P.hot : P.mid, glow: true, wobble: R() * 6, flicker: true });
    }
  }
  return out;
}

// Potion sparkles: green, rising, spread across the figure (0.089).
function heal(h, u) {
  const out = [], n = 26;
  for (let i = 0; i < n; i++) {
    out.push({ kind: 'dot', x: h.x + (R() - 0.5) * 120 * u, y: h.y + (R() - 0.2) * 160 * u, vx: (R() - 0.5) * 30 * u, vy: -(50 + R() * 90) * u,
      g: -30 * u, drag: 0.6, age: 0, life: 0.9 + R() * 0.8, size: (2 + R() * 3) * u, color: R() < 0.5 ? '120,255,140' : '190,255,170', glow: true, wobble: R() * 6 });
  }
  return out;
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
    else (p.kind === 'splat' ? floor : p.kind === 'slash' ? ink : glow).push(p);
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
  if (parts.length) requestAnimationFrame(tick);
  else running = false; // render() already cleared the last painted area
}

// Backing store at up to 1.25x device pixels (0.129, was 1.5: particles are
// fast and soft — 1.5 cost ~20% more raster for no visible gain; more is
// waste), and 1x once the 3D background has had to step down its quality
// (0.129: the device is struggling). true = the canvas was resized.
function fit() {
  scale = Math.min(globalThis.devicePixelRatio || 1, bgQualityLevel() > 0 ? 1 : 1.25);
  const w = Math.round(canvas.clientWidth * scale), h = Math.round(canvas.clientHeight * scale);
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w; canvas.height = h;
  return true;
}

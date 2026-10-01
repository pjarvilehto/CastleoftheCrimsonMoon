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

import { isBg3dActive } from '../core/bg3d.js';

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
const MAX = 450;
const R = Math.random, rr = (a, b) => a + R() * (b - a);
let canvas = null, ctx2d = null, parts = [], running = false, last = 0, scale = 1;

export function particlesEnabled() {
  return isBg3dActive() && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// (Re)attach the canvas to a combat room's fx layer.
export function attachParticles(layer) {
  parts = [];
  if (!layer || !particlesEnabled()) { canvas = null; return; }
  canvas = document.createElement('canvas');
  canvas.className = 'fx-particles';
  ctx2d = canvas.getContext?.('2d') ?? null;
  if (!ctx2d) { canvas = null; return; }
  layer.prepend(canvas);
}

// Burst at screen point (x, y). dir: -1 sprays left, 1 right, 0 all round.
// size: the card height, so bursts scale with the cards. kind: 'hit' |
// 'crit' | 'kill' (big: true = a kill). floor: the card's bottom edge,
// where ink drops land.
export function burst(material, x, y, opts = {}) {
  if (!canvas?.isConnected) return;
  for (const p of spawnParticles(material, x, y, opts)) if (parts.length < MAX) parts.push(p);
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

function step(p, dt) {
  if (p.vx === undefined) return;
  p.vx *= Math.exp(-p.drag * dt);
  p.vy = p.vy * Math.exp(-p.drag * dt) + p.g * dt;
  p.x += p.vx * dt + (p.wobble ? Math.sin(p.age * 5 + p.wobble) * 0.6 : 0);
  p.y += p.vy * dt;
  if (p.floor && p.y > p.floor && p.kind === 'blob') { // lands: a splat that fades slowly
    Object.assign(p, { kind: 'splat', y: p.floor + rr(-3, 3), vx: undefined, age: 0, life: rr(1.4, 2.2), w: p.size * rr(2.2, 3.4) });
  }
}

function draw(c, p) {
  if (p.age < 0) return; // a delayed ring
  const k = Math.max(0, 1 - p.age / p.life);
  switch (p.kind) {
    case 'dot': {
      const fl = p.flicker ? 0.55 + 0.45 * Math.sin(p.age * 38 + p.wobble * 9) : 1;
      c.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      c.fillStyle = `rgba(${p.color},${0.55 * k * fl})`;
      c.beginPath(); c.arc(p.x, p.y, Math.max(0.5, p.size * (0.6 + k * 0.4)), 0, 7); c.fill(); break;
    }
    case 'blob': {
      const st = Math.min(3.2, 1 + Math.hypot(p.vx, p.vy) / 260); // stretched along its flight, like a brush flick
      c.globalCompositeOperation = 'source-over';
      c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p.vy, p.vx));
      c.fillStyle = `rgba(${p.color},${0.95 * Math.min(1, k * 1.6)})`;
      c.beginPath(); c.ellipse(0, 0, p.size * st, p.size / Math.sqrt(st), 0, 0, 7); c.fill(); c.restore(); break;
    }
    case 'splat':
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = `rgba(${p.color},${0.85 * k})`;
      c.beginPath(); c.ellipse(p.x, p.y, p.w, p.w * 0.28, 0, 0, 7); c.fill(); break;
    case 'slash': {
      const t = p.age / p.life, L = p.len * Math.min(1, t * 4), x0 = -p.len / 2;
      c.globalCompositeOperation = 'source-over';
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = `rgba(${p.color},${0.92 * (1 - t)})`;
      c.beginPath(); c.moveTo(x0, 0); c.quadraticCurveTo(x0 + L / 2, -p.w, x0 + L, 0); c.quadraticCurveTo(x0 + L / 2, p.w * 0.35, x0, 0); c.fill();
      // a thin hot edge along the cut, so the dark ink reads on dark rooms
      c.strokeStyle = `rgba(${p.edge},${0.85 * (1 - t)})`; c.lineWidth = Math.max(1, p.w * 0.14);
      c.beginPath(); c.moveTo(x0, 0); c.quadraticCurveTo(x0 + L / 2, -p.w, x0 + L, 0); c.stroke();
      c.restore(); break;
    }
    case 'ring': {
      const t = p.age / p.life, r = p.r0 + (p.r1 - p.r0) * (1 - (1 - t) ** 3);
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgba(${p.color},${0.9 * (1 - t)})`; c.lineWidth = Math.max(1, 7 * (1 - t));
      c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.stroke(); break;
    }
    case 'flash': {
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      g.addColorStop(0, `rgba(${p.color},${0.9 * k})`); g.addColorStop(1, `rgba(${p.color},0)`);
      c.globalCompositeOperation = 'lighter'; c.fillStyle = g;
      c.beginPath(); c.arc(p.x, p.y, p.size, 0, 7); c.fill(); break;
    }
    case 'streak': {
      const sp = Math.hypot(p.vx, p.vy) || 1, len = Math.min(70, sp * 0.05) + 3;
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineWidth = p.size;
      c.strokeStyle = `rgba(${k > 0.6 ? p.hot : p.mid},${Math.min(1, k * 1.4)})`; // white-hot, then cooling
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len); c.stroke(); break;
    }
  }
}

function tick(now) {
  if (!canvas?.isConnected) { running = false; parts = []; return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fit();
  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.setTransform(scale, 0, 0, scale, 0, 0); // particles live in CSS px
  parts = parts.filter((p) => (p.age += dt) < p.life);
  for (const p of parts) { step(p, dt); draw(ctx2d, p); }
  if (parts.length) requestAnimationFrame(tick);
  else { ctx2d.setTransform(1, 0, 0, 1, 0, 0); ctx2d.clearRect(0, 0, canvas.width, canvas.height); running = false; }
}

// Backing store at up to 1.5x device pixels (particles are small; more is waste).
function fit() {
  scale = Math.min(globalThis.devicePixelRatio || 1, 1.5);
  const w = Math.round(canvas.clientWidth * scale), h = Math.round(canvas.clientHeight * scale);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

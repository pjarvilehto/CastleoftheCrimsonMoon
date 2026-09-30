// ui/particles.js — combat particle bursts (0.089). One shared <canvas>
// in the fx layer; its animation loop runs ONLY while particles are alive
// and stops when the last one fades. No assets: every particle is a
// circle drawn in code.
//
// What comes out of a hit depends on what the target is made of
// (MATERIAL, by enemy id): blood for flesh, embers for the Cinderborn,
// soul wisps for the wraith, dust for bone and stone.
// Off under prefers-reduced-motion, and when the 3D background has fallen
// back to flat (the renderer's own weak-device signal).

import { isBg3dActive } from '../core/bg3d.js';

export const MATERIAL = {
  ghoul: 'embers',            // "Cinderborn"
  wraith: 'wisps',
  skeleton: 'dust', gargoyle: 'dust',
};
export const materialOf = (who) => (who === 'player' ? 'blood' : MATERIAL[who] ?? 'blood');

const MAX = 450;
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
// size: the card height, so bursts scale with the cards. big: a kill.
export function burst(material, x, y, { dir = 0, size = 400, big = false } = {}) {
  if (!canvas?.isConnected) return;
  const n = Math.round((big ? 2.2 : 1) * { blood: 18, embers: 22, wisps: 10, dust: 16, heal: 26 }[material]);
  const u = size / 400; // unit: 1 at a 400px-tall card
  for (let i = 0; i < n && parts.length < MAX; i++) parts.push(spawn(material, x, y, dir, u, big));
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
}

function spawn(material, x, y, dir, u, big) {
  const r = Math.random;
  const spread = dir === 0 ? Math.PI * 2 : Math.PI * 0.9;
  const base = dir === 0 ? 0 : dir > 0 ? 0 : Math.PI;
  const a = base + (r() - 0.5) * spread;
  // each particle starts a little off the burst point (0.090): a spray, not a pinhole
  const p = { x: x + (r() - 0.5) * 36 * u, y: y + (r() - 0.5) * 36 * u, age: 0, material };
  switch (material) {
    case 'embers': {
      const s = (60 + r() * 160) * u;
      Object.assign(p, { vx: Math.cos(a) * s * 0.7, vy: -Math.abs(Math.sin(a)) * s - 40 * u, g: -60 * u, drag: 1.8,
        life: 0.7 + r() * 0.8, size: (1.5 + r() * 2.5) * u, color: r() < 0.5 ? '255,170,60' : '255,110,30', glow: true });
      break;
    }
    case 'wisps': {
      const s = (20 + r() * 50) * u;
      Object.assign(p, { vx: Math.cos(a) * s, vy: -(30 + r() * 60) * u, g: -20 * u, drag: 0.8,
        life: (big ? 1.6 : 1.1) + r() * 0.8, size: (4 + r() * 7) * u, color: '170,230,255', glow: true, wobble: r() * 6 });
      break;
    }
    case 'heal': { // potion sparkles: green, rising, spread across the figure
      Object.assign(p, { x: x + (r() - 0.5) * 120 * u, y: y + (r() - 0.2) * 160 * u, vx: (r() - 0.5) * 30 * u, vy: -(50 + r() * 90) * u,
        g: -30 * u, drag: 0.6, life: 0.9 + r() * 0.8, size: (2 + r() * 3) * u, color: r() < 0.5 ? '120,255,140' : '190,255,170', glow: true, wobble: r() * 6 });
      break;
    }
    case 'dust': {
      const s = (80 + r() * 200) * u;
      Object.assign(p, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60 * u, g: 700 * u, drag: 2.5,
        life: 0.5 + r() * 0.5, size: (1.5 + r() * 3) * u, color: r() < 0.5 ? '190,180,160' : '130,120,110' });
      break;
    }
    default: { // blood
      const s = (120 + r() * 260) * u;
      Object.assign(p, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90 * u, g: 900 * u, drag: 1.2,
        life: 0.45 + r() * 0.45, size: (1.5 + r() * 3.5) * u, color: r() < 0.6 ? '150,10,10' : '200,25,25' });
    }
  }
  return p;
}

function tick(now) {
  if (!canvas?.isConnected) { running = false; parts = []; return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fit();
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter((p) => (p.age += dt) < p.life);
  for (const p of parts) {
    p.vx *= Math.exp(-p.drag * dt);
    p.vy = p.vy * Math.exp(-p.drag * dt) + p.g * dt;
    p.x += p.vx * dt + (p.wobble ? Math.sin(p.age * 5 + p.wobble) * 0.6 : 0);
    p.y += p.vy * dt;
    const k = 1 - p.age / p.life; // fades out over its life
    ctx2d.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
    ctx2d.fillStyle = `rgba(${p.color},${(p.glow ? 0.55 : 0.9) * k})`;
    ctx2d.beginPath();
    ctx2d.arc(p.x * scale, p.y * scale, Math.max(0.5, p.size * (p.glow ? 0.6 + k * 0.4 : 1) * scale), 0, Math.PI * 2);
    ctx2d.fill();
  }
  if (parts.length) requestAnimationFrame(tick);
  else { ctx2d.clearRect(0, 0, canvas.width, canvas.height); running = false; }
}

// Backing store at up to 1.5x device pixels (particles are small; more is waste).
function fit() {
  scale = Math.min(globalThis.devicePixelRatio || 1, 1.5);
  const w = Math.round(canvas.clientWidth * scale), h = Math.round(canvas.clientHeight * scale);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

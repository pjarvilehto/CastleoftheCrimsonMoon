// ui/particleLooks.js — what comes out of a hit (0.089; looks 0.128;
// split out of ui/particles.js, 0.136, which draws them). Pure: no DOM,
// no canvas — spawnParticles() returns the particles of one burst, and the
// smoke suite checks the looks directly.
//
// What comes out depends on what the target is made of (MATERIAL, by enemy
// id), and each material has its look (STYLE_OF, picked in the Particle
// Lab, particle-lab/):
//   blood (flesh, the knight) — Ink & Gore: few heavy dark blobs stretched
//     along their flight, an ink slash across the target, drops that land
//     on the card floor as splats and fade slowly.
//   dust (bone, stone), embers (the Cinderborn), wisps (the wraith) —
//     Spark & Streak: additive streaks stretched by their speed, white-hot
//     cooling to the material colour, an impact ring (two on a crit); fire
//     on a yellow ramp with cinders floating up after the hit.
// Bursts come in three sizes: hit, crit (heavy too), kill. A particle is a
// plain object { kind, x, y, vx?, vy?, g?, drag?, age, life, size, ... };
// the kinds are drawn by ui/particles.js (blob, splat, slash, streak,
// ring, flash, dot).

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

// Math.random looked up per call, not captured at load: the benchmark swaps
// in a seeded one, and a captured reference kept the particles random (0.136).
export const R = () => Math.random();
export const rr = (a, b) => a + R() * (b - a);

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

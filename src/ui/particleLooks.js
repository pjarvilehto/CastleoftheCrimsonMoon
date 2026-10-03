// ui/particleLooks.js — what comes out of a hit (0.089; looks 0.128;
// split out of ui/particles.js, 0.136, which draws them). Pure: no DOM,
// no canvas — spawnParticles() returns the particles of one burst, and the
// smoke suite checks the looks directly.
//
// What comes out depends on what the target is made of (MATERIAL, by enemy
// id), and each material has its look (STYLE_OF, picked in the Particle
// Lab, labs/particles/):
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
export function spawnParticles(material, x, y, { dir = 0, size, big = false, kind = big ? 'kill' : 'hit', floor = null } = {}) { // (size: the card's, every caller passes it)
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

// ---- the classes' own traces (0.00268, the developer's ask: each class's
// attacks unique) ----
// A class's blow lays its own trace over the foe's material burst (the
// steel, rust, fire, grave-green, moss, violet or ochre of its theme), and
// its events (the hex, the blight, the wild shape, a charge back, the
// thrall) burst on their own. spawnClassBurst(look, x, y, opts) is pure like
// spawnParticles; combatFx.js classTrace() picks the look from the class
// and the blow. New kinds: puff (soft smoke, source-over, growing), sigil
// (a turning pentagram in a ring), arc (a crescent stroke sweeping) and a
// dot that seeks a point (tx, ty, pull — the soul wisps).
export const CLASS_PAL = {
  steel: { dark: '70,74,84', mid: '200,206,220', hot: '255,255,255' },         // the Knight's heavy
  rust: { dark: '110,30,8', mid: '236,110,40', hot: '255,214,150' },          // the Barbarian
  fire: PAL.embers,                                                           // the Wizard's fireball
  arcane: { dark: '20,40,120', mid: '90,150,255', hot: '190,214,255' },       // the Wizard's blows (a hot that still reads blue)
  grave: { dark: '10,50,30', mid: '80,220,120', hot: '180,255,200' },         // the Necromancer
  moss: { dark: '30,70,20', mid: '140,210,70', hot: '220,255,180' },          // the Druid
  violet: { dark: '60,20,110', mid: '180,110,255', hot: '240,220,255' },      // the Hexhunter
  ochre: { dark: '70,60,20', mid: '200,180,80', hot: '245,235,180' },         // the Plague Sister
};
export const CLASS_LOOKS = ['steel', 'cleave', 'cleavespill', 'rage', 'fireball', 'arcane', 'charge', 'drain', 'grave', 'thrall', 'thrallhit', 'thrallfall', 'claw', 'thorn', 'wild', 'hex', 'hexhit', 'hexspark', 'censer', 'blight', 'incense'];

// the primitives, each sized by u (the card's height / 290, as the looks above)
const sparks = (h, P, n, lo, hi, fall = 1, life = [0.2, 0.4]) => { // additive streaks all round, white-hot cooling to the colour
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, s = rr(lo, hi) * h.u;
    out.push({ kind: 'streak', x: h.x, y: h.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 300 * h.u * fall, drag: 6, age: 0, life: rr(life[0], life[1]), size: rr(1.4, 2.6) * h.u, hot: P.hot, mid: P.mid });
  }
  return out;
};
const motes = (h, P, n, { spread = 40, rise = [50, 140], life = [0.7, 1.3], size = [2, 3.6], fall = -1, tx, ty, pull = 0 } = {}) => { // glowing dots that drift and flicker (embers, wisps, incense sparks)
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ kind: 'dot', x: h.x + rr(-spread, spread) * h.u, y: h.y + rr(-spread * 0.6, spread) * h.u, vx: rr(-40, 40) * h.u, vy: -rr(rise[0], rise[1]) * h.u * (fall < 0 ? 1 : -1), g: 40 * h.u * fall,
      drag: 0.9, age: 0, life: rr(life[0], life[1]), size: rr(size[0], size[1]) * h.u, color: R() < 0.5 ? P.hot : P.mid, glow: true, wobble: R() * 6, flicker: true,
      ...(pull > 0 ? { tx, ty, pull: pull * h.u, drag: 1.6 } : {}) });
  }
  return out;
};
const puffs = (h, P, n, { spread = 36, size = [14, 24], rise = [20, 60], life = [0.9, 1.6], alpha = 0.32 } = {}) => { // soft smoke, rolling up and growing
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ kind: 'puff', x: h.x + rr(-spread, spread) * h.u, y: h.y + rr(-spread * 0.4, spread * 0.6) * h.u, vx: rr(-25, 25) * h.u, vy: -rr(rise[0], rise[1]) * h.u, g: -10 * h.u,
      drag: 0.8, age: 0, life: rr(life[0], life[1]), size: rr(size[0], size[1]) * h.u, color: R() < 0.6 ? P.dark : P.mid, alpha, grow: rr(1.4, 2.2), wobble: R() * 6 });
  }
  return out;
};
const leaves = (h, P, n, all = false) => { // blobs that tumble and settle: leaves and bark
  const out = [], side = h.dir < 0 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const a = all ? R() * Math.PI * 2 : rr(-1.2, 0.3), s = rr(120, 360) * h.u;
    out.push({ kind: 'blob', x: h.x + rr(-16, 16) * h.u, y: h.y + rr(-16, 16) * h.u, vx: (all ? 1 : side) * Math.cos(a) * s, vy: Math.sin(a) * s - 80 * h.u,
      g: 260 * h.u, drag: 1.6, age: 0, life: rr(0.8, 1.3), size: rr(2.5, 5) * h.u, color: R() < 0.5 ? P.mid : P.dark, wobble: R() * 6 });
  }
  return out;
};
const ring = (h, P, r1, life = 0.3, age = 0, color = P.hot) => ({ kind: 'ring', x: h.x, y: h.y, age, life, r0: 8 * h.u, r1: r1 * h.u, color });
const flash = (h, P, size, life = 0.14, color = P.hot) => ({ kind: 'flash', x: h.x, y: h.y, age: 0, life, size: size * h.u, color });
const rakes = (h, P, n, len, w) => { // n parallel cuts across the figure, the class colour on their edge
  const out = [], side = h.dir < 0 ? -1 : 1, rot = side * rr(-0.8, -0.5), nx = -Math.sin(rot), ny = Math.cos(rot);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 16 * h.u;
    out.push({ kind: 'slash', x: h.x + nx * off, y: h.y + ny * off, age: i * 0.03, life: 0.28, len: len * h.u, w: w * h.u, color: P.dark, edge: P.hot, rot });
  }
  return out;
};
const arc = (h, P, r, w, life = 0.42) => ({ kind: 'arc', x: h.x, y: h.y + r * 0.9 * h.u, age: 0, life, r: r * h.u, a0: h.dir < 0 ? -Math.PI * 0.25 : -Math.PI * 0.75, sweep: (h.dir < 0 ? -1 : 1) * Math.PI * 0.5, w: w * h.u, color: P.mid, edge: P.hot }); // a crescent swung across the figure
const sigil = (h, P, r, life, spin) => ({ kind: 'sigil', x: h.x, y: h.y, age: 0, life, r: r * h.u, spin, color: P.mid, edge: P.hot });

// One class burst (pure). opts: size (the card's height), dir (-1 / 1, the
// way the blow goes), kind ('hit' | 'crit'), to ({ x, y } — the drain's
// wisps fly there).
export function spawnClassBurst(look, x, y, { size, dir = 1, kind = 'hit', to = null } = {}) {
  const h = { x, y, dir, u: size / 290 }, big = kind !== 'hit', m = big ? 1.5 : 1, C = CLASS_PAL;
  switch (look) {
    case 'steel': return [flash(h, C.steel, 36), ...sparks(h, C.steel, 14, 420, 900, 1, [0.14, 0.3])]; // the Knight's heavy: a steel clash
    case 'cleave': return [arc(h, C.rust, 170, 20, 0.5), flash(h, C.rust, 60, 0.14, C.rust.mid), ...sparks(h, C.rust, 18, 300, 760, -1), ...motes(h, C.rust, 10, { spread: 50 })]; // the Barbarian's Cleave: a wide crescent swung through the foe, embers off the edge
    case 'cleavespill': return [arc(h, C.rust, 120, 14, 0.42), ...sparks(h, C.rust, 10, 260, 600, -1), ...motes(h, C.rust, 5)];
    case 'rage': return [flash(h, C.rust, 34, 0.12, C.rust.mid), ...motes(h, C.rust, 9, { spread: 30, rise: [40, 110], life: [0.5, 0.9] })]; // his blows shed embers
    case 'fireball': return [flash(h, C.fire, big ? 130 : 95, 0.26, C.fire.mid), flash(h, C.fire, big ? 55 : 40, 0.16), ...sparks(h, C.fire, Math.round(22 * m), 300, 820, -1, [0.3, 0.5]), ...motes(h, C.fire, Math.round(12 * m), { spread: 40, rise: [80, 200], life: [0.7, 1.4] }), ...puffs(h, { dark: '28,18,12', mid: '70,46,30' }, 5, { size: [16, 28], rise: [40, 90], alpha: 0.4 })]; // the Wizard's Fireball: a bloom, cinders, smoke
    case 'arcane': return [flash(h, C.arcane, 60, 0.16, C.arcane.mid), flash(h, C.arcane, 26, 0.1), ...sparks(h, C.arcane, 12, 320, 700, 0, [0.18, 0.34]), ...motes(h, C.arcane, 5, { spread: 30, life: [0.4, 0.8] })]; // his blows: an arcane bolt's crackle
    case 'charge': return [flash(h, C.arcane, 50, 0.3, C.arcane.mid), ...motes(h, C.arcane, 12, { spread: 50, rise: [60, 160], life: [0.6, 1.1], size: [1.6, 3.2] })]; // a charge back into the grimoire
    case 'drain': return [ring(h, C.grave, 90, 0.34), ...motes(h, C.grave, 24, { spread: 40, rise: [20, 60], life: [0.8, 1.2], size: [3.2, 5.2], tx: to?.x ?? x, ty: to?.y ?? y, pull: to ? 3200 : 0 })]; // the Necromancer's Soul Drain: wisps torn out of the foe fly to him
    case 'grave': return [flash(h, C.grave, 40, 0.16, C.grave.mid), ...motes(h, C.grave, 12, { spread: 30, rise: [30, 90], life: [0.6, 1.1] })]; // his blows: grave motes
    case 'thrall': return [ring(h, C.grave, 110, 0.4, 0, C.grave.mid), flash(h, C.grave, 60, 0.3), ...motes(h, C.grave, 18, { spread: 50, rise: [60, 160], life: [0.8, 1.4], size: [1.6, 3.2] })]; // a foe rises again at his side
    case 'thrallhit': return motes(h, C.grave, 6, { spread: 40, rise: [20, 70], life: [0.4, 0.8] });
    case 'thrallfall': return [...motes(h, C.grave, 12, { spread: 50, rise: [-80, -20], life: [0.6, 1.1], fall: 1 }), ...puffs(h, C.grave, 3, { size: [14, 22], alpha: 0.25 })]; // the thrall crumbles: motes and dust fall
    case 'claw': return [...rakes(h, C.moss, 3, 170, 9), ...leaves(h, C.moss, 8), ...sparks(h, C.moss, 6, 260, 560, 1, [0.16, 0.3])]; // the Druid's feral blow: three rakes and leaves
    case 'thorn': return [...rakes(h, C.moss, 1, 130, 6), ...leaves(h, C.moss, 4)]; // his blow before the shape
    case 'wild': return [ring(h, C.moss, 150, 0.4), flash(h, C.moss, 70, 0.3), ...leaves(h, C.moss, 26, true), ...motes(h, C.moss, 10, { spread: 60, rise: [60, 150], life: [0.8, 1.4] })]; // Go Feral: leaves burst from the Druid
    case 'hex': return [sigil(h, C.violet, 82, 0.95, 2.2), ring(h, C.violet, 120, 0.36, 0, C.violet.mid), ...sparks(h, C.violet, 16, 240, 640, -1, [0.3, 0.5])]; // the Hexhunter's Hex: a sigil turns on the foe
    case 'hexhit': return [sigil(h, C.violet, 60, 0.5, 4), flash(h, C.violet, 50, 0.14), ...sparks(h, C.violet, Math.round(12 * m), 360, 820, -1, [0.2, 0.4])]; // a blow on the hexed foe: the sigil flares
    case 'hexspark': return [...sparks(h, C.violet, 6, 280, 600, -1, [0.16, 0.3]), ...motes(h, C.violet, 3, { spread: 20, life: [0.4, 0.8] })]; // her other blows
    case 'censer': return [...puffs(h, C.ochre, 8, { spread: 44, size: [16, 30], rise: [25, 70], life: [1.1, 1.9] }), ...motes(h, C.ochre, 6, { spread: 40, rise: [50, 130], life: [0.7, 1.3], size: [1.2, 2.2] })]; // Last Rites: the censer's smoke settles on a foe
    case 'blight': return [...puffs(h, C.ochre, 4, { spread: 30, size: [10, 18], rise: [25, 60], life: [0.8, 1.3], alpha: 0.28 }), ...motes(h, C.ochre, 4, { spread: 26, rise: [40, 100], life: [0.5, 1] })]; // the blight gnaws: a wisp of it rises
    case 'incense': return [...puffs(h, C.ochre, 5, { spread: 26, size: [14, 24], rise: [30, 70], life: [0.7, 1.2], alpha: 0.4 }), ...motes(h, C.ochre, 6, { spread: 24, rise: [40, 110], life: [0.5, 0.9] })]; // her blows: a swing of the censer
    default: return [];
  }
}

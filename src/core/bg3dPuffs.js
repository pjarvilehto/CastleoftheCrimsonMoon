// core/bg3dPuffs.js — the drifting mist (0.101): large soft "puffs" placed
// IN the scene volume and drawn as camera-facing sprites (bg3dPuffGL.js).
// What makes it read as volume: each puff fades softly where the painted
// scene is nearer than it (depth map), so mist sits between the pillars and
// behind the well; nearer puffs are bigger and slide further when the
// camera sways; each is lit from above (its own lumps shade it). They drift
// with the scene's wind — sideways, toward or away from the camera —
// wrapping around a box whose edges fade, and rock and breathe slowly.
// Tuning: backgrounds.json parallax `puffs` + `fogWind` (per-file overrides).
// No DOM or WebGL here — the smoke suite tests it in Node.

import { fogNoise, mulberry32 } from './bg3dFog.js';

// World units: the focal plane is 1 in front of the camera; the art spans
// roughly 0.6 (near) to 1.4 (far). y is up; puffs hang low (y is biased
// toward its lower end). P (backgrounds.json parallax.puffs): count, size
// and y ranges, width = the box half-width (covers the frustum at `far`),
// near/far = distance range, with fading bands at both ends.

// A stable scene-specific seed (the same file always gets the same puffs).
export function seedOf(name) {
  let h = 2166136261;
  for (const ch of String(name)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const lerp = (a, b, t) => a + (b - a) * t;

export function makePuffs(seed, P) {
  const r = mulberry32(seed);
  return Array.from({ length: P.count }, () => ({
    x: lerp(-P.width, P.width, r()),
    y: lerp(P.y[0], P.y[1], r() ** 1.6),
    d: lerp(P.near, P.far, r()),
    size: lerp(P.size[0], P.size[1], r()),
    speed: lerp(0.7, 1.3, r()),       // not in lockstep
    variant: Math.floor(r() * 4),     // sprite atlas cell
    spin: lerp(0.06, 0.16, r()) * (r() < 0.5 ? -1 : 1), // rocking amplitude (rad)
    phase: r() * Math.PI * 2,
    period: lerp(24, 46, r()),        // s
    shade: lerp(0.88, 1.1, r()),
    alpha: lerp(0.6, 1, r()),
  }));
}

const wrapIn = (v, lo, hi) => lo + ((((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo));
const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
// 1 inside [lo, hi], easing to 0 over `band` at each end
const inBox = (v, lo, hi, bandLo, bandHi = bandLo) => Math.min(smooth((v - lo) / bandLo), smooth((hi - v) / bandHi));

// The puffs at time t (seconds): wind [x, y, z] in world units/s, +z =
// toward the camera. Far ones first (drawn back to front).
export function puffFrame(puffs, t, P, wind) {
  const yLo = P.y[0] - 0.25, yHi = P.y[1] + 0.25;
  return puffs.map((p) => {
    const w = (p.phase + (t * Math.PI * 2) / p.period);
    const x = wrapIn(p.x + wind[0] * p.speed * t, -P.width, P.width);
    const y = wrapIn(p.y + wind[1] * p.speed * t, yLo, yHi) + Math.sin(w * 0.7) * 0.012;
    const d = wrapIn(p.d - wind[2] * p.speed * t, P.near, P.far);
    const alpha = p.alpha * inBox(x, -P.width, P.width, 0.25) * inBox(y, yLo, yHi, 0.12)
      * inBox(d, P.near, P.far, P.nearBand, P.farBand);
    return { pos: [x, y, -d], size: p.size * (1 + Math.sin(w * 1.3) * 0.06), rot: p.spin * Math.sin(w),
      alpha, variant: p.variant, shade: p.shade };
  }).filter((q) => q.alpha > 0.004).sort((a, b) => a.pos[2] - b.pos[2]);
}

// Vertex data, 4 corners per puff: world position (3), atlas uv (2), local
// height -1..1 (1), alpha (1), shade (1). The quad is TALL x as high as it
// is wide — the sprites are wider than high, and every pixel of a big
// overlapping quad costs fill rate.
export const PUFF_FLOATS = 8;
export const TALL = 0.8;
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
export function puffVertices(frame, out = new Float32Array(frame.length * 4 * PUFF_FLOATS)) {
  let o = 0; // written in place: no per-corner arrays (160 a frame, 0.157)
  for (const p of frame) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot), h = p.size / 2;
    const cu = (p.variant % 2) * 0.5, cv = Math.floor(p.variant / 2) * 0.5;
    for (const [a, b] of CORNERS) {
      const bt = b * TALL, rx = a * c - bt * s, ry = a * s + bt * c;
      out[o++] = p.pos[0] + rx * h; out[o++] = p.pos[1] + ry * h; out[o++] = p.pos[2];
      out[o++] = cu + (a + 1) * 0.25; out[o++] = cv + (1 - bt) * 0.25;
      out[o++] = ry; out[o++] = p.alpha; out[o++] = p.shade;
    }
  }
  return out;
}

// Two triangles per puff.
export function puffIndices(n) {
  const idx = new Uint16Array(n * 6);
  for (let i = 0; i < n; i++) idx.set([0, 1, 2, 0, 2, 3].map((v) => v + i * 4), i * 6);
  return idx;
}

// The sprite atlas: 2x2 cells of `cell` px, four different puffs, as
// luminance + alpha byte pairs: L = density, A = light (baked self-shadow:
// lit from above, so where the puff is denser a little higher up, this
// point is in its own shade; SHADE maps the byte back). Each puff is a
// cluster of soft blobs (a billowy outline) thinned by noise, fading to
// zero inside its cell (no bleeding into a neighbour, even rotated) and
// above/below TALL (outside the quad).
export const SHADE = [0.78, 1.25];
export function puffSprites(cell = 128, seed = 11) {
  const r = mulberry32(seed), size = cell * 2, out = new Uint8Array(size * size * 2);
  const noise = fogNoise(cell, seed + 1);
  for (let v = 0; v < 4; v++) {
    const blobs = Array.from({ length: 9 }, () => {
      const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.42;
      return { x: Math.cos(a) * rad, y: Math.sin(a) * rad * 0.55, r: lerp(0.22, 0.42, r()), w: lerp(0.4, 1, r()) };
    });
    const ox = Math.floor(r() * cell), oy = Math.floor(r() * cell);
    const cx = (v % 2) * cell, cy = Math.floor(v / 2) * cell;
    const cellVals = new Float32Array(cell * cell);
    let max = 0;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const px = ((x + 0.5) / cell) * 2 - 1, py = ((y + 0.5) / cell) * 2 - 1;
      let dens = 0;
      for (const b of blobs) dens += b.w * Math.exp(-((px - b.x) ** 2 + (py - b.y) ** 2) / (b.r * b.r));
      // the noise thins the puff inside (wispy, uneven), it doesn't cut an outline
      const n = smooth((noise[((y + oy) % cell) * cell + ((x + ox) % cell)] / 255 - 0.2) / 0.6);
      const edge = smooth((0.97 - Math.hypot(px, py * 1.25)) / 0.55);
      const val = (1 - Math.exp(-1.4 * dens * (0.45 + 0.55 * n))) * edge;
      cellVals[y * cell + x] = val;
      max = Math.max(max, val);
    }
    const at = (x, y) => (y < 0 ? 0 : cellVals[y * cell + x] / (max || 1));
    const up = Math.round(cell * 0.07);
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const i = ((cy + y) * size + cx + x) * 2;
      const shade = Math.min(SHADE[1], Math.max(SHADE[0], 1 + (at(x, y) - at(x, y - up)) * 1.1));
      out[i] = Math.round(at(x, y) * 255);
      out[i + 1] = Math.round(((shade - SHADE[0]) / (SHADE[1] - SHADE[0])) * 255);
    }
  }
  return out;
}

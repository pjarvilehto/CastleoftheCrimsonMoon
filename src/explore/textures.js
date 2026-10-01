// explore/textures.js — the dungeon's surfaces, painted in code (0.139).
// No image files: each texture is drawn on a canvas the way the game's ink
// art is made (assets/bg/castle_dungeon.jpg is the model) — flat olive-grey
// stone in two or three painted values, broken black outlines, black chips
// and drips of ink, grime. A height canvas (blurred) gives a normal map, so
// torchlight still catches the stones. Seeded: the same textures every time.

import * as THREE from 'three';
import { seeded } from './grid.js';

const SIZE = 512;

// One texture set: { map, normalMap } as three.js textures.
function finish(color, height, strength, blur = 3) {
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normalFrom(height, strength, blur));
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map, normalMap };
}

function canvases() {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = SIZE; return c; };
  const color = mk(), height = mk();
  return { color, height, cx: color.getContext('2d'), hx: height.getContext('2d') };
}

// Height (grey) -> soft (box-blurred, wrapping) -> tangent-space normals (Sobel).
function normalFrom(height, strength, blur) {
  const w = height.width, h = height.height, n = w * h;
  const src = height.getContext('2d').getImageData(0, 0, w, h).data;
  let a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = src[i * 4] / 255;
  for (let pass = 0; pass < 2 && blur > 0; pass++) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -blur; k <= blur; k++) s += a[((y + dy * k + h) % h) * w + ((x + dx * k + w) % w)];
        b[y * w + x] = s / (2 * blur + 1);
      }
      [a, b] = [b, a];
    }
  }
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ox = out.getContext('2d'), img = ox.createImageData(w, h), d = img.data;
  const H = (x, y) => a[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  ox.putImageData(img, 0, 0);
  return out;
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
const INK = 'rgba(6,6,4,0.95)';
const poly = (c, pts) => { c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p); c.closePath(); };

// a chunky stone: a box with its corners knocked off, every point jittered
function stoneShape(x, y, w, h, rnd) {
  const j = (k) => (rnd() - 0.5) * k, c = Math.min(w, h) * (0.05 + rnd() * 0.1);
  return [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]]
    .map(([px, py]) => [px + j(Math.min(w, h) * 0.1), py + j(Math.min(w, h) * 0.1)]);
}

// a ragged black chip of ink
function chip(c, x, y, r, rnd) {
  const n = 5 + Math.floor(rnd() * 3);
  poly(c, Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.6, rr = r * (0.45 + rnd() * 0.75);
    return [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
  }));
  c.fill();
}

// a tapered streak of ink running down from (x, y)
function drip(c, x, y, len, w) {
  c.beginPath(); c.moveTo(x - w / 2, y);
  c.quadraticCurveTo(x - w * 0.3, y + len * 0.6, x, y + len);
  c.quadraticCurveTo(x + w * 0.3, y + len * 0.6, x + w / 2, y);
  c.closePath(); c.fill();
}

// an outline in ink with gaps, like a quick pen line
function brokenOutline(c, pts, rnd, width) {
  c.strokeStyle = INK; c.lineCap = 'round';
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], steps = 3;
    for (let s = 0; s < steps; s++) {
      if (rnd() < 0.18) continue; // a gap
      const t0 = s / steps, t1 = (s + 1) / steps + 0.02;
      c.lineWidth = width * (0.6 + rnd() * 0.8);
      c.beginPath(); c.moveTo(p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0); c.lineTo(p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1); c.stroke();
    }
  });
}

// One stone: flat base value, a lit plane and a shade plane (painted, not
// blended), a few dry-brush strokes, ink chips along the edges, drips off
// the top, a broken outline. Height: the shape, raised, chips dented.
function paintStone(cx, hx, x, y, w, h, tone, rnd, ink = 1) {
  const pts = stoneShape(x, y, w, h, rnd);
  poly(cx, pts); cx.fillStyle = hsl(tone.h, tone.s, tone.l); cx.fill();
  cx.save(); poly(cx, pts); cx.clip();
  const cut = y + h * (0.3 + rnd() * 0.25); // the lit upper plane
  cx.fillStyle = hsl(tone.h, tone.s, tone.l + 5, 0.8);
  poly(cx, [[x - 4, y - 4], [x + w + 4, y - 4], [x + w + 4, cut + (rnd() - 0.5) * h * 0.3], [x + w * 0.5, cut + (rnd() - 0.5) * h * 0.2], [x - 4, cut + (rnd() - 0.5) * h * 0.3]]); cx.fill();
  cx.fillStyle = hsl(tone.h, tone.s, tone.l - 6, 0.75); // the shade plane
  const low = y + h * (0.78 + rnd() * 0.1);
  poly(cx, [[x - 4, low], [x + w * 0.6, low + (rnd() - 0.5) * 8], [x + w + 4, low - 4], [x + w + 4, y + h + 4], [x - 4, y + h + 4]]); cx.fill();
  for (let k = 0; k < 5; k++) { // dry brush along the stone
    const sy = y + rnd() * h, len = w * (0.2 + rnd() * 0.5), sx = x + rnd() * (w - len);
    cx.strokeStyle = hsl(tone.h, tone.s, tone.l + (rnd() - 0.5) * 12, 0.25);
    cx.lineWidth = 2 + rnd() * 5; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(sx + len, sy + (rnd() - 0.5) * 5); cx.stroke();
  }
  cx.fillStyle = INK; hx.fillStyle = '#000';
  for (let k = 0; k < Math.round((3 + rnd() * 6) * ink); k++) { // chips, mostly at the edges
    const e = pts[Math.floor(rnd() * pts.length)], f = pts[Math.floor(rnd() * pts.length)], t = rnd() * 0.3;
    const px = e[0] + (f[0] - e[0]) * t, py = e[1] + (f[1] - e[1]) * t, r = 2 + rnd() * 6;
    chip(cx, px, py, r, rnd); chip(hx, px, py, r, rnd);
  }
  for (let k = 0; k < Math.round(rnd() * 3 * ink); k++) drip(cx, x + 6 + rnd() * (w - 12), y + 2, 8 + rnd() * h * 0.6, 2 + rnd() * 5);
  cx.restore();
  brokenOutline(cx, pts, rnd, 3);
  poly(hx, pts); hx.fillStyle = `rgb(${190 + rnd() * 40 | 0},0,0)`; hx.fill(); // (only red is read)
}

// grime: long dark streaks running down the whole face, and ink spatter
function grime(cx, rnd, n, tone) {
  for (let k = 0; k < n; k++) {
    cx.fillStyle = hsl(tone.h, tone.s, 8, 0.2 + rnd() * 0.25);
    drip(cx, rnd() * SIZE, rnd() * SIZE * 0.6, 40 + rnd() * 160, 4 + rnd() * 10);
  }
  cx.fillStyle = INK;
  for (let k = 0; k < n; k++) chip(cx, rnd() * SIZE, rnd() * SIZE, 1 + rnd() * 2.5, rnd);
}

// A depth tier's palette (explore.json tiers, 0.142): stone / floor /
// ceiling = [hue, hue spread, saturation, its spread, lightness, its
// spread], growth = [hue, spread] of the moss or stains at the wall's foot
// (or null), dark = the joints between the stones.
const toneOf = (p, rnd) => ({ h: p[0] + rnd() * p[1], s: p[2] + rnd() * p[3], l: p[4] + rnd() * p[5] });

// Wall: courses of chunky stones, black joints, grime, moss at the foot.
// (Canvas row 0 is the TOP of the wall: build.js maps v = 0 to the floor.)
export function wallTexture(seed, pal) {
  const rnd = seeded(seed), { color, height, cx, hx } = canvases();
  cx.fillStyle = pal.dark; cx.fillRect(0, 0, SIZE, SIZE);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, SIZE, SIZE);
  let y = 0;
  while (y < SIZE - 20) {
    const ch = Math.min(SIZE - y, 50 + Math.floor(rnd() * 46));
    let x = -Math.floor(rnd() * 60);
    while (x < SIZE) {
      const w = 60 + Math.floor(rnd() * 120);
      paintStone(cx, hx, x + 2, y + 2, w - 4, ch - 4, toneOf(pal.stone, rnd), rnd);
      x += w;
    }
    y += ch;
  }
  grime(cx, rnd, 40, { h: pal.stone[0], s: 10 });
  for (let k = 0; k < (pal.growth ? 70 : 0); k++) { // moss and damp, thick near the floor
    const my = SIZE - Math.pow(rnd(), 2.2) * SIZE * 0.45, mx = rnd() * SIZE;
    cx.fillStyle = hsl(pal.growth[0] + rnd() * pal.growth[1], 22, 12 + rnd() * 8, 0.25 + rnd() * 0.25);
    chip(cx, mx, my, 5 + rnd() * 16, rnd);
  }
  return finish(color, height, 1.6);
}

// Floor: big worn flagstones in staggered rows, wet dark patches.
export function floorTexture(seed, pal) {
  const rnd = seeded(seed), { color, height, cx, hx } = canvases();
  cx.fillStyle = pal.dark; cx.fillRect(0, 0, SIZE, SIZE);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, SIZE, SIZE);
  const rows = 4, rh = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.5 : 0;
    while (x < SIZE) {
      const w = rh * (0.8 + rnd() * 0.7);
      paintStone(cx, hx, x + 4, r * rh + 4, w - 8, rh - 8, toneOf(pal.floor, rnd), rnd, 0.6);
      x += w;
    }
  }
  for (let k = 0; k < 9; k++) { // damp patches
    cx.fillStyle = hsl(pal.floor[0], 12, 7, 0.35 + rnd() * 0.25);
    chip(cx, rnd() * SIZE, rnd() * SIZE, 18 + rnd() * 40, rnd);
  }
  cx.fillStyle = INK;
  for (let k = 0; k < 60; k++) chip(cx, rnd() * SIZE, rnd() * SIZE, 1 + rnd() * 3, rnd);
  return finish(color, height, 1.4);
}

// Ceiling: rough dark rock, no courses — blotches and ink cracks.
export function ceilingTexture(seed, pal) {
  const rnd = seeded(seed), { color, height, cx, hx } = canvases();
  cx.fillStyle = pal.dark; cx.fillRect(0, 0, SIZE, SIZE);
  hx.fillStyle = '#404040'; hx.fillRect(0, 0, SIZE, SIZE);
  for (let k = 0; k < 120; k++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, r = 10 + rnd() * 46;
    const t = toneOf(pal.ceiling, rnd);
    cx.fillStyle = hsl(t.h, t.s, t.l, 0.6);
    chip(cx, x, y, r, rnd);
    const g = 60 + rnd() * 140 | 0; hx.fillStyle = `rgb(${g},${g},${g})`; chip(hx, x, y, r, rnd);
  }
  cx.strokeStyle = INK; hx.strokeStyle = '#000';
  for (let k = 0; k < 9; k++) { // ink cracks
    let x = rnd() * SIZE, y = rnd() * SIZE;
    cx.lineWidth = hx.lineWidth = 1.5 + rnd() * 2.5;
    cx.beginPath(); hx.beginPath(); cx.moveTo(x, y); hx.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 70; cx.lineTo(x, y); hx.lineTo(x, y); }
    cx.stroke(); hx.stroke();
  }
  cx.fillStyle = INK;
  for (let k = 0; k < 50; k++) chip(cx, rnd() * SIZE, rnd() * SIZE, 1 + rnd() * 4, rnd);
  return finish(color, height, 1.8);
}

// Wood for beams and posts: dark planks with long grain strokes, inked edges.
export function woodTexture(seed) {
  const rnd = seeded(seed), { color, height, cx, hx } = canvases();
  const planks = 4, pw = SIZE / planks;
  for (let p = 0; p < planks; p++) {
    const tone = { h: 28 + rnd() * 10, s: 18 + rnd() * 10, l: 15 + rnd() * 7 };
    cx.fillStyle = hsl(tone.h, tone.s, tone.l); cx.fillRect(p * pw, 0, pw, SIZE);
    hx.fillStyle = '#a0a0a0'; hx.fillRect(p * pw + 3, 0, pw - 6, SIZE);
    for (let k = 0; k < 22; k++) {
      const gx = p * pw + 4 + rnd() * (pw - 8);
      cx.strokeStyle = rnd() < 0.3 ? INK : hsl(tone.h, tone.s, tone.l + (rnd() - 0.6) * 10, 0.5);
      cx.lineWidth = 1 + rnd() * 2.5;
      cx.beginPath(); cx.moveTo(gx, 0); cx.bezierCurveTo(gx + (rnd() - 0.5) * 12, SIZE * 0.3, gx + (rnd() - 0.5) * 12, SIZE * 0.7, gx, SIZE); cx.stroke();
    }
    cx.strokeStyle = INK; cx.lineWidth = 5; cx.strokeRect(p * pw + 1, -2, pw - 2, SIZE + 4);
  }
  cx.fillStyle = INK;
  for (let k = 0; k < 40; k++) chip(cx, rnd() * SIZE, rnd() * SIZE, 1 + rnd() * 4, rnd);
  return finish(color, height, 2.2, 1);
}

// The torch flame: a soft additive teardrop on a transparent canvas.
export function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 84, 2, 32, 76, 46);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,205,110,0.95)');
  g.addColorStop(0.6, 'rgba(235,120,40,0.5)'); g.addColorStop(1, 'rgba(120,40,10,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(32, 6); x.quadraticCurveTo(62, 70, 32, 124); x.quadraticCurveTo(2, 70, 32, 6); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A soft round glow, white (tinted by the material): torch halos and the
// ground mist (0.142).
export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// explore/propTextures.js — painted textures for the themed rooms (0.146), in
// the same ink style as textures.js: flat painted values, black ink lines,
// chips. Books on shelves, banners (ragged, alpha-cut), stained glass (for
// emissive windows), iron-banded doors, cloth with a gold border (table
// runners, carpets), skull-packed ossuary walls, cobwebs, straw. Each is
// made once and shared; all seeded.

import * as THREE from 'three';
import { seeded } from './grid.js';

const cache = new Map();
const INK = 'rgba(6,6,4,0.95)';
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function make(key, w, h, paint, { alpha = false, srgb = true, repeat = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  paint(x, w, h, seeded(key.length * 977 + w));
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.alpha = alpha;
  cache.set(key, t);
  return t;
}

// Shelves of books: rows of spines in leather colours, ink between them.
export const booksTexture = () => make('books', 512, 512, (x, w, h, rnd) => {
  x.fillStyle = '#120b07'; x.fillRect(0, 0, w, h);
  const rows = 4, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let px = 4;
    while (px < w - 4) {
      const bw = 10 + rnd() * 22, bh = rh * (0.6 + rnd() * 0.32), lean = rnd() < 0.08 ? (rnd() - 0.5) * 8 : 0;
      const hue = [0, 20, 30, 45, 100, 210][Math.floor(rnd() * 6)];
      x.fillStyle = hsl(hue, 25 + rnd() * 25, 20 + rnd() * 18);
      const y0 = (r + 1) * rh - 10 - bh;
      x.beginPath(); x.moveTo(px, y0 + bh); x.lineTo(px + lean, y0); x.lineTo(px + bw + lean, y0); x.lineTo(px + bw, y0 + bh); x.fill();
      x.fillStyle = hsl(45, 40, 45, 0.5); // gilt bands
      x.fillRect(px + 2, y0 + bh * 0.2, bw - 4, 2); x.fillRect(px + 2, y0 + bh * 0.75, bw - 4, 2);
      x.strokeStyle = INK; x.lineWidth = 2; x.stroke();
      px += bw + (rnd() < 0.1 ? 14 : 1);
    }
    x.fillStyle = '#2a1a10'; x.fillRect(0, (r + 1) * rh - 10, w, 10); // the shelf board
    x.fillStyle = INK; x.fillRect(0, (r + 1) * rh - 11, w, 2);
  }
});

// A banner: dark cloth, a gold edge, an emblem; the bottom torn in points.
export const bannerTexture = (hue) => make(`banner${hue}`, 128, 384, (x, w, h, rnd) => {
  x.fillStyle = hsl(hue, 45, 20); x.beginPath();
  x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w, h * 0.82);
  for (let i = 4; i >= 0; i--) x.lineTo((i / 4) * w, h * (i % 2 ? 0.98 : 0.84) - rnd() * 14);
  x.closePath(); x.fill();
  for (let k = 0; k < 14; k++) { x.strokeStyle = hsl(hue, 40, 12 + rnd() * 14, 0.4); x.lineWidth = 3 + rnd() * 6; x.beginPath(); const px = rnd() * w; x.moveTo(px, 0); x.lineTo(px + (rnd() - 0.5) * 10, h); x.stroke(); }
  x.fillStyle = hsl(45, 55, 40); x.fillRect(8, 0, 4, h * 0.82); x.fillRect(w - 12, 0, 4, h * 0.82);
  x.save(); x.translate(w / 2, h * 0.38); // the emblem: a crown over a moon
  x.fillStyle = hsl(45, 60, 46); x.beginPath(); x.arc(0, 12, 26, 0, Math.PI * 2); x.fill();
  x.fillStyle = hsl(hue, 45, 20); x.beginPath(); x.arc(10, 6, 22, 0, Math.PI * 2); x.fill();
  x.fillStyle = hsl(45, 60, 46); x.beginPath(); x.moveTo(-22, -22); x.lineTo(-22, -40); x.lineTo(-11, -30); x.lineTo(0, -46); x.lineTo(11, -30); x.lineTo(22, -40); x.lineTo(22, -22); x.fill();
  x.restore();
  x.strokeStyle = INK; x.lineWidth = 3; x.strokeRect(1, -2, w - 2, h * 0.8);
}, { alpha: true, repeat: false });

// Stained glass: panes of one hue family between black leading, a tracery
// rosette at the top. Shown emissive: the window glows.
export const glassTexture = (hue) => make(`glass${hue}`, 256, 512, (x, w, h, rnd) => {
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  for (let py = 0; py < h; py += 36) for (let px = 0; px < w; px += 32) {
    x.fillStyle = hsl(hue + (rnd() - 0.5) * 50, 55 + rnd() * 30, 22 + rnd() * 34);
    x.fillRect(px + 3, py + 3, 26 + rnd() * 3, 30 + rnd() * 3);
  }
  x.strokeStyle = '#000'; x.lineWidth = 7;
  x.beginPath(); x.arc(w / 2, h * 0.2, w * 0.3, 0, Math.PI * 2); x.stroke();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; x.beginPath(); x.moveTo(w / 2, h * 0.2); x.lineTo(w / 2 + Math.cos(a) * w * 0.3, h * 0.2 + Math.sin(a) * w * 0.3); x.stroke(); }
  x.lineWidth = 6; x.beginPath(); x.moveTo(w / 2, h * 0.36); x.lineTo(w / 2, h); x.stroke();
}, { repeat: false });

// A plank door bound in iron, nail heads, a ring.
export const doorTexture = () => make('door', 256, 512, (x, w, h, rnd) => {
  for (let i = 0; i < 5; i++) { x.fillStyle = hsl(25, 25, 14 + rnd() * 8); x.fillRect(i * w / 5, 0, w / 5, h); x.fillStyle = INK; x.fillRect(i * w / 5, 0, 3, h); }
  for (const by of [0.15, 0.5, 0.85]) {
    x.fillStyle = '#1a1714'; x.fillRect(0, h * by - 12, w, 24);
    x.fillStyle = '#4a443c'; for (let px = 12; px < w; px += 32) { x.beginPath(); x.arc(px, h * by, 4, 0, 7); x.fill(); }
  }
  x.strokeStyle = '#1a1714'; x.lineWidth = 7; x.beginPath(); x.arc(w * 0.75, h * 0.55, 18, 0, 7); x.stroke();
  x.strokeStyle = INK; x.lineWidth = 6; x.strokeRect(0, 0, w, h);
});

// Cloth: deep red with a gold border band and ink folds (runners, carpets).
export const clothTexture = (hue) => make(`cloth${hue}`, 256, 256, (x, w, h, rnd) => {
  x.fillStyle = hsl(hue, 50, 16); x.fillRect(0, 0, w, h);
  for (let k = 0; k < 20; k++) { x.strokeStyle = hsl(hue, 45, 9 + rnd() * 10, 0.35); x.lineWidth = 2 + rnd() * 6; x.beginPath(); const py = rnd() * h; x.moveTo(0, py); x.lineTo(w, py + (rnd() - 0.5) * 20); x.stroke(); }
  x.fillStyle = hsl(45, 55, 36); x.fillRect(16, 0, 8, h); x.fillRect(w - 24, 0, 8, h);
  x.fillStyle = INK; for (let k = 0; k < 30; k++) { x.beginPath(); x.arc(rnd() * w, rnd() * h, 1 + rnd() * 2, 0, 7); x.fill(); }
});

// An ossuary wall: skulls packed in rows, ink in every socket.
export const skullsTexture = () => make('skulls', 512, 512, (x, w, h, rnd) => {
  x.fillStyle = '#0a0806'; x.fillRect(0, 0, w, h);
  for (let py = 20; py < h; py += 52) for (let px = (py / 52) % 2 ? 26 : 0; px < w + 30; px += 52) {
    const l = 52 + rnd() * 16;
    x.fillStyle = hsl(40, 18, l); x.beginPath(); x.ellipse(px, py, 22, 20, 0, 0, 7); x.fill(); x.fillRect(px - 12, py + 10, 24, 14);
    x.fillStyle = hsl(40, 15, l - 14); x.beginPath(); x.ellipse(px + 6, py + 4, 14, 14, 0, 0, 7); x.fill();
    x.fillStyle = INK;
    x.beginPath(); x.ellipse(px - 8, py, 6, 7, 0, 0, 7); x.ellipse(px + 8, py, 6, 7, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(px, py + 6); x.lineTo(px - 3, py + 13); x.lineTo(px + 3, py + 13); x.fill();
    for (let t = -9; t <= 9; t += 4.5) x.fillRect(px + t - 1, py + 17, 2, 7);
  }
});

// Cobweb in a corner: strands from one corner, rings between them.
export const cobwebTexture = () => make('cobweb', 256, 256, (x, w, h, rnd) => {
  x.strokeStyle = 'rgba(210,205,190,0.55)'; x.lineWidth = 1.4;
  const rays = 7, ends = [];
  for (let i = 0; i < rays; i++) { const a = (i / (rays - 1)) * Math.PI / 2, r = w * (0.75 + rnd() * 0.25); ends.push(a); x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * r, Math.sin(a) * r); x.stroke(); }
  for (let ring = 1; ring < 7; ring++) {
    const r = ring * w * 0.11; x.beginPath();
    ends.forEach((a, i) => { const rr = r * (0.9 + rnd() * 0.2), px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (i === 0) x.moveTo(px, py); else x.quadraticCurveTo(Math.cos(a - 0.13) * rr * 0.85, Math.sin(a - 0.13) * rr * 0.85, px, py); });
    x.stroke();
  }
}, { alpha: true, repeat: false });

// Straw strewn on a cell floor.
export const strawTexture = () => make('straw', 256, 256, (x, w, h, rnd) => {
  for (let k = 0; k < 500; k++) {
    const px = w / 2 + (rnd() - 0.5) * w * 0.9 * rnd(), py = h / 2 + (rnd() - 0.5) * h * 0.9 * rnd(), a = rnd() * Math.PI, l = 10 + rnd() * 26;
    x.strokeStyle = hsl(42 + rnd() * 10, 40, 22 + rnd() * 20, 0.9); x.lineWidth = 1 + rnd() * 1.5;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
}, { alpha: true, repeat: false });

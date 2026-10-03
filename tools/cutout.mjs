// tools/cutout.mjs — cutting a generated portrait out of its flat grey
// background (0.185, tools/gen-art.mjs). Pure: RGBA bytes in, alpha out;
// no sharp, no DOM, so the suite can test it on a synthetic picture.
//
// The prompt asks FLUX for "a plain flat light grey background (#c8c8c8)",
// but a model never hits a colour exactly, paints a lighter paper or a
// darker panel inside a border, a vignette, a ground shadow and a
// signature anyway, and the figure may carry greys of its own (the
// knight's chainmail, the gargoyle's stone). So the key is not a global
// colour match: the background colour is sampled from the picture's
// border, and only pixels REACHED from the border go (a flood fill) —
// through near-background colours, through paper-like ones (light and
// unsaturated: the panels, the vignettes; the inked figure is dark or
// coloured and its outline stops the fill, so a skull face or a tooth
// inside it stays) and, in the picture's lower part, through the shadow's
// mid-light wash — with a soft edge where the fill meets the figure.
// Then enclosed holes of plain background (the paper between a figure's
// legs, walled in by its ground shadow) and stray marks in the bottom
// band (signatures, shadow scraps) go, and the figure's box is measured
// for trimming and scaling. A dark ground shadow survives all of this (it
// is as dark as the figure): gen-art.mjs --clean paints it out instead.

/** The background colour: the median of the border ring's pixels. */
export function sampleBackground(data, w, h, ring = Math.max(2, Math.round(Math.min(w, h) * 0.02))) {
  const r = [], g = [], b = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) { x = w - ring - 1; continue; }
      const i = (y * w + x) * 4;
      r.push(data[i]); g.push(data[i + 1]); b.push(data[i + 2]);
    }
  }
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  return [med(r), med(g), med(b)];
}

const dist = (data, i, c) => Math.sqrt((data[i] - c[0]) ** 2 + (data[i + 1] - c[1]) ** 2 + (data[i + 2] - c[2]) ** 2);
const lum = (data, i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
const sat = (data, i) => { const mx = Math.max(data[i], data[i + 1], data[i + 2]); return mx ? (mx - Math.min(data[i], data[i + 1], data[i + 2])) / mx : 0; };

/** Paper-like: light and unsaturated, whatever the exact tone (a lighter paper, a grey panel, a vignette). */
export const PAPER = { minLum: 120, maxSat: 0.3, tolerance: 70 }; // (0.00201: within `tolerance` of the border's tone too — a painterly figure has no outline, so its own greys must not count)
/** The ground shadow the model paints under the figure despite the prompt: a mid-light, unsaturated wash in the picture's lower part (y from `fromY` of the height). Measured on the pilot: shadow pixels at luminance 105-135, distance 130-180 from the background; the inked figure under 80. */
export const SHADOW = { tolerance: 200, minLum: 90, minLumShare: 0.5, maxSat: 0.45, fromY: 0.6 }; // minLum, or `minLumShare` of the border's own brightness when that is lower (a mid-grey background's shadow is darker than a light paper's; 0.00201)

/**
 * The alpha of every pixel: 0 where the flood fill from the border ran
 * (within `tolerance` of the background colour, paper-like, a shadow in
 * the lower part, or inside the 1% border margin), 255 inside the figure,
 * in between on the figure's edge pixels (their distance to the
 * background next to them, over 2x the tolerance). Returns { alpha, bg }.
 */
export function keyOut(data, w, h, { tolerance = 30, paper = PAPER, shadow = SHADOW, margin = Math.max(1, Math.round(Math.min(w, h) * 0.01)), bg = sampleBackground(data, w, h) } = {}) {
  const n = w * h;
  const reached = new Uint8Array(n);
  const stack = [];
  const yShadow = shadow ? Math.round(h * (shadow.fromY ?? 0)) : h;
  const bgLum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  const shadowLum = shadow ? Math.min(shadow.minLum, bgLum * (shadow.minLumShare ?? 1)) : 0;
  const passable = (p) => {
    const x = p % w, y = (p - x) / w;
    if (x < margin || y < margin || x >= w - margin || y >= h - margin) return true;
    const i = p * 4, d = dist(data, i, bg);
    if (d <= tolerance) return true;
    const L = lum(data, i), S = sat(data, i);
    if (paper && L >= paper.minLum && S <= paper.maxSat && d <= (paper.tolerance ?? Infinity)) return true;
    return !!shadow && y >= yShadow && d <= shadow.tolerance && L >= shadowLum && S <= shadow.maxSat;
  };
  const push = (p) => { if (!reached[p] && passable(p)) { reached[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  const alpha = new Uint8Array(n).fill(255);
  const soft = tolerance * 2;
  for (let p = 0; p < n; p++) {
    if (reached[p]) { alpha[p] = 0; continue; }
    const x = p % w, y = (p - x) / w;
    const near = [x > 0 && reached[p - 1] ? p - 1 : -1, x < w - 1 && reached[p + 1] ? p + 1 : -1, y > 0 && reached[p - w] ? p - w : -1, y < h - 1 && reached[p + w] ? p + w : -1].filter((q) => q >= 0);
    if (!near.length) continue;
    // against the background next to it (a panel's grey, not the border's)
    const q = near[0] * 4, local = [data[q], data[q + 1], data[q + 2]];
    alpha[p] = Math.max(0, Math.min(255, Math.round((255 * dist(data, p * 4, local)) / soft)));
  }
  return { alpha, bg };
}

/**
 * Enclosed holes: a connected piece of unreached PAPER pixels (light,
 * unsaturated, within `tolerance` of the background's own tone) at least
 * `minArea` of the picture is cleared: the loop between an arm, the torso
 * and the sword, the paper between the legs walled in by the shadow.
 * Measured on the pilot: such loops sit 1-27 from the border's colour; a
 * skull face is off that tone (and no face showed up as paper-like at
 * all); a tooth is far too small. (Pale stone of the paper's own tone
 * would go too: --holes 0 then.) Returns how many went.
 */
export const HOLES = { tolerance: 40, minArea: 0.003, fromY: 0, white: { tolerance: 90, minLum: 200, maxSat: 0.12 } };
export function fillHoles(data, alpha, w, h, bg, opts = {}) {
  const { tolerance, minArea, fromY, white } = { ...HOLES, ...opts };
  const n = w * h, label = new Int32Array(n).fill(-1), yFrom = h * fromY;
  // paper's own tone, or a near-white neutral pocket (a lighter paper under the feet, 0.00201: the gargoyles) — bone and skin are warmer than that
  const paperish = (p) => { const i = p * 4, d = dist(data, i, bg); return alpha[p] > 0 && ((d <= tolerance && lum(data, i) >= PAPER.minLum && sat(data, i) <= PAPER.maxSat) || (white && d <= white.tolerance && lum(data, i) >= white.minLum && sat(data, i) <= white.maxSat)); };
  let gone = 0;
  for (let s = 0; s < n; s++) {
    if (label[s] >= 0 || !paperish(s)) continue;
    const id = s, pixels = [s], stack = [s];
    label[s] = id;
    let y0 = h;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p - x) / w;
      if (y < y0) y0 = y;
      for (const q of [x > 0 && p - 1, x < w - 1 && p + 1, y > 0 && p - w, y < h - 1 && p + w]) if (q !== false && label[q] < 0 && paperish(q)) { label[q] = id; pixels.push(q); stack.push(q); }
    }
    if (y0 >= yFrom && pixels.length >= minArea * n) { for (const p of pixels) alpha[p] = 0; gone++; }
  }
  return gone;
}

/**
 * Stray marks: every connected piece but the largest that lies entirely
 * in the bottom `band` of the picture (the model's signature in a corner,
 * a scrap of shadow) is cleared. Returns how many went.
 */
export function dropStray(alpha, w, h, band = 0.15) {
  const n = w * h, label = new Int32Array(n).fill(-1), comps = [];
  for (let s = 0; s < n; s++) {
    if (alpha[s] === 0 || label[s] >= 0) continue;
    const id = comps.length, c = { area: 0, y0: h, pixels: [] };
    comps.push(c); label[s] = id;
    const stack = [s];
    while (stack.length) {
      const p = stack.pop(); c.area++; c.pixels.push(p);
      const x = p % w, y = (p - x) / w;
      if (y < c.y0) c.y0 = y;
      for (const q of [x > 0 && p - 1, x < w - 1 && p + 1, y > 0 && p - w, y < h - 1 && p + w]) if (q !== false && alpha[q] > 0 && label[q] < 0) { label[q] = id; stack.push(q); }
    }
  }
  if (comps.length < 2) return 0;
  const main = comps.reduce((a, b) => (b.area > a.area ? b : a));
  const yBand = h * (1 - band);
  let gone = 0;
  for (const c of comps) if (c !== main && c.y0 >= yBand) { for (const p of c.pixels) alpha[p] = 0; gone++; }
  return gone;
}

/** The box of the pixels with alpha > `min`: { x0, y0, x1, y1 } (x1/y1 exclusive), or null when empty. */
export function bbox(alpha, w, h, min = 8) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Writes `alpha` into the RGBA bytes (in place) and returns the figure's box. */
export function applyAlpha(data, alpha, w, h) {
  for (let p = 0; p < w * h; p++) data[p * 4 + 3] = alpha[p];
  return bbox(alpha, w, h);
}

/**
 * Where a cut-out figure goes on the old portrait's canvas so it reads the
 * same size on the card: scaled to the old figure's height (capped by the
 * canvas width), feet on the old figure's baseline, centred on its centre.
 * box = the new figure's box, old = { w, h, box } of the current portrait.
 * Returns { w, h, left, top } for the scaled figure (integers).
 */
export function placeOn(box, old) {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const ob = old.box ?? { x0: 0, y0: 0, x1: old.w, y1: old.h };
  let s = (ob.y1 - ob.y0) / bh;
  if (bw * s > old.w) s = old.w / bw;
  const w = Math.max(1, Math.round(bw * s)), h = Math.max(1, Math.round(bh * s));
  const cx = (ob.x0 + ob.x1) / 2;
  const left = Math.round(Math.max(0, Math.min(old.w - w, cx - w / 2)));
  const top = Math.round(Math.max(0, Math.min(old.h - h, ob.y1 - h)));
  return { w, h, left, top };
}

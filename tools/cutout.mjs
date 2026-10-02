// tools/cutout.mjs — cutting a generated portrait out of its flat grey
// background (0.184, tools/gen-art.mjs). Pure: RGBA bytes in, alpha out;
// no sharp, no DOM, so the suite can test it on a synthetic picture.
//
// The prompt asks FLUX for "a plain flat light grey background (#c8c8c8)",
// but a model never hits a colour exactly and the figure may carry greys
// of its own (the knight's chainmail, the gargoyle's stone), so the key
// is not a global colour match: the background colour is sampled from
// the picture's border, and only pixels REACHED from the border through
// near-background colours go (a flood fill), with a soft edge where the
// fill meets the figure (anti-aliased edge pixels keep part of their
// alpha). Then the figure's box, for trimming and scaling.

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

const dist = (data, i, bg) => Math.sqrt((data[i] - bg[0]) ** 2 + (data[i + 1] - bg[1]) ** 2 + (data[i + 2] - bg[2]) ** 2);
const lum = (data, i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
const sat = (data, i) => { const mx = Math.max(data[i], data[i + 1], data[i + 2]); return mx ? (mx - Math.min(data[i], data[i + 1], data[i + 2])) / mx : 0; };

/** The ground shadow the model paints under the figure despite the prompt: a mid-light, unsaturated wash on the background in the picture's lower part (y from `fromY` of the height), reachable from the border. Measured on the pilot: shadow pixels at luminance 105-135 and distance 130-180 from the background; the inked figure under 80. */
export const SHADOW = { tolerance: 200, minLum: 90, maxSat: 0.45, fromY: 0.6 };

/**
 * The alpha of every pixel: 0 where the flood fill from the border ran
 * (colour within `tolerance` of the background, or a shadow: within
 * `shadow.tolerance`, light and unsaturated — the inked figure is dark or
 * coloured, and its outline stops the fill), 255 inside the figure, in
 * between on the figure's edge pixels (their distance to the background
 * over 2x the tolerance). Returns { alpha, bg }.
 */
export function keyOut(data, w, h, { tolerance = 30, shadow = SHADOW, bg = sampleBackground(data, w, h) } = {}) {
  const n = w * h;
  const reached = new Uint8Array(n);
  const stack = [];
  const yShadow = shadow ? Math.round(h * (shadow.fromY ?? 0)) : h;
  const passable = (p) => { const i = p * 4, d = dist(data, i, bg); return d <= tolerance || (p >= yShadow * w && shadow && d <= shadow.tolerance && lum(data, i) >= shadow.minLum && sat(data, i) <= shadow.maxSat); };
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
    const edge = (x > 0 && reached[p - 1]) || (x < w - 1 && reached[p + 1]) || (y > 0 && reached[p - w]) || (y < h - 1 && reached[p + w]);
    if (edge) alpha[p] = Math.max(0, Math.min(255, Math.round((255 * dist(data, p * 4, bg)) / soft)));
  }
  return { alpha, bg };
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

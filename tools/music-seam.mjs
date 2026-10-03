// The loop seam of a generated score (0.00280, the music thread). A bed in
// the game is a loop of loopS seconds plus tailS more (src/audio/musicLoop.js:
// the next copy starts at loopS and the two crossfade over tailS). A
// generated piece has a beginning and an ending, so the import looks for the
// two moments that sound most alike — a START in one range, an END in
// another — and cuts the file from START to END + tailS: the music's own
// continuation past END is the tail, crossfaded into START.
//
// How alike: per frame (2048-sample FFT at 22.05 kHz, hop 1024 = 46 ms) a
// chroma vector (harmony) and log band energies (timbre), each normalised;
// two frames' similarity is the cosine of the pair. A seam's score is the
// mean similarity of the WINDOW after START against the window after END,
// frame by frame (the music must carry on alike, not just touch), less a
// penalty for a difference in level and a small bonus per second of loop
// (a bed heard for minutes should repeat as little as it can). Then the end is nudged by up to
// ±140 ms so the onsets line up (the beat keeps its place across the seam).
// Plain JS (no numpy here): the self-similarity matrix of a two-minute
// piece is ~6M cells, under a second.

import { spawnSync } from 'node:child_process';

export const SR = 22050;
const N = 2048, HOP = 1024;

/** Mono float PCM at `sr` from any file ffmpeg reads. */
export function decode(path, sr = SR) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', path, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg decode ${path}: ${r.stderr?.toString().slice(-200)}`);
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

/** In-place radix-2 FFT on (re, im). */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

const hann = (n) => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
const unit = (v) => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return v.map((x) => x / s); };

/** Per frame: a unit feature vector (chroma ++ bands, halves weighted alike) and its level in dB. */
export function features(x, sr = SR, n = N, hop = HOP) {
  const win = hann(n), frames = Math.max(0, Math.floor((x.length - n) / hop) + 1);
  const pc = new Int16Array(n / 2), band = new Int16Array(n / 2), NB = 24, lo = 50, hi = 9000;
  for (let k = 1; k < n / 2; k++) {
    const f = (k * sr) / n;
    pc[k] = f >= 80 && f <= 5000 ? ((Math.round(12 * Math.log2(f / 440)) % 12) + 12) % 12 : -1;
    band[k] = f >= lo && f <= hi ? Math.min(NB - 1, Math.floor((NB * Math.log(f / lo)) / Math.log(hi / lo))) : -1;
  }
  const feats = [], db = new Float32Array(frames);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let t = 0; t < frames; t++) {
    let e = 0;
    for (let i = 0; i < n; i++) { const v = x[t * hop + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
    db[t] = 10 * Math.log10(e / n + 1e-12);
    fft(re, im);
    const chroma = new Array(12).fill(0), bands = new Array(NB).fill(0);
    for (let k = 1; k < n / 2; k++) {
      const m = Math.hypot(re[k], im[k]);
      if (pc[k] >= 0) chroma[pc[k]] += m;
      if (band[k] >= 0) bands[band[k]] += m * m;
    }
    const lb = bands.map((b) => Math.log1p(b * 100));
    const mean = lb.reduce((s, v) => s + v, 0) / NB;
    feats.push([...unit(chroma), ...unit(lb.map((v) => v - mean))].map((v) => v * Math.SQRT1_2));
  }
  return { feats, db, hopS: hop / sr };
}

/**
 * The best seam: START in startRange, END in endRange (seconds), END - START
 * at least minLoop, the window after each compared. Returns { start, end,
 * score, sim, dDb } in seconds (frame resolution).
 */
export function findSeam({ feats, db, hopS }, { startRange, endRange, minLoop = 60, window = 4, levelPenalty = 0.015, preferLong = 0.0005, tailS = 0 }) {
  const W = Math.round(window / hopS), F = feats.length;
  const fr = (s) => Math.max(0, Math.round(s / hopS));
  const s0 = fr(startRange[0]), s1 = Math.min(fr(startRange[1]), F - W - 1);
  const e0 = fr(endRange[0]), e1 = Math.min(fr(endRange[1]), F - W - 1, F - 1 - Math.ceil(tailS / hopS)); // the window and the tail must exist past END
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const lvl = (t) => { let s = 0; for (let k = 0; k < W; k++) s += 10 ** (db[t + k] / 10); return 10 * Math.log10(s / W); };
  const levels = new Map();
  const L = (t) => (levels.has(t) ? levels.get(t) : (levels.set(t, lvl(t)), levels.get(t)));
  let best = null;
  for (let s = s0; s <= s1; s++) for (let e = Math.max(e0, s + fr(minLoop)); e <= e1; e++) {
    if (e + W >= F) break;
    let sim = 0;
    for (let k = 0; k < W; k++) sim += dot(feats[s + k], feats[e + k]);
    sim /= W;
    const dDb = Math.abs(L(s) - L(e)), score = sim - levelPenalty * dDb + preferLong * (e - s) * hopS; // (a longer loop repeats less: 20 s more is worth 0.01 of likeness)
    if (!best || score > best.score) best = { s, e, score, sim, dDb };
  }
  if (!best) throw new Error('no seam fits the ranges (the piece is shorter than minLoop, or the ranges are empty)');
  return { start: best.s * hopS, end: best.e * hopS, score: best.score, sim: best.sim, dDb: best.dDb };
}

/** Onset strength (spectral flux) at a fine hop over [from, from + len) seconds. */
function flux(x, sr, from, len, n = 1024, hop = 128) {
  const win = hann(n), a = Math.max(0, Math.round(from * sr)), frames = Math.floor((Math.round(len * sr) - n) / hop);
  const out = new Float32Array(Math.max(0, frames)), re = new Float64Array(n), im = new Float64Array(n);
  let prev = null;
  for (let t = 0; t < frames; t++) {
    for (let i = 0; i < n; i++) { re[i] = (x[a + t * hop + i] ?? 0) * win[i]; im[i] = 0; }
    fft(re, im);
    const mag = new Float64Array(n / 2);
    let f = 0;
    for (let k = 1; k < n / 2; k++) { mag[k] = Math.log1p(Math.hypot(re[k], im[k]) * 10); if (prev) f += Math.max(0, mag[k] - prev[k]); }
    out[t] = f; prev = mag;
  }
  return { env: out, hopS: hop / sr };
}

/** The END nudged (±maxS) so the onsets after it line up with the onsets after START. */
export function alignEnd(x, start, end, { sr = SR, window = 4, maxS = 0.14 } = {}) {
  const A = flux(x, sr, start, window), B = flux(x, sr, end - maxS, window + 2 * maxS);
  const maxLag = Math.round(maxS / A.hopS);
  let best = 0, bestLag = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let k = 0; k < A.env.length; k++) s += A.env[k] * (B.env[k + maxLag + lag] ?? 0);
    if (s > best) { best = s; bestLag = lag; }
  }
  return end + bestLag * A.hopS;
}

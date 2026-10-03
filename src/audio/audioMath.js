// audio/audioMath.js — pure helpers for the audio engine (0.107): the
// music crossfade curve, voice planning (how many copies of a sound may
// overlap), stereo position from the screen, and the volume-slider curve.
// No Web Audio here — the smoke suite tests it in Node.

export const dbToGain = (db) => 10 ** (db / 20);

// Volume sliders (0..1) feel linear to the ear on a squared curve.
export const sliderGain = (v) => Math.max(0, Math.min(1, Number(v) || 0)) ** 2;

// Crossfade curve (n points, 0 -> 1; out = 1 -> 0). Equal gain (linear):
// a music loop's crossfade plays the SAME audio twice, in phase, so the
// two always sum to exactly 1 (equal power would bump it 3 dB, 0.113).
// A generated bed (0.00280, tools/gen-score.mjs --import) crossfades its
// own continuation into its start: two DIFFERENT passages, which sum by
// power, so it asks for `crossfade: 'power'` (sin / cos) — equal gain dipped
// up to 3 dB in the middle of the seam.
export function fadeCurve(n = 32, out = false, power = false) {
  return Float32Array.from({ length: n }, (_, i) => {
    const x = i / (n - 1);
    if (power) return Math.sin(((out ? 1 - x : x) * Math.PI) / 2); // (exactly 0 and 1 at the ends)
    return out ? 1 - x : x;
  });
}

// Stereo position (-1 left .. 1 right) of a screen x, scaled by `width`
// (0.6: placement you can hear without hard-panning headphones).
export function panForX(x, screenW, width) {
  if (!Number.isFinite(x) || !(screenW > 0)) return 0;
  const p = (x / screenW) * 2 - 1;
  return Math.max(-1, Math.min(1, p)) * width;
}

// Should a new voice of `name` start at time t (s), given the voices still
// sounding ({ name, t0, t1, stinger })? Returns { skip } or
// { steal: [voices to fade out], gainDb } — repeats within retriggerMs are
// dropped, at most maxPerClip copies of one clip and maxTotal voices
// overall (the oldest go first; stingers are never stolen), and each copy
// already sounding lowers the new one by stackDb.
export function planVoice(voices, name, t, { maxPerClip, maxTotal, retriggerMs, stackDb }) {
  const live = voices.filter((v) => v.t1 > t);
  const same = live.filter((v) => v.name === name);
  if (same.some((v) => Math.abs(t - v.t0) * 1000 < retriggerMs)) return { skip: true };
  const steal = [];
  const oldestFirst = (list) => [...list].sort((a, b) => a.t0 - b.t0);
  for (const v of oldestFirst(same)) if (same.length - steal.length >= maxPerClip) steal.push(v);
  const rest = oldestFirst(live.filter((v) => !steal.includes(v) && !v.stinger));
  let count = live.length - steal.length;
  for (const v of rest) {
    if (count < maxTotal) break;
    steal.push(v);
    count--;
  }
  return { steal, gainDb: (same.length - steal.filter((v) => v.name === name).length) * stackDb };
}

// Per-hit variation (0.110): a strike played twice in a row must not
// sound stamped. cfg (audio.json variation.<clip>): rate [lo, hi]; eq
// { lo, hi, db, q } — a peaking filter at a random frequency, ± db; layers
// [{ name, p, db }] — each joins with probability p, at db (± 2), with its
// own random rate. rnd: injectable for tests.
export function planVariation(cfg, rnd = Math.random) {
  if (!cfg) return null;
  const span = ([lo, hi], r = rnd()) => lo + (hi - lo) * r;
  const rate = cfg.rate ? span(cfg.rate) : 1;
  const eq = cfg.eq
    ? { freq: cfg.eq.lo * (cfg.eq.hi / cfg.eq.lo) ** rnd(), gain: (rnd() * 2 - 1) * cfg.eq.db, q: cfg.eq.q }
    : null;
  const layers = (cfg.layers ?? [])
    .filter((l) => rnd() < l.p)
    .map((l) => ({ name: l.name, gainDb: l.db + (rnd() * 2 - 1) * cfg.layerDb, rate: span(cfg.layerRate) }));
  return { rate, eq, layers };
}

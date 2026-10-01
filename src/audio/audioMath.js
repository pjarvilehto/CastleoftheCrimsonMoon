// audio/audioMath.js — pure helpers for the audio engine (0.107): the
// loopable sections of a music bed, voice planning (how many copies of a sound may
// overlap), stereo position from the screen, and the volume-slider curve.
// No Web Audio here — the smoke suite tests it in Node.

export const dbToGain = (db) => 10 ** (db / 20);

// Volume sliders (0..1) feel linear to the ear on a squared curve.
export const sliderGain = (v) => Math.max(0, Math.min(1, Number(v) || 0)) ** 2;

// The sections of a music bed worth looping (0.107). The generated beds
// are ~20s pieces that each fade to near-silence and back in (and the file
// fades in/out at its ends), so plain looping dipped into silence every
// ~20s. Windows of `win` seconds; body = the median window. A gap is a run
// of at least `gapS` seconds more than `gapDb` below the body (rhythmic
// decays inside a bar stay above that), widened to where its fades begin
// (`edgeDb` below the body, at most `edgeS` each side). Sections = what's
// between the gaps and the file ends, at least `minS` long; a bed without
// gaps is one section. data: Float32Array (one channel).
export function findSections(data, sampleRate, { win = 0.25, gapDb = 15, gapS = 1.5, edgeDb = 6, edgeS = 3, minS = 4 } = {}) {
  const n = Math.max(1, Math.round(win * sampleRate));
  const dbs = [];
  for (let i = 0; i + n <= data.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += data[j] * data[j];
    dbs.push(10 * Math.log10(s / n + 1e-12));
  }
  const duration = data.length / sampleRate;
  if (dbs.length < 8) return [{ start: 0, end: duration }];
  const body = [...dbs].sort((a, b) => a - b)[Math.floor(dbs.length / 2)];
  const quiet = dbs.map((d) => d < body - gapDb);
  const soft = (i) => i >= 0 && i < dbs.length && dbs[i] < body - edgeDb;
  const edge = Math.round(edgeS / win);
  const cut = new Array(dbs.length).fill(false);
  const widen = (lo, hi) => { // mark [lo, hi] plus its fade slopes as cut
    for (let k = 0; k < edge && soft(lo - 1); k++) lo--;
    for (let k = 0; k < edge && soft(hi + 1); k++) hi++;
    for (let i = lo; i <= hi; i++) cut[i] = true;
  };
  for (let i = 0; i < dbs.length;) {
    if (!quiet[i]) { i++; continue; }
    let j = i;
    while (j + 1 < dbs.length && quiet[j + 1]) j++;
    if ((j - i + 1) * win >= gapS) widen(i, j);
    i = j + 1;
  }
  // the file's own fade-in / fade-out
  let i0 = 0;
  while (i0 < dbs.length && soft(i0)) cut[i0++] = true;
  let i1 = dbs.length - 1;
  while (i1 >= 0 && soft(i1)) cut[i1--] = true;
  const sections = [];
  for (let i = 0; i < dbs.length;) {
    if (cut[i]) { i++; continue; }
    let j = i;
    while (j + 1 < dbs.length && !cut[j + 1]) j++;
    if ((j - i + 1) * win >= minS) sections.push({ start: i * win, end: Math.min(duration, (j + 1) * win) });
    i = j + 1;
  }
  return sections.length ? sections : [{ start: 0, end: duration }];
}

// Equal-power crossfade curve (n points, 0 -> 1); reversed = fade out.
export function fadeCurve(n = 32, out = false) {
  return Float32Array.from({ length: n }, (_, i) => {
    const x = i / (n - 1);
    return out ? Math.cos(x * Math.PI / 2) : Math.sin(x * Math.PI / 2);
  });
}

// Stereo position (-1 left .. 1 right) of a screen x, scaled by `width`
// (0.6: placement you can hear without hard-panning headphones).
export function panForX(x, screenW, width = 0.6) {
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
export function planVoice(voices, name, t, { maxPerClip = 2, maxTotal = 6, retriggerMs = 80, stackDb = -3 } = {}) {
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
    ? { freq: cfg.eq.lo * (cfg.eq.hi / cfg.eq.lo) ** rnd(), gain: (rnd() * 2 - 1) * cfg.eq.db, q: cfg.eq.q ?? 1.2 }
    : null;
  const layers = (cfg.layers ?? [])
    .filter((l) => rnd() < l.p)
    .map((l) => ({ name: l.name, gainDb: l.db + (rnd() * 4 - 2), rate: span([0.85, 1.2]) }));
  return { rate, eq, layers };
}

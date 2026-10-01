// audio/mixer.js — the mix (0.107). Every sound goes through one graph:
//
//   music.js -> music bus -> duck -> \
//                                     master -> limiter -> speakers
//   sfx.js   -> effects bus --------> /
//
// The limiter means overlapping hits can never clip (before 0.107 they
// summed straight to the speakers, up to ~3x full scale). Bus levels come
// from assets/data/audio.json x the player's volume sliders (persisted
// here) x the MUSIC / SOUND on-off toggles. The music ducks under
// stingers (death, victory, rare finds...). Audio pauses while the tab is
// hidden. Without Web Audio (tests) the graph is never built and every
// call is a no-op; volumes still load/persist.

import { DATA } from '../shared/data.js';
import { hasAudio, ensureCtx } from './audioCore.js';
import { dbToGain, sliderGain } from './audioMath.js';

const VOL_KEY = 'castle-audio-volumes';
export const VOLUME_KINDS = ['master', 'music', 'sfx'];
const cfg = () => DATA.audio ?? {};
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 1));

let nodes = null;                         // { ctx, music, duck, sfx, master, limiter }
const muted = { music: false, sfx: false }; // the corner toggles (music.js / sfx.js own their persistence)
let volumes = null;

function loadVolumes() {
  if (volumes) return volumes;
  let saved = {};
  try { saved = JSON.parse(globalThis.localStorage?.getItem(VOL_KEY) || '{}') || {}; } catch { saved = {}; }
  const def = cfg().volumes ?? {};
  volumes = Object.fromEntries(VOLUME_KINDS.map((k) => [k, clamp01(saved[k] ?? def[k] ?? 1)]));
  return volumes;
}

export const getVolumes = () => ({ ...loadVolumes() });

export function setVolume(kind, v) {
  if (!VOLUME_KINDS.includes(kind)) return;
  loadVolumes()[kind] = clamp01(v);
  try { globalThis.localStorage?.setItem(VOL_KEY, JSON.stringify(volumes)); } catch { /* private mode */ }
  apply();
}

// What each bus is set to right now (also used by the tests).
export function busGain(kind) {
  const v = loadVolumes();
  if (kind === 'master') return sliderGain(v.master);
  const level = kind === 'music' ? cfg().musicLevel : cfg().sfxLevel;
  return muted[kind] ? 0 : level * sliderGain(v[kind]);
}

const hold = (param, t) => {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); }
};

function apply(ramp = 0.08) {
  if (!nodes) return;
  const t = nodes.ctx.currentTime;
  for (const k of VOLUME_KINDS) {
    hold(nodes[k].gain, t);
    nodes[k].gain.linearRampToValueAtTime(busGain(k), t + ramp);
  }
}

export function setBusMuted(kind, m) {
  muted[kind] = !!m;
  apply(0.15);
}

// Build the graph once (first gesture). null without Web Audio.
export function mixer() {
  if (nodes || !hasAudio()) return nodes;
  const ctx = ensureCtx();
  const L = cfg().limiter ?? {};
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = L.threshold;
  limiter.knee.value = L.knee;
  limiter.ratio.value = L.ratio;
  limiter.attack.value = L.attack;
  limiter.release.value = L.release;
  const [master, music, duck, sfx] = [0, 0, 0, 0].map(() => ctx.createGain());
  music.connect(duck);
  duck.connect(master);
  sfx.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);
  nodes = { ctx, music, duck, sfx, master, limiter };
  for (const k of VOLUME_KINDS) nodes[k].gain.value = busGain(k);
  watchVisibility(ctx);
  return nodes;
}

export const musicInput = () => mixer()?.music ?? null;
export const sfxInput = () => mixer()?.sfx ?? null;

// The music dips by duck.db under a stinger starting at `at` (context
// time) and comes back after `seconds`.
export function duckMusic(seconds, at = 0) {
  if (!nodes) return;
  const d = cfg().duck ?? {};
  const g = nodes.duck.gain;
  const t = Math.max(at, nodes.ctx.currentTime);
  hold(g, t);
  g.setTargetAtTime(dbToGain(d.db), t, d.attack / 3);
  g.setTargetAtTime(1, t + seconds, d.release / 3);
}

// A hidden tab goes quiet (and stops using the CPU for audio); it comes back
// when the tab does. Some browsers (iOS) only resume from a gesture.
function watchVisibility(ctx) {
  const doc = globalThis.document;
  doc?.addEventListener?.('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') ctx.suspend?.().catch?.(() => {});
    else ctx.resume?.().catch?.(() => {});
  });
  globalThis.addEventListener?.('pointerdown', () => {
    if (ctx.state !== 'running' && doc?.visibilityState !== 'hidden') ctx.resume?.().catch?.(() => {});
  });
}

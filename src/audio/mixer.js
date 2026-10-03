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
import { hasAudio, ensureCtx, GESTURE_EVENTS } from './audioCore.js';
import { dbToGain, sliderGain } from './audioMath.js';
import { getJsonPref, setJsonPref } from '../shared/prefs.js';

const VOL_KEY = 'castle-audio-volumes';
const VOLUME_KINDS = ['master', 'music', 'sfx'];
const cfg = () => DATA.audio;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

let nodes = null;                         // { ctx, music, duck, sfx, master, limiter }
let duckUntil = 0;                        // context time the latest duck releases (a running max, never reset)
const muted = { music: false, sfx: false }; // the corner toggles (music.js / sfx.js own their persistence)
let volumes = null;

function loadVolumes() {
  if (volumes) return volumes;
  const saved = getJsonPref(VOL_KEY, {});
  const def = cfg().volumes;
  volumes = Object.fromEntries(VOLUME_KINDS.map((k) => [k, clamp01(Number.isFinite(Number(saved[k])) ? Number(saved[k]) : def[k])]));
  return volumes;
}

export const getVolumes = () => ({ ...loadVolumes() });

export function setVolume(kind, v) {
  if (!VOLUME_KINDS.includes(kind)) return;
  loadVolumes()[kind] = clamp01(v);
  setJsonPref(VOL_KEY, volumes);
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
  const L = cfg().limiter;
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
// time) and comes back after `seconds` — or when the longest duck still
// running ends (0.00223: the hold drops every later event, the earlier
// duck's release included, so a short stinger under a narrator line used
// to bring the music back early).
export function duckMusic(seconds, at = 0) {
  if (!nodes) return;
  const d = cfg().duck;
  const g = nodes.duck.gain;
  const t = Math.max(at, nodes.ctx.currentTime);
  duckUntil = Math.max(duckUntil, t + seconds);
  hold(g, t);
  g.setTargetAtTime(dbToGain(d.db), t, d.attack / 3);
  g.setTargetAtTime(1, duckUntil, d.release / 3);
}

// A hidden tab goes quiet (and stops using the CPU for audio); it comes back
// when the tab does. Some browsers (iOS) only resume from a gesture.
function watchVisibility(ctx) {
  const doc = globalThis.document;
  doc?.addEventListener?.('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') ctx.suspend?.().catch?.(() => {});
    else ctx.resume?.().catch?.(() => {});
  });
  for (const t of GESTURE_EVENTS) globalThis.addEventListener?.(t, () => { // (0.00209: the tap's end too — a touch activates there)
    if (ctx.state !== 'running' && doc?.visibilityState !== 'hidden') ctx.resume?.().catch?.(() => {});
  });
}

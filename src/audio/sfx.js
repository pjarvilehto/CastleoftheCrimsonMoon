// audio/sfx.js — one-shot sound effects. Short clips fired from game events
// (attacks, clicks, transitions, loot, death...), gesture-gated like
// music.js: the shared AudioContext unlocks on the first gesture (see
// audioCore.js GESTURE_EVENTS; initSfx from main.js). SOUND: OFF persists
// separately from music (shared/prefs.js mutePref, 'castle-sfx-muted').
// Without Web Audio (tests) everything is a no-op.
//
// 0.107 (the audio pass):
//   - every clip has a loudness trim (assets/data/audio.json clips) and
//     plays through the effects bus -> limiter (mixer.js);
//   - voice management (audioMath.planVoice, audio.json voices): repeats
//     within retriggerMs are dropped, at most maxPerClip copies of a clip
//     and maxTotal sounds at once, stacked copies quieter — a 5-enemy turn
//     no longer piles up 7 full-level hits;
//   - opts: { pan (-1..1), delayMs (schedule ahead, e.g. to land on the
//     visual strike), rate, gainDb, plain (0.00301: no random variation,
//     layers or level jitter — the SFX Lab's dry listen) };
//   - 'boom' and the classes' colour layers are synthesized (synth.js); the
//     strikes' tick / thud / slice / clank and the crit's ring are recordings
//     since 0.00305 (the developer's SFX Lab review);
//   - 0.118: every sound is an entry in audio.json clips (the registry);
//   - 0.110: strikes vary every hit (audio.json variation: pitch, a random
//     peaking EQ, random tick/thud/slice/clank layers from synth.js);
//   - stingers duck the music (audio.json duck.clips).

import { DATA } from '../shared/data.js';
import { hasAudio, ensureCtx, decode, fetchBytes, onFirstGesture, cached } from './audioCore.js';
import { mixer, sfxInput, setBusMuted, duckMusic } from './mixer.js';
import { dbToGain, planVoice, planVariation } from './audioMath.js';
import { playSynth } from './synth.js';
import { mutePref } from '../shared/prefs.js';

// The sound registry (0.118): assets/data/audio.json `clips` — per name a
// file or `synth` (audio/synth.js), its trim, and stinger / jitter flags.
const clip = (name) => DATA.audio.clips[name] ?? null;

let ctx = null;
const buffers = {}; // name -> Promise<AudioBuffer> (clips are tiny; all stay decoded)
let voices = [];    // sounding / scheduled: { name, t0, t1, stinger, stop(t) }
const mute = mutePref('castle-sfx-muted');
setBusMuted('sfx', mute.on);

const bufferFor = (name) => cached(buffers, name, () => decode(clip(name).file));

function start(name, buffer, at, { pan = 0, rate = null, gainDb = 0, plain = false }) {
  if (mute.on) return;
  const A = DATA.audio;
  const t = Math.max(at, ctx.currentTime);
  voices = voices.filter((v) => v.t1 > ctx.currentTime);
  const plan = planVoice(voices, name, t, A.voices);
  if (plan.skip) return;
  for (const v of plan.steal) v.stop(t);
  const c = clip(name);
  // strikes (0.110): random pitch, tone colour and articulation layers;
  // other jittered clips: a random pitch within c.rate. Then a random level.
  const vary = rate == null && !plain ? planVariation(A.variation?.[name]) : null;
  const r = rate ?? vary?.rate ?? (c.rate && !plain ? c.rate[0] + Math.random() * (c.rate[1] - c.rate[0]) : 1);
  const out = ctx.createGain();
  out.gain.value = dbToGain(c.gainDb + gainDb + plan.gainDb + (c.jitterDb && !plain ? (Math.random() * 2 - 1) * c.jitterDb : 0));
  let node = out;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(p);
    node = p;
  }
  node.connect(sfxInput());
  let sources, dur;
  if (buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = r;
    if (vary?.eq) {
      const eq = ctx.createBiquadFilter();
      eq.type = 'peaking';
      eq.frequency.value = vary.eq.freq;
      eq.gain.value = vary.eq.gain;
      eq.Q.value = vary.eq.q;
      src.connect(eq);
      eq.connect(out);
    } else src.connect(out);
    src.start(t);
    sources = [src];
    dur = buffer.duration / r;
  } else {
    const made = playSynth(ctx, name, out, t, r);
    if (!made) { node.disconnect(); return; } // not a generated sound (a bad layer name)
    ({ sources, dur } = made);
  }
  sources[0].onended = () => { try { node.disconnect(); } catch { /* gone */ } };
  const voice = {
    name, t0: t, t1: t + dur, stinger: !!c.stinger,
    stop(when) { // a quick fade, never a click
      voice.t1 = Math.min(voice.t1, when + 0.05);
      out.gain.setTargetAtTime(0, when, 0.012);
      for (const s of sources) { try { s.stop(when + 0.06); } catch { /* already stopped */ } }
    },
  };
  voices.push(voice);
  const duck = A.duck?.clips?.[name];
  if (duck) duckMusic(duck, t);
  for (const l of vary?.layers ?? []) { // (0.00305: a layer may be a recording — the strikes' tick / thud / slice / clank — decoded once, started at the same moment)
    const lc = clip(l.name);
    if (lc?.file) bufferFor(l.name).then((b) => start(l.name, b, t, { pan, rate: l.rate, gainDb: gainDb + l.gainDb })).catch(() => {});
    else start(l.name, null, t, { pan, rate: l.rate, gainDb: gainDb + l.gainDb });
  }
}

// Fire a one-shot by its audio.json clips name. Before the first gesture
// (or when muted) it silently drops — effects are cosmetic, never queued.
export function sfx(name, opts = {}) {
  const c = clip(name);
  if (!ctx) adoptRunning(); // (0.00309: the title's fly-in sounds before any gesture where the browser let the title bed start)
  if (!c || !ctx || mute.on) return;
  const at = ctx.currentTime + Math.max(0, opts.delayMs ?? 0) / 1000;
  if (c.synth) {
    try { start(name, null, at, opts); } catch { /* audio must never break gameplay */ }
    return;
  }
  bufferFor(name)
    .then((buffer) => start(name, buffer, at, opts))
    .catch(() => { /* audio must never break gameplay */ });
}

// A file clip from a buffer of the caller's own, through the same path as
// sfx() — the registry's trim, the voices, the duck, the stinger flag
// (0.00301: the SFX Lab's edited previews, a clip time-stretched for a
// speed its pitch does not follow). opts as sfx()'s; a rate given plays
// the buffer at that pitch. Nothing before the first gesture.
export function sfxFrom(name, buffer, opts = {}) {
  const c = clip(name);
  if (!c || !ctx || mute.on || !buffer) return;
  const at = ctx.currentTime + Math.max(0, opts.delayMs ?? 0) / 1000;
  try { start(name, buffer, at, opts); } catch { /* audio must never break gameplay */ }
}

// The shared context once the first gesture has unlocked it (the lab
// decodes and stretches its previews on the same clock), else null.
export const sfxContext = () => ctx;

// A clip played so its loudest moment (clips.<name>.peakMs, measured) lands
// atMs from now — a sound timed to a picture rather than started with it
// (0.00297: the YOU DIED hit on the dialog; the whooshes on the crossfade).
// A peak past atMs starts at once and lands late by the difference.
export function sfxPeakAt(name, atMs, opts = {}) {
  const c = clip(name);
  if (!c) return;
  sfx(name, { ...opts, delayMs: Math.max(0, atMs - (c.peakMs ?? 0)) });
}

// A room change's whoosh (0.173, audio.json transition; 0.00297: one of the
// developer's ten whoosh recordings, picked at random each change in place
// of the one pitched-down swoosh), scheduled so the clip's loudest moment
// lands peakAtMs into the transition — the middle of windows out,
// crossfade, windows in. jitterDb varies each play's level a little.
export function transitionSfx(atMs = DATA.audio.transition.peakAtMs, opts = {}) { // (0.00309: the title's fly-in asks for its own moment, 0.00310 its own trim)
  const T = DATA.audio.transition;
  sfxPeakAt(T.clips[Math.floor(Math.random() * T.clips.length)], atMs, opts);
}

// Before the first gesture the module has no context: a sound asked for
// then is dropped. 0.00309: where the browser let the title bed start on
// its own (music.js startEarly — the context is RUNNING), the fly-in's
// whoosh and the Descend strike may sound too, through the same mixer. A
// suspended context is left alone: a source scheduled on one plays the
// moment it resumes, a stale burst on the first click.
function adoptRunning() {
  const c = ensureCtx();
  if (c?.state !== 'running') return;
  ctx = c;
  mixer();
}

export const isMuted = () => mute.on;

export function toggleMuted() {
  const m = mute.toggle();
  setBusMuted('sfx', m);
  return m;
}

// Called once from main.js: the first gesture anywhere unlocks the context
// and warms the whole clip set so first fires don't wait on a fetch.
// 0.00271: the bytes alone, in the pool's own order — warming through
// decode() put every clip at the FRONT of the download line (its "about
// to play" flag), and with the classes' and the foes' recordings (59 file
// clips) the narrator's takes waited behind them all; a clip decodes from
// its cached bytes on its first play, a moment's work.
export function initSfx() {
  if (!hasAudio()) return;
  onFirstGesture(() => {
    ctx = ensureCtx();
    mixer();
    ctx.resume?.().catch?.(() => {});
    // 0.00299: the pulled get-hit recordings (audio.json cries, 0.00287) cannot
    // play while their flag is off — hurt_<class> under cries.hero (combatQueue.js
    // sfxFor), ehurt_<foe> under cries.foe (combatSfx.js) — so they are not
    // warmed either: 19 files, ~244 KB, that went through the two-lane pool
    // ahead of the narrator's takes and the Descend essentials. A flag flipped
    // on, they warm with the rest.
    const cries = DATA.audio.cries;
    for (const [name, c] of Object.entries(DATA.audio.clips)) {
      if (!c.file) continue;
      if (name.startsWith('hurt_') && !cries.hero) continue;
      if (name.startsWith('ehurt_') && !cries.foe) continue;
      fetchBytes(c.file).catch(() => {});
    }
    // the strikes' recorded layers decoded ahead (0.00305): a layer that waited on its first decode would land late under the first blow
    for (const v of Object.values(DATA.audio.variation ?? {})) for (const l of v.layers ?? []) if (clip(l.name)?.file) bufferFor(l.name).catch(() => {});
    // a clip marked prime decodes ahead too (0.00313: the descent's tom on the very first press — Enter the Castle is the first gesture, and a decode after it put the strike late)
    for (const [name, c] of Object.entries(DATA.audio.clips)) if (c.prime && c.file) bufferFor(name).catch(() => {});
  });
}

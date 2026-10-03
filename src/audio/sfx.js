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
//     visual strike), rate, gainDb };
//   - 'ring' / 'boom' / strike layers are synthesized (synth.js);
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

function start(name, buffer, at, { pan = 0, rate = null, gainDb = 0 }) {
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
  const vary = rate == null ? planVariation(A.variation?.[name]) : null;
  const r = rate ?? vary?.rate ?? (c.rate ? c.rate[0] + Math.random() * (c.rate[1] - c.rate[0]) : 1);
  const out = ctx.createGain();
  out.gain.value = dbToGain(c.gainDb + gainDb + plan.gainDb + (c.jitterDb ? (Math.random() * 2 - 1) * c.jitterDb : 0));
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
  for (const l of vary?.layers ?? []) start(l.name, null, t, { pan, rate: l.rate, gainDb: gainDb + l.gainDb });
}

// Fire a one-shot by its audio.json clips name. Before the first gesture
// (or when muted) it silently drops — effects are cosmetic, never queued.
export function sfx(name, opts = {}) {
  const c = clip(name);
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
export function transitionSfx() {
  const T = DATA.audio.transition;
  sfxPeakAt(T.clips[Math.floor(Math.random() * T.clips.length)], T.peakAtMs);
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
  });
}

// audio/sfx.js — one-shot sound effects. Short clips fired from game events
// (attacks, clicks, transitions, loot, death...), gesture-gated like
// music.js: the shared AudioContext unlocks on the first pointerdown/keydown
// (initSfx from main.js). Mute persists separately from music
// ('castle-sfx-muted'). Without Web Audio (tests) everything is a no-op.
//
// 0.107 (the audio pass):
//   - every clip has a loudness trim (assets/data/audio.json clips) and
//     plays through the effects bus -> limiter (mixer.js);
//   - voice management (audioMath.planVoice): repeats within a few ms are
//     dropped, at most 2 copies of a clip and ~6 sounds at once, stacked
//     copies quieter — a 5-enemy turn no longer piles up 7 full-level hits;
//   - opts: { pan (-1..1), delayMs (schedule ahead, e.g. to land on the
//     visual strike), rate, gainDb };
//   - 'ring' / 'boom' are synthesized sweeteners (synth.js);
//   - stingers duck the music (audio.json duck.clips).

import { DATA } from '../shared/data.js';
import { hasAudio, ensureCtx, decode, onFirstGesture } from './audioCore.js';
import { mixer, sfxInput, setBusMuted, duckMusic } from './mixer.js';
import { dbToGain, planVoice } from './audioMath.js';
import { SYNTH, playSynth } from './synth.js';

const CLIPS = {
  click: 'assets/audio/sfx-click.mp3',     // every button press
  attack: 'assets/audio/sfx-attack.mp3',   // sword slash impact
  kill: 'assets/audio/sfx-kill.mp3',       // killing blow / multi-kill / smash
  hurt: 'assets/audio/sfx-hurt.mp3',       // player takes a hit
  swoosh: 'assets/audio/sfx-swoosh.mp3',   // room transitions, dodges
  death: 'assets/audio/sfx-death.mp3',     // YOU DIED sting
  shrine: 'assets/audio/sfx-shrine.mp3',   // shrine blessing, relic revive
  levelup: 'assets/audio/sfx-levelup.mp3', // discipline / alchemy training
  rare: 'assets/audio/sfx-rare.mp3',       // tier-4 epic item discovery
  loot: 'assets/audio/sfx-loot.mp3',       // common loot pickup
  heal: 'assets/audio/sfx-heal.mp3',       // potions, lifesteal drains
  forge: 'assets/audio/sfx-forge.mp3',     // blacksmith enhancement
  victory: 'assets/audio/sfx-victory.mp3', // escape fanfare
};
const MUTE_KEY = 'castle-sfx-muted';
// Names that get pitch (±12%) and level (±1 dB) jitter so repeats vary.
const JITTERED = new Set(['attack', 'kill', 'hurt', 'loot']);
// Never cut off to make room for another sound.
const STINGERS = new Set(['death', 'victory', 'rare', 'shrine', 'levelup', 'boom']);

let ctx = null;
const buffers = {}; // name -> Promise<AudioBuffer> (clips are tiny; all stay decoded)
let voices = [];    // sounding / scheduled: { name, t0, t1, stinger, stop(t) }
let muted = false;
try { muted = globalThis.localStorage?.getItem(MUTE_KEY) === '1'; } catch { /* no storage */ }
setBusMuted('sfx', muted);

function bufferFor(name) {
  if (!buffers[name]) {
    buffers[name] = decode(CLIPS[name]);
    buffers[name].catch(() => { delete buffers[name]; }); // allow retry on failure
  }
  return buffers[name];
}

function start(name, buffer, at, { pan = 0, rate = null, gainDb = 0 }) {
  if (muted) return;
  const A = DATA.audio ?? {};
  const t = Math.max(at, ctx.currentTime);
  voices = voices.filter((v) => v.t1 > ctx.currentTime);
  const plan = planVoice(voices, name, t, A.voices);
  if (plan.skip) return;
  for (const v of plan.steal) v.stop(t);
  const jitter = JITTERED.has(name);
  const r = rate ?? (jitter ? 0.88 + Math.random() * 0.24 : 1);
  const out = ctx.createGain();
  out.gain.value = dbToGain((A.clips?.[name]?.gainDb ?? 0) + gainDb + plan.gainDb + (jitter ? Math.random() * 2 - 1 : 0));
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
    src.connect(out);
    src.start(t);
    sources = [src];
    dur = buffer.duration / r;
  } else {
    ({ sources, dur } = playSynth(ctx, name, out, t, r));
  }
  sources[0].onended = () => { try { node.disconnect(); } catch { /* gone */ } };
  const voice = {
    name, t0: t, t1: t + dur, stinger: STINGERS.has(name),
    stop(when) { // a quick fade, never a click
      voice.t1 = Math.min(voice.t1, when + 0.05);
      out.gain.setTargetAtTime(0, when, 0.012);
      for (const s of sources) { try { s.stop(when + 0.06); } catch { /* already stopped */ } }
    },
  };
  voices.push(voice);
  const duck = A.duck?.clips?.[name];
  if (duck) duckMusic(duck, t);
}

// Fire a one-shot. Before the first gesture (or when muted) it silently
// drops — effects are cosmetic, never queued.
export function sfx(name, opts = {}) {
  if ((!CLIPS[name] && !SYNTH[name]) || !ctx || muted) return;
  const at = ctx.currentTime + Math.max(0, opts.delayMs ?? 0) / 1000;
  if (SYNTH[name]) { start(name, null, at, opts); return; }
  bufferFor(name)
    .then((buffer) => start(name, buffer, at, opts))
    .catch(() => { /* audio must never break gameplay */ });
}

export function isMuted() { return muted; }

export function toggleMuted() {
  muted = !muted;
  try { globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* no storage */ }
  setBusMuted('sfx', muted);
  return muted;
}

// Called once from main.js: the first gesture anywhere unlocks the context
// and warms the whole clip set so first fires don't wait on a fetch.
export function initSfx() {
  if (!hasAudio()) return;
  onFirstGesture(() => {
    ctx = ensureCtx();
    mixer();
    ctx.resume?.();
    for (const name of Object.keys(CLIPS)) bufferFor(name).catch(() => {});
  });
}

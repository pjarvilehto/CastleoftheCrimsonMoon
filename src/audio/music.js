// audio/music.js — scene background music. Five ~60s looping beds (title /
// combat / boss / shrine / end) generated for the castle's mood; crossfaded on scene
// change. Browsers block audio before a user gesture, so the AudioContext
// is created on the first pointerdown/keydown and the pending track fades
// in then. Mute state persists in localStorage. Without a Web Audio
// implementation (tests), everything is a safe no-op.
//
// Memory (0.078): a decoded 60s stereo bed is ~23MB of float samples, and
// all five used to be decoded up front (~115MB). Now only the compressed
// mp3 bytes are warmed (~5MB total); a bed is decoded when it starts
// playing, and the previous bed's decode is dropped once it has faded.
//
// 0.107: beds play seamlessly (musicLoop.js: the ~20s pieces they're made
// of chain into each other with crossfades, skipping their fades) and play into the mixer's
// music bus (volume slider, MUSIC toggle, ducking under stingers).

import { DATA } from '../shared/data.js';
import { hasAudio, ensureCtx, fetchBytes, decode, onFirstGesture } from './audioCore.js';
import { mixer, musicInput, setBusMuted } from './mixer.js';
import { findSections } from './audioMath.js';
import { createLoop } from './musicLoop.js';

const TRACKS = {
  title: 'assets/audio/music-title.mp3',   // title screen + hub
  combat: 'assets/audio/music-combat.mp3', // combat rooms (cinematic percussion)
  boss: 'assets/audio/music-boss.mp3',     // boss rooms
  shrine: 'assets/audio/music-shrine.mp3', // shrine rooms
  end: 'assets/audio/music-end.mp3',       // run end (escaped or died)
};
const MUTE_KEY = 'castle-music-muted';
const fadeS = () => DATA.audio?.music?.fadeS ?? 1.6;

let ctx = null;
let buffers = {};        // name -> Promise<AudioBuffer> — only the playing bed
let current = null;      // { loop, gain } of the audible track
let currentName = null;
let pending = 'title';   // title screen is the first scene
let muted = false;
try { muted = globalThis.localStorage?.getItem(MUTE_KEY) === '1'; } catch { /* no storage */ }
setBusMuted('music', muted);

function initCtx() {
  if (ctx || !hasAudio()) return;
  ctx = ensureCtx();
  mixer();
}

function bufferFor(name) {
  // Cache the in-flight promise: concurrent start calls share one decode.
  if (!buffers[name]) {
    buffers[name] = decode(TRACKS[name]);
    buffers[name].catch(() => { delete buffers[name]; }); // allow retry on failure
  }
  return buffers[name];
}

async function startTrack(name) {
  if (!ctx || muted || currentName === name) { pending = name; return; }
  pending = name;
  let buffer;
  try { buffer = await bufferFor(name); } catch { return; } // never block the game on audio
  if (pending !== name) return; // a newer request superseded this decode
  currentName = name;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(musicInput());
  const t = ctx.currentTime;
  // the bed's pieces without their fades (computed once per decode)
  buffer.sections ??= findSections(buffer.getChannelData(0), buffer.sampleRate);
  const loop = createLoop(ctx, buffer, gain, buffer.sections, t, { crossfade: DATA.audio?.music?.crossfade ?? 1.2 });
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + fadeS());

  if (current) {
    const old = current;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + fadeS());
    old.loop.stop(t + fadeS() + 0.05);
    setTimeout(() => { try { old.gain.disconnect(); } catch { /* already gone */ } }, fadeS() * 1000 + 200);
  }
  current = { loop, gain };
  // Drop every other decoded bed: the fading source keeps its own buffer
  // alive until it stops, then it can be collected (~23MB each).
  for (const n of Object.keys(buffers)) if (n !== name) delete buffers[n];
}

// Scene entry points call this. Before the first gesture it only records
// the desired track; unlockAudio() starts it.
export function play(name) {
  if (!TRACKS[name]) return;
  pending = name;
  if (ctx && !muted) startTrack(name);
}

// Warm the compressed bytes of every track in the background, so a scene
// switch only waits on a decode (fast), never on the network.
function warmOthers() {
  for (const name of Object.keys(TRACKS)) fetchBytes(TRACKS[name]).catch(() => {});
}

// Called once from main.js: the first gesture anywhere unlocks audio.
export function initMusic() {
  if (!hasAudio()) return;
  onFirstGesture(() => {
    initCtx();
    ctx.resume?.();
    if (!muted && pending) startTrack(pending);
    warmOthers();
  });
}

export function isMuted() { return muted; }

export function toggleMuted() {
  muted = !muted;
  try { globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* no storage */ }
  setBusMuted('music', muted);
  if (!muted) {
    initCtx();
    if (ctx) {
      ctx.resume?.();
      if (pending) startTrack(pending);
      warmOthers();
    }
  }
  return muted;
}

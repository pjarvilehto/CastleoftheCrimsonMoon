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

import { hasAudio, ensureCtx, fetchBytes, decode, onFirstGesture } from './audioCore.js';

const TRACKS = {
  title: 'assets/audio/music-title.mp3',   // title screen + hub
  combat: 'assets/audio/music-combat.mp3', // combat rooms (cinematic percussion)
  boss: 'assets/audio/music-boss.mp3',     // boss rooms
  shrine: 'assets/audio/music-shrine.mp3', // shrine rooms
  end: 'assets/audio/music-end.mp3',       // run end (escaped or died)
};
const VOLUME = 0.35;
const FADE_S = 1.6;
const MUTE_KEY = 'castle-music-muted';

let ctx = null;
let master = null;
let buffers = {};        // name -> Promise<AudioBuffer> — only the playing bed
let current = null;      // { src, gain } of the audible track
let currentName = null;
let pending = 'title';   // title screen is the first scene
let muted = false;
try { muted = globalThis.localStorage?.getItem(MUTE_KEY) === '1'; } catch { /* no storage */ }

function initCtx() {
  if (ctx || !hasAudio()) return;
  ctx = ensureCtx();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : VOLUME;
  master.connect(ctx.destination);
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
  gain.connect(master);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  // Trim a hair off both ends to hide the mp3 loop seam.
  src.loopStart = 0.06;
  src.loopEnd = Math.max(1, buffer.duration - 0.06);
  src.connect(gain);
  src.start();
  gain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_S);

  if (current) {
    const old = current;
    old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_S);
    setTimeout(() => { try { old.src.stop(); old.gain.disconnect(); } catch { /* already stopped */ } }, FADE_S * 1000 + 100);
  }
  current = { src, gain };
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
  if (muted) {
    if (master) master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
  } else {
    initCtx();
    if (ctx) {
      ctx.resume?.();
      master.gain.value = VOLUME;
      if (pending) startTrack(pending);
      warmOthers();
    }
  }
  return muted;
}

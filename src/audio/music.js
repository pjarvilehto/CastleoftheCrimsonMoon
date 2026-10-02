// audio/music.js — scene background music. Five looping beds (title /
// combat / boss / shrine / end), crossfaded on scene change. Browsers
// block audio before a user gesture, so the AudioContext is created on the
// first gesture (see audioCore.js GESTURE_EVENTS) and the pending track
// fades in then. MUSIC: OFF persists in this browser (shared/prefs.js
// mutePref). Without a Web Audio implementation, everything is a safe no-op.
//
// The beds are the dark ambient score (0.114; tools/gen-music.py — the
// classic beds and their section-chaining went in 0.118). Each is an
// exact loop (audio.json music.tracks: file, loopS, tailS, gainDb level
// trim) played seamlessly by musicLoop.js into the mixer's music bus
// (volume slider, MUSIC toggle, ducking under stingers).
//
// Memory (0.078): a decoded bed is tens of MB of float samples, so only
// the compressed mp3 bytes are warmed; a bed is decoded when it starts
// playing, and the previous bed's decode is dropped once it has faded.

import { DATA } from '../shared/data.js';
import { mutePref } from '../shared/prefs.js';
import { hasAudio, ensureCtx, fetchBytes, decode, onFirstGesture, cached } from './audioCore.js';
import { mixer, musicInput, setBusMuted } from './mixer.js';
import { dbToGain } from './audioMath.js';
import { createLoop } from './musicLoop.js';

const fadeS = () => DATA.audio.music.fadeS;
// A scene's bed: title (title screen + hub), combat, boss, shrine, end.
const bed = (name) => DATA.audio?.music?.tracks?.[name] ?? null;

let ctx = null;
let buffers = {};        // file -> Promise<AudioBuffer> — only the playing bed
let current = null;      // { loop, gain } of the audible track
let currentName = null;
let pending = 'title';   // title screen is the first scene
const mute = mutePref('castle-music-muted');
setBusMuted('music', mute.on);

function initCtx() {
  if (ctx || !hasAudio()) return;
  ctx = ensureCtx();
  mixer();
}

// Cache the in-flight promise: concurrent start calls share one decode.
const bufferFor = (file) => cached(buffers, file, () => decode(file));

async function startTrack(name) {
  const b = bed(name);
  if (!b || !ctx || mute.on || currentName === name) { pending = name; return; }
  pending = name;
  let buffer;
  try { buffer = await bufferFor(b.file); } catch { return; } // never block the game on audio
  // a newer request superseded this decode, or MUSIC went OFF meanwhile (0.00209:
  // the bed used to start behind the muted bus and hold its buffer), or a
  // concurrent call for this same bed already started it off the shared decode
  // (0.00223: two loops of one bed, one fading the other — the gesture's title
  // start and the hub's play('title') during the decode; a mute and unmute
  // inside one decode too)
  if (pending !== name || mute.on || currentName === name) return;
  currentName = name;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(musicInput());
  const t = ctx.currentTime;
  const loop = createLoop(ctx, buffer, gain, b, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(dbToGain(b.gainDb), t + fadeS()); // level-matched (audio.json)

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
  // alive until it stops, then it can be collected.
  for (const f of Object.keys(buffers)) if (f !== b.file) delete buffers[f];
}

// Scene entry points call this. Before the first gesture it only records
// the desired track; the first gesture starts it.
export function play(name) {
  if (!bed(name)) return;
  pending = name;
  if (ctx && !mute.on) startTrack(name);
}

// Warm the compressed bytes of every bed in the background, so a scene
// switch only waits on a decode (fast), never on the network. Not while
// MUSIC is OFF (0.00223: a muted player used to download the whole score
// at the first gesture); the unmute warms them then.
function warmOthers() {
  for (const t of Object.values(DATA.audio?.music?.tracks ?? {})) fetchBytes(t.file).catch(() => {});
}

// Called once from main.js: the first gesture anywhere unlocks audio.
export function initMusic() {
  if (!hasAudio()) return;
  onFirstGesture(() => {
    initCtx();
    ctx.resume?.().catch?.(() => {});
    if (!mute.on) { if (pending) startTrack(pending); warmOthers(); }
  });
}

export const isMuted = () => mute.on;

export function toggleMuted() {
  const m = mute.toggle();
  setBusMuted('music', m);
  if (m && current) { // 0.00197: the bed stops (it kept scheduling its loop and holding its decoded buffer, ~20MB, behind a silent bus)
    const old = current;
    try { old.loop.stop(ctx.currentTime + 0.2); } catch { /* already gone */ } // (0.00223: after the bus's 0.15 s ramp, not a hard cut)
    setTimeout(() => { try { old.gain.disconnect(); } catch { /* already gone */ } }, 250);
    current = null; currentName = null; // (pending keeps the latest ask — 0.00223: it used to be reset to the playing bed, so a bed asked for during its decode was forgotten)
    for (const f of Object.keys(buffers)) delete buffers[f];
  }
  if (!m) {
    initCtx();
    if (ctx) {
      ctx.resume?.().catch?.(() => {});
      if (pending) startTrack(pending);
      warmOthers();
    }
  }
  return m;
}

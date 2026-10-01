// audio/music.js — scene background music. Five looping beds (title /
// combat / boss / shrine / end), crossfaded on scene change. Browsers
// block audio before a user gesture, so the AudioContext is created on the
// first pointerdown/keydown and the pending track fades in then. Mute
// state persists in localStorage. Without a Web Audio implementation
// (tests), everything is a safe no-op.
//
// Memory (0.078): a decoded 60s stereo bed is ~23MB of float samples, and
// all five used to be decoded up front (~115MB). Now only the compressed
// mp3 bytes are warmed (~5MB per score); a bed is decoded when it starts
// playing, and the previous bed's decode is dropped once it has faded.
//
// 0.107: beds play seamlessly (musicLoop.js) into the mixer's music bus
// (volume slider, MUSIC toggle, ducking under stingers).
//
// 0.114: two scores, picked in the VOLUME panel and kept in this browser
// (assets/data/audio.json music.scores; `score` is the default):
//   - the dark ambient score (tools/gen-music.py): each bed is an exact
//     loop of loopS seconds with its first tailS seconds appended, so it
//     restarts every loopS and crossfades (equal gain) over identical
//     audio — no dip, and the pulse keeps its place;
//   - the classic beds: ~20s pieces with fades, chained section by section
//     (audioMath.findSections) so the fades are skipped.

import { DATA } from '../shared/data.js';
import { hasAudio, ensureCtx, fetchBytes, decode, onFirstGesture } from './audioCore.js';
import { mixer, musicInput, setBusMuted } from './mixer.js';
import { findSections, dbToGain } from './audioMath.js';
import { createLoop } from './musicLoop.js';

const MUTE_KEY = 'castle-music-muted';
const SCORE_KEY = 'castle-music-score';
const fadeS = () => DATA.audio?.music?.fadeS;

let ctx = null;
let buffers = {};        // file -> Promise<AudioBuffer> — only the playing bed
let current = null;      // { loop, gain } of the audible track
let currentKey = null;   // 'score:name' of the audible track
let pending = 'title';   // title screen is the first scene
let muted = false;
let chosen = null;       // the score picked in this browser (else the default)
try {
  muted = globalThis.localStorage?.getItem(MUTE_KEY) === '1';
  chosen = globalThis.localStorage?.getItem(SCORE_KEY) || null;
} catch { /* no storage */ }
setBusMuted('music', muted);

// The scores in audio.json, and the one playing (a stale choice falls
// back to the default).
export const scores = () => DATA.audio?.music?.scores ?? {};
export function scoreId() {
  const all = scores();
  if (all[chosen]) return chosen;
  return all[DATA.audio?.music?.score] ? DATA.audio.music.score : Object.keys(all)[0];
}
// A scene's bed in the current score: { file, loopS?, tailS?, gainDb? }. Scenes ask
// for title (title screen + hub), combat, boss, shrine, end (run end).
const bed = (name) => scores()[scoreId()]?.tracks?.[name] ?? null;

// How a bed loops: an exact loop restarts every loopS over its appended
// tail (equal-gain crossfade); a classic bed chains its sections.
export function loopPlan(b, buffer, crossfade = 1.2) {
  if (b.loopS) return { sections: [{ start: 0, end: b.loopS + (b.tailS ?? 0) }], opts: { crossfade: b.tailS ?? 0, linear: true } };
  buffer.sections ??= findSections(buffer.getChannelData(0), buffer.sampleRate);
  return { sections: buffer.sections, opts: { crossfade } };
}

function initCtx() {
  if (ctx || !hasAudio()) return;
  ctx = ensureCtx();
  mixer();
}

function bufferFor(file) {
  // Cache the in-flight promise: concurrent start calls share one decode.
  if (!buffers[file]) {
    buffers[file] = decode(file);
    buffers[file].catch(() => { delete buffers[file]; }); // allow retry on failure
  }
  return buffers[file];
}

async function startTrack(name) {
  const b = bed(name);
  const key = `${scoreId()}:${name}`;
  if (!b || !ctx || muted || currentKey === key) { pending = name; return; }
  pending = name;
  let buffer;
  try { buffer = await bufferFor(b.file); } catch { return; } // never block the game on audio
  if (pending !== name || bed(name) !== b) return; // a newer request (or score) superseded this decode
  currentKey = key;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(musicInput());
  const t = ctx.currentTime;
  const plan = loopPlan(b, buffer, DATA.audio?.music?.crossfade);
  const loop = createLoop(ctx, buffer, gain, plan.sections, t, plan.opts);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(dbToGain(b.gainDb ?? 0), t + fadeS()); // level-matched (audio.json)

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
  for (const f of Object.keys(buffers)) if (f !== b.file) delete buffers[f];
}

// Scene entry points call this. Before the first gesture it only records
// the desired track; the first gesture starts it.
export function play(name) {
  if (!bed(name)) return;
  pending = name;
  if (ctx && !muted) startTrack(name);
}

// Warm the compressed bytes of the score's tracks in the background, so a
// scene switch only waits on a decode (fast), never on the network.
function warmOthers() {
  for (const t of Object.values(scores()[scoreId()]?.tracks ?? {})) fetchBytes(t.file).catch(() => {});
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

// Switch scores (VOLUME panel): the scene's bed crossfades into the other
// score's version right away. Unknown ids are ignored.
export function setScore(id) {
  if (!scores()[id]) return scoreId();
  chosen = id;
  try { globalThis.localStorage?.setItem(SCORE_KEY, id); } catch { /* no storage */ }
  if (ctx && !muted) {
    if (pending) startTrack(pending);
    warmOthers();
  }
  return id;
}

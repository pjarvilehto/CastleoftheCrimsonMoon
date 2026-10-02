// audio/audioCore.js — the ONE AudioContext shared by music.js and sfx.js
// (0.078: each used to create its own), plus a cached fetch of compressed
// audio bytes. Browsers block audio before a user gesture, so the context
// is created lazily from the first pointerdown/keydown. Without a Web Audio
// implementation (tests), hasAudio() is false and callers no-op.

// Looked up when needed (not at load), so the smoke suite can install its
// fake AudioContext (tools/test/fakeAudio.mjs, 0.118).
const AC = () => globalThis.AudioContext || globalThis.webkitAudioContext || null;
let ctx = null;
const bytes = {}; // url -> Promise<ArrayBuffer> (compressed file, cached in-flight)

export function hasAudio() { return !!AC(); }

// Create (once) and return the shared context; null without Web Audio.
export function ensureCtx() {
  if (!ctx && AC()) ctx = new (AC())();
  return ctx;
}

// Compressed bytes stay cached (small: ~1MB per music bed); decodes are
// the caller's choice, since a decoded 60s stereo bed is ~23MB of floats.
// At most LANES audio files download at once (0.00197): the beds (10MB),
// every narrator take (4MB) and the clip set used to start together at the
// title, against the Descend essentials on a slow link. A sound that is
// about to play (decode) goes to the front of the line.
const LANES = 2;
let active = 0;
const line = []; // [start, front]
function next() {
  while (active < LANES && line.length) { active++; line.shift()[0](); }
}
function queued(task, front) {
  return new Promise((resolve, reject) => {
    const start = () => task().then(resolve, reject).finally(() => { active--; next(); });
    if (front) line.unshift([start]); else line.push([start]);
    next();
  });
}
export function fetchBytes(url, front = false) {
  return cached(bytes, url, () => queued(() => fetch(url).then((res) => {
    if (!res.ok) throw new Error(`audio ${url}: ${res.status}`);
    return res.arrayBuffer();
  }), front));
}

// A promise per key, shared by concurrent callers; a failed one is
// forgotten so the next call retries (the bytes, the beds, the clips).
export function cached(map, key, make) {
  if (!map[key]) {
    map[key] = make();
    map[key].catch(() => { delete map[key]; });
  }
  return map[key];
}

// Decode from the cached bytes. decodeAudioData detaches its input, so it
// gets a copy — the cached compressed bytes survive for the next decode.
export async function decode(url) {
  const raw = await fetchBytes(url, true); // (about to play: ahead of the warm-up)
  return ctx.decodeAudioData(raw.slice(0));
}

// Run fn on the first user gesture, once. 0.00209: pointerup and touchend
// too — a touch counts as activation at the tap's END (pointerdown does for
// a mouse only), so on a phone the first tap used to leave the context
// suspended until the second.
export const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
export function onFirstGesture(fn) {
  const once = () => {
    for (const t of GESTURE_EVENTS) globalThis.removeEventListener?.(t, once);
    fn();
  };
  for (const t of GESTURE_EVENTS) globalThis.addEventListener?.(t, once);
}

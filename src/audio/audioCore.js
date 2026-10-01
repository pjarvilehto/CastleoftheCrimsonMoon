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
export function fetchBytes(url) {
  if (!bytes[url]) {
    bytes[url] = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`audio ${url}: ${res.status}`);
      return res.arrayBuffer();
    });
    bytes[url].catch(() => { delete bytes[url]; }); // allow retry on failure
  }
  return bytes[url];
}

// Decode from the cached bytes. decodeAudioData detaches its input, so it
// gets a copy — the cached compressed bytes survive for the next decode.
export async function decode(url) {
  const raw = await fetchBytes(url);
  return ctx.decodeAudioData(raw.slice(0));
}

// Run fn on the first user gesture (pointerdown or keydown), once.
export function onFirstGesture(fn) {
  const once = () => {
    globalThis.removeEventListener?.('pointerdown', once);
    globalThis.removeEventListener?.('keydown', once);
    fn();
  };
  globalThis.addEventListener?.('pointerdown', once);
  globalThis.addEventListener?.('keydown', once);
}

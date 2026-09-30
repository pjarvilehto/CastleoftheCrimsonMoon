// audio/sfx.js — one-shot sound effects. Short generated clips fired from
// game events (attacks, clicks, transitions, loot, death...). Like music.js,
// Web Audio is gesture-gated: the context unlocks on the first
// pointerdown/keydown via initSfx() from main.js. Repetitive combat sounds
// get a random playback-rate jitter so rapid hits don't sound stamped.
// Mute persists separately from music ('castle-sfx-muted'). Without a Web
// Audio implementation (tests), everything is a safe no-op.

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
const VOLUME = 0.5;
const MUTE_KEY = 'castle-sfx-muted';
// Names that get pitch jitter (±12%) so repeated fires vary.
const JITTERED = new Set(['attack', 'kill', 'hurt', 'loot']);

const AC = globalThis.AudioContext || globalThis.webkitAudioContext || null;
let ctx = null;
let master = null;
let buffers = {}; // name -> Promise<AudioBuffer> (cached in-flight)
let muted = false;
try { muted = globalThis.localStorage?.getItem(MUTE_KEY) === '1'; } catch { /* no storage */ }

function ensureCtx() {
  if (ctx || !AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : VOLUME;
  master.connect(ctx.destination);
}

function bufferFor(name) {
  if (!buffers[name]) {
    buffers[name] = (async () => {
      const res = await fetch(CLIPS[name]);
      const raw = await res.arrayBuffer();
      return ctx.decodeAudioData(raw);
    })();
    buffers[name].catch(() => { delete buffers[name]; }); // allow retry on failure
  }
  return buffers[name];
}

// Fire a one-shot. Before the first gesture (or when muted) it silently
// drops — effects are cosmetic, never queued.
export function sfx(name) {
  if (!CLIPS[name] || !ctx || muted) return;
  bufferFor(name)
    .then((buffer) => {
      if (muted) return; // muted while the clip was decoding
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      if (JITTERED.has(name)) src.playbackRate.value = 0.88 + Math.random() * 0.24;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      src.connect(gain);
      gain.connect(master);
      src.start();
    })
    .catch(() => { /* audio must never break gameplay */ });
}

export function isMuted() { return muted; }

export function toggleMuted() {
  muted = !muted;
  try { globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* no storage */ }
  if (master) master.gain.linearRampToValueAtTime(muted ? 0 : VOLUME, ctx.currentTime + 0.15);
  return muted;
}

// Called once from main.js: the first gesture anywhere unlocks the context
// and warms the whole clip set so first fires don't wait on a fetch.
export function initSfx() {
  if (!AC) return;
  const unlock = () => {
    ensureCtx();
    ctx.resume?.();
    for (const name of Object.keys(CLIPS)) bufferFor(name).catch(() => {});
    globalThis.removeEventListener?.('pointerdown', unlock);
    globalThis.removeEventListener?.('keydown', unlock);
  };
  globalThis.addEventListener?.('pointerdown', unlock);
  globalThis.addEventListener?.('keydown', unlock);
}

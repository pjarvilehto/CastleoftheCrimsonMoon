// audio/narrator.js — the Old Wizard's voice-over (0.161). The lines are
// docs/narration-script.md, rendered with ElevenLabs by tools/gen-vo.mjs
// into assets/audio/vo/ and listed in assets/data/narration.json (per line
// id its takes: file, text, measuredDb). WHEN a line plays is audio.json
// narration.lines (chance per event, first-in-room, once per room / run /
// session, cooldown); the scenes only name the moment: narrate('overkill').
//
// Playback: one line at a time — a line asked for while one plays waits
// for it (gapS of silence between), or is dropped when the wait would be
// longer than maxWaitS. Every take is levelled so its loudest 50 ms lands
// at narration.targetDb, it goes through the effects bus (the SOUND toggle
// and slider apply) and the music ducks under it like under a stinger.
// A take is never played twice in a row for one line. NARRATOR: OFF (the
// corner toggle) persists in this browser. Without Web Audio, or before
// the first gesture, everything is a no-op that still keeps the rule state.

import { DATA } from '../shared/data.js';
import { hasAudio, ensureCtx, fetchBytes, decode, onFirstGesture } from './audioCore.js';
import { mixer, sfxInput, duckMusic } from './mixer.js';
import { dbToGain } from './audioMath.js';
import { getPref, setPref } from '../shared/prefs.js';

const MUTE_KEY = 'castle-narration-muted';
const cfg = () => DATA.audio.narration;
const takesOf = (id) => DATA.narration.lines[id] ?? null;
// A re-rendered take keeps its filename; its URL carries the render stamp so no cache serves the old one.
const urlOf = (t) => (t.rendered ? `${t.file}?r=${encodeURIComponent(t.rendered)}` : t.file);

let ctx = null;
let muted = getPref(MUTE_KEY) === '1';
let queue = Promise.resolve(); // the lines' decodes, in order (0.00197)
let armed = null;     // a line to play on the first gesture (the title screen's welcome)
let busyUntil = 0;    // context time the current line (and its gap) ends
const state = { room: new Set(), run: new Set(), session: new Set(), lastAt: {}, lastTake: {} };

// ---- the rules (pure; the tests drive these) ----

// Should line `id` play now under `rule`? Updates the state when it does
// (a first-in-room attempt counts even when the roll then says no).
export function decide(rule, id, s, now = Date.now(), rnd = Math.random) {
  if (!rule) return false;
  if (rule.oncePerRun && s.run.has(id)) return false;
  if (rule.oncePerRoom && s.room.has(id)) return false;
  if (rule.oncePerSession && s.session.has(id)) return false;
  if (rule.cooldownMs > 0 && now - (s.lastAt[id] ?? -Infinity) < rule.cooldownMs) return false;
  const first = rule.firstInRoom && !s.room.has(id);
  const play = first || rnd() < rule.chance;
  if (first || play) s.room.add(id);
  if (play) { s.run.add(id); s.session.add(id); s.lastAt[id] = now; }
  return play;
}

// A random take, never the one played last for this line (when there are two or more).
export function pickTake(takes, last = null, rnd = Math.random) {
  const pool = takes.length > 1 ? takes.filter((t) => t.take !== last) : takes;
  return pool[Math.floor(rnd() * pool.length)];
}

// ---- state scope: the scenes mark the boundaries ----
export function narratorRoom() { state.room.clear(); }
export function narratorRun() { state.run.clear(); state.room.clear(); }

// ---- playing ----

// Say line `id` if its rule allows; true when it will play. delayMs: hold
// it (a room's narration waits for the painting, combat's for the blow).
export function narrate(id, { delayMs = 0 } = {}) {
  const takes = takesOf(id);
  if (!takes?.length || !decide(cfg().lines[id], id, state)) return false;
  if (!ctx || muted) return true; // the moment counted; nothing to hear yet (and no take spent)
  const take = pickTake(takes, state.lastTake[id]);
  state.lastTake[id] = take.take;
  const N = cfg();
  // one chain (0.00197): two lines asked for in the same tick (a death and
  // the first-death line, a chest and its relic) used to race on decode
  queue = queue.then(() => decode(urlOf(take))).then((buffer) => {
    const now = ctx.currentTime;
    const at = Math.max(now + delayMs / 1000, busyUntil);
    if (at - now > N.maxWaitS) return; // too long a queue: the moment has passed
    const out = ctx.createGain();
    out.gain.value = dbToGain(N.targetDb - take.measuredDb);
    out.connect(sfxInput());
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(out);
    src.start(at);
    src.onended = () => { try { out.disconnect(); } catch { /* gone */ } };
    busyUntil = at + buffer.duration + N.gapS;
    duckMusic(buffer.duration + N.gapS, at);
  }).catch(() => { /* audio must never break gameplay */ });
  return true;
}

// The title screen's welcome: audio needs a gesture, so the line waits for
// the session's first click or key (initNarrator plays it then).
export function armOnGesture(id) { armed = id; }

export function isNarratorMuted() { return muted; }

export function toggleNarrator() {
  muted = !muted;
  setPref(MUTE_KEY, muted ? '1' : '0');
  return muted;
}

// Called once from main.js: the first gesture unlocks the context, warms
// the takes' compressed bytes (~4 MB; decoded on demand, a few ms each) and
// says the armed line.
export function initNarrator() {
  if (!hasAudio()) return;
  onFirstGesture(() => {
    ctx = ensureCtx();
    mixer();
    for (const takes of Object.values(DATA.narration.lines)) for (const t of takes) fetchBytes(urlOf(t)).catch(() => {});
    if (armed) { const id = armed; armed = null; narrate(id); }
  });
}

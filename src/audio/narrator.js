// audio/narrator.js — the Old Wizard's voice-over (0.161). The lines are
// docs/narration-script.md, rendered with ElevenLabs by tools/gen-vo.mjs
// into assets/audio/vo/ and listed in assets/data/narration.json (per line
// id its takes: file, text, measuredDb). WHEN a line plays is audio.json
// narration.lines (chance per event, first-in-room, once per room / run /
// session, cooldown); the scenes only name the moment: narrate('overkill').
//
// Playback: one line at a time — a line asked for while one plays waits
// for it (gapS of silence between), or is dropped when the wait would be
// longer than maxWaitS (a dropped line spends no once-per rule, 0.00223).
// Every take is levelled so its loudest 50 ms lands at narration.targetDb,
// it goes through the effects bus (the SOUND toggle and slider apply: a
// line asked for while that bus is silent is skipped like under NARRATOR:
// OFF) and the music ducks under it like under a stinger. A take is never
// played twice in a row for one line. NARRATOR: OFF (the corner toggle)
// persists in this browser (shared/prefs.js mutePref), stops the line
// playing and drops the ones waiting. Without Web Audio, or before the
// first gesture, everything is a no-op that still keeps the rule state.

import { DATA } from '../shared/data.js';
import { hasAudio, ensureCtx, fetchBytes, decode, onFirstGesture } from './audioCore.js';
import { mixer, sfxInput, duckMusic, busGain } from './mixer.js';
import { dbToGain } from './audioMath.js';
import { mutePref } from '../shared/prefs.js';

const cfg = () => DATA.audio.narration;
const takesOf = (id) => DATA.narration.lines[id] ?? null;
// A re-rendered take keeps its filename; its URL carries the render stamp so no cache serves the old one.
const urlOf = (t) => (t.rendered ? `${t.file}?r=${encodeURIComponent(t.rendered)}` : t.file);

let ctx = null;
const mute = mutePref('castle-narration-muted');
let queue = Promise.resolve(); // the lines' decodes, in order (0.00197)
let armed = null;     // a line to play on the first gesture (the title screen's welcome)
let busyUntil = 0;    // context time the current line (and its gap) ends
const live = new Set(); // the sources playing or scheduled: { src, out } (NARRATOR: OFF stops them)
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
  if (!takes?.length) return false;
  // what the rules held before this ask: a line dropped unheard gives it back (unspend, 0.00223)
  const was = { run: state.run.has(id), session: state.session.has(id), room: state.room.has(id), lastAt: state.lastAt[id], lastTake: state.lastTake[id] };
  if (!decide(cfg().lines[id], id, state)) return false;
  // the moment counted; nothing to hear (no gesture yet, NARRATOR: OFF, SOUND: OFF or its slider at 0): no take spent, no decode, no duck
  if (!ctx || mute.on || busGain('sfx') === 0) return true;
  const take = pickTake(takes, state.lastTake[id]);
  state.lastTake[id] = take.take;
  const mine = take.take, setAt = state.lastAt[id];
  // a line that is never heard (the queue too long, NARRATOR: OFF during the
  // decode) spends nothing: the once-per marks, the cooldown and the 'last
  // take' go back to what they were (decide()'s first-in-room mark is about
  // a failed chance roll and stays with a heard line only too)
  const unspend = () => {
    if (!was.run) state.run.delete(id);
    if (!was.session) state.session.delete(id);
    if (!was.room) state.room.delete(id);
    if (state.lastAt[id] === setAt) { if (was.lastAt === undefined) delete state.lastAt[id]; else state.lastAt[id] = was.lastAt; }
    if (state.lastTake[id] === mine) state.lastTake[id] = was.lastTake;
  };
  const N = cfg();
  // one chain (0.00197): two lines asked for in the same tick (a death and
  // the first-death line, a chest and its relic) used to race on decode
  queue = queue.then(() => decode(urlOf(take))).then((buffer) => {
    if (mute.on || busGain('sfx') === 0) { unspend(); return; } // NARRATOR went OFF, or SOUND went OFF / its slider to 0, during the decode (0.00299: the take used to start through the silent bus and duck the music for its length)
    const now = ctx.currentTime;
    const at = Math.max(now + delayMs / 1000, busyUntil);
    if (at - now > N.maxWaitS) { unspend(); return; } // too long a queue: the moment has passed
    const out = ctx.createGain();
    out.gain.value = dbToGain(N.targetDb - take.measuredDb);
    out.connect(sfxInput());
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(out);
    src.start(at);
    const entry = { src, out };
    live.add(entry);
    src.onended = () => { live.delete(entry); try { out.disconnect(); } catch { /* gone */ } };
    busyUntil = at + buffer.duration + N.gapS;
    duckMusic(buffer.duration + N.gapS, at);
  }).catch(() => { /* audio must never break gameplay */ });
  return true;
}

// The title screen's welcome: audio needs a gesture, so the line waits for
// the session's first click or key (initNarrator plays it then).
export function armOnGesture(id) { armed = id; }

export const isNarratorMuted = () => mute.on;

export function toggleNarrator() {
  const m = mute.toggle();
  if (m) { // OFF stops the line playing and drops the ones waiting (0.00223: they used to play on)
    const now = ctx?.currentTime ?? 0;
    for (const { src, out } of live) { try { out.gain.setTargetAtTime(0, now, 0.01); src.stop(now + 0.05); } catch { /* already gone */ } } // (a short ramp, no click; onended still disconnects)
    live.clear(); busyUntil = 0;
  } else if (ctx) warmTakes(); // (not warmed while OFF)
  return m;
}

// The takes' compressed bytes (~4 MB; decoded on demand, a few ms each),
// warmed in the background — not while NARRATOR is OFF (0.00223: a muted
// player used to download every take at the first gesture).
function warmTakes() {
  for (const takes of Object.values(DATA.narration.lines)) for (const t of takes) fetchBytes(urlOf(t)).catch(() => {});
}

// Called once from main.js: the first gesture unlocks the context, warms
// the takes and says the armed line.
export function initNarrator() {
  if (!hasAudio()) return;
  onFirstGesture(() => {
    ctx = ensureCtx();
    mixer();
    if (!mute.on) warmTakes();
    if (armed) { const id = armed; armed = null; narrate(id); }
  });
}

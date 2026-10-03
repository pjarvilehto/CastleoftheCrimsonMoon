// labs/sfx/lab.js — the SFX Lab (see index.html). Every clip of the sound
// registry (assets/data/audio.json clips) grouped by where the game plays
// it, played through the game's own modules — sfx.js (the trims, voices,
// variation layers, stingers), mixer.js (the buses, the duck) and music.js
// (the beds) — so what is heard here is what the game plays. Per clip:
// Volume (a dB offset on the trim), Pitch (semitones) and Speed (%, the
// pitch kept: the decoded clip is time-stretched here by overlap-add, then
// played at the pitch's rate through sfx.sfxFrom); Approve; a note. The
// state lives in localStorage: { [clip]: { ok, vol, pitch, speed, note, at } }.
// COPY JSON = { approved: [clips], edits: [{ clip, gainDb, pitch, speed, note, approved }] }
// for tools/render-sfx.mjs --apply.

import { loadData, DATA } from '../../src/shared/data.js';
import { sfx, sfxFrom, sfxContext, initSfx, isMuted as sfxMuted, toggleMuted as toggleSfx } from '../../src/audio/sfx.js';
import { play as playBed, initMusic, isMuted as musicMuted, toggleMuted as toggleMusic } from '../../src/audio/music.js';
import { setBusMuted } from '../../src/audio/mixer.js';
import { decode } from '../../src/audio/audioCore.js';
import { heroList, heavyName } from '../../src/shared/heroes.js';

const KEY = 'castle-sfx-lab';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids.filter((k) => k !== null && k !== false && k !== undefined));
  return n;
};

await loadData();
const CLIPS = DATA.audio.clips;
const heroes = heroList();
const foes = Object.entries(DATA.enemies);

// ---- where each clip plays: the sections, in the game's order ----
// Each row: [clip, where, detail]. A clip in two places is listed in both.
const SECTIONS = [
  { id: 'hall', name: 'Great Hall', bed: 'title', rows: [
    ['click', 'Every button', 'main.js: a click on any button, the hall, the title and the dialogs too'],
    ['levelup', 'Train / Alchemy', 'a discipline or an alchemy track bought, the satchel expanded (hubSections.js)'],
    ['forge', 'Forge', 'a worn item forged a level'],
    ['loot', "A run's finds revealed", 'each find taking its slot as the hall opens after a run (tier 1-2)'],
    ['rare', "A run's finds revealed", 'a tier 3-4 find taking its slot'],
    ['deeper', 'Descend into the Dungeon', 'as the descent begins, after the Descend Now? prompt (0.00298; then the room whoosh)'],
    ['attack', 'VOLUME panel', "the SOUND slider's preview blow (also every blow in combat, below)"],
  ] },
  { id: 'combat', name: 'Combat', bed: 'combat', rows: [
    ['attack', "The hero's blow", 'every strike, a spill and thorns; its variation entry picks a pitch, a tone and tick / thud / slice / clank layers each play (combatSfx.js: panned to the card, landing on the blow)'],
    ['hurt', 'A blow on the hero', 'the plain hurt (the class cries hurt_<id> sit behind audio.json cries.hero, off since 0.00287)'],
    ['kill', 'A foe falls', "a kill, a multi-kill, OVERKILL's line; also the mega crit's deep second hit at rate 0.72, -5 dB"],
    ['ring', 'A crit', 'the crit\'s impact (recorded since 0.00305, the review\'s ask), lower and louder on a mega crit (rate 0.8, +2 dB)'],
    ['boom', 'OVERKILL', 'synth: the low boom under the heavy blow that covers the room (-4 dB)'],
    ['swoosh', 'A dodge', "a foe's dodge, a bound foe's strain, Immune!"],
    ['heal', 'Drink Potion', 'the potion, with the green light (recorded in 0.00305: a cork, a gulp, a shimmer — the old one read as a coin jingle)'],
    ['loot', 'A find', 'a kill\'s item (tier 1-3) and the coins'],
    ['rare', 'A relic found', 'a tier-4 find'],
    ['shrine', "The boss's summons", 'the summon line (the same chime as a boon taken)'],
    ['revive', 'The Heart revives you', "the Heart of the Dying Moon's second life (0.00297, a stinger: the music ducks)"],
    ['death', 'YOU DIED', 'timed so its hit lands as the dialog flashes in (0.00297, a stinger)'],
    ['tick', 'Strike layer', 'a knife shing (recorded since 0.00305), a random layer under a blow'],
    ['thud', 'Strike layer / Entangle', "a strong impact with reverb (recorded since 0.00305): the body of a blow; also Entangle's roots, the thrall's blows and its fall"],
    ['slice', 'Strike layer', 'a knife swing with its shing (recorded since 0.00305)'],
    ['clank', 'Strike layer', 'a big metallic impact with reverb (recorded since 0.00305): armour under a blow on the hero'],
  ] },
  { id: 'classes', name: "The classes' sounds", bed: 'combat', rows: [
    ...heroes.flatMap((h) => [
      [`atk_${h.id}`, `${h.name}'s blow`, `recorded (0.00271), with the class's own synth colour layered on top from its variation entry`],
      [`heavy_${h.id}`, `${h.name}'s ${heavyName({ hero: { id: h.id } })}`, 'the heavy; recorded, with its layers'],
      [`hurt_${h.id}`, `${h.name} struck`, 'behind audio.json cries.hero (off since 0.00287): the plain hurt plays instead'],
    ]),
    ['swing', 'Class layer', 'synth: a heavy swing'],
    ['crackle', 'Class layer', "synth: fire's roar and pops (the Wizard)"],
    ['zap', 'Class layer / a charge back', 'synth: an arcane buzz falling; also the Wizard\'s charge returning'],
    ['wail', 'Class layer / the thrall', "synth: a grave voice; also the Necromancer's thrall rising"],
    ['rake', 'Class layer', 'synth: three claws (the Druid)'],
    ['chime', 'Class layer / the Hex', "synth: an inharmonic bell; also the Hexhunter's mark"],
    ['hiss', 'Class layer / the blight', "synth: censer smoke and chain; also the Plague Sister's blight"],
    ['grunt', 'The hero struck', 'synth: the struck hero\'s grunt (a layer; off the hurt clips since 0.00277)'],
  ] },
  { id: 'foes', name: "The foes' sounds", bed: 'combat', rows: foes.flatMap(([id, e]) => [
    [`eatk_${id}`, `${e.name} attacks`, 'with the blow on the hero (combatSfx.js, from the striking card)'],
    [`ehurt_${id}`, `${e.name} struck`, 'behind audio.json cries.foe (off since 0.00287)'],
  ]) },
  { id: 'panel', name: 'Shrine and treasure rooms', bed: 'shrine', rows: [
    ['shrine', 'A boon taken', 'the blessing chime (a stinger: the music ducks)'],
    ['loot', 'The chests', 'an item inside; the Iron Coffer\'s coins too (since 0.00305)'],
    ['rare', 'A relic', 'the reliquary\'s relic (and the chest\'s tier 4)'],
    ['revive', "The reliquary's price paid back", "the Heart gives the knight back after the seal drank him (0.00297)"],
    ['deeper', 'Push Deeper', 'leaving a panel room, as in combat'],
  ] },
  { id: 'change', name: 'Room change', bed: 'combat', rows: [
    ['deeper', 'Push Deeper', 'the huge tom as the room is left (0.00298)'],
    ...DATA.audio.transition.clips.map((c) => [c, 'The crossfade', `one of the ${DATA.audio.transition.clips.length} picked at random; its loudest moment (${CLIPS[c].peakMs} ms in) lands ${DATA.audio.transition.peakAtMs / 1000} s into the change, mid-crossfade`]),
  ] },
  { id: 'end', name: "The run's end", bed: 'end', rows: [
    ['death', 'YOU DIED', 'the huge wooden tube with the dialog (the end bed follows it)'],
    ['victory', 'The win', "the room-24 boss beaten: the victory dialog's chime (a stinger)"],
  ] },
];
const BEDS = { title: 'title / Great Hall', combat: 'combat', boss: 'boss', shrine: 'shrine / treasure', end: "run's end" };

// ---- state ----
let state = {};
try { state = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { state = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };
const S = (clip) => (state[clip] ??= { ok: false, vol: 0, pitch: 0, speed: 100, note: '' });
const edited = (clip) => { const s = state[clip]; return !!s && (s.vol !== 0 || s.pitch !== 0 || s.speed !== 100); };
const approved = (clip) => state[clip]?.ok ?? !!CLIPS[clip].approved; // the registry's approval is the base; this browser's verdict overrides
const level = (clip) => { const c = CLIPS[clip]; return c.file ? `${(c.measuredDb + c.gainDb).toFixed(1)} dB (measured ${c.measuredDb}, trim ${c.gainDb >= 0 ? '+' : ''}${c.gainDb})` : `synth, trim ${c.gainDb >= 0 ? '+' : ''}${c.gainDb ?? 0}`; };

// ---- audio: the game's modules, unlocked by the first gesture like the game's ----
// initSfx / initMusic register for the FIRST gesture, so both go in at load
// (a listener added during a click misses that click's own pointerup). The
// music bus starts muted here: the game's title bed may start under it at the
// first gesture, and MUSIC ON lifts the mute and asks for the section's bed.
let armed = false, musicOn = false, vary = true;
initSfx();
initMusic();
setBusMuted('music', true);
function arm() {
  if (armed) return;
  armed = true;
  if (sfxMuted()) { toggleSfx(); say("The game's SOUND was OFF in this browser — turned ON to hear the clips (the game's setting too)."); }
}
function say(t) { $('note').textContent = t; }

// speed without a pitch change: a plain overlap-add time-stretch (60 ms
// Hann grains at half overlap) — good enough for a review listen; the
// render tool does the real one with ffmpeg
const stretched = {}; // `${clip}@${factor}` -> AudioBuffer
function stretch(ctx, buf, factor) {
  if (Math.abs(factor - 1) < 0.005) return buf;
  const sr = buf.sampleRate, grain = Math.round(0.06 * sr), hopOut = grain >> 1, hopIn = hopOut / factor;
  const outLen = Math.ceil(buf.length * factor) + grain;
  const out = ctx.createBuffer(buf.numberOfChannels, outLen, sr);
  const win = Float32Array.from({ length: grain }, (_, k) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / grain));
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch), dst = out.getChannelData(ch);
    for (let o = 0, i = 0; o + grain <= outLen; o += hopOut, i += hopIn) {
      const s0 = Math.round(i);
      if (s0 >= src.length) break;
      for (let k = 0; k < grain && s0 + k < src.length; k++) dst[o + k] += src[s0 + k] * win[k];
    }
  }
  return out;
}
const decoded = {};
async function playClip(clip) {
  arm();
  const c = CLIPS[clip], s = S(clip);
  const pitch = 2 ** (s.pitch / 12), speed = s.speed / 100;
  if (musicOn && (bedFor() !== currentBed)) startBed(); // the section's bed follows the clip
  if (!edited(clip) && vary) { sfx(clip); return; } // as the game plays it
  const opts = { gainDb: s.vol, plain: !vary };
  if (c.synth || !c.file) { // one knob: pitch and speed are the same rate for a generated sound
    if (s.pitch !== 0) opts.rate = pitch;
    sfx(clip, opts);
    return;
  }
  if (s.pitch === 0 && s.speed === 100) { sfx(clip, opts); return; }
  const ctx = sfxContext();
  if (!ctx) { sfx(clip, opts); return; } // (before the first gesture: nothing plays; after it the context is there)
  const key = `${clip}@${(pitch / speed).toFixed(3)}`;
  try {
    decoded[c.file] ??= decode(c.file);
    stretched[key] ??= stretch(ctx, await decoded[c.file], pitch / speed); // the length a rate of `pitch` brings back to 1 / speed
  } catch { delete decoded[c.file]; return; }
  sfxFrom(clip, stretched[key], { ...opts, rate: pitch });
}
let currentBed = null, currentSection = null;
function bedFor() { const pick = $('bed').value; return pick === 'auto' ? (currentSection?.bed ?? 'title') : pick; }
function startBed() {
  if (!musicOn) return;
  arm();
  if (musicMuted()) { toggleMusic(); say("The game's MUSIC was OFF in this browser — turned ON for the beds (the game's setting too)."); }
  setBusMuted('music', false);
  const bed = bedFor();
  playBed(bed); // (crossfades from the bed playing, as a scene change does)
  currentBed = bed;
  $('music').textContent = `♪ Music: ${BEDS[bed]}`;
}
// music.js has no stop: OFF mutes the bus (the bed plays on under it) and ON lifts the mute where it is
function setMusic(on) {
  musicOn = on;
  $('music').classList.toggle('on', on);
  if (on) startBed();
  else { setBusMuted('music', true); $('music').textContent = '♪ Music: off'; }
}

// ---- the list ----
const rows = []; // { clip, section, row, knobs }
let current = 0;
function setCurrent(i) {
  rows[current]?.row.classList.remove('current');
  current = Math.max(0, Math.min(rows.length - 1, i));
  rows[current].row.classList.add('current');
  currentSection = rows[current].section;
  rows[current].row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function paintAll(clip) { for (const r of rows) if (r.clip === clip) paint(r); count(); }
function paint(r) {
  const s = S(r.clip);
  r.row.classList.toggle('ok', approved(r.clip));
  r.row.classList.toggle('edited', edited(r.clip));
  r.row.querySelector('.b-ok').classList.toggle('on-ok', approved(r.clip));
  r.row.querySelector('.b-ok').textContent = approved(r.clip) ? '✓ Approved' : 'Approve';
  r.knobs.vol.input.value = s.vol; r.knobs.vol.out.value = `${s.vol >= 0 ? '+' : ''}${s.vol.toFixed(1)} dB`;
  r.knobs.pitch.input.value = s.pitch; r.knobs.pitch.out.value = `${s.pitch >= 0 ? '+' : ''}${s.pitch} st`;
  r.knobs.speed.input.value = s.speed; r.knobs.speed.out.value = `${s.speed}%`;
  r.knobs.note.value = s.note ?? '';
  r.row.querySelector('.b-reset').disabled = !edited(r.clip) && !s.note;
}
function count() {
  const names = Object.keys(CLIPS);
  const ok = names.filter(approved).length, ed = names.filter(edited).length;
  $('count').innerHTML = `<b>${names.length}</b> clips · <b>${ok}</b> approved · <b>${ed}</b> edited`;
}
const knob = (r, key, label, min, max, step) => {
  const input = el('input', { type: 'range', min, max, step, value: S(r.clip)[key] });
  const out = el('output');
  input.addEventListener('input', () => { S(r.clip)[key] = Number(input.value); save(); paintAll(r.clip); });
  input.addEventListener('change', () => { setCurrent(rows.indexOf(r)); playClip(r.clip); });
  return { wrap: el('label', {}, el('span', {}, label), input, out), input, out };
};
const root = $('groups');
for (const sec of SECTIONS) {
  const box = el('section', { class: 'group' },
    el('div', { class: 'group-head' }, el('h2', {}, sec.name), el('span', { class: 'bed' }, 'Bed under it: ', el('b', {}, BEDS[sec.bed])),
      el('button', { class: 'small', onclick: () => { $('bed').value = 'auto'; currentSection = sec; setMusic(true); } }, '♪ Play this bed')));
  for (const [clip, where, detail] of sec.rows) {
    if (!CLIPS[clip]) continue;
    const c = CLIPS[clip];
    const r = { clip, section: sec };
    const vol = knob(r, 'vol', 'Volume', -12, 12, 0.5), pitch = knob(r, 'pitch', 'Pitch', -12, 12, 1), speed = knob(r, 'speed', 'Speed', 50, 200, 5);
    if (c.synth || !c.file) { speed.input.disabled = true; speed.wrap.classList.add('lock'); speed.wrap.title = 'a generated sound: pitch and speed are one knob'; }
    const note = el('input', { type: 'text', placeholder: 'a note for the render (what was wrong, what you want)' });
    note.addEventListener('input', () => { S(clip).note = note.value; save(); for (const o of rows) if (o.clip === clip && o !== r) o.knobs.note.value = note.value; });
    r.knobs = { vol, pitch, speed, note };
    r.row = el('div', { class: 'clip', onclick: () => setCurrent(rows.indexOf(r)) },
      el('span', { class: 'name' }, clip, el('small', {}, c.file ? c.file.split('/').pop() : 'generated (audio/synth.js)'), el('small', {}, level(clip), c.stinger ? ' · stinger' : '', DATA.audio.duck.clips[clip] ? ` · ducks the music ${DATA.audio.duck.clips[clip]} s` : '')),
      el('span', { class: 'where' }, where, el('small', {}, detail)),
      el('div', { class: 'acts' },
        el('button', { class: 'play', onclick: (e) => { e.stopPropagation(); setCurrent(rows.indexOf(r)); playClip(clip); } }, '▶ Play'),
        el('button', { class: 'b-ok small', onclick: (e) => { e.stopPropagation(); S(clip).ok = !approved(clip); S(clip).at = Date.now(); save(); paintAll(clip); } }, 'Approve'),
        el('button', { class: 'b-reset small', onclick: (e) => { e.stopPropagation(); Object.assign(S(clip), { vol: 0, pitch: 0, speed: 100, note: '' }); save(); paintAll(clip); } }, 'Reset')),
      el('div', { class: 'knobs' }, vol.wrap, pitch.wrap, speed.wrap, note));
    rows.push(r);
    box.append(r.row);
  }
  root.append(box);
}
rows.forEach(paint);
count();
setCurrent(0);

// ---- controls ----
$('music').onclick = () => setMusic(!musicOn);
$('bed').onchange = () => { if (musicOn) startBed(); };
$('vary').onclick = () => { vary = !vary; $('vary').classList.toggle('on', vary); $('vary').textContent = `Variation: ${vary ? 'on' : 'off'}`; };
$('stopAll').onclick = () => { setMusic(false); };
$('clear').onclick = () => { if (confirm('Forget every verdict, edit and note in this browser?')) { state = {}; save(); rows.forEach(paint); count(); } };
$('copy').onclick = async () => {
  const out = { approved: [], edits: [] };
  for (const clip of Object.keys(CLIPS)) {
    const s = state[clip];
    if (edited(clip) || s?.note) out.edits.push({ clip, gainDb: s.vol, pitch: s.pitch, speed: s.speed, note: s.note || undefined, approved: approved(clip) });
    else if (s?.ok && !CLIPS[clip].approved) out.approved.push(clip);
  }
  const json = JSON.stringify(out, null, 2);
  $('out').textContent = json;
  $('exportBox').classList.remove('hidden');
  try { await navigator.clipboard.writeText(json); } catch { /* no clipboard: the box has it */ }
  const a = el('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: 'sfx-review.json' });
  document.body.append(a); a.click(); a.remove();
};
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  const r = rows[current];
  if (k === ' ') { e.preventDefault(); playClip(r.clip); }
  else if (k === 'a') { S(r.clip).ok = !approved(r.clip); S(r.clip).at = Date.now(); save(); paintAll(r.clip); }
  else if (k === 'm') $('music').click();
  else if (k === 'v') $('vary').click();
  else if (k === 'r') r.row.querySelector('.b-reset').click();
  else if (k === 'j' || k === 'arrowdown') { e.preventDefault(); setCurrent(current + 1); }
  else if (k === 'k' || k === 'arrowup') { e.preventDefault(); setCurrent(current - 1); }
});

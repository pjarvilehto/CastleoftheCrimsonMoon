// tools/test/narration.test.mjs — the Old Wizard's voice-over (0.161):
// the script, the rendered takes and their registry agree; the rules
// (chance, first-in-room, once per room / run / session, cooldown, no take
// twice in a row); the engine against the fake AudioContext (levelled,
// one line at a time, dropped when the wait is too long, ducking, mute);
// and every moment in the game wired to its line.

import { ok, sleep, fresh, registry, DATA, dungeonScene, readFileSync, statSync } from './harness.mjs';

fresh();

const read = (f) => readFileSync(f, 'utf8');
const N = DATA.audio.narration;
const LINES = DATA.narration.lines;

// ---- the script -> the takes -> the registry ----
{
  const { parseScript, cleanTake } = await import('../gen-vo.mjs');
  const script = parseScript(read('docs/narration-script.md'));
  const ids = script.map((l) => l.id);
  ok('the script has 32 lines in 127 takes (OVERKILL nine since 0.188)', ids.length === 32 && script.reduce((n, l) => n + l.takes.length, 0) === 127 && script.find((l) => l.id === 'overkill').takes.length === 9);
  ok('every line of the script is in narration.json with every take', script.every((l) => l.takes.every((t) => LINES[l.id]?.some((x) => x.take === t.take && x.text === t.text))));
  ok('narration.json has no line the script lacks', Object.keys(LINES).every((id) => ids.includes(id)));
  const takes = Object.values(LINES).flat();
  ok('every take is an MP3 on disk under assets/audio/vo, measured', takes.every((t) => /^assets\/audio\/vo\/vo_[a-z0-9_]+_\d\.mp3$/.test(t.file) && statSync(t.file).size > 5 * 1024 && Number.isFinite(t.measuredDb)));
  ok('every take is levelled within reach (measured between -24 and -5 dB)', takes.every((t) => t.measuredDb > -24 && t.measuredDb < -5));
  ok('the narrator never shouts: no "!" sent, no stage direction, no leading ellipsis', takes.every((t) => !/[!*]/.test(t.text) && !t.text.startsWith('…'))
    && cleanTake('*(dry chuckle)* Rise!') === 'Rise.' && cleanTake('…It is done.') === 'It is done.');
  ok('every line has a rule (audio.json narration.lines) and every rule a line', ids.every((id) => Number.isFinite(N.lines[id]?.chance)) && Object.keys(N.lines).every((id) => LINES[id]));
  ok('the script\'s frequencies: every / sometimes / once rules', N.lines.descent_begin.chance === 1 && N.lines.hall_return.chance === 0.4 && N.lines.room_cleared.chance === 0.2
    && N.lines.overkill.firstInRoom && N.lines.overkill.chance === 0.25 && N.lines.low_hp.oncePerRoom && N.lines.low_hp.cooldownMs === 30000
    && N.lines.new_record.oncePerRun && N.lines.boss_summon.oncePerRoom && N.lines.forge.oncePerSession);
  ok('gen-vo: --only narrows the rendering, never the registry (0.188: it truncated narration.json to one line)', read('tools/gen-vo.mjs').includes('(!only || only.includes(j.id))') && !read('tools/gen-vo.mjs').includes('if (only && !only.includes(id)) continue;'));
  ok('data check covers the narration', read('src/shared/dataCheck.js').includes('narration.lines') && read('src/shared/data.js').includes("'narration'"));
}

// ---- the rules (pure) ----
{
  const { decide, pickTake } = await import('../../src/audio/narrator.js');
  const S = () => ({ room: new Set(), run: new Set(), session: new Set(), lastAt: {}, lastTake: {} });
  const hi = () => 0.99, lo = () => 0.01;
  let s = S();
  ok('chance 1 plays every time; chance 0 never', decide({ chance: 1 }, 'a', s, 0, hi) && decide({ chance: 1 }, 'a', s, 0, hi) && !decide({ chance: 0 }, 'b', s, 0, lo));
  ok('a chance is a roll', decide({ chance: 0.3 }, 'c', s, 0, () => 0.29) && !decide({ chance: 0.3 }, 'c', s, 0, () => 0.31));
  ok('no rule: silence', !decide(undefined, 'x', s, 0, lo));
  s = S();
  const ov = { chance: 0.25, firstInRoom: true };
  ok('OVERKILL: the first in a room always, then the chance', decide(ov, 'overkill', s, 0, hi) && !decide(ov, 'overkill', s, 0, hi) && decide(ov, 'overkill', s, 0, lo));
  s.room.clear();
  ok('...and again first in the next room', decide(ov, 'overkill', s, 0, hi));
  s = S();
  const low = { chance: 1, oncePerRoom: true, cooldownMs: 30000 };
  ok('low HP: once per room', decide(low, 'low_hp', s, 1000, hi) && !decide(low, 'low_hp', s, 2000, hi));
  s.room.clear();
  ok('...and not within 30 s of the last, even in a new room', !decide(low, 'low_hp', s, 20000, hi) && decide(low, 'low_hp', s, 31001, hi));
  s = S();
  ok('new record: once per run', decide({ chance: 1, oncePerRun: true }, 'new_record', s, 0, hi) && !decide({ chance: 1, oncePerRun: true }, 'new_record', s, 0, hi));
  s.room.clear();
  ok('...a new room does not reset it; a new run does', !decide({ chance: 1, oncePerRun: true }, 'new_record', s, 0, hi) && (s.run.clear(), decide({ chance: 1, oncePerRun: true }, 'new_record', s, 0, hi)));
  s = S();
  ok('the forge: once per session', decide({ chance: 1, oncePerSession: true }, 'forge', s, 0, hi) && (s.run.clear(), s.room.clear(), !decide({ chance: 1, oncePerSession: true }, 'forge', s, 0, hi)));
  const takes = [{ take: 1 }, { take: 2 }, { take: 3 }, { take: 4 }];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  let last = null, repeat = false, seen = new Set();
  for (let i = 0; i < 200; i++) { const t = pickTake(takes, last, rnd); if (t.take === last) repeat = true; seen.add(t.take); last = t.take; }
  ok('a take is never said twice in a row; all four get their turn', !repeat && seen.size === 4);
  ok('one take: always that one', pickTake([{ take: 1 }], 1, rnd).take === 1);
}

// ---- the engine, against the fake AudioContext ----
{
  const { installFakeAudio } = await import('./fakeAudio.mjs');
  const fa = installFakeAudio();
  const nar = await import('../../src/audio/narrator.js');
  const mx = await import('../../src/audio/mixer.js');
  const { dbToGain } = await import('../../src/audio/audioMath.js');
  ok('narrator: on by default, the toggle persists', nar.isNarratorMuted() === false && nar.toggleNarrator() === true
    && localStorage.getItem('castle-narration-muted') === '1');
  const fetched = []; const inner = globalThis.fetch;
  globalThis.fetch = (url) => { fetched.push(String(url)); return inner(url); };
  const voFetched = () => fetched.filter((u) => u.includes('assets/audio/vo/'));
  nar.initNarrator(); // with NARRATOR: OFF
  fa.gesture();
  const ctx = fa.ctx();
  ctx.decodeAudioData = async () => ctx.createBuffer(1, 2 * 48000, 48000); // 2 s takes
  await sleep(10);
  ok('NARRATOR: OFF at the first gesture downloads no take (0.00223)', voFetched().length === 0);
  const takeCount = Object.values(LINES).flat().length;
  nar.toggleNarrator(); nar.narrate('descent_begin'); // ON: the takes warm; a line asked for in the same tick
  await sleep(10);
  ok('...ON warms every take, and a line asked for meanwhile goes ahead of them (the pool)', nar.isNarratorMuted() === false && voFetched().length === takeCount
    && voFetched()[2]?.includes('vo_descent_begin_'), voFetched().slice(0, 3).join(' '));
  const started = () => ctx.started.filter((s) => s.kind === 'buffer' && s.buffer?.duration === 2 && s.started[2] === undefined); // the narrator's (a music loop starts with a duration)
  const gainOf = (src) => src.outs[0]?.gain?.value;
  nar.narratorRun();
  const T0 = Math.max(100, Math.ceil(ctx.currentTime / 100) * 100 + 100); // (the clock relative to what is there: the audio test leaves it a second past every registered clip — 0.00271, with 59 file clips it passed 100)
  ctx.currentTime = T0;
  const n0 = started().length;
  ok('a line plays: the moment counts', nar.narrate('descent_begin') === true);
  await sleep(10);
  const a = started()[n0];
  const levels = LINES.descent_begin.map((t) => dbToGain(N.targetDb - t.measuredDb));
  ok('...a take starts now through the effects bus, levelled to targetDb', !!a && a.started[0] === T0 && a.outs[0].outs[0] === mx.mixer().sfx
    && levels.some((g) => Math.abs(g - gainOf(a)) < 1e-9), a && `${a.started} ${gainOf(a)}`);
  const duck = mx.mixer().duck.gain.events;
  ok('...the music ducks under it', duck.some((e) => e[0] === 'target' && Math.abs(e[1] - dbToGain(DATA.audio.duck.db)) < 1e-9 && e[2] === T0));
  nar.narrate('boss_enter');
  await sleep(10);
  const b = started()[n0 + 1];
  ok('a second line waits for the first, a gap between', !!b && Math.abs(b.started[0] - (T0 + 2 + N.gapS)) < 1e-9, b && `${b.started}`);
  ctx.currentTime = T0 + 3; // the second line still has 1.8 s to go
  nar.narrate('shrine_enter', { delayMs: 500 });
  await sleep(10);
  const c = started()[n0 + 2];
  ok('a delayed line starts after its delay or the queue, whichever is later', !!c && Math.abs(c.started[0] - (T0 + 2 * (2 + N.gapS))) < 1e-9, c && `${c.started}`);
  const n1 = started().length;
  for (let i = 0; i < 4; i++) nar.narrate('treasure_enter');
  await sleep(10);
  ok('lines that would wait longer than maxWaitS are dropped', started().length < n1 + 4 && started().every((s) => s.started[0] - (T0 + 3) <= N.maxWaitS + 1e-9));

  // SOUND: OFF (0.00223): nothing to hear, so no take is spent and the music is not ducked
  mx.setBusMuted('sfx', true);
  ctx.currentTime = T0 + 50;
  const nS = started().length, nD = mx.mixer().duck.gain.events.length;
  ok('SOUND: OFF — the moment counts, no take plays, no duck', nar.narrate('boss_enter') === true && (await sleep(10), started().length === nS && mx.mixer().duck.gain.events.length === nD));
  mx.setBusMuted('sfx', false);

  // a line dropped for the wait gives its once-per rule back (0.00223)
  ctx.currentTime = T0 + 60; nar.narratorRun();
  nar.narrate('boss_enter'); nar.narrate('shrine_enter'); // 2 x (2 s + the gap) queued: a third would wait past maxWaitS
  const nU = started().length;
  ok('a line dropped for the wait keeps its once per run', nar.narrate('new_record') === true && (await sleep(10), started().length === nU + 2)
    && (ctx.currentTime = T0 + 70, nar.narrate('new_record') === true) && (await sleep(10), started().length === nU + 3));
  const rnd = Math.random; Math.random = () => 0; // (the forge's chance roll always passes)
  ctx.currentTime = T0 + 80;
  nar.narrate('boss_enter'); nar.narrate('shrine_enter');
  const nF = started().length;
  ok('...and its once per session', nar.narrate('forge') === true && (await sleep(10), started().length === nF + 2)
    && (ctx.currentTime = T0 + 90, nar.narrate('forge') === true) && (await sleep(10), started().length === nF + 3)
    && (ctx.currentTime = T0 + 95, nar.narrate('forge') === false)); // (heard once: the session rule holds)
  Math.random = rnd;

  ctx.currentTime = T0 + 100;
  nar.narrate('retreat'); await sleep(10);
  const playing = started().at(-1);
  nar.toggleNarrator(); // OFF
  ok('NARRATOR: OFF stops the line playing (0.00223)', typeof playing?.stopped === 'number' && playing.outs[0].gain.events.some((e) => e[0] === 'target' && e[1] === 0));
  const n2 = started().length;
  ok('NARRATOR: OFF — the moment still counts, nothing plays', nar.narrate('descent_begin') === true && (await sleep(10), started().length === n2));
  nar.toggleNarrator(); // ON
  let release; const decode2s = ctx.decodeAudioData;
  ctx.decodeAudioData = () => new Promise((r) => { release = () => r(ctx.createBuffer(1, 2 * 48000, 48000)); });
  nar.narrate('retreat'); await sleep(1); // its decode held open
  nar.toggleNarrator(); // OFF while it decodes
  release(); await sleep(10);
  ok('...and drops a line still decoding when it came', started().length === n2);
  ctx.decodeAudioData = decode2s;
  nar.toggleNarrator(); // ON
  ok('an unknown line is ignored', nar.narrate('nope') === false);
  ok('no audio errors', ctx.errors.length === 0, ctx.errors.join('; '));

  // the dungeon's first room says the descent (the scene drives the real narrator)
  fresh();
  ctx.currentTime = 300;
  const n3 = started().length;
  dungeonScene().enter(registry.app);
  await sleep(50);
  const d = started()[n3];
  const dl = LINES.descent_begin.map((t) => dbToGain(N.targetDb - t.measuredDb));
  ok('entering the castle: "…your descent begins", held for the painting', !!d && Math.abs(d.started[0] - (300 + N.roomEntryDelayMs / 1000)) < 1e-9 && dl.some((g) => Math.abs(g - gainOf(d)) < 1e-9), d && `${d.started}`);
  fa.restore();
}

// ---- combat events -> lines ----
{
  const { voFor } = await import('../../src/ui/combatQueue.js');
  const run = { maxHp: 1000 };
  const c = { over: false, victory: false, isBoss: false };
  ok('OVERKILL / multi-kill (SMASH) / mega crit / revive / summon map to their lines',
    voFor({ type: 'overkill' }, { run, combat: c }) === 'overkill' && voFor({ type: 'multi' }, { run, combat: c }) === 'smash'
    && voFor({ type: 'atk', megaCrit: true }, { run, combat: c }) === 'mega_crit' && voFor({ type: 'atk', crit: true }, { run, combat: c }) === undefined
    && voFor({ type: 'revive' }, { run, combat: c }) === 'revive' && voFor({ type: 'summon' }, { run, combat: c }) === 'boss_summon');
  ok('the room cleared: a line, except after a boss (which has its own)', voFor({ type: 'sys' }, { run, combat: { over: true, victory: true, isBoss: false } }) === 'room_cleared'
    && voFor({ type: 'sys' }, { run, combat: { over: true, victory: true, isBoss: true } }) === undefined && voFor({ type: 'sys' }, { run, combat: { over: true, victory: false } }) === undefined);
  ok('a hit that leaves the knight low: the low-HP line', voFor({ type: 'dmg', snap: { hp: 350 } }, { run, combat: c }) === 'low_hp' && voFor({ type: 'dmg', snap: { hp: 351 } }, { run, combat: c }) === undefined);
  ok('a relic drop narrates', read('src/ui/combatQueue.js').includes("vo: cls === 'relic' ? 'relic_found'"));
  const pb = read('src/ui/combatPlayback.js');
  ok('playback says a line\'s narration as it prints; the dungeon delays it to the blow', pb.includes('if (item.vo) onVo(item.vo);') && read('src/ui/scenes/dungeonScene.js').includes('onVo: (id) => narrate(id, { delayMs: DATA.audio.narration.combatDelayMs })'));
}

// ---- every moment wired ----
{
  const d = read('src/ui/scenes/dungeonScene.js');
  ok('the room threshold: boss / shrine / treasure, else descent, stretch, record, elite — one line, held for the painting',
    d.includes("['boss_enter']") && d.includes("['shrine_enter']") && d.includes("['treasure_enter']") && d.includes("firstRoom && 'descent_begin'")
    && d.includes('`stretch_${stretch + 1}`') && d.includes("room.number > rec.bestRoom && 'new_record'") && d.includes("room.enemies.some(isElite) && 'elite'")
    && d.includes('for (const id of ids) if (narrate(id, opts)) break;') && d.includes('delayMs: DATA.audio.narration.roomEntryDelayMs'));
  ok('the dungeon marks runs and rooms for the once-per rules', d.includes('narratorRun();') && d.includes('narratorRoom();'));
  ok('a potion, a death (the reliquary\'s, a boss\'s, the first), a boss slain', d.includes("narrate('potion')") && d.includes("'death_reliquary' : DATA.enemies[run.killedBy]?.boss ? 'death_boss' : 'death'")
    && d.includes("records.deaths === 0) narrate('first_death')") && d.includes("!maybeShowVictory() && run.room.isBoss) narrate('boss_slain')"));
  ok('the title greets on the first gesture; the hall after a run; a level, the forge', read('src/ui/scenes/titleScene.js').includes("armOnGesture('title_welcome')")
    && read('src/ui/scenes/hubScene.js').includes("if (opts.fromRun) narrate('hall_return')") && read('src/ui/scenes/runEndScene.js').includes("go('hub', { fromRun: true")
    && read('src/ui/hubSections.js').includes("> lv) narrate('level_up')") && read('src/ui/hubSections.js').includes("narrate('forge')"));
  ok('a retreat, the victory, a boon, a chest, a relic from the reliquary', read('src/ui/scenes/runEndScene.js').includes("narrate('retreat')") && read('src/ui/victoryModal.js').includes("narrate('victory')")
    && read('src/ui/shrineUI.js').includes("narrate('shrine_take')") && read('src/ui/treasureUI.js').includes('narrate(`chest_${kind}`)') && read('src/ui/treasureUI.js').includes("narrate('relic_found')"));
  const m = read('src/main.js');
  ok('main: NARRATOR toggle under SOUND, the narrator initialised', /onOffToggle\('SOUND'[^\n]*\n\s*onOffToggle\('NARRATOR'/.test(m) && m.includes('initNarrator()'));
  ok('CLAUDE.md documents the voice-over', read('CLAUDE.md').includes('narrator.js'));
  // a re-rendered take (0.164): approved: false + a rendered stamp; the game and the lab fetch it under a stamped URL
  const redone = Object.values(LINES).flat().filter((t) => t.rendered);
  const wasRedone = Object.values(LINES).flat().filter((t) => t.rendered && t.approved === true);
  ok('a re-rendered take can be approved afterwards (0.167: the tool dropped such approvals)', wasRedone.length >= 20, String(wasRedone.length));
  ok('re-rendered takes are stamped and unapproved until reviewed', redone.every((t) => typeof t.approved === 'boolean' && !Number.isNaN(Date.parse(t.rendered)))
    && read('src/audio/narrator.js').includes('`${t.file}?r=${encodeURIComponent(t.rendered)}`') && read('labs/vo/lab.js').includes('?r=${encodeURIComponent(t.rendered)}'));
}

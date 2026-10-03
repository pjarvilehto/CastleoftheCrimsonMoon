// tools/test/audio.test.mjs — music, sound effects, the corner toggles.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, sleep, t, fresh, registry, DATA, dungeonScene, hubScene, titleScene, resetProfile, getProfile, readFileSync, readdirSync, statSync, withSeedAsync } from './harness.mjs';

fresh();

// T30: 0.066 — background music engine (no Web Audio in the shim: safe no-ops)
{
  const music = await import('../../src/audio/music.js');
  ok('music module loads without AudioContext', typeof music.play === 'function' && typeof music.initMusic === 'function');
  ok('default: music on', music.isMuted() === false);
  ok('toggle mutes and persists', music.toggleMuted() === true && localStorage.getItem('castle-music-muted') === '1');
  ok('toggle restores', music.toggleMuted() === false && localStorage.getItem('castle-music-muted') === '0');
  let quiet = true; try { music.play('boss'); music.play('nope'); music.initMusic(); } catch { quiet = false; } // (0.00299: the check used to pass `true` whatever the calls did)
  ok('play/init no-op safely without AudioContext', quiet);
}

// T33: 0.068 — five 60s music tracks wired to the right scenes; the Forge
// ignores tier-1 gear (no enhance button, forgeItem refuses).
{
  const musicSrc = readFileSync(new URL('../../src/audio/music.js', import.meta.url), 'utf8');
  const tracks = DATA.audio.music.tracks; // the beds live in audio.json (0.114; one score since 0.118)
  for (const t of ['title', 'combat', 'boss', 'shrine', 'end']) {
    const secs = statSync(tracks[t].file).size * 8 / 128000; // 128 kbps
    ok(`music bed ${t}: on disk, a loop + its tail, at least 30 s`, Math.abs(secs - (tracks[t].loopS + tracks[t].tailS)) < 0.6 && tracks[t].loopS >= 30); // (0.00282: the developer's shrine loop is the take's first ~35 s)
  }
  ok('the classic beds are gone (0.118)', !readdirSync('assets/audio').some((f) => /^music-(title|combat|boss|shrine|end)\.mp3$/.test(f)));
  ok('no stale ambient/dungeon track refs', !musicSrc.includes('ambient.mp3') && !musicSrc.includes('dungeon.mp3'));
  const read = (f) => readFileSync(new URL(`../../src/ui/scenes/${f}`, import.meta.url), 'utf8');
  ok('title screen plays title track', read('titleScene.js').includes("play('title')"));
  ok('hub plays title track', read('hubScene.js').includes("play('title')"));
  ok('end screen plays end track', read('runEndScene.js').includes("play('end')"));
  ok('dungeon routes combat/shrine/boss', (() => { const d = read('dungeonScene.js'); return d.includes("'combat'") && d.includes("'shrine'") && d.includes("'boss'"); })());
}
{
  const { forgeItem, forgeCost } = await import('../../src/meta/leveling.js');
  resetProfile();
  const p = getProfile();
  p.coins = 100000;
  ok('forge refuses tier-1 items', forgeItem('rusty_sword') === false && !p.forged.rusty_sword);
  ok('forge accepts tier-2 items', forgeItem('knights_blade') === true && p.forged.knights_blade === 1);

  const { hubScene } = await import('../../src/ui/scenes/hubScene.js');
  const countForgeBtns = () => { let n = 0; registry.app.walk((e) => { if (e.className && e.className.split(' ').includes('forge-btn')) n++; }); return n; };
  resetProfile();
  getProfile().equipment.weapon = 'rusty_sword'; // tier 1
  hubScene().enter(registry.app);
  ok('no forge button for tier-1 gear', countForgeBtns() === 0);
  resetProfile();
  getProfile().equipment.weapon = 'knights_blade'; // tier 2
  getProfile().coins = 100000;
  hubScene().enter(registry.app);
  ok('forge button shown for tier-2 gear', countForgeBtns() === 1);
  resetProfile();
}

// T34: 0.069 — fullscreen toggle (0.115: built by main.js's fullscreenToggle
// on the shared ON/OFF toggle; the label follows fullscreenchange).
{
  const mainSrc = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  ok('fullscreen toggle (an icon beside SETTINGS, 0.00242) requests/exits fullscreen, synced to fullscreenchange', mainSrc.includes("class: 'debug-toggle fs-toggle'") && mainSrc.includes("[!isPhone() && fullscreenToggle()]")
    && mainSrc.includes('enterFullscreen()') && mainSrc.includes('exitFullscreen()') && mainSrc.includes("'fullscreenchange', () => btn.sync()")
    && readFileSync(new URL('../../src/shared/platform.js', import.meta.url), 'utf8').includes('requestFullscreen ?? root.webkitRequestFullscreen')); // (0.00209: the prefixed calls live in platform.js, shared with the phone gate)
}

// T35: 0.070 — sound effects: module no-op safety, all clips on disk, and
// every hook point wired (playback-synced combat sounds, clicks, transitions,
// death, shrine, level-up, loot, forge, victory).
{
  const sfxMod = await import('../../src/audio/sfx.js');
  ok('sfx module loads without AudioContext', typeof sfxMod.sfx === 'function' && typeof sfxMod.initSfx === 'function');
  ok('sfx default: sound on', sfxMod.isMuted() === false);
  ok('sfx toggle mutes and persists', sfxMod.toggleMuted() === true && localStorage.getItem('castle-sfx-muted') === '1');
  ok('sfx toggle restores', sfxMod.toggleMuted() === false && localStorage.getItem('castle-sfx-muted') === '0');
  let quiet = true; try { sfxMod.sfx('attack'); sfxMod.sfx('nope'); sfxMod.initSfx(); } catch { quiet = false; }
  ok('sfx play/init no-op safely without AudioContext', quiet);

  const C = DATA.audio.clips; // the sound registry (0.118)
  for (const c of ['click', 'attack', 'kill', 'hurt', 'swoosh', 'shrine', 'levelup', 'rare', 'loot', 'heal', 'forge', 'victory']) {
    // (0.00302: a clip the SFX Lab's review re-rendered moved into sfx/ as <c>_v<k>.mp3; the rest keep their first names)
    ok(`sfx clip registered + on disk: ${c}`, (C[c]?.file === `assets/audio/sfx-${c}.mp3` || new RegExp(`^assets/audio/sfx/${c}_v\\d+\\.mp3$`).test(C[c]?.file)) && statSync(C[c].file).size > 5 * 1024); // 0.5s click ~ 8.8KB
  }
  // 0.00297: the developer's recordings — the death hit (a huge wooden tube, timed to the dialog) and the Heart's revive (a spooky metal hit), both stingers that duck the music
  ok('the death hit: a new file with its loudest moment measured, a stinger', /^assets\/audio\/sfx\/death_v\d+\.mp3$/.test(C.death.file) && statSync(C.death.file).size > 100 * 1024
    && Number.isFinite(C.death.peakMs) && C.death.peakMs > 0 && C.death.stinger === true && DATA.audio.duck.clips.death > 0 && !readdirSync('assets/audio').includes('sfx-death.mp3'));
  ok('the revive hit: a file clip, a stinger ducking the music like the shrine', C.revive.file === 'assets/audio/sfx/revive_v1.mp3' && statSync(C.revive.file).size > 100 * 1024
    && C.revive.stinger === true && DATA.audio.duck.clips.revive === DATA.audio.duck.clips.shrine);
  ok('the death and the revive sit at the stingers\' level, above the hits (death -7.5 since the 0.00302 review, revive -10)', Math.abs(C.death.measuredDb + C.death.gainDb + 7.5) < 0.11 && Math.abs(C.revive.measuredDb + C.revive.gainDb + 10) < 0.11);
  ok('generated sounds registered as synth (the boom and the classes\' colours; 0.00305: the strikes\' layers and the crit\'s ring are recordings now)', ['boom', 'swing', 'crackle', 'zap', 'wail', 'rake', 'chime', 'hiss', 'grunt'].every((n) => C[n]?.synth === true && !C[n].file)
    && ['ring', 'tick', 'thud', 'slice', 'clank', 'heal'].every((n) => /^assets\/audio\/sfx\/\w+_v\d+\.mp3$/.test(C[n]?.file) && !C[n].synth && statSync(C[n].file).size > 5 * 1024));
  ok('the strikes\' recorded layers keep the synths\' raw levels under the hits (tick -17.1, slice -23.5; the thud and the clank a little stronger, the developer\'s ask), the crit\'s ring at -10 with the sweeteners from 0',
    Math.abs(C.tick.measuredDb + C.tick.gainDb + 17.1) < 0.11 && Math.abs(C.slice.measuredDb + C.slice.gainDb + 23.5) < 0.11 && Math.abs(C.thud.measuredDb + C.thud.gainDb + 8) < 0.11 && Math.abs(C.clank.measuredDb + C.clank.gainDb + 10) < 0.11
    && Math.abs(C.ring.measuredDb + C.ring.gainDb + 10) < 0.11 && DATA.audio.sweeteners.crit.ringDb === 0 && DATA.audio.sweeteners.mega.ringDb > 0
    && readFileSync('src/ui/treasureUI.js', 'utf8').includes("? 'rare' : 'loot');") && readFileSync('src/shared/dataCheck.js', 'utf8').includes('a clip — synth or a recording since 0.00305'));
  ok('combat sounds jittered', ['attack', 'kill', 'hurt', 'loot'].every((n) => C[n].rate?.length === 2 && C[n].jitterDb > 0));

  const read = (f) => readFileSync(f, 'utf8'); // cwd = repo root (harness)
  ok('playback fires item.sfx on print (via the scene\'s onSfx, 0.107)', read('src/ui/combatPlayback.js').includes('if (item.text && item.sfx) onSfx(item);')
    && read('src/ui/combatPlayback.js').includes('onSfx = (item) => sfx(item.sfx)'));
  const d = read('src/ui/scenes/dungeonScene.js');
  const q = read('src/ui/combatQueue.js'); // event -> queue mapping (0.098)
  ok('dungeon maps combat events to sfx', q.includes("atk: 'attack'") && q.includes("dmg: 'hurt'") && q.includes("kill: 'kill'"));
  ok('dungeon: rare vs common loot sounds', q.includes("cls === 'relic' ? 'rare' : 'loot'"));
  ok('dungeon: death/potion wired; the room swoosh moved to every transition (main.js, 0.173)', !d.includes("sfx('whoosh')") && d.includes("sfxPeakAt('death', DEATH_PEAK_MS)") && d.includes("combatSfx({ sfx: 'heal'") && readFileSync('src/main.js', 'utf8').includes('onTransition(() => { transitionSfx(); bgPush(); })'));
  {
    const { sfxFor } = await import('../../src/ui/combatQueue.js');
    const { DEATH_PEAK_MS } = await import('../../src/ui/fx.js');
    ok('the Heart\'s revive plays its own hit, the summon keeps the shrine chime (0.00297)', sfxFor({ type: 'revive' }) === 'revive' && sfxFor({ type: 'summon' }) === 'shrine');
    ok('the death hit lands as the dialog flashes in: the flash\'s peak is exported and the clip\'s own peak comes before it', DEATH_PEAK_MS === 900 && C.death.peakMs < DEATH_PEAK_MS
      && read('src/ui/fx.js').includes('}, DEATH_PEAK_MS);'));
    ok('the reliquary\'s revive plays the hit too (treasureUI: the Heart unspent before, spent after, the knight alive)', read('src/ui/treasureUI.js').includes("if (!got.died && heart && !run.revive) sfx('revive');"));
    // 0.00298: the huge tom on Push Deeper (every chosen room change, not the first room's entry) and as the hall's Descend begins
    ok('the deeper strike: a file clip at the hits\' level, struck on Push Deeper and on Descend', C.deeper.file === 'assets/audio/sfx/deeper_v1.mp3' && statSync(C.deeper.file).size > 100 * 1024
      && Math.abs(C.deeper.measuredDb + C.deeper.gainDb + 7) < 0.11 && !C.deeper.stinger // (-12 until the developer's 0.00302 review: +5)
      && d.includes("if (!instant) sfx('deeper');") && read('src/ui/scenes/hubScene.js').includes("sfx('deeper'); // the descent begins"));
  }
  ok('shrine blessing chime wired', read('src/ui/shrineUI.js').includes("sfx('shrine')"));
  const h = read('src/ui/hubSections.js'); // (0.00223: the hall's rows live there)
  ok('hub: levelup + forge wired', h.includes("sfx('levelup')") && h.includes("sfx('forge')"));
  ok('run end: no fanfare, the narrator\'s word on a retreat (0.162); the win dialog keeps the chime', !read('src/ui/scenes/runEndScene.js').includes("sfx('victory')")
    && read('src/ui/scenes/runEndScene.js').includes("narrate('retreat')") && read('src/ui/victoryModal.js').includes("sfx('victory')"));
  const m = read('src/main.js');
  ok('main: SOUND toggle + global clicks', m.includes("onOffToggle('SOUND'") && m.includes("closest?.('button')") && m.includes('initSfx()'));
}

// T69: 0.107 — the audio pass: the music crossfade (equal gain since 0.118), stereo from the screen, voice management, the mixer (buses,
// limiter, sliders, ducking, background pause), loudness trims, combat
// sounds placed + timed + tiered, and the VOLUME panel.
{
  const read = (f) => readFileSync(f, 'utf8');
  const am = await import('../../src/audio/audioMath.js');
  const fin = am.fadeCurve(32), fout = am.fadeCurve(32, true);
  ok('the procedural beds\' equal-gain curve, kept for a bed without `crossfade` (same audio in phase: sums to 1, no +3 dB bump; every shipped bed crossfades by power since 0.00282 — checked with the loop below)', fin.every((v, i) => Math.abs(v + fout[i] - 1) < 1e-6) && fin[0] === 0 && Math.abs(fin[31] - 1) < 1e-6);
  ok('stereo: left card left, right card right, capped by width', am.panForX(0, 1000, 0.6) === -0.6 && am.panForX(500, 1000, 0.6) === 0
    && Math.abs(am.panForX(1000, 1000, 0.5) - 0.5) < 1e-9 && am.panForX(NaN, 1000) === 0);
  ok('slider curve: half way = quarter gain', am.sliderGain(0.5) === 0.25 && am.sliderGain(2) === 1 && am.sliderGain(-1) === 0);
  const V = { maxPerClip: 2, maxTotal: 4, retriggerMs: 80, stackDb: -3 };
  const v = (name, t0, stinger = false) => ({ name, t0, t1: t0 + 1, stinger });
  ok('voices: a repeat within the retrigger window is dropped', am.planVoice([v('hurt', 1)], 'hurt', 1.05, V).skip === true);
  const p3 = am.planVoice([v('hurt', 1), v('hurt', 1.2)], 'hurt', 1.4, V);
  ok('voices: a 3rd copy of one clip replaces the oldest, quieter for the one left', p3.steal.length === 1 && p3.steal[0].t0 === 1 && p3.gainDb === -3);
  const full = [v('death', 0.5, true), v('attack', 0.9), v('kill', 1), v('loot', 1.1)];
  const pt = am.planVoice(full, 'hurt', 1.3, V);
  ok('voices: at the total cap the oldest non-stinger goes; stingers are never cut', pt.steal.length === 1 && pt.steal[0].name === 'attack');
  ok('voices: finished sounds don\'t count', am.planVoice([v('hurt', 0)], 'hurt', 1.5, V).gainDb === 0);

  const A = DATA.audio;
  const clips = Object.keys(A.clips).filter((c) => A.clips[c].file);
  const loud = (c) => A.clips[c].measuredDb + A.clips[c].gainDb;
  ok('every clip has a loudness trim', clips.every((c) => Number.isFinite(A.clips[c]?.gainDb) && Number.isFinite(A.clips[c]?.measuredDb)));
  ok('mix: a rare find is louder than common loot and the hits; hits ~-12; the click audible', loud('rare') > loud('loot') + 4 && loud('rare') > loud('attack')
    && Math.abs(loud('attack') + 12) <= 2 && Math.abs(loud('hurt') + 12) <= 2 && loud('click') > -30 && loud('death') > loud('attack'));

  const mx = await import('../../src/audio/mixer.js');
  const mxFresh = await import('../../src/audio/mixer.js?order-proof'); // (0.00223: an instance of its own — the shared one may hold a graph from a block that ran before)
  ok('mixer: no graph without Web Audio; default volumes from data', mxFresh.mixer() === null && mxFresh.getVolumes().master === A.volumes.master);
  mx.setVolume('music', 0.5);
  ok('volume sliders persist and set the bus (squared curve)', JSON.parse(localStorage.getItem('castle-audio-volumes')).music === 0.5
    && Math.abs(mx.busGain('music') - A.musicLevel * 0.25) < 1e-9);
  mx.setVolume('music', 7);
  ok('volumes clamp to 0..1', mx.getVolumes().music === 1);
  mx.setBusMuted('sfx', true);
  ok('the SOUND toggle silences the effects bus, keeping the slider', mx.busGain('sfx') === 0 && mx.getVolumes().sfx === 1);
  mx.setBusMuted('sfx', false);
  // (the graph, the hidden-tab pause and the gesture resume are driven for real in T83 below, 0.00223)
  ok('stingers duck the music', ['death', 'victory', 'rare'].every((c) => A.duck.clips[c] > 0) && A.duck.db < 0 && A.limiter.threshold < 0);
  // combat sounds: placed on their card, timed to the blow, tiered
  const { combatSfx } = await import('../../src/ui/combatSfx.js');
  const { strikeMs } = await import('../../src/ui/combatFx.js');
  globalThis.innerWidth = 1000;
  const card = (x) => ({ card: { getBoundingClientRect: () => ({ left: x - 50, width: 100 }) } });
  const ctx = { unit: (w) => (w === 'player' ? card(150) : card(600 + w * 100)) };
  const calls = [];
  const rec = (name, o = {}) => calls.push({ name, ...o });
  combatSfx({ sfx: 'attack', fx: { kind: 'attack', from: 'player', to: 2 } }, ctx, rec);
  ok('your blow sounds from the struck enemy, on the strike', calls[0].name === 'attack' && calls[0].pan > 0.2 && calls[0].delayMs === strikeMs({}) && strikeMs({}) > 100);
  calls.length = 0;
  combatSfx({ sfx: 'hurt', fx: { kind: 'attack', from: 1, to: 'player' } }, ctx, rec);
  ok('hits on the knight sound from the left', calls[0].name === 'hurt' && calls[0].pan < -0.3);
  calls.length = 0;
  combatSfx({ sfx: 'attack', fx: { kind: 'attack', from: 'player', to: 0, crit: true, heavy: true } }, ctx, rec);
  ok('crit: + a ring, on the (heavier, later) strike', calls.map((c) => c.name).join() === 'attack,ring' && calls[1].delayMs === strikeMs({ heavy: true }) && strikeMs({ heavy: true }) > strikeMs({}));
  calls.length = 0;
  combatSfx({ sfx: 'attack', fx: { kind: 'attack', from: 'player', to: 0, crit: true, mega: true } }, ctx, rec);
  ok('MEGA CRIT: + a lower ring and a deep second hit', calls.map((c) => c.name).join() === 'attack,ring,kill' && calls[1].rate < 1 && calls[2].rate < 1);
  calls.length = 0;
  combatSfx({ sfx: 'kill', fx: { kind: 'overkill', dmg: 300 } }, ctx, rec);
  ok('OVERKILL: + a boom', calls.map((c) => c.name).join() === 'kill,boom');
  calls.length = 0;
  combatSfx({ sfx: 'kill', sink: 3, text: 'x died!' }, ctx, rec);
  combatSfx({ sfx: 'loot', text: '+5 coins' }, ctx, rec);
  ok('a death and its loot come from that enemy\'s card', calls[0].pan > 0.4 && calls[1].pan === calls[0].pan);
  delete globalThis.innerWidth;

  const vp = read('src/ui/volumePanel.js');
  ok('VOLUME panel: master / music / effects sliders, live', vp.includes("['master', 'Master'], ['music', 'Music'], ['sfx', 'Effects']") && vp.includes('setVolume(kind, e.target.value)')
    && read('src/main.js').includes('volumeToggle(),'));
}

// T70: 0.173 — the room change's whoosh, played so its loudest moment lands in
// the middle of the transition (1 s out + 2 s crossfade + 1 s in = 2 s).
// 0.00297: ten of the developer's whoosh recordings in place of the one
// pitched-down swoosh (gone with its variation entry), one picked at random
// each change, every one measured (peakMs) and levelled where the old one sat;
// the generated whoosh is long gone.
{
  const A = DATA.audio, T = A.transition, cs = T.clips.map((n) => A.clips[n]);
  ok('the transition lists ten whoosh recordings, each a measured file clip with its loudest moment', T.clips.length === 10 && new Set(T.clips).size === 10 && !T.clip
    && cs.every((c) => /^assets\/audio\/sfx\/whoosh_\w+_v\d+\.mp3$/.test(c.file) && statSync(c.file).size > 100 * 1024 && Number.isFinite(c.measuredDb) && Number.isFinite(c.peakMs) && c.peakMs > 0)
    && !A.clips.whoosh && !A.clips.room_swoosh && !A.variation.room_swoosh && !readFileSync('src/audio/synth.js', 'utf8').includes('whoosh'));
  ok('every whoosh\'s peak comes before mid-transition (2 s), so each can be timed to the crossfade; the level varied a little each play', T.peakAtMs === 2000
    && cs.every((c) => T.peakAtMs - c.peakMs > 0 && c.jitterDb > 0));
  ok('the whooshes sit well above the hits\' -12, each at the developer\'s own level (0.00302: his SFX Lab review lifted them 3 to 7.5 dB; 0.00298 had them at -12, at the old swoosh\'s -19.3 they were way too quiet)',
    cs.every((c) => { const l = c.measuredDb + c.gainDb; return l > -10 && l <= -4; }), cs.map((c) => (c.measuredDb + c.gainDb).toFixed(1)).join());
  ok('the old swoosh and death files are gone from the folder players download (rule 7: new names)', !readdirSync('assets/audio').some((f) => /room-swoosh|sfx-death/.test(f)));
}

// T73: 0.110 — strikes vary every hit (pitch, a random tone colour,
// random articulation layers); the coin jingle 3 dB quieter.
{
  const am = await import('../../src/audio/audioMath.js');
  const A = DATA.audio;
  let seq = [0, 0, 0, 0.1, 0.5, 0.2, 0.9, 0.9, 0.9];
  const det = () => seq.shift() ?? 0.5;
  const lo = am.planVariation(A.variation.attack, det);
  ok('variation: lowest pitch, lowest EQ band, layers by chance', Math.abs(lo.rate - A.variation.attack.rate[0]) < 1e-9 && Math.abs(lo.eq.freq - A.variation.attack.eq.lo) < 1e-9
    && lo.eq.gain === -A.variation.attack.eq.db && lo.layers.length >= 1 && lo.layers[0].name === 'tick');
  // seeded (0.136): 40 independent random plans could collide by chance — the
  // check flaked about one run in twenty
  let seed = 12345; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const plans = Array.from({ length: 40 }, () => am.planVariation(A.variation.attack, rnd));
  const sig = (p) => `${p.rate.toFixed(2)}|${Math.round(p.eq.freq)}|${p.layers.map((l) => l.name).join('+')}`;
  ok('variation: 40 hits, 40 different sounds; layers sometimes, not always', new Set(plans.map(sig)).size === 40
    && plans.some((p) => p.layers.length === 0) && plans.some((p) => p.layers.length >= 2)
    && plans.every((p) => p.rate >= 0.84 && p.rate <= 1.2 && p.eq.freq >= 500 && p.eq.freq <= 4500 && Math.abs(p.eq.gain) <= 6));
  ok('variation: none for clips without a config', am.planVariation(undefined) === null);
  const syn = readFileSync('src/audio/synth.js', 'utf8'), sfxSrc = readFileSync('src/audio/sfx.js', 'utf8');
  ok('strike layers: tick, thud, slice (yours), clank, thud (on the knight) — recordings since 0.00305 (the synth instruments stay in synth.js, unused)', ['tick', 'thud', 'slice', 'clank'].every((n) => syn.includes(`function ${n}(`) && A.clips[n]?.file && !A.clips[n].synth)
    && A.variation.attack.layers.map((l) => l.name).join() === 'tick,thud,slice' && A.variation.hurt.layers.map((l) => l.name).join() === 'clank,thud');
  ok('sfx: the layers on every strike go through start() — a recorded one from its decoded buffer, a synth one as before', sfxSrc.includes('if (lc?.file) bufferFor(l.name).then((b) => start(l.name, b, t,') && sfxSrc.includes('else start(l.name, null, t,')); // (the EQ, the pitch and a layer are heard in T83)
  ok('coin jingle 3 dB quieter (0.110)', Math.abs(A.clips.loot.gainDb - 0.9) < 1e-9);
}

// T78: 0.115 — the corner column: one flex column of ON/OFF toggles in a
// fixed order; a toggle flips its state and label; a panel opens right
// under its button (and closes again).
{
  const { cornerBar, onOffToggle, panelToggle } = await import('../../src/ui/cornerToggles.js');
  const { el } = await import('../../src/core/dom.js');
  let state = false;
  const t1 = onOffToggle('MUSIC', { cls: 'music-toggle', get: () => state, flip: () => (state = !state) });
  ok('ON/OFF toggle: label + lit class follow the state', t1.textContent === 'MUSIC: OFF' && !t1.classList.contains('on'));
  t1.listeners.click[0]();
  ok('...clicking flips it', state === true && t1.textContent === 'MUSIC: ON' && t1.classList.contains('on'));
  const p = panelToggle('VOLUME', 'volume-toggle', () => el('div', { class: 'volume-panel' }, 'x'));
  const after = el('button', {}, 'CHANGELIST');
  const lead = el('button', { class: 'debug-toggle fs-toggle' });
  const bar = cornerBar([false, t1, p, after], [lead, false]);
  // (0.00242: the top row — FULLSCREEN, ☰ SETTINGS — leads; the menu drops down under it)
  const top = bar.children[0], menu = top.children[top.children.length - 1];
  ok('the menu keeps its order under the top row, skipping absent items', bar.className === 'corner-bar' && top.className === 'corner-top' && top.children[0] === lead && top.children.length === 2
    && bar.children.slice(1).map((c) => c.textContent).join('|') === 'MUSIC: ON|VOLUME|CHANGELIST' && menu.textContent === '☰Settings');
  p.listeners.click[0]();
  ok('a panel opens right under its button', bar.children.map((c) => c.className).join('|') === 'corner-top|debug-toggle music-toggle|debug-toggle volume-toggle|volume-panel|' && p.classList.contains('on'));
  p.listeners.click[0]();
  ok('...and closes', bar.children.length === 4 && !p.classList.contains('on'));
  menu.listeners.click[0]();
  ok('SETTINGS opens the menu (lit while open), a second click closes it', bar.classList.contains('open') && menu.classList.contains('on') && (menu.listeners.click[0](), !bar.classList.contains('open') && !menu.classList.contains('on')));
  { // 0.00255: a click in a dialog an item opened (BENCHMARK's Start) closes the menu and goes through; any other click outside is swallowed
    const { openDialog } = await import('../../src/ui/dialog.js');
    const outside = document.listeners.click[document.listeners.click.length - 1];
    const ev = () => { const e = { target: {}, stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {} }; return e; };
    menu.listeners.click[0](); const e1 = ev(); outside(e1);
    const swallowed = e1.stopped && !bar.classList.contains('open');
    menu.listeners.click[0](); const d = openDialog({ label: 'Benchmark', children: [] }); const e2 = ev(); outside(e2);
    ok('the menu: a click outside closes it and is swallowed; one inside a dialog closes it and goes through', swallowed && !e2.stopped && !bar.classList.contains('open'));
    d.close?.();
  }
  const m = readFileSync('src/main.js', 'utf8'), css = readFileSync('styles.css', 'utf8');
  ok('main builds the menu: AUDIO (MUSIC SOUND NARRATOR VOLUME) DISPLAY (BATTERY SAVER) GAME (EXPORT SAVE IMPORT SAVE CHANGELIST) DEBUG MODE (the tools)',
    /menuHead\('Audio'\),\s*onOffToggle\('MUSIC'[\s\S]*onOffToggle\('SOUND'[\s\S]*onOffToggle\('NARRATOR'[\s\S]*volumeToggle\(\),\s*menuHead\('Display'\),\s*onOffToggle\('BATTERY SAVER'[\s\S]*menuHead\('Game'\),\s*exportSaveToggle\(\),\s*importSaveToggle\([^\n]*\n\s*changelogToggle\(\),\s*dbg\.toggle,\s*\.\.\.dbg\.items,/.test(m)
    && css.includes('.corner-bar {') && css.includes('.corner-bar:not(.open) > :not(.corner-top) { display: none; }') && css.includes('.corner-bar:not(.debug-on) > .dbg { display: none; }') && !/toggle \{ top: \d+px; \}/.test(css));
  // DEBUG MODE (0.00242): its tools carry .dbg (hidden until it is on); OFF puts every testing switch back
  const { debugMenu } = await import('../../src/ui/debugToggles.js');
  const { DEBUG } = await import('../../src/shared/debug.js');
  const { getPref } = await import('../../src/shared/prefs.js');
  const dm = debugMenu();
  const on0 = dm.toggle.textContent === 'DEBUG MODE: ON';
  if (!on0) dm.toggle.listeners.click[0]();
  DEBUG.invulnerable = true; DEBUG.forceCrit = true;
  dm.toggle.listeners.click[0]();
  ok('DEBUG MODE: its tools are marked .dbg; OFF clears every testing switch and is remembered', dm.items.length >= 9 && dm.items.every((n) => n.classList.contains('dbg'))
    && dm.toggle.textContent === 'DEBUG MODE: OFF' && !DEBUG.invulnerable && !DEBUG.forceCrit && getPref('castle-debug-mode') === '0');
}

// 0.00223 — the on/off preference the three toggles share (shared/prefs.js mutePref).
{
  const { mutePref } = await import('../../src/shared/prefs.js');
  const m = mutePref('castle-test-muted');
  ok('mutePref: off by default; toggle persists 1 / 0 and a fresh read sees it', m.on === false && m.toggle() === true && localStorage.getItem('castle-test-muted') === '1'
    && mutePref('castle-test-muted').on === true && m.toggle() === false && localStorage.getItem('castle-test-muted') === '0' && m.get() === false);
  localStorage.removeItem('castle-test-muted');
}

// 0.00197 / 0.00223 — the download pool: two lanes, and a queued file that is
// asked to play moves to the front of the line (the welcome take used to
// wait behind the whole score).
{
  const { fetchBytes } = await import('../../src/audio/audioCore.js');
  const savedFetch = globalThis.fetch;
  const order = [], release = {};
  globalThis.fetch = (url) => new Promise((res) => { order.push(url); release[url] = () => res({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); });
  const urls = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => `assets/audio/pool-${k}.mp3`);
  for (const u of urls) fetchBytes(u).catch(() => {});
  ok('the pool starts two downloads, the rest wait their turn', order.length === 2 && order[0] === urls[0] && order[1] === urls[1]);
  const p = fetchBytes(urls[4], true); // queued fifth, about to play
  release[urls[0]](); await sleep(1);
  ok('a queued file asked to play starts next, ahead of the ones queued before it', order.length === 3 && order[2] === urls[4]);
  ok('...and the asking call gets the one cached download', p === fetchBytes(urls[4]));
  for (const u of urls) { release[u]?.(); await sleep(1); }
  ok('...the rest follow in their order', order.join() === [urls[0], urls[1], urls[4], urls[2], urls[3], urls[5]].join());
  globalThis.fetch = savedFetch;
}

// T83: 0.118 — the audio engine driven for real, against a recording fake
// AudioContext whose params reject non-finite values like browsers do
// (0.116 shipped a NaN gain on the generated layers that froze combat on
// crits; source checks couldn't see it).
{
  const { installFakeAudio } = await import('./fakeAudio.mjs');
  const fa = installFakeAudio();
  const sfxMod = await import('../../src/audio/sfx.js');
  const music = await import('../../src/audio/music.js');
  const mx = await import('../../src/audio/mixer.js');
  const { dbToGain } = await import('../../src/audio/audioMath.js');
  const A = DATA.audio;
  // every audio file fetched, in order, each given its own size so a decoded buffer can be told apart (buffer.tag)
  const fetched = [], sizes = {}; let nth = 0;
  const inner = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url); fetched.push(u);
    return u.includes('assets/audio/') ? { ok: true, arrayBuffer: async () => new ArrayBuffer(sizes[u] ??= 100 + nth++) } : inner(url);
  };
  const bedFiles = Object.values(A.music.tracks).map((t) => t.file);
  const bedsFetched = () => bedFiles.filter((f) => fetched.includes(f)).length;
  music.toggleMuted(); // MUSIC: OFF before the first gesture
  sfxMod.initSfx(); music.initMusic();
  const visBefore = (document.listeners.visibilitychange ?? []).length; // (the mixer's own listener joins at the first gesture)
  fa.gesture();
  const ctx = fa.ctx();
  const dec = ctx.decodeAudioData.bind(ctx);
  ctx.decodeAudioData = async (raw) => { const b = await dec(raw); b.tag = raw.byteLength; return b; };
  await sleep(10);
  ok('first gesture: one shared context, mixer built', !!ctx && ctx.nodes.some((n) => n.kind === 'compressor') && mx.mixer() !== null);
  const g = mx.mixer();
  ok('graph: music -> duck -> master, effects -> master, master -> limiter -> speakers, the limiter set from data (0.00223: the nodes, not the source)',
    g.music.outs[0] === g.duck && g.duck.outs[0] === g.master && g.sfx.outs[0] === g.master && g.master.outs[0] === g.limiter && g.limiter.outs[0] === ctx.destination
    && g.limiter.kind === 'compressor' && g.limiter.threshold.value === A.limiter.threshold && g.limiter.ratio.value === A.limiter.ratio);
  const visNew = (document.listeners.visibilitychange ?? []).slice(visBefore);
  document.hidden = true; for (const fn of visNew) fn(); await sleep(0);
  const paused = ctx.state;
  document.hidden = false; for (const fn of visNew) fn(); await sleep(0);
  ok('audio pauses in a hidden tab and comes back with it', visNew.length === 1 && paused === 'suspended' && ctx.state === 'running');
  ctx.state = 'suspended'; fa.gesture('pointerup'); await sleep(0);
  ok('a suspended context resumes on a later gesture — a touch\'s end too (0.00209)', ctx.state === 'running');
  ok('MUSIC: OFF at the first gesture downloads no bed (0.00223)', bedsFetched() === 0 && fetched.some((u) => u.includes('assets/audio/')));
  // 0.00299: the pulled get-hit recordings (audio.json cries, 0.00287) are not warmed while their flag is off
  const cryFiles = (prefix) => Object.entries(A.clips).filter(([k, c]) => k.startsWith(prefix) && c.file).map(([, c]) => c.file);
  const hurtFiles = cryFiles('hurt_'), ehurtFiles = cryFiles('ehurt_');
  const warmed = (files) => files.filter((f) => fetched.includes(f)).length;
  ok('the warm-up skips the hurt_<class> and ehurt_<foe> recordings while cries.hero / cries.foe are off, the other clips warm (0.00299)',
    A.cries.hero === false && A.cries.foe === false && hurtFiles.length === 7 && ehurtFiles.length === 12 && warmed(hurtFiles) === 0 && warmed(ehurtFiles) === 0
    && fetched.includes(A.clips.hurt.file) && fetched.includes(A.clips.atk_wizard.file), `${warmed(hurtFiles)} hurt_, ${warmed(ehurtFiles)} ehurt_ warmed`);
  A.cries.hero = true; sfxMod.initSfx(); fa.gesture(); await sleep(10); // (fresh() restores DATA; put back below all the same)
  ok('...cries.hero flipped on: the heroes\' cries warm, the foes\' still not', warmed(hurtFiles) === hurtFiles.length && warmed(ehurtFiles) === 0);
  A.cries.foe = true; sfxMod.initSfx(); fa.gesture(); await sleep(10);
  ok('...cries.foe too: every recording warms', warmed(ehurtFiles) === ehurtFiles.length);
  A.cries.hero = false; A.cries.foe = false;
  music.toggleMuted(); // ON: the title bed starts and the score warms
  await sleep(10);
  ok('...ON warms the whole score and starts the title bed', bedsFetched() === bedFiles.length && ctx.started.some((s) => s.buffer?.tag === sizes[A.music.tracks.title.file]));
  // 0.00285: with MUSIC on, the title bed is fetched and decoded at boot and starts with no gesture where the browser lets the context run (a second music.js instance boots against the running fake context)
  const nStarted = ctx.started.length;
  const early = await import('../../src/audio/music.js?boot-early');
  early.initMusic();
  await sleep(10);
  ok('MUSIC on at boot: the title bed is decoded and started before any gesture where the context runs (0.00285)', ctx.started.slice(nStarted).some((s) => s.buffer?.tag === sizes[A.music.tracks.title.file]));
  early.toggleMuted(); if (music.isMuted()) music.toggleMuted(); // (the early instance's loop stopped; the shared pref and bus back ON for the rest of the block)

  // every registered sound, at every option combination the game uses
  for (const name of Object.keys(A.clips)) {
    sfxMod.sfx(name);
    sfxMod.sfx(name, { pan: 0.7, delayMs: 120, rate: 0.8, gainDb: -10 });
    ctx.currentTime += 1; // past the retrigger window
  }
  await sleep(10);
  ok('every registered sound plays with finite levels (synth layers included)', ctx.errors.length === 0, ctx.errors.join('; '));
  const synthStarts = ctx.started.filter((s) => s.kind === 'osc').length;
  ok('...clips start buffer sources, synth sounds oscillators/noise', ctx.started.some((s) => s.kind === 'buffer' && s.buffer) && synthStarts > 0);
  // 0.00305: a recorded layer (the strikes' tick / thud / slice / clank) starts as a buffer at the blow's own moment, through the layer's trim
  {
    const n0 = ctx.started.length, blows = [];
    await withSeedAsync(9, async () => { for (let i = 0; i < 6; i++) { ctx.currentTime += 1; blows.push(ctx.currentTime); sfxMod.sfx('attack'); await sleep(30); } });
    const started = ctx.started.slice(n0).filter((s) => s.kind === 'buffer');
    const layers = started.filter((s) => !blows.some((b) => Math.abs(s.started[0] - b) < 1e-9 && s === started.find((x) => Math.abs(x.started[0] - b) < 1e-9)));
    ok('a strike\'s recorded layers start as buffers at their blow\'s moment (six blows: some layers, every one on a blow)', layers.length > 0 && layers.every((l) => blows.some((b) => Math.abs(l.started[0] - b) < 1e-9)), `${started.length} buffers, ${layers.length} layers`);
  }

  // the 0.116 case: crit / mega crit / overkill sweeteners + strike layers
  const { combatSfx } = await import('../../src/ui/combatSfx.js');
  const n0 = ctx.started.length;
  for (const fx of [{ kind: 'attack', from: 'player', to: 0, crit: true }, { kind: 'attack', from: 'player', to: 0, crit: true, mega: true }, { kind: 'overkill', dmg: 300 }]) {
    combatSfx({ sfx: fx.kind === 'overkill' ? 'kill' : 'attack', fx }, {});
    ctx.currentTime += 1;
  }
  await sleep(10);
  ok('crit, MEGA CRIT and OVERKILL sounds play without an error', ctx.errors.length === 0 && ctx.started.length > n0 + 3, ctx.errors.join('; '));

  // a stinger ducks the music bus
  const duck = mx.mixer().duck.gain;
  duck.events.length = 0;
  sfxMod.sfx('death');
  await sleep(10);
  ok('a stinger ducks the music by duck.db', duck.events.some((e) => e[0] === 'target' && Math.abs(e[1] - dbToGain(A.duck.db)) < 1e-9));
  ctx.currentTime += 10; // (past every duck so far: the release is a running max, never rewound)
  duck.events.length = 0;
  const dk = ctx.currentTime;
  mx.duckMusic(2.4, dk); mx.duckMusic(1.0, dk + 0.5);
  const rel = duck.events.filter((e) => e[0] === 'target' && e[1] === 1).at(-1);
  ok('a shorter duck under a longer one keeps the longer release (0.00223)', !!rel && Math.abs(rel[2] - (dk + 2.4)) < 1e-9, rel && `${rel}`);

  // a repeat inside the retrigger window is dropped
  const n1 = ctx.started.length;
  sfxMod.sfx('loot'); sfxMod.sfx('loot');
  await sleep(10);
  ok('a repeat inside the retrigger window is dropped', ctx.started.length === n1 + 1);
  // the room whoosh (0.173): scheduled so its loudest moment lands peakAtMs into the transition (0.00223: the start time, not the source);
  // 0.00297: one of the ten recordings at random — each start is timed by ITS OWN peak, and a dozen changes play more than one of them
  const TR = A.transition, bySize = new Map(TR.clips.map((n) => [sizes[A.clips[n].file], A.clips[n]])); // (every file fetched above got its own size)
  const seen = new Set();
  await withSeedAsync(11, async () => {
    for (let i = 0; i < 12; i++) {
      ctx.currentTime += 5;
      const nT = ctx.started.length;
      sfxMod.transitionSfx();
      await sleep(10);
      const sw = ctx.started.slice(nT).find((s) => s.kind === 'buffer');
      const c = sw && bySize.get(sw.buffer?.bytes);
      if (!c) { seen.add('?'); break; }
      seen.add(c.file);
      if (Math.abs(sw.started[0] - (ctx.currentTime + (TR.peakAtMs - c.peakMs) / 1000)) > 1e-9) { seen.add('late'); break; }
    }
  });
  ok('each room whoosh starts peakAtMs - its own peakMs after the transition begins, and the pick varies', !seen.has('?') && !seen.has('late') && seen.size >= 3, [...seen].join(' '));
  // a clip timed by its peak (sfxPeakAt): the death hit lands with the dialog
  ctx.currentTime += 5;
  const nD = ctx.started.length;
  sfxMod.sfxPeakAt('death', 900);
  await sleep(10);
  const dh = ctx.started.slice(nD).find((s) => s.kind === 'buffer');
  ok('sfxPeakAt starts the death hit 900 ms - its peakMs ahead of the dialog', !!dh && Math.abs(dh.started[0] - (ctx.currentTime + (900 - A.clips.death.peakMs) / 1000)) < 1e-9, dh && `${dh.started[0]}`);
  // the SFX Lab's path (0.00301): sfxFrom plays a buffer of the caller's at a given rate through the same start();
  // `plain` = no variation layers, no random pitch, no level jitter — the trim plus the offset exactly
  ctx.currentTime += 5;
  const own = ctx.createBuffer(2, 4800, 48000);
  const nF = ctx.started.length, nN2 = ctx.nodes.length;
  sfxMod.sfxFrom('attack', own, { rate: 0.5, gainDb: 2, plain: true });
  await sleep(10);
  const fr = ctx.started.slice(nF).find((s) => s.kind === 'buffer');
  const gains = ctx.nodes.slice(nN2).filter((n) => n.kind === 'gain');
  ok('sfxFrom plays the given buffer at the given rate, alone (plain: no EQ, no synth layer)', !!fr && fr.buffer === own && fr.playbackRate.value === 0.5
    && !ctx.nodes.slice(nN2).some((n) => n.kind === 'biquad') && !ctx.started.slice(nF).some((s) => s.kind === 'osc'));
  ok('plain: the level is the trim plus the offset, no jitter', gains.some((g) => Math.abs(g.gain.value - dbToGain(A.clips.attack.gainDb + 2)) < 1e-9), gains.map((g) => g.gain.value).join());
  ok('the lab reads the context sfx.js plays on', sfxMod.sfxContext() === ctx);
  let plainPitch = true;
  await withSeedAsync(3, async () => { for (let i = 0; i < 6; i++) { ctx.currentTime += 1; const n0 = ctx.started.length; sfxMod.sfx('loot', { plain: true }); await sleep(5); const s = ctx.started.slice(n0).find((x) => x.kind === 'buffer'); if (!s || s.playbackRate.value !== 1) plainPitch = false; } });
  ok('plain: a clip with a random rate range plays at pitch 1', plainPitch);
  // variation (0.110) heard: a peaking EQ, a pitch off 1 and a synthesized layer on the strikes
  const nN = ctx.nodes.length, nS = ctx.started.length;
  await withSeedAsync(5, async () => { for (let i = 0; i < 10; i++) { ctx.currentTime += 1; sfxMod.sfx('attack'); await sleep(5); } });
  ok('every strike varies: a random peaking EQ, a pitch off 1, a layer (a recording since 0.00305)', ctx.nodes.slice(nN).some((n) => n.kind === 'biquad' && n.type === 'peaking')
    && ctx.started.slice(nS).some((s) => s.kind === 'buffer' && s.playbackRate.value !== 1) && ctx.started.slice(nS).filter((s) => s.kind === 'buffer').length > 10);

  // music: the bed loops exactly, at its level, through the music bus
  music.play('combat');
  await sleep(10);
  const T = A.music.tracks.combat;
  const beds = ctx.started.filter((s) => s.kind === 'buffer' && s.started[2] === T.loopS + T.tailS);
  ok('music: the combat bed plays [0, loopS + tailS), the next copy one loop later', beds.length >= 2 && beds[0].started[1] === 0
    && Math.abs(beds[1].started[0] - beds[0].started[0] - T.loopS) < 1e-9, beds.map((b) => b.started.join(',')).join(' | '));
  const fadeIns = ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.some((e) => e[0] === 'linear' && Math.abs(e[1] - dbToGain(T.gainDb)) < 1e-9));
  ok('...fading in to its level trim', fadeIns.length >= 1);
  const curves = ctx.nodes.flatMap((n) => (n.gain?.events ?? []).filter((e) => e[0] === 'curve' && e[3] === T.tailS));
  const mid = (c) => c[1][Math.floor(c[1].length / 2)];
  const shape = T.crossfade === 'power' ? (c) => Math.abs(mid(c) - Math.SQRT1_2) < 0.05 : (c) => Math.abs(mid(c) - 0.5) < 0.05; // (0.00280: a generated bed's continuation sums by power, an exact loop's identical audio by gain)
  ok(`...crossfading over its tail, ${T.crossfade === 'power' ? 'equal power (a generated bed)' : 'equal gain'}`, curves.some((e) => e[1][0] === 0 && e[1].at(-1) === 1 && shape(e)) && curves.some((e) => e[1][0] === 1 && e[1].at(-1) === 0 && shape(e)));
  const { fadeCurve } = await import('../../src/audio/audioMath.js');
  ok('the crossfade curves: equal gain sums to 1, equal power squares to 1, both exactly 0 and 1 at the ends', [false, true].every((p) => { const i = fadeCurve(32, false, p), o = fadeCurve(32, true, p); return i[0] === 0 && i[31] === 1 && o[0] === 1 && o[31] === 0 && i.every((v, k) => Math.abs((p ? v * v + o[k] * o[k] : v + o[k]) - 1) < 1e-6); }));
  const n2 = ctx.started.length;
  music.play('combat');
  await sleep(10);
  ok('...asking for the playing bed again changes nothing', ctx.started.length === n2);
  music.play('boss');
  await sleep(10);
  ok('a scene change starts the next bed', ctx.started.some((s) => s.started[2] === A.music.tracks.boss.loopS + A.music.tracks.boss.tailS));
  const bedStarts = (name, from) => ctx.started.slice(from).filter((s) => s.buffer?.tag === sizes[A.music.tracks[name].file]).length; // (a loop = the playing copy + the one scheduled after it)
  const n3 = ctx.started.length;
  music.play('end'); music.play('end');
  await sleep(10);
  ok('two asks for one bed in one tick start one loop (0.00223)', bedStarts('end', n3) === 2);
  const n4 = ctx.started.length;
  music.play('shrine'); music.toggleMuted(); music.toggleMuted(); // OFF and ON inside the shrine bed's decode
  await sleep(10);
  ok('MUSIC OFF and ON inside a decode: the bed asked for plays, once (0.00223: the old bed came back)', bedStarts('shrine', n4) === 2 && bedStarts('end', n4) === 0);

  // mute + volume
  const m = mx.mixer();
  music.toggleMuted();
  ok('MUSIC off: the music bus ramps to 0', m.music.gain.events.at(-1)[0] === 'linear' && m.music.gain.events.at(-1)[1] === 0);
  music.toggleMuted();
  mx.setVolume('master', 0.5);
  ok('VOLUME master: squared slider curve on the master bus', Math.abs(m.master.gain.events.at(-1)[1] - 0.25) < 1e-9);
  mx.setVolume('master', 1);
  ok('no audio errors anywhere', ctx.errors.length === 0, ctx.errors.join('; '));
  fa.restore();
}

// 0.00209 / 0.00223: the first gesture counts a touch's END too (pointerup, touchend), and once only
{
  const { installFakeAudio } = await import('./fakeAudio.mjs');
  const fa = installFakeAudio();
  const { onFirstGesture, GESTURE_EVENTS } = await import('../../src/audio/audioCore.js');
  let fired = 0;
  onFirstGesture(() => fired++);
  fa.gesture('touchend'); fa.gesture('touchend'); fa.gesture('pointerdown'); fa.gesture('keydown');
  ok('a touch\'s end is the first gesture, and the callback runs once whatever follows', GESTURE_EVENTS.includes('touchend') && GESTURE_EVENTS.includes('pointerup') && fired === 1);
  fa.restore();
}

// 0.00273: generated scores (the music thread's bake-off). The briefs in
// docs/music-prompts.md -> tools/gen-score.mjs (ElevenLabs Music as a
// composition plan, Lyria 3 Pro with timestamps and optionally the bed's
// painting, Stable Audio 2.5) -> assets/audio/candidates + music-art.json ->
// the Music Lab (labs/music/), level-matched beside the bed the game plays.
{
  const { parseScore, planFor, lyriaPrompt, stablePrompt, requestFor, applyVerdicts, MODELS, BAKEOFF } = await import('../gen-score.mjs');
  const doc = parseScore(readFileSync('docs/music-prompts.md', 'utf8'));
  const tracks = Object.keys(DATA.audio.music.tracks);
  ok('music-prompts.md: a brief per music bed, its sections back to back from 0:00 to its length, its painting in the game',
    doc.style.length > 100 && doc.avoid.includes('vocals') && tracks.every((id) => doc.beds.some((b) => b.id === id))
    && doc.beds.every((b) => b.line && b.global.length >= 4 && b.sections.length >= 3 && b.sections[0].from === 0 && b.sections.at(-1).to === b.seconds
      && b.sections.every((s, i) => i === 0 || s.from === b.sections[i - 1].to) && statSync(`assets/bg/${b.painting}`).isFile()), doc.beds.map((b) => b.id).join());
  const bed = doc.beds.find((b) => b.id === 'combat');
  const plan = planFor(doc, bed, 'more brass');
  ok('the requests: ElevenLabs a composition plan (sections in ms, the avoid list negative), Lyria the timestamps and the painting lead, Stable Audio no structure and the asked length',
    plan.sections.reduce((s, x) => s + x.duration_ms, 0) === bed.seconds * 1000 && plan.negative_global_styles.includes('vocals') && plan.positive_global_styles.includes('more brass')
    && lyriaPrompt(doc, bed).includes('[0:00 - 0:16]') && lyriaPrompt(doc, bed, '', true).startsWith('The attached painting') && !stablePrompt(doc, bed).includes('[0:00')
    && requestFor(doc, bed, { model: 'stable', n: 1 }).input.duration === bed.seconds && requestFor(doc, bed, { model: 'eleven', n: 1 }).body.model_id === 'music_v1'
    && BAKEOFF.models.every((m) => MODELS[m]));
  const reg = JSON.parse(readFileSync('assets/data/music-art.json', 'utf8'));
  const all = Object.values(reg.beds).flatMap((e) => e.candidates);
  ok('music-art.json: every take is on disk with its model, length and loudness, numbered once per bed; the shipped beds are measured',
    all.length >= 12 && all.every((k) => statSync(k.file).isFile() && k.file.startsWith('assets/audio/candidates/') && Number.isFinite(k.lufs) && k.seconds > 30 && k.label && (k.plan || k.prompt))
    && Object.values(reg.beds).every((e) => new Set(e.candidates.map((k) => k.n)).size === e.candidates.length)
    && tracks.every((id) => reg.beds[id]?.current?.file === DATA.audio.music.tracks[id].file && Number.isFinite(reg.beds[id].current.lufs)), `${all.length} takes`);
  const copy = structuredClone(reg), [a, b2] = Object.values(copy.beds).flatMap((e) => e.candidates);
  applyVerdicts(copy, { approved: [{ id: 'x', file: a.file, note: 'the one' }], rejected: [{ id: 'x', file: b2.file, note: 'too busy' }, { id: 'title', file: 'assets/audio/music-title-v2.mp3', current: true }] });
  ok('--rerender records the lab\'s verdicts and notes (a verdict on the game\'s own bed changes nothing)', a.verdict === 'ok' && a.note === 'the one' && b2.verdict === 'no' && b2.note === 'too busy');
  const lab = readFileSync('labs/music/index.html', 'utf8'), js = readFileSync('labs/music/lab.js', 'utf8');
  ok('the Music Lab: booted versioned over the site root, linked from the menu, level-matched by the measured LUFS, verdicts copied for --rerender',
    lab.includes('<base href="../../">') && lab.includes('name="robots" content="noindex"') && lab.includes('<script src="labs/boot.js" data-lab="labs/music/lab.js"') && lab.includes('class="labs-link" href="labs/"')
    && readFileSync('labs/index.html', 'utf8').includes('href="music/" data-lab="music"') && js.includes('createMediaElementSource') && js.includes('TARGET_LUFS - t.lufs') && js.includes("download: 'music-rerender.json'"));
}

// 0.00283 — the sound tool and the shared ElevenLabs module: the prompt
// table and the registry name the same recorded clips, a fresh take
// never overwrites (rule 7), and the one POST carries the key and
// throws the status.
{
  const { readPrompts, nextFile } = await import('../gen-sfx.mjs');
  const { post, hasKey, RETRY_WAITS_S } = await import('../elevenlabs.mjs');
  const rows = readPrompts();
  const EXTRA = ['tick', 'thud', 'slice', 'clank', 'ring', 'heal']; // (0.00305: the third table — the strikes' layers, the crit's impact, the potion)
  const recorded = Object.entries(DATA.audio.clips).filter(([k, c]) => (/^(atk|heavy|hurt|eatk|ehurt)_/.test(k) || EXTRA.includes(k)) && c.file?.startsWith('assets/audio/sfx/')).map(([k]) => k);
  ok('sfx-prompts.md: a row per recorded clip (seconds and a prompt), and a recording for every row',
    rows.length >= 45 && rows.every((r) => r.seconds > 0 && r.prompt.length > 20 && recorded.includes(r.clip)) && recorded.every((k) => rows.some((r) => r.clip === k)), `${rows.length} rows, ${recorded.length} clips`);
  ok('readPrompts reads the table alone (a heading or prose row is skipped)',
    readPrompts('| clip | seconds | prompt |\n|---|---|---|\n| atk_x | 1.5 | a swing |\nsome prose | with | bars | in | it\n| eatk_rat | 1 | a bite |').map((r) => r.clip).join() === 'atk_x,eatk_rat');
  ok('nextFile: the first free _vN, never an existing one', nextFile('atk_wizard', (f) => f === 'atk_wizard_v1.mp3' || f === 'atk_wizard_v2.mp3') === 'atk_wizard_v3.mp3' && nextFile('new_clip', () => false) === 'new_clip_v1.mp3');
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; };
  const bytes = await post('sound-generation', { text: 'a swing', duration_seconds: 1 }, { fetchFn, key: 'k' });
  ok('elevenlabs.post: the path under /v1, the key in the header, the body as JSON, the bytes back',
    calls[0].url === 'https://api.elevenlabs.io/v1/sound-generation' && calls[0].init.headers['xi-api-key'] === 'k' && JSON.parse(calls[0].init.body).text === 'a swing' && bytes.length === 3);
  let err = null;
  try { await post('x', {}, { fetchFn: async () => ({ ok: false, status: 401, text: async () => 'missing_permissions and more' }), key: 'k' }); } catch (e) { err = e; }
  ok('a refused call throws the status and the start of the body', err?.message.startsWith('HTTP 401: missing_permissions'));
  ok('the key is read from the environment, never baked in', typeof hasKey() === 'boolean' && !readFileSync('tools/elevenlabs.mjs', 'utf8').match(/xi-api-key': '[a-z0-9]/));
  // 0.00299: the format fallback and the 429 retry live in post (gen-score.mjs carried its own copy)
  const asked = [];
  const refuse192 = async (url) => { asked.push(url); return url.includes('mp3_44100_192') ? { ok: false, status: 400, text: async () => '{"detail":{"status":"output_format_not_allowed","message":"needs a higher subscription tier"}}' } : { ok: true, arrayBuffer: async () => new Uint8Array([9]).buffer }; };
  const got = await post('music', { x: 1 }, { fetchFn: refuse192, key: 'k', formats: ['mp3_44100_192', 'mp3_44100_128'] });
  ok('post: a refused output format falls back to the next one asked for (192 -> 128 kbps)', got.length === 1 && asked.length === 2 && asked[0].endsWith('/music?output_format=mp3_44100_192') && asked[1].endsWith('/music?output_format=mp3_44100_128'));
  const slept = [], logged = []; let busy = 2;
  const fetch429 = async () => (busy-- > 0 ? { ok: false, status: 429, text: async () => '{"detail":{"status":"too_many_concurrent_requests"}}' } : { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer });
  const ret = await post('sound-generation', {}, { fetchFn: fetch429, key: 'k', retries: 5, sleepFn: async (s) => { slept.push(s); }, log: (m) => logged.push(m) });
  ok('post: a 429 waits 10 s, then 20, and tries again; the wait is logged with the API\'s code', ret.length === 1 && slept.join() === RETRY_WAITS_S.slice(0, 2).join() && logged.length === 2 && logged[0].includes('too_many_concurrent_requests'));
  let e429 = null; busy = 1;
  try { await post('x', {}, { fetchFn: fetch429, key: 'k', sleepFn: async () => {}, log: () => {} }); } catch (e) { e429 = e; }
  ok('...and without retries (the default) a 429 throws like any refusal', e429?.message.startsWith('HTTP 429:'));
  const inPath = []; await post('tts/v?output_format=mp3_44100_128', {}, { fetchFn: async (url) => { inPath.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }; }, key: 'k' });
  ok('...a path with its own query string is sent as it is (gen-vo)', inPath[0] === 'https://api.elevenlabs.io/v1/tts/v?output_format=mp3_44100_128');
}

// 0.00280: a take into the game (gen-score.mjs --import). The seam finder
// (tools/music-seam.mjs) finds where a piece repeats; the search stops short
// of the piece's fade; the new bed plays at the old bed's level; audio.json
// keeps its layout; the imported beds crossfade by power.
{
  const { features, findSeam } = await import('../music-seam.mjs');
  const { autoRanges, gainFor, setTrack } = await import('../gen-score.mjs');
  const sr = 22050, chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [247, 311, 370], [165, 208, 247]];
  const x = new Float32Array(sr * 40);
  for (let i = 0; i < x.length; i++) { const c = chords[Math.floor(i / sr / 2) % 5]; x[i] = c.reduce((s, f) => s + Math.sin((2 * Math.PI * f * i) / sr), 0) * 0.1; } // (a 10 s progression, four times)
  const seam = findSeam(features(x, sr), { startRange: [0, 1], endRange: [7, 14], minLoop: 5, window: 3 });
  ok('the seam finder finds where a piece repeats (a 10 s chord cycle: END = START + 10 s)', Math.abs(seam.end - seam.start - 10) < 0.15 && seam.sim > 0.95, JSON.stringify(seam));
  const hopS = 0.05, db = Float32Array.from({ length: 2400 }, (_, i) => (i < 2200 ? -15 : -15 - (i - 2200) * 0.3)); // (120 s, fading from 110 s)
  const r = autoRanges({ db, hopS }, 3, 4);
  ok('the seam search: START in the first 40%, END from the middle to the fade less the compared window', r.startRange[1] === 48 && r.endRange[0] === 60 && r.endRange[1] > 104 && r.endRange[1] <= 108, JSON.stringify(r));
  ok('the new bed plays at the old bed\'s level (2 dB louder = 2 dB less gain)', gainFor(1.9, -16.3, -14.3) === -0.1);
  const text = readFileSync('assets/data/audio.json', 'utf8');
  const moved = setTrack(text, 'boss', { file: 'assets/audio/x.mp3', loopS: 70.5, tailS: 3, crossfade: 'power', gainDb: -1 });
  const J = JSON.parse(moved);
  ok('the import edits one music track in place: the rest of audio.json byte for byte', J.music.tracks.boss.file === 'assets/audio/x.mp3' && J.music.tracks.boss.crossfade === 'power'
    && moved.split('\n').length === text.split('\n').length + (text.includes('"boss": {\n        "file": "assets/audio/music-boss-v2.mp3",\n        "loopS": 60,\n        "tailS": 2,\n        "gainDb"') ? 1 : 0)
    && JSON.stringify({ ...J, music: { ...J.music, tracks: { ...J.music.tracks, boss: null } } }) === JSON.stringify({ ...JSON.parse(text), music: { ...JSON.parse(text).music, tracks: { ...JSON.parse(text).music.tracks, boss: null } } }));
  const reg = JSON.parse(readFileSync('assets/data/music-art.json', 'utf8'));
  const imported = Object.entries(reg.beds).flatMap(([id, e]) => e.candidates.filter((k) => k.imported).map((k) => [id, k]));
  ok('every imported take is the bed the game plays: approved, its seam and level recorded, an equal-power crossfade', imported.length >= 2 && imported.every(([id, k]) => {
    const t = DATA.audio.music.tracks[id];
    return k.verdict === 'ok' && t.file === k.imported.file && t.loopS === k.imported.loopS && t.crossfade === 'power' && k.imported.end > k.imported.start && statSync(t.file).isFile();
  }), imported.map(([id, k]) => `${id}_c${k.n}`).join());
}

// 0.00301: the SFX Lab (labs/sfx/) — every clip by where it plays, through the
// game's own modules, with Volume / Pitch / Speed edits and approvals that
// tools/render-sfx.mjs applies (a pitch or speed change re-rendered into a new
// file with ffmpeg, the trim keeping the level; approvals marked in the registry).
{
  const lab = readFileSync('labs/sfx/index.html', 'utf8'), js = readFileSync('labs/sfx/lab.js', 'utf8');
  ok('sfx lab: not indexed, resolves from the site root, booted under the build, links back to the menu, a card on it (0 opens the tenth)',
    lab.includes('<base href="../../">') && lab.includes('name="robots" content="noindex"') && lab.includes('<script src="labs/boot.js" data-lab="labs/sfx/lab.js"') && lab.includes('class="labs-link" href="labs/"')
    && readFileSync('labs/index.html', 'utf8').includes('href="sfx/" data-lab="sfx"') && readFileSync('labs/index.html', 'utf8').includes("e.key === '0' ? 10"));
  ok('sfx lab: the game\'s own sfx, mixer and music modules; the edited preview through sfxFrom; the review as sfx-review.json',
    js.includes("from '../../src/audio/sfx.js'") && js.includes("from '../../src/audio/music.js'") && js.includes('sfxFrom(clip, stretched[key], { ...opts, rate: pitch })') && js.includes("download: 'sfx-review.json'")
    && js.includes('initSfx();\ninitMusic();'));
  // every registered clip is listed in some section, and every listed clip is registered
  const listed = new Set([...js.matchAll(/^\s+\['([a-z_]+)',/gm)].map((m) => m[1]));
  const generated = (id) => /^(atk|heavy|hurt)_/.test(id) || /^(eatk|ehurt)_/.test(id) || /^whoosh_/.test(id); // (built from heroes.json, enemies.json and transition.clips)
  const missing = Object.keys(DATA.audio.clips).filter((id) => !listed.has(id) && !generated(id));
  const unknown = [...listed].filter((id) => !DATA.audio.clips[id]);
  ok('sfx lab: every registered clip has its row (the class, foe and whoosh rows from the data), no row names a clip the registry lacks', missing.length === 0 && unknown.length === 0, `missing ${missing} unknown ${unknown}`);
  const { pitchSpeedFilter, nextFile, setClip, newGain, applyReview } = await import('../render-sfx.mjs');
  ok('render-sfx: the ffmpeg filter — asetrate for the pitch, atempo chained inside 0.5-2 for the tempo, nothing at 0 st / 100%',
    pitchSpeedFilter(-12, 100) === 'asetrate=22050,aresample=44100,atempo=2' && pitchSpeedFilter(0, 150) === 'atempo=1.5' && pitchSpeedFilter(0, 100) === ''
    && pitchSpeedFilter(0, 25) === 'atempo=0.5,atempo=0.5' && /^asetrate=58866,aresample=44100,atempo=0\.5,atempo=0\.5993/.test(pitchSpeedFilter(5, 40)));
  ok('render-sfx: a new name beside the old (rule 7) — sfx/<stem>_v<k+1>, a root sfx-<x>.mp3 into sfx/ as <x>_v2',
    nextFile('assets/audio/sfx/deeper_v1.mp3', () => false) === 'assets/audio/sfx/deeper_v2.mp3' && nextFile('assets/audio/sfx-loot.mp3', () => false) === 'assets/audio/sfx/loot_v2.mp3'
    && nextFile('assets/audio/sfx/deeper_v1.mp3', (f) => f.endsWith('_v2.mp3')) === 'assets/audio/sfx/deeper_v3.mp3');
  ok('render-sfx: the trim keeps the level plus the offset on the new measure', newGain({ measuredDb: -6, gainDb: -6 }, 2, -8) === -2 && newGain({ measuredDb: -10.6, gainDb: -8.7 }, 0, -12.3) === -7);
  const text = readFileSync('assets/data/audio.json', 'utf8');
  const t2 = setClip(text, 'loot', { approved: true });
  const J2 = JSON.parse(t2), J0 = JSON.parse(text);
  ok('render-sfx: setClip rewrites one clip in place (a clip whose block holds an array too), the rest byte for byte',
    J2.clips.loot.approved === true && J2.clips.loot.rate[0] === J0.clips.loot.rate[0] && t2.split('\n').length === text.split('\n').length + (J0.clips.loot.approved ? 0 : 1)
    && JSON.stringify({ ...J2, clips: { ...J2.clips, loot: null } }) === JSON.stringify({ ...J0, clips: { ...J0.clips, loot: null } }));
  const logs = [], removed = [], rendered = [];
  const out = JSON.parse(applyReview(text, { approved: ['click'], edits: [
    { clip: 'deeper', gainDb: 1, pitch: -2, speed: 100, approved: true }, { clip: 'boom', gainDb: -1, pitch: 2 }, { clip: 'loot', gainDb: 1.5 }, { clip: 'nope' }] },
  { render: (src, dst, f) => rendered.push([src, dst, f]), measure: () => ({ db: -5, ms: 200 }), remove: (f) => removed.push(f), log: (l) => logs.push(l) }));
  ok('render-sfx: an approval marks the clip; a pitch edit renders a new file, measures it, keeps the level plus the offset, moves the peak and removes the old file',
    out.clips.click.approved === true && rendered.length === 1 && rendered[0][0] === 'assets/audio/sfx/deeper_v1.mp3' && rendered[0][1] === 'assets/audio/sfx/deeper_v2.mp3'
    && out.clips.deeper.file === 'assets/audio/sfx/deeper_v2.mp3' && out.clips.deeper.measuredDb === -5 && out.clips.deeper.peakMs === 200 && out.clips.deeper.approved === true
    && Math.abs(out.clips.deeper.gainDb - (J0.clips.deeper.measuredDb + J0.clips.deeper.gainDb + 1 + 5)) < 1e-9 && removed.join() === 'assets/audio/sfx/deeper_v1.mp3');
  ok('render-sfx: a synth clip takes the offset alone and its pitch is a note for the hand; a volume-only edit is the trim; an unknown clip is skipped',
    out.clips.boom.gainDb === J0.clips.boom.gainDb - 1 && logs.some((l) => /boom: a generated sound/.test(l)) && Math.abs(out.clips.loot.gainDb - (J0.clips.loot.gainDb + 1.5)) < 1e-9 && out.clips.loot.file === J0.clips.loot.file
    && logs.some((l) => /nope: not a clip/.test(l)));
  const dry = applyReview(text, { approved: ['click'], edits: [{ clip: 'deeper', pitch: 1 }] }, { render: () => { throw new Error('rendered on a dry run'); }, log: () => {}, dry: true });
  ok('render-sfx: --dry-run changes nothing and renders nothing', dry === text);
}

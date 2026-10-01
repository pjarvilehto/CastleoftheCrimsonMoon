// tools/test/audio.test.mjs — music, sound effects, the corner toggles.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, sleep, t, fresh, registry, El, DATA, show, handleKey, setBackground, transitionTo, createRun, generateRoom,
  scaleEnemy, createCombat, playerAttack, shrineOffers, canAffordOffer, acceptOffer, dungeonScene, hubScene, titleScene,
  resetProfile, getProfile, loadData, readFileSync, readdirSync, statSync } from './harness.mjs';

fresh();

// T30: 0.066 — background music engine (no Web Audio in the shim: safe no-ops)
{
  const music = await import('../../src/audio/music.js');
  ok('music module loads without AudioContext', typeof music.play === 'function' && typeof music.initMusic === 'function');
  ok('default: music on', music.isMuted() === false);
  ok('toggle mutes and persists', music.toggleMuted() === true && localStorage.getItem('castle-music-muted') === '1');
  ok('toggle restores', music.toggleMuted() === false && localStorage.getItem('castle-music-muted') === '0');
  music.play('boss'); music.play('nope'); music.initMusic();
  ok('play/init no-op safely without AudioContext', true);
}

// T33: 0.068 — five 60s music tracks wired to the right scenes; the Forge
// ignores tier-1 gear (no enhance button, forgeItem refuses).
{
  const musicSrc = readFileSync(new URL('../../src/audio/music.js', import.meta.url), 'utf8');
  const tracks = DATA.audio.music.tracks; // the beds live in audio.json (0.114; one score since 0.118)
  for (const t of ['title', 'combat', 'boss', 'shrine', 'end']) {
    const secs = statSync(tracks[t].file).size * 8 / 128000; // 128 kbps
    ok(`music bed ${t}: on disk, an exact loop + its tail`, Math.abs(secs - (tracks[t].loopS + tracks[t].tailS)) < 0.6 && tracks[t].loopS >= 60);
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
  ok('fullscreen toggle requests/exits fullscreen, label synced to fullscreenchange', mainSrc.includes("onOffToggle('FULLSCREEN'")
    && mainSrc.includes('requestFullscreen') && mainSrc.includes('exitFullscreen') && mainSrc.includes("'fullscreenchange', () => btn.sync()"));
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
  sfxMod.sfx('attack'); sfxMod.sfx('nope'); sfxMod.initSfx();
  ok('sfx play/init no-op safely without AudioContext', true);

  const C = DATA.audio.clips; // the sound registry (0.118)
  for (const c of ['click', 'attack', 'kill', 'hurt', 'swoosh', 'death', 'shrine', 'levelup', 'rare', 'loot', 'heal', 'forge', 'victory']) {
    ok(`sfx clip registered + on disk: ${c}`, C[c]?.file === `assets/audio/sfx-${c}.mp3` && statSync(C[c].file).size > 5 * 1024); // 0.5s click ~ 8.8KB
  }
  ok('generated sounds registered as synth', ['whoosh', 'ring', 'boom', 'tick', 'thud', 'slice', 'clank'].every((n) => C[n]?.synth === true && !C[n].file));
  ok('combat sounds jittered', ['attack', 'kill', 'hurt', 'loot'].every((n) => C[n].rate?.length === 2 && C[n].jitterDb > 0));

  const read = (f) => readFileSync(f, 'utf8'); // cwd = repo root (harness)
  ok('playback fires item.sfx on print (via the scene\'s onSfx, 0.107)', read('src/ui/combatPlayback.js').includes('if (item.text && item.sfx) onSfx(item);')
    && read('src/ui/combatPlayback.js').includes('onSfx = (item) => sfx(item.sfx)'));
  const d = read('src/ui/scenes/dungeonScene.js');
  const q = read('src/ui/combatQueue.js'); // event -> queue mapping (0.098)
  ok('dungeon maps combat events to sfx', q.includes("atk: 'attack'") && q.includes("dmg: 'hurt'") && q.includes("kill: 'kill'"));
  ok('dungeon: rare vs common loot sounds', q.includes("cls === 'relic' ? 'rare' : 'loot'"));
  ok('dungeon: room whoosh/death/potion wired', d.includes("sfx('whoosh'); transitionTo(setup)") && d.includes("sfx('death')") && d.includes("combatSfx({ sfx: 'heal'"));
  ok('shrine blessing chime wired', read('src/ui/shrineUI.js').includes("sfx('shrine')"));
  const h = read('src/ui/scenes/hubScene.js');
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
  ok('music crossfade is equal-gain (same audio in phase: sums to 1, no +3 dB bump)', fin.every((v, i) => Math.abs(v + fout[i] - 1) < 1e-6) && fin[0] === 0 && Math.abs(fin[31] - 1) < 1e-6);
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
  ok('mixer: no graph without Web Audio; default volumes from data', mx.mixer() === null && mx.getVolumes().master === A.volumes.master);
  mx.setVolume('music', 0.5);
  ok('volume sliders persist and set the bus (squared curve)', JSON.parse(localStorage.getItem('castle-audio-volumes')).music === 0.5
    && Math.abs(mx.busGain('music') - A.musicLevel * 0.25) < 1e-9);
  mx.setVolume('music', 7);
  ok('volumes clamp to 0..1', mx.getVolumes().music === 1);
  mx.setBusMuted('sfx', true);
  ok('the SOUND toggle silences the effects bus, keeping the slider', mx.busGain('sfx') === 0 && mx.getVolumes().sfx === 1);
  mx.setBusMuted('sfx', false);
  const mxSrc = read('src/audio/mixer.js');
  ok('graph: music -> duck -> master, effects -> master, master -> limiter -> speakers', mxSrc.includes('music.connect(duck)') && mxSrc.includes('duck.connect(master)')
    && mxSrc.includes('sfx.connect(master)') && mxSrc.includes('master.connect(limiter)') && mxSrc.includes('limiter.connect(ctx.destination)')
    && mxSrc.includes('createDynamicsCompressor()') && A.limiter.threshold < 0);
  ok('audio pauses in a hidden tab', mxSrc.includes("visibilityState === 'hidden') ctx.suspend"));
  ok('stingers duck the music', ['death', 'victory', 'rare'].every((c) => A.duck.clips[c] > 0) && A.duck.db < 0 && read('src/audio/sfx.js').includes('duckMusic(duck, t)'));
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
  combatSfx({ sfx: 'kill', fx: { kind: 'smash', dmg: 300 } }, ctx, rec);
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

// T70: 0.108 — a dedicated whoosh between rooms (generated: sweeps up and
// down while travelling left -> right), audible in the mix; the escape
// fanfare 30% quieter.
{
  const A = DATA.audio;
  const syn = readFileSync('src/audio/synth.js', 'utf8');
  ok('room whoosh: generated, sweeps, travels left -> right', DATA.audio.clips.whoosh.synth === true && syn.includes("p.pan.setValueAtTime(-0.6, t)")
    && syn.includes('p.pan.linearRampToValueAtTime(0.6, t + dur)') && syn.includes("bp.frequency.exponentialRampToValueAtTime(2600"));
  ok('room whoosh sits with the hits in the mix', Math.abs(A.clips.whoosh.measuredDb + A.clips.whoosh.gainDb + 12) <= 1);
  ok('escape fanfare 30% quieter (-3.1 dB)', Math.abs(A.clips.victory.gainDb - (1.4 + 20 * Math.log10(0.7))) < 0.05);
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
  ok('strike layers are generated: tick, thud, slice (yours), clank, thud (on the knight)', ['tick', 'thud', 'slice', 'clank'].every((n) => syn.includes(`function ${n}(`) && A.clips[n]?.synth)
    && A.variation.attack.layers.map((l) => l.name).join() === 'tick,thud,slice' && A.variation.hurt.layers.map((l) => l.name).join() === 'clank,thud');
  ok('sfx: a random peaking EQ and the layers on every strike', sfxSrc.includes("eq.type = 'peaking'") && sfxSrc.includes('planVariation(A.variation?.[name])')
    && sfxSrc.includes('for (const l of vary?.layers ?? []) start(l.name, null, t,'));
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
  const bar = cornerBar([false, t1, p, after]);
  ok('the column keeps its order, skipping absent items', bar.className === 'corner-bar' && bar.children.map((c) => c.textContent).join('|') === 'MUSIC: ON|VOLUME|CHANGELIST');
  p.listeners.click[0]();
  ok('a panel opens right under its button', bar.children.map((c) => c.className).join('|') === 'debug-toggle music-toggle|debug-toggle volume-toggle|volume-panel|' && p.classList.contains('on'));
  p.listeners.click[0]();
  ok('...and closes', bar.children.length === 3 && !p.classList.contains('on'));
  const m = readFileSync('src/main.js', 'utf8'), css = readFileSync('styles.css', 'utf8');
  ok('main builds the column: (INVULNERABLE) MUSIC FULLSCREEN SOUND VOLUME CHANGELIST (debug tools)', /debugMode && invulnerableToggle\(\),\s*onOffToggle\('MUSIC'[\s\S]*fullscreenToggle\(\),\s*onOffToggle\('SOUND'[\s\S]*volumeToggle\(\),\s*changelogToggle\(\),\s*\.\.\.\(debugMode \? debugToggles\(\)/.test(m)
    && css.includes('.corner-bar {') && !/toggle \{ top: \d+px; \}/.test(css));
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
  sfxMod.initSfx(); music.initMusic();
  fa.gesture();
  const ctx = fa.ctx();
  await sleep(10);
  ok('first gesture: one shared context, mixer built', !!ctx && ctx.nodes.some((n) => n.kind === 'compressor') && mx.mixer() !== null);

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

  // the 0.116 case: crit / mega crit / overkill sweeteners + strike layers
  const { combatSfx } = await import('../../src/ui/combatSfx.js');
  const n0 = ctx.started.length;
  for (const fx of [{ kind: 'attack', from: 'player', to: 0, crit: true }, { kind: 'attack', from: 'player', to: 0, crit: true, mega: true }, { kind: 'smash', dmg: 300 }]) {
    combatSfx({ sfx: fx.kind === 'smash' ? 'kill' : 'attack', fx }, {});
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

  // a repeat inside the retrigger window is dropped
  const n1 = ctx.started.length;
  sfxMod.sfx('loot'); sfxMod.sfx('loot');
  await sleep(10);
  ok('a repeat inside the retrigger window is dropped', ctx.started.length === n1 + 1);

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
  ok('...crossfading over its tail, equal gain', curves.some((e) => e[1][0] === 0 && e[1].at(-1) === 1) && curves.some((e) => e[1][0] === 1 && e[1].at(-1) === 0));
  const n2 = ctx.started.length;
  music.play('combat');
  await sleep(10);
  ok('...asking for the playing bed again changes nothing', ctx.started.length === n2);
  music.play('boss');
  await sleep(10);
  ok('a scene change starts the next bed', ctx.started.some((s) => s.started[2] === A.music.tracks.boss.loopS + A.music.tracks.boss.tailS));

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

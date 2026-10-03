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
  sfxMod.sfx('attack'); sfxMod.sfx('nope'); sfxMod.initSfx();
  ok('sfx play/init no-op safely without AudioContext', true);

  const C = DATA.audio.clips; // the sound registry (0.118)
  for (const c of ['click', 'attack', 'kill', 'hurt', 'swoosh', 'death', 'shrine', 'levelup', 'rare', 'loot', 'heal', 'forge', 'victory']) {
    ok(`sfx clip registered + on disk: ${c}`, C[c]?.file === `assets/audio/sfx-${c}.mp3` && statSync(C[c].file).size > 5 * 1024); // 0.5s click ~ 8.8KB
  }
  ok('generated sounds registered as synth', ['ring', 'boom', 'tick', 'thud', 'slice', 'clank'].every((n) => C[n]?.synth === true && !C[n].file));
  ok('combat sounds jittered', ['attack', 'kill', 'hurt', 'loot'].every((n) => C[n].rate?.length === 2 && C[n].jitterDb > 0));

  const read = (f) => readFileSync(f, 'utf8'); // cwd = repo root (harness)
  ok('playback fires item.sfx on print (via the scene\'s onSfx, 0.107)', read('src/ui/combatPlayback.js').includes('if (item.text && item.sfx) onSfx(item);')
    && read('src/ui/combatPlayback.js').includes('onSfx = (item) => sfx(item.sfx)'));
  const d = read('src/ui/scenes/dungeonScene.js');
  const q = read('src/ui/combatQueue.js'); // event -> queue mapping (0.098)
  ok('dungeon maps combat events to sfx', q.includes("atk: 'attack'") && q.includes("dmg: 'hurt'") && q.includes("kill: 'kill'"));
  ok('dungeon: rare vs common loot sounds', q.includes("cls === 'relic' ? 'rare' : 'loot'"));
  ok('dungeon: death/potion wired; the room swoosh moved to every transition (main.js, 0.173)', !d.includes("sfx('whoosh')") && d.includes("sfx('death')") && d.includes("combatSfx({ sfx: 'heal'") && readFileSync('src/main.js', 'utf8').includes('onTransition(() => { transitionSfx(); bgPush(); })'));
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

// T70: 0.173 — the room change's swoosh: the developer's SFX pitched down half
// an octave, then a quarter more and 30% quieter (0.175, a new file), played so its loudest moment lands in the middle
// of the transition (1 s out + 2 s crossfade + 1 s in = 2 s), with a little
// random pitch, tone and level each time; the generated whoosh is gone.
{
  const A = DATA.audio, T = A.transition, c = A.clips[T.clip];
  ok('room swoosh: a measured file clip with its loudest moment, no generated whoosh', T.clip === 'room_swoosh' && /sfx-room-swoosh-v2\.mp3$/.test(c.file)
    && statSync(c.file).size > 20 * 1024 && Number.isFinite(c.measuredDb) && Number.isFinite(c.peakMs) && c.peakMs > 0 && !A.clips.whoosh && !readFileSync('src/audio/synth.js', 'utf8').includes('whoosh'));
  ok('room swoosh: its peak lands mid-transition (2 s), a little varied each play', T.peakAtMs === 2000 && T.peakAtMs - c.peakMs > 0
    && A.variation.room_swoosh.rate[0] < 1 && A.variation.room_swoosh.rate[1] > 1 && A.variation.room_swoosh.eq.lo < A.variation.room_swoosh.eq.hi && c.jitterDb > 0);
  ok('room swoosh sits well under the hits in the mix (0.175 and 0.177: 30% quieter twice)', c.measuredDb + c.gainDb <= -18 && c.measuredDb + c.gainDb > -22);
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
  ok('sfx: the layers on every strike go through start()', sfxSrc.includes('for (const l of vary?.layers ?? []) start(l.name, null, t,')); // (the EQ, the pitch and a layer are heard in T83)
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
  ok('main builds the menu: AUDIO (MUSIC SOUND NARRATOR VOLUME) DISPLAY (BATTERY SAVER) GAME (CHANGELIST) DEBUG MODE (the tools)',
    /menuHead\('Audio'\),\s*onOffToggle\('MUSIC'[\s\S]*onOffToggle\('SOUND'[\s\S]*onOffToggle\('NARRATOR'[\s\S]*volumeToggle\(\),\s*menuHead\('Display'\),\s*onOffToggle\('BATTERY SAVER'[\s\S]*menuHead\('Game'\),\s*changelogToggle\(\),\s*dbg\.toggle,\s*\.\.\.dbg\.items,/.test(m)
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
  music.toggleMuted(); // ON: the title bed starts and the score warms
  await sleep(10);
  ok('...ON warms the whole score and starts the title bed', bedsFetched() === bedFiles.length && ctx.started.some((s) => s.buffer?.tag === sizes[A.music.tracks.title.file]));

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
  // the room swoosh (0.173): scheduled so its loudest moment lands peakAtMs into the transition (0.00223: the start time, not the source)
  ctx.currentTime += 5;
  const nT = ctx.started.length, TR = A.transition, cTR = A.clips[TR.clip];
  sfxMod.transitionSfx();
  await sleep(10);
  const sw = ctx.started.slice(nT).find((s) => s.kind === 'buffer');
  ok('the room swoosh starts peakAtMs - peakMs after the transition begins', !!sw && Math.abs(sw.started[0] - (ctx.currentTime + (TR.peakAtMs - cTR.peakMs) / 1000)) < 1e-9, sw && `${sw.started[0]} vs ${ctx.currentTime + (TR.peakAtMs - cTR.peakMs) / 1000}`);
  // variation (0.110) heard: a peaking EQ, a pitch off 1 and a synthesized layer on the strikes
  const nN = ctx.nodes.length, nS = ctx.started.length;
  await withSeedAsync(5, async () => { for (let i = 0; i < 10; i++) { ctx.currentTime += 1; sfxMod.sfx('attack'); await sleep(5); } });
  ok('every strike varies: a random peaking EQ, a pitch off 1, a generated layer', ctx.nodes.slice(nN).some((n) => n.kind === 'biquad' && n.type === 'peaking')
    && ctx.started.slice(nS).some((s) => s.kind === 'buffer' && s.playbackRate.value !== 1) && ctx.started.slice(nS).some((s) => s.kind === 'osc'));

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

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
  for (const t of ['title', 'combat', 'boss', 'shrine', 'end']) {
    ok(`music track file referenced: ${t}`, musicSrc.includes(`assets/audio/music-${t}.mp3`));
    const size = statSync(new URL(`../../assets/audio/music-${t}.mp3`, import.meta.url)).size;
    ok(`music-${t}.mp3 is a ~60s track`, size > 800 * 1024); // 61s @ 128kbps ~ 977KB
  }
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

// T34: 0.069 — fullscreen toggle wired under the music toggle, label synced
// to fullscreenchange so Esc exits don't leave a stale ON label.
{
  const mainSrc = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  ok('fullscreen button created', mainSrc.includes('fs-toggle') && mainSrc.includes('FULLSCREEN: OFF'));
  ok('toggle requests/exits fullscreen', mainSrc.includes('requestFullscreen') && mainSrc.includes('exitFullscreen'));
  ok('label synced to fullscreenchange', mainSrc.includes('fullscreenchange') && mainSrc.includes('document.fullscreenElement'));
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  ok('fs-toggle positioned under music toggle', css.includes('.fs-toggle { top: 72px; }') && css.includes('.music-toggle { top: 40px; }'));
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

  const clips = ['click', 'attack', 'kill', 'hurt', 'swoosh', 'death', 'shrine', 'levelup', 'rare', 'loot', 'heal', 'forge', 'victory'];
  const sfxSrc = readFileSync(new URL('../../src/audio/sfx.js', import.meta.url), 'utf8');
  for (const c of clips) {
    ok(`sfx clip referenced + on disk: ${c}`,
      sfxSrc.includes(`assets/audio/sfx-${c}.mp3`)
      && statSync(new URL(`../../assets/audio/sfx-${c}.mp3`, import.meta.url)).size > 5 * 1024); // 0.5s click ~ 8.8KB
  }
  ok('combat sounds jittered', sfxSrc.includes('playbackRate') && sfxSrc.includes("'attack'"));

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
  ok('run end: escape fanfare', read('src/ui/scenes/runEndScene.js').includes("sfx('victory')"));
  const m = read('src/main.js');
  ok('main: SOUND toggle + global clicks', m.includes('sfx-toggle') && m.includes("closest?.('button')") && m.includes('initSfx()'));
  // 0.079: one slot higher without ?debug (no INVULNERABLE toggle above it)
  ok('sfx toggle positioned under fullscreen', read('styles.css').includes('.sfx-toggle { top: 72px; }')
    && read('styles.css').includes('body.debug .sfx-toggle { top: 104px; }'));
}

// T69: 0.107 — the audio pass: loop points skip the beds' fades, equal-power
// crossfades, stereo from the screen, voice management, the mixer (buses,
// limiter, sliders, ducking, background pause), loudness trims, combat
// sounds placed + timed + tiered, and the VOLUME panel.
{
  const read = (f) => readFileSync(f, 'utf8');
  const am = await import('../../src/audio/audioMath.js');
  // a bed like the generated ones: two 10s pieces, each fading out to
  // silence and back in, plus the file's own fade-in / fade-out; and a
  // rhythmic bed whose beats decay ~12 dB every half second (no gaps)
  const sr = 1000, sig = new Float32Array(sr * 26), beat = new Float32Array(sr * 20);
  for (let i = 0; i < sig.length; i++) {
    const t = i / sr;
    const env = t < 1 ? t : t < 11 ? 1 : t < 14 ? Math.max(0, 1 - (t - 11) / 3) ** 3 : t < 15 ? (t - 14) : t < 23 ? 1 : Math.max(0, 1 - (t - 23) / 3) ** 3;
    sig[i] = Math.sin(i * 0.7) * 0.5 * env;
  }
  for (let i = 0; i < beat.length; i++) beat[i] = Math.sin(i * 0.9) * 0.5 * 10 ** (-((i % 500) / 500) * 12 / 20);
  const secs = am.findSections(sig, sr);
  ok('music sections: each piece without its fades (no dip into silence)', secs.length === 2 && secs[0].start <= 1 && secs[0].end >= 10.5 && secs[0].end <= 12
    && secs[1].start >= 14 && secs[1].start <= 15.5 && secs[1].end >= 22.5 && secs[1].end <= 24, JSON.stringify(secs));
  const bs = am.findSections(beat, sr);
  ok('music sections: rhythmic decays are not gaps', bs.length === 1 && bs[0].start === 0 && bs[0].end === 20, JSON.stringify(bs));
  const fin = am.fadeCurve(32), fout = am.fadeCurve(32, true);
  ok('crossfade is equal-power (no dip in the middle)', fin.every((v, i) => Math.abs(v * v + fout[i] * fout[i] - 1) < 1e-6) && fin[0] === 0 && Math.abs(fin[31] - 1) < 1e-6);
  ok('stereo: left card left, right card right, capped by width', am.panForX(0, 1000) === -0.6 && am.panForX(500, 1000) === 0
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
  const clips = ['click', 'attack', 'kill', 'hurt', 'swoosh', 'death', 'shrine', 'levelup', 'rare', 'loot', 'heal', 'forge', 'victory'];
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
  const musicSrc = read('src/audio/music.js');
  ok('music: seamless sections through the music bus', !musicSrc.includes('src.loop = true') && musicSrc.includes('findSections(') && musicSrc.includes('createLoop(')
    && musicSrc.includes('gain.connect(musicInput())'));

  // the loop chain against a fake audio context
  const { createLoop } = await import('../../src/audio/musicLoop.js');
  const starts = [], curves = [];
  const param = () => ({ setValueAtTime() {}, setValueCurveAtTime(c, t, d) { curves.push([c[0], t, d]); } });
  const fake = {
    createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
    createBufferSource: () => ({ connect() {}, start(at, off, dur) { starts.push([at, off, dur]); }, stop() {} }),
  };
  const loop = createLoop(fake, {}, {}, [{ start: 1, end: 11 }, { start: 15, end: 23 }], 5, { crossfade: 2, ahead: 2 });
  ok('music chain: sections in turn, each starting a crossfade before the last ends', starts.length === 3 && loop.sections.length === 2
    && starts[0].join() === '5,1,10' && starts[1].join() === '13,15,8' && starts[2].join() === '19,1,10');
  ok('music chain: overlapping sections fade in / out over the crossfade', curves.some(([v0, t, d]) => v0 === 0 && t === 13 && d === 2) && curves.some(([v0, t, d]) => v0 === 1 && t === 13 && d === 2));

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
    && read('src/main.js').includes('snd, volumeToggle(),') && read('styles.css').includes('.volume-toggle { top: 104px; }') && read('styles.css').includes('body.debug .volume-toggle { top: 136px; }'));
}

// T70: 0.108 — a dedicated whoosh between rooms (generated: sweeps up and
// down while travelling left -> right), audible in the mix; the escape
// fanfare 30% quieter.
{
  const A = DATA.audio;
  const syn = readFileSync('src/audio/synth.js', 'utf8');
  ok('room whoosh: generated, sweeps, travels left -> right', syn.includes('whoosh: true') && syn.includes("p.pan.setValueAtTime(-0.6, t)")
    && syn.includes('p.pan.linearRampToValueAtTime(0.6, t + dur)') && syn.includes("bp.frequency.exponentialRampToValueAtTime(2600"));
  ok('room whoosh sits with the hits in the mix', Math.abs(A.clips.whoosh.measuredDb + A.clips.whoosh.gainDb + 12) <= 1);
  ok('escape fanfare 30% quieter (-3.1 dB)', Math.abs(A.clips.victory.gainDb - (1.4 + 20 * Math.log10(0.7))) < 0.05);
}

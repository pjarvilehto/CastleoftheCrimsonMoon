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
  ok('playback fires item.sfx on print', read('src/ui/combatPlayback.js').includes('if (item.sfx) sfx(item.sfx)'));
  const d = read('src/ui/scenes/dungeonScene.js');
  const q = read('src/ui/combatQueue.js'); // event -> queue mapping (0.098)
  ok('dungeon maps combat events to sfx', q.includes("atk: 'attack'") && q.includes("dmg: 'hurt'") && q.includes("kill: 'kill'"));
  ok('dungeon: rare vs common loot sounds', q.includes("cls === 'relic' ? 'rare' : 'loot'"));
  ok('dungeon: swoosh/death/potion wired', d.includes("sfx('swoosh')") && d.includes("sfx('death')") && d.includes("sfx('heal')"));
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

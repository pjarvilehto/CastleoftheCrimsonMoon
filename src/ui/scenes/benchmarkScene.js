// ui/scenes/benchmarkScene.js — the ?debug BENCHMARK (0.131): a scripted,
// repeatable combat scene that measures how smoothly this machine runs the
// game, so desktops and laptops can be compared with real numbers. It uses
// the real pieces — combat engine, battle line, log playback, effects,
// particles, sounds, 3D background — but with fixed enemies (one of each
// particle material), fixed knight stats and a seeded Math.random, so
// every machine plays exactly the same fight. Three phases, each measured
// on its own (core/perfMonitor.js):
//   idle      the room at rest: background, fog, idle animations
//   combat    attacks and heavies back to back, rooms refilled as they clear
//   overkill  a heavier exterior scene, a room-wiping OVERKILL every turn
// Nothing touches the run history: the result is saved to profile.bench
// (meta/profile.js recordBenchmark) and goes out with the play stats.

import { setBackground, go } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { createRun } from '../../run/runState.js';
import { createCombat, playerAttack, canHeavy, useHeavy, heavyTarget } from '../../run/combat.js';
import { scaleEnemy } from '../../shared/balance.js';
import { DEBUG } from '../../shared/debug.js';
import { DATA } from '../../shared/data.js';
import { createPlayback } from '../combatPlayback.js';
import { queueEvents } from '../combatQueue.js';
import { createPlayerUnit, createEnemyUnit } from '../battleLine.js';
import { playFx } from '../combatFx.js';
import { combatSfx } from '../combatSfx.js';
import { newRecording, addFrame, summarizeFrames } from '../../core/perfMonitor.js';
import { holdQuality, isBg3dActive, bgQualityLevel } from '../../core/bg3d.js';
import { recordBenchmark } from '../../meta/profile.js';
import { showBenchmarkResult, PHASES } from '../benchmark.js';
import { closeAllDialogs } from '../dialog.js';

export { PHASES }; // the script lives in ui/benchmark.js (the prompt quotes its length)

const ROOM = 3;          // enemy scaling depth: a few hits each
const BEAT_MS = 150;     // the bot's pause after a turn finishes printing
// Only a hidden tab (or a sleeping laptop, > SLEEP_MS) is not a frame. A
// run's recorder treats gaps over 1 s as pauses, but here nobody pauses:
// a long freeze is a hitch, and dropping them hid a whole phase (0.135).
const SLEEP_MS = 5000;

// Seeded Math.random (Park-Miller): the same fight on every machine.
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// returnTo: the scene to go back to ('title' from the ?debug button; the
// Great Hall's prompt passes 'hub', 0.133).
export function benchmarkScene({ returnTo = 'title' } = {}) {
  const realRandom = Math.random, wasInvulnerable = DEBUG.invulnerable;
  let run = null, combat = null, ui = null, root = null, logEl = null;
  let phase = -1, rec = null, endsAt = 0, last = 0, done = false, turn = 0, botTimer = null;
  const results = {};

  const playback = createPlayback({
    logEl: () => logEl,
    onTick: () => update(),
    onEmpty: () => { botTimer = setTimeout(bot, BEAT_MS); },
    onFx: (fx) => fx && playFx(fx, fxCtx),
    onSfx: (item) => combatSfx(item, fxCtx),
  });
  const fxCtx = {
    unit: (who) => (!ui ? null : who === 'player' ? ui.player : ui.enemies[who] ?? null),
    get layer() { return ui?.layer ?? null; },
  };

  return {
    inRun: true, // no update prompt mid-measurement
    enter(r) {
      root = r;
      closeAllDialogs(); // 0.134: nothing left over from the last scene may stay up (or act) over the fight
      Math.random = seeded(20261001);
      DEBUG.invulnerable = true;
      holdQuality(true); // measure at this machine's current quality; never step it down here
      run = createRun();
      Object.assign(run.stats, { dmg: 12, crit: 0.3, armor: 30, maxHp: 400 });
      run.hp = run.maxHp = 400;
      logEl = el('div', { id: 'combat-log', class: 'docked' });
      requestAnimationFrame(frame);
      nextPhase();
    },
  };

  function nextPhase() {
    if (rec) results[PHASES[phase].id] = summarizeFrames(rec);
    phase += 1;
    if (phase >= PHASES.length) return finish();
    const ph = PHASES[phase];
    setBackground(ph.bg);
    newRoom();
    rec = newRecording(); last = 0;
    endsAt = performance.now() + ph.secs * 1000;
    clearTimeout(botTimer);
    if (ph.act) botTimer = setTimeout(bot, 600); // let the room's entrance play
    else setTimeout(() => { if (PHASES[phase] === ph) nextPhase(); }, ph.secs * 1000);
  }

  function frame(now) {
    if (done) return;
    const d = now - last;
    if (last && rec && d > 0 && d < SLEEP_MS && !document.hidden) addFrame(rec, d);
    last = now;
    // the countdown: only when it changes (0.135 — rewriting it every frame
    // forced a page layout per frame, which the numbers then measured)
    const label = `Benchmark — ${PHASES[phase]?.label ?? ''} · ${Math.max(0, Math.ceil((endsAt - now) / 1000))}s`;
    if (ui?.title && ui.title.textContent !== label) ui.title.textContent = label;
    requestAnimationFrame(frame);
  }

  // The bot: one action per turn, as fast as the log allows.
  function bot() {
    if (done) return;
    const ph = PHASES[phase];
    if (performance.now() >= endsAt) return nextPhase();
    if (combat.over) { newRoom(); botTimer = setTimeout(bot, 600); return; }
    turn += 1;
    if (ph.act === 'smash') { // every turn a room-wiping heavy
      run.stats.dmg = 100000; combat.heavyCd = 0;
      useHeavy(combat); act(() => playerAttack(combat, heavyTarget(combat), true));
    } else if (canHeavy(combat) && turn % 3 === 0) {
      useHeavy(combat); act(() => playerAttack(combat, heavyTarget(combat), true));
    } else {
      act(() => playerAttack(combat, combat.enemies.findIndex((e) => e.hp > 0), false));
    }
  }

  function act(fn) {
    const pre = { enemies: combat.enemies.map((e) => e.hp), hp: run.hp, meters: combat.enemies.map(() => null) };
    queueEvents(fn(), { run, combat, playback });
    playback.begin(pre);
  }

  function newRoom() {
    const ph = PHASES[phase];
    run.stats.dmg = 12;
    run.hp = run.maxHp;
    const room = { number: ROOM, kind: 'combat', isBoss: false, background: ph.bg, name: 'Benchmark', enemies: ph.enemies.map((id) => scaleEnemy(id, ROOM)) };
    combat = createCombat(run, room);
    playback.reset();
    const none = () => {}; // the player's buttons do nothing here: the bot plays
    const player = createPlayerUnit(run, { onHeavy: none, onPotion: none });
    const enemies = combat.enemies.map((e, i) => createEnemyUnit(e, i, { onAttack: none, onGone: none }));
    const title = el('h1', { class: 'room-title' }, 'Benchmark');
    const layer = el('div', { class: 'fx-layer' });
    root.innerHTML = '';
    root.append(title,
      el('div', { class: 'battle-line', style: `--n:${enemies.length}` }, player.el, el('div', { class: 'enemy-row' }, ...enemies.map((u) => u.el))),
      layer, logEl);
    ui = { player, enemies, layer, title };
    playFx({ kind: 'enter' }, fxCtx);
    update();
  }

  function update() {
    if (!ui) return;
    const printing = playback.isPrinting();
    ui.player.update({ hp: playback.playerHpOf(run.hp), printing, heavyReady: false, heavyCd: 0, dead: false });
    ui.enemies.forEach((u, i) => {
      const e = combat.enemies[i];
      u.update({ hp: playback.hpOf(i, e.hp), dead: playback.deadOf(i, e.hp), printing, combatOver: combat.over, meter: null });
    });
  }

  function finish() {
    done = true;
    clearTimeout(botTimer);
    playback.reset();
    Math.random = realRandom;
    DEBUG.invulnerable = wasInvulnerable;
    holdQuality(false);
    const result = {
      at: Date.now(), build: DATA.build?.version ?? '?',
      bg: isBg3dActive() ? '3d' : 'flat', q: isBg3dActive() ? bgQualityLevel() : -1,
      dpr: Math.round((globalThis.devicePixelRatio || 1) * 100) / 100,
      vw: Math.round(globalThis.innerWidth || 0), vh: Math.round(globalThis.innerHeight || 0),
      phases: results,
    };
    recordBenchmark(result);
    showBenchmarkResult(result, () => go(returnTo), returnTo === 'hub');
  }
}

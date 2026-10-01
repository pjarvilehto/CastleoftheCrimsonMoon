// ui/scenes/dungeonScene.js — one room at a time: enter, fight, loot, choose.
// Combat rooms use the chromeless card layout (battleLine.js); shrine
// rooms keep the panel layout (shrineUI.js). Combat events become queue
// items in combatQueue.js; combatPlayback.js prints them.
//
// Log line colors (see #combat-log CSS):
//   atk  — red    (player attacks, enemy attacks, deaths)
//   heal — green  (potions, lifesteal)
//   move — yellow (entering / moving between rooms, room-cleared rewards)
//   loot — gold   (per-kill drops, shrine blessings)
//   multi— gold bold (multi-kill)
//   sys  — gray   (deaths, misc)
//   summon — violet (the boss calls a skeleton, 0.092)

import { setBackground, transitionTo, go } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { createRun, enterNextRoom, drinkPotion, settleRun } from '../../run/runState.js';
import { shareStats } from '../../meta/telemetry.js';
import { getProfile, markVictorySeen } from '../../meta/profile.js';
import { createCombat, playerAttack, canHeavy, useHeavy, heavyTarget } from '../../run/combat.js';
import { logLine, itemName } from '../hud.js';
import { deathFlash, tickUp } from '../fx.js';
import { createPlayback } from '../combatPlayback.js';
import { combatSfx } from '../combatSfx.js';
import { renderShrineRoom } from '../shrineUI.js';
import { queueEvents } from '../combatQueue.js';
import { createBuffBar, updateBuffs } from '../buffs.js';
import { mountBattle } from '../battleRoom.js';
import { playFx } from '../combatFx.js';
import { DATA } from '../../shared/data.js';
import { play } from '../../audio/music.js';
import { sfx } from '../../audio/sfx.js';
import { showDeathModal } from '../deathModal.js';
import { showVictoryModal } from '../victoryModal.js';
import { startPerf, stopPerf } from '../../core/perfMonitor.js';

export function dungeonScene() {
  const run = createRun();
  let combat = null;
  let logEl = null;      // ONE persistent log for the whole dungeon visit
  let roomStart = null;  // loot snapshot at room entry, for the victory summary
  let currentRoot = null;
  let shownCoins = 0;    // animated HUD counter values (tick up to reality)
  let shownXp = 0;
  let buffBar = null;    // bottom-left shrine blessing bar
  let deathShown = false; // death modal fired for the fatal blow
  let ui = null;         // the persistent battle line of the current combat room (0.086)

  const playback = createPlayback({
    logEl: () => logEl,
    onTick: () => { if (ui) updateCombat(); },
    onEmpty: () => {
      tickUpChips();
      if (combat.over && !combat.victory) openDeathModal();
      if (combat.over && combat.victory) maybeShowVictory();
    },
    onFx: (fx) => fx && playFx(fx, fxCtx),
    onSfx: (item) => combatSfx(item, fxCtx), // stereo + timed to the blow (0.107)
  });
  // What effects can touch: the live units of the battle line.
  const fxCtx = {
    unit: (who) => (!ui ? null : who === 'player' ? ui.player : ui.enemies[who] ?? null),
    get layer() { return ui?.layer ?? null; },
  };

  return {
    inRun: true, // a reload now would lose the run (update prompt waits, 0.094)
    enter(root) {
      startPerf(); // the run's frame rate, for the play stats (0.130)
      logEl = el('div', { id: 'combat-log' });
      buffBar = createBuffBar();
      // First room enters inline — show()'s own transition is already
      // fading the windows, a nested transitionTo would deadlock on guard.
      nextRoom(root, true);
    },
  };

  function nextRoom(root, instant = false) {
    const setup = () => {
      const firstRoom = run.roomNumber === 0;
      const room = enterNextRoom(run);
      play(room.kind === 'boss' ? 'boss' : room.kind === 'shrine' ? 'shrine' : 'combat');
      combat = createCombat(run, room);
      deathShown = false;
      ui = null; // the new room builds its own battle line
      playback.reset();
      setBackground(room.background);
      roomStart = { coins: run.coins, xp: run.xp, items: run.itemsFound.length };
      shownCoins = run.coins; // reset counters per room (no tick-up anim)
      shownXp = run.xp;
      logLine(logEl, firstRoom
        ? `You enter the castle: ${room.name} (room ${room.number}).`
        : `You move to the next room... ${room.name} (room ${room.number}).`, 'move');
      render(root);
    };
    if (instant) setup();
    else { sfx('whoosh'); transitionTo(setup); } // windows out, bg crossfade, windows in (0.108: a room whoosh)
  }

  function render(root) {
    currentRoot = root;
    const room = run.room;
    if (room.kind === 'shrine') renderShrine(root, room);
    else renderCombat(root, room);
  }

  // ---- combat: chromeless card battle line ----
  // Built ONCE per room (0.086) and patched in place on every playback
  // tick — a full rebuild every 100ms restarted any CSS animation.
  function renderCombat(root, room) {
    if (!ui || ui.room !== room || ui.root !== root) buildCombat(root, room);
    updateCombat();
  }

  function buildCombat(root, room) {
    const battle = mountBattle(run, combat, {
      // Heavy goes to the front: a summon standing before the boss (0.092).
      onHeavy: () => { if (canAct()) { useHeavy(combat); act(() => playerAttack(combat, heavyTarget(combat), true)); } },
      onPotion: () => {
        // 0.080: potions persist, so topping up between rooms is allowed
        // (after a win) — never while dead or mid-playback.
        if ((combat.over && !combat.victory) || playback.isPrinting()) return;
        const sip = drinkPotion(run);
        if (sip) {
          combatSfx({ sfx: 'heal', fx: { kind: 'heal', to: 'player' } }, fxCtx);
          logLine(logEl, `You drink a potion. (+${sip.healed} HP)${sip.free ? ' The elixir is not spent!' : ''}${sip.armor ? ` (+${sip.armor} armor until the room ends)` : ''}`, 'heal');
          playFx({ kind: 'heal', to: 'player', amount: sip.healed, potion: true }, fxCtx);
        }
        updateCombat();
      },
      onAttack: (i) => act(() => playerAttack(combat, i, false)),
    });
    // Death has no corner button — the fatal blow triggers the blood-red
    // flash and the centered YOU DIED dialog (openDeathModal, 0.067).
    const proceed = el('div', { class: 'combat-proceed' });
    const layer = el('div', { class: 'fx-layer' }); // floating numbers (0.087)
    root.innerHTML = '';
    root.append(
      el('h1', { class: 'room-title' }, room.isBoss ? room.name : `Room ${room.number} - ${room.name}`, recordTag()),
      battle.line, // ui/battleRoom.js
      el('div', { class: 'resources' },
        el('div', { class: 'res-row' }, el('span', { class: 'res-label' }, 'XP'), el('b', { id: 'hud-xp' }, String(shownXp))),
        el('div', { class: 'res-row' }, el('span', { class: 'res-label' }, 'COINS'), el('b', { id: 'hud-coins' }, String(shownCoins)))),
      layer,
      logEl,
      proceed);
    logEl.className = 'docked';
    logEl.scrollTop = logEl.scrollHeight;
    root.append(buffBar);
    updateBuffs(buffBar, run.buffs);
    ui = { room, root, battle, player: battle.player, enemies: battle.enemies, proceed, layer };
    playFx({ kind: 'enter' }, fxCtx);
  }

  function updateCombat() {
    ui.battle.update(playback, { heavyReady: canHeavy(combat), dead: combat.over && !combat.victory });
    const printing = playback.isPrinting();
    const showProceed = combat.over && !printing && combat.victory;
    if (showProceed && !ui.proceed.children.length) {
      ui.proceed.append(
        // 'active' (0.079): pulsing yellow — the obvious next step.
        el('button', { class: 'primary active', key: 'd', proceed: true, onclick: () => nextRoom(ui.root) }, 'Push Deeper'),
        el('button', { class: 'danger', key: 'r', onclick: () => endRun(ui.root, 'retreat') }, 'Retreat with Loot'));
    } else if (!showProceed && ui.proceed.children.length) {
      ui.proceed.innerHTML = '';
    }
  }

  // ---- shrine: panel layout (shrineUI.js) ----
  function renderShrine(root, room) {
    renderShrineRoom(root, run, room, {
      title: [`Room ${room.number} - ${room.name}`, recordTag()],
      logEl, buffBar, coins: shownCoins, xp: shownXp,
      onDeeper: () => nextRoom(root),
      onRetreat: () => endRun(root, 'retreat'),
      refresh: () => render(currentRoot),
    });
  }

  // Execute a combat action. Combat resolves synchronously; the resulting
  // log lines are queued and printed one by one (logDelayMs apart) so the
  // fight reads as it happens. Input is locked while the queue drains.
  function act(fn) {
    if (!canAct()) return;
    // The replay starts from the state BEFORE the action resolves (0.086).
    const pre = { enemies: combat.enemies.map((e) => e.hp), hp: run.hp, meters: combat.enemies.map((e) => e.summonMeter ?? null) };
    queueEvents(fn(), { run, combat, playback });
    if (combat.over && combat.victory) {
      playback.enqueue({ text: roomSummaryText(), cls: 'move' });
    }
    playback.begin(pre);
  }

  // Roll the coin/XP HUD counters up to their true values after each
  // action's playback finishes. The chips display shownCoins/shownXp.
  function tickUpChips() {
    const cEl = document.getElementById('hud-coins');
    const xEl = document.getElementById('hud-xp');
    if (cEl && run.coins !== shownCoins) { tickUp(cEl, shownCoins, run.coins, 700); shownCoins = run.coins; }
    if (xEl && run.xp !== shownXp) { tickUp(xEl, shownXp, run.xp, 700); shownXp = run.xp; }
  }

  // Rich log line (array of strings/Nodes): looted item names print in
  // their rarity colors. logLine() accepts both strings and arrays.
  function roomSummaryText() {
    const dc = run.coins - roomStart.coins;
    const dx = run.xp - roomStart.xp;
    const parts = [`Room cleared! Rewards: +${dc} coins, +${dx} XP`];
    const newItems = run.itemsFound.slice(roomStart.items);
    if (newItems.length) {
      parts.push(' — loot: ');
      newItems.forEach((id, i) => {
        if (i > 0) parts.push(', ');
        parts.push(itemName(DATA.items[id]));
      });
    }
    return parts;
  }

  // "★ RECORD DEPTH" tag on the room title: shown when this room is at or
  // past the player's best-ever depth (i.e. the frontier — reached on an
  // earlier run but never cleared, or beyond it). Never on the first run.
  function recordTag() {
    const rec = getProfile().records;
    return rec.runs > 0 && run.roomNumber >= rec.bestRoom
      ? el('span', { class: 'record-tag' }, '★ Record depth')
      : null;
  }

  // Death is an event: after the fatal blow finishes printing, the screen
  // bleeds slowly to red, the YOU DIED dialog flashes in at the peak, and
  // the red fades back out behind it (fx.js deathFlash, 0.079).
  function openDeathModal() {
    if (deathShown) return;
    deathShown = true;
    sfx('death');
    deathFlash(() => showDeathModal(run, () => endRun(currentRoot, 'death')));
  }

  // The final boss falls (0.121): the first time a save beats the boss of
  // finalBossRoom, a one-off "you've won" dialog celebrates it before the
  // usual Push Deeper / Retreat choice.
  function maybeShowVictory() {
    const room = run.room;
    if (!room.isBoss || room.number < DATA.difficulty.finalBossRoom || getProfile().victorySeen) return;
    markVictorySeen();
    showVictoryModal(run);
  }

  // Ghost-click guard: Safari still fires click events on buttons that
  // were disabled/replaced mid-gesture — no action once combat is over or
  // while a previous action is still printing.
  function canAct() {
    return !combat.over && !playback.isPrinting();
  }

  function endRun(root, outcome) {
    run.perf ??= stopPerf(); // ??=: a double Retreat must not wipe it (0.130)
    shareStats(settleRun(run, outcome)); // play stats (0.102)
    go('runEnd', run, outcome);
  }
}

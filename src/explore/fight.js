// explore/fight.js — one encounter's fight, over the dimmed dungeon view
// (0.141). The game's own combat: the room comes from run/roomGen.js at
// its depth, and the battle line, log playback, effects and sounds are
// the dungeon scene's (ui/battleRoom.js, combatPlayback.js, combatQueue.js,
// combatFx.js, combatSfx.js) — only the way out differs: a won fight
// offers Onward (Space), a lost one Rise Again. The run object carries HP,
// potions and loot from fight to fight; the lab never settles it, so
// nothing reaches the save.
//
// startFight(root, run, room, { onDone(victory) }) -> { close() }

import { el } from '../core/dom.js';
import { createCombat, playerAttack, canHeavy, useHeavy, heavyTarget } from '../run/combat.js';
import { drinkPotion } from '../run/runState.js';
import { createPlayback } from '../ui/combatPlayback.js';
import { queueEvents } from '../ui/combatQueue.js';
import { mountBattle } from '../ui/battleRoom.js';
import { playFx } from '../ui/combatFx.js';
import { combatSfx } from '../ui/combatSfx.js';
import { logLine } from '../ui/hud.js';
import { sfx } from '../audio/sfx.js';

export function startFight(root, run, room, { onDone }) {
  run.room = room;
  run.roomNumber = room.number;
  run.tempArmor = 0;
  const combat = createCombat(run, room);
  const logEl = el('div', { id: 'combat-log', class: 'docked' });
  let ui = null, closed = false;

  const playback = createPlayback({
    logEl: () => logEl,
    onTick: () => update(),
    onEmpty: () => update(),
    onFx: (fx) => fx && playFx(fx, fxCtx),
    onSfx: (item) => combatSfx(item, fxCtx),
  });
  const fxCtx = {
    unit: (who) => (!ui ? null : who === 'player' ? ui.player : ui.enemies[who] ?? null),
    get layer() { return ui?.layer ?? null; },
  };
  const canAct = () => !closed && !combat.over && !playback.isPrinting();

  function act(fn) {
    if (!canAct()) return;
    const pre = { enemies: combat.enemies.map((e) => e.hp), hp: run.hp, meters: combat.enemies.map((e) => e.summonMeter ?? null) };
    queueEvents(fn(), { run, combat, playback });
    if (combat.over && combat.victory) playback.enqueue({ text: `The way is clear. (${run.coins} coins, ${run.xp} XP so far)`, cls: 'move' });
    if (combat.over && !combat.victory) playback.enqueue({ text: 'The knight falls...', cls: 'sys' });
    playback.begin(pre);
  }

  const battle = mountBattle(run, combat, {
    onHeavy: () => { if (canAct()) { useHeavy(combat); act(() => playerAttack(combat, heavyTarget(combat), true)); } },
    onPotion: () => {
      if (closed || (combat.over && !combat.victory) || playback.isPrinting()) return;
      const sip = drinkPotion(run);
      if (sip) {
        combatSfx({ sfx: 'heal', fx: { kind: 'heal', to: 'player' } }, fxCtx);
        logLine(logEl, `You drink a potion. (+${sip.healed} HP)`, 'heal');
        playFx({ kind: 'heal', to: 'player', amount: sip.healed, potion: true }, fxCtx);
      }
      update();
    },
    onAttack: (i) => act(() => playerAttack(combat, i, false)),
  });
  const proceed = el('div', { class: 'combat-proceed' });
  const layer = el('div', { class: 'fx-layer' });
  root.innerHTML = '';
  root.append(el('h1', { class: 'room-title' }, room.isBoss ? room.enemies[0].name : `Room ${room.number}`), battle.line, layer, logEl, proceed);
  ui = { battle, player: battle.player, enemies: battle.enemies, layer };
  logLine(logEl, room.isBoss ? `${room.enemies[0].name} rises before you.` : `Enemies bar the way! (room ${room.number})`, 'move');
  playFx({ kind: 'enter' }, fxCtx);
  update();

  function update() {
    if (closed) return;
    battle.update(playback, { heavyReady: canHeavy(combat), dead: combat.over && !combat.victory });
    const ready = combat.over && !playback.isPrinting();
    if (ready && !proceed.children.length) {
      const won = combat.victory;
      if (!won) sfx('death');
      proceed.append(el('button', {
        class: won ? 'primary active' : 'danger active active-red', key: won ? 'o' : 'r', proceed: true,
        onclick: () => close(won),
      }, won ? 'Onward' : 'Rise Again'));
    }
  }

  function close(won) {
    if (closed) return;
    closed = true;
    playback.reset();
    onDone(won);
  }
  return { close: () => close(false), combat };
}

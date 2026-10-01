// ui/battleRoom.js — one combat room's battle line (0.136): the knight's
// unit beside a row of enemy units (ui/battleLine.js), built ONCE per room
// and patched in place on every playback tick (0.086 — a full rebuild every
// tick restarted the CSS animations). Shared by the dungeon and the
// benchmark, so the benchmark draws exactly what a real fight draws.
//
// mountBattle(run, combat, { onHeavy, onPotion, onAttack(i) })
//   -> { player, enemies, row, line, update(playback, { heavyReady, dead }) }

import { el } from '../core/dom.js';
import { createPlayerUnit, createEnemyUnit } from './battleLine.js';

// What effects can touch — the live units of the current battle line.
// ui(): the scene's current { player, enemies, layer } (null between rooms).
export const fxContext = (ui) => ({
  unit: (who) => { const u = ui(); return !u ? null : who === 'player' ? u.player : u.enemies[who] ?? null; },
  get layer() { return ui()?.layer ?? null; },
});

// The state BEFORE an action resolves: the replay starts from there (0.086).
export const snapshot = (combat) => ({
  enemies: combat.enemies.map((e) => e.hp), hp: combat.run.hp, meters: combat.enemies.map((e) => e.summonMeter ?? null),
});

export function mountBattle(run, combat, { onHeavy, onPotion, onAttack }) {
  const player = createPlayerUnit(run, { onHeavy, onPotion });
  const unit = (i) => createEnemyUnit(combat.enemies[i], i, {
    onAttack: () => onAttack(i),
    onGone: () => fit(), // a fallen summon crumbles away, freeing its slot
  });
  const enemies = combat.enemies.map((e, i) => unit(i));
  const row = el('div', { class: 'enemy-row' }, ...enemies.map((u) => u.el));
  // --n drives the card size (styles.css --card-h): crowded rooms shrink
  // their cards to fit the width instead of wrapping (0.078).
  const line = el('div', { class: 'battle-line', style: `--n:${enemies.length}` }, player.el, row);
  const fit = () => line.setAttribute('style', `--n:${Math.max(1, row.children.length)}`);

  // Summons join mid-fight (0.092): each card appears as its summon line
  // prints (the playback view says how many enemies exist yet), in front
  // of — left of — the boss.
  function sync(playback) {
    const n = playback.enemyCount(combat.enemies.length);
    if (enemies.length >= n) return;
    const boss = enemies.find((u) => !u.summoned);
    while (enemies.length < n) {
      const u = unit(enemies.length);
      enemies.push(u);
      row.insertBefore(u.el, boss?.el ?? null);
    }
    fit();
  }

  // Every tick: HP and states as the replay shows them (combatPlayback.js).
  function update(playback, { heavyReady = false, dead = false } = {}) {
    const printing = playback.isPrinting();
    sync(playback);
    player.update({
      hp: playback.playerHpOf(run.hp), printing, dead,
      heavyReady: heavyReady && !printing && !combat.over, heavyCd: combat.heavyCd,
    });
    enemies.forEach((u, i) => {
      const e = combat.enemies[i];
      u.update({
        hp: playback.hpOf(i, e.hp), dead: playback.deadOf(i, e.hp), printing, combatOver: combat.over,
        meter: playback.meterOf(i, e.summonMeter ?? null),
      });
    });
  }

  return { player, enemies, row, line, update };
}

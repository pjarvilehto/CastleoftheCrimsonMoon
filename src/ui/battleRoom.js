// ui/battleRoom.js — one combat room's battle line (0.136): the knight's
// unit beside a row of enemy units (ui/battleLine.js), built ONCE per room
// and patched in place on every playback tick (0.086 — a full rebuild every
// tick restarted the CSS animations). Shared by the dungeon and the
// benchmark, so the benchmark draws exactly what a real fight draws.
//
// mountBattle(run, combat, { onHeavy, onPotion, onAttack(i), rand })
//   -> { player, enemies, row, line, update(playback, { heavyReady, dead }) }
// (rand: the portraits' deal, shared/portraits.js dealPortrait — the benchmark
// passes a fixed one, so every run of it draws the same faces)

import { statusOf } from '../run/combat.js';
import { el } from '../core/dom.js';
import { createPlayerUnit, createEnemyUnit } from './battleLine.js';
import { dealPortrait } from '../shared/portraits.js';

// What effects can touch — the live units of the current battle line.
// ui(): the scene's current { player, enemies, layer } (null between rooms).
// run(): the scene's current run (0.00283; null where there is none) — the
// class's heavy on run.stats.klass (ui/classFx.js reads the traces from it)
// and the satchel's count (ui/findFx.js). The scenes add what else they
// have (loot, lootAhead).
export const fxContext = (ui, run = () => null) => ({
  unit: (who) => { const u = ui(); return !u ? null : who === 'player' ? u.player : u.enemies[who] ?? null; },
  get layer() { return ui()?.layer ?? null; },
  run,
});

// The state BEFORE an action resolves: the replay starts from there (0.086).
export const snapshot = (combat) => ({
  enemies: combat.enemies.map((e) => e.hp), hp: combat.run.hp, meters: combat.enemies.map((e) => e.summonMeter ?? null),
});

// The boss card's width in enemy-card widths (styles.css .boss-card aspect-ratio).
const BOSS_SLOTS = 2;

export function mountBattle(run, combat, { onHeavy, onPotion, onAttack, rand }) {
  const player = createPlayerUnit(run, { onHeavy, onPotion });
  const gone = []; // per enemy: resolves once its fallen card has left the row (0.00220: the playback waits for it)
  const unit = (i) => {
    let left;
    gone[i] = new Promise((r) => { left = r; });
    return createEnemyUnit(combat.enemies[i], i, {
      art: dealPortrait(combat, combat.enemies[i], rand), // each foe its own of the kind's approved pictures (0.00303), kept for the fight
      onAttack: () => onAttack(i),
      onGone: () => { fit(); left(); }, // a fallen enemy leaves the row: the slots left grow into the room (0.00216)
    });
  };
  const enemies = combat.enemies.map((e, i) => unit(i));
  const row = el('div', { class: 'enemy-row' }, ...enemies.map((u) => u.el));
  // --n drives the card size (styles.css --card-h): crowded rooms shrink
  // their cards to fit the width instead of wrapping (0.078).
  // ondragstart (0.159): no native drag may start from the line — the portraits are images
  // The boss's card is twice as wide (0.196, styles.css .boss-card): it
  // takes two slots of the width budget (--slots), its summons one each.
  const wide = combat.enemies.some((e) => e.boss) ? BOSS_SLOTS - 1 : 0;
  const sizing = (n) => `--n:${n};--slots:${n + wide}`;
  const line = el('div', { class: 'battle-line', style: sizing(enemies.length), ondragstart: (e) => e.preventDefault?.() }, player.el, row);
  // 0.00209: the line's parent (#app) gets the two numbers too — the phone's
  // card budget is computed there, so the log strip and the boons' bar
  // follow the cards' real height (dungeonScene calls fit() once the line is in)
  const fit = () => {
    const n = Math.max(1, row.children.length);
    line.setAttribute('style', sizing(n));
    line.parentElement?.style?.setProperty?.('--n', n); line.parentElement?.style?.setProperty?.('--slots', n + wide);
  };

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
      charges: combat.charges, // (0.00267: the wizard's charges)
    });
    enemies.forEach((u, i) => {
      const e = combat.enemies[i];
      u.update({
        hp: playback.hpOf(i, e.hp), dead: playback.deadOf(i, e.hp), printing, combatOver: combat.over,
        meter: playback.meterOf(i, e.summonMeter ?? null),
        ...playback.statusOf(i, statusOf(combat, e, i)), // (0.00267: the hexhunter's hex, the plague sister's blight; 0.00271 the Druid's roots; 0.00277 from the replay's snapshot)
      });
    });
  }

  const whenGone = (i) => gone[i] ?? Promise.resolve();
  // The death's own step (0.00220) only where the row needs it (the developer's
  // call): while an enemy card sits partly off the screen — a crowded row on
  // a phone — the fallen card's leaving brings it in, so the playback waits
  // for that restack. A row that fits keeps the quick pace: a heavy blow
  // runs from one victim to the next and the row closes up behind it.
  const restackDue = () => {
    const w = globalThis.innerWidth;
    if (!w) return false;
    return enemies.some((u) => { const r = u.el.getBoundingClientRect?.(); return !!r && r.width > 0 && (r.left < -1 || r.left + r.width > w + 1); });
  };
  const deathStep = (i) => (restackDue() ? whenGone(i) : null);
  return { player, enemies, row, line, update, fit, whenGone, restackDue, deathStep };
}

// shared/balance.js — all difficulty math in one place.
// Reads raw enemy defs and scales them by room depth.

import { DATA } from './data.js';

export function scaleEnemy(enemyId, roomNumber) {
  const base = DATA.enemies[enemyId];
  const diff = DATA.difficulty;
  const depth = Math.max(0, roomNumber - 1);
  // Enemy level tracks depth (same cadence as tiers): rooms 1-3 are
  // unlabeled LV1, then LV2, LV3... Level 1 prints no suffix.
  const level = Math.max(1, Math.floor((roomNumber - 1) / diff.tierRooms) + 1);
  return {
    id: enemyId,
    name: level > 1 ? `${base.name} LV${level}` : base.name,
    level,
    boss: !!base.boss,
    maxHp: Math.round(base.hp * Math.pow(diff.hpGrowth, depth)),
    dmg: Math.round(base.dmg * Math.pow(diff.dmgGrowth, depth)),
    xp: Math.round(base.xp * Math.pow(1.06, depth)),
    coins: base.coins,
  };
}

export function roomTier(roomNumber) {
  const t = DATA.difficulty.tierRooms;
  return Math.min(3, 1 + Math.floor((roomNumber - 1) / t));
}

function randInt([min, max]) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// T3-strength elites and bosses — marked with a gold star in battle and
// the only enemies that can drop T4 crimson relics (loot.js).
export function isElite(enemy) {
  return !!(enemy.boss || enemy.maxHp >= 60);
}

export function rollCoins(enemy) {
  return randInt(enemy.coins);
}

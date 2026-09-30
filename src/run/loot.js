// run/loot.js — drops after kills. Fortune stat shifts luck.

import { DATA } from '../shared/data.js';
import { rollCoins, isElite } from '../shared/balance.js';

function randInt([min, max]) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Returns { coins, xp, itemId|null } for one killed enemy.
// roomNumber gates T4 relics by depth (0.071); direct calls default deep.
// hasRelic caps relics at ONE per run (0.072) — they're build-defining
// drops, not a per-room income stream.
export function rollLoot(enemy, fortuneLevel, roomNumber = Infinity, hasRelic = false) {
  const diff = DATA.difficulty;
  const fortuneBonus = fortuneLevel * 0.02;

  const coins = Math.round(rollCoins(enemy) * (1 + fortuneBonus));
  const xp = enemy.xp;

  let itemId = null;
  // T4 crimson relics: their own rare roll, and only bosses and T3-strength
  // elites (maxHp >= 60) can carry one — and only from room 11 on (0.071),
  // so early elites can't hand out top-tier gear.
  const relicEligible = isElite(enemy) && roomNumber >= (diff.t4MinRoom ?? 11) && !hasRelic;
  if (relicEligible && Math.random() < (diff.t4Chance ?? 0.05) + fortuneBonus) {
    const relics = Object.keys(DATA.items).filter((id) => DATA.items[id].tier === 4);
    if (relics.length) itemId = relics[Math.floor(Math.random() * relics.length)];
  } else if (Math.random() < diff.dropChance + fortuneBonus) {
    const pool = Object.keys(DATA.items).filter(
      (id) => DATA.items[id].tier <= maxTierFor(enemy)
    );
    if (pool.length) itemId = pool[Math.floor(Math.random() * pool.length)];
  }

  return { coins, xp, itemId };
}

function maxTierFor(enemy) {
  if (isElite(enemy)) return 3;
  if (enemy.maxHp >= 28) return 2;
  return 1;
}

export function potionDrop() {
  // 0.072: was hardcoded 0.15 — at ~110 kills per deep run that rained
  // ~16 potions/run and made the shop pointless.
  return Math.random() < (DATA.difficulty.potionDropChance ?? 0.05);
}

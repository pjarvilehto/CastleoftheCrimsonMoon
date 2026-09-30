// run/runState.js — everything that exists ONLY during a dungeon run.
// The run accumulates its own earnings; meta/profile is only touched
// via settleRun() when the run ends (death or retreat). This is the
// single write-path from run state to meta state — keep it that way.

import { getProfile, derivedStats, persist, trainedLevel } from '../meta/profile.js';
import { potionHealAmount, efficiencyChance, infusionArmor } from '../meta/leveling.js';
import { equipItems } from '../meta/equipment.js';
import { generateRoom } from './roomGen.js';
import { rollLoot, potionDrop } from './loot.js';
import { DATA } from '../shared/data.js';

function randomShrineRoom() {
  const [lo, hi] = DATA.difficulty.shrineRoomRange ?? [2, 7];
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function createRun() {
  const stats = derivedStats();
  return {
    roomNumber: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    stats,                       // snapshot of dmg/armor/crit at run start
    coins: 0,
    xp: 0,
    itemsFound: [],              // item ids picked up this run
    potions: stats.potions,      // drawn from the persistent stock (0.080)
    potionCap: stats.potionCap,  // satchel size — pickups beyond it are sold
    kills: 0,
    buffs: [], // shrine blessings: {icon, label} — run-scoped, die with the run
    shrineRoom: randomShrineRoom(), // one shrine in rooms 2-7 (shrineRoomRange)
    revive: stats.revive ?? false, // Heart of the Dying Moon — once per run
    over: false,
    room: null,
  };
}

export function enterNextRoom(run) {
  run.roomNumber += 1;
  run.tempArmor = 0; // Infusion armor dies with the room
  run.room = generateRoom(run.roomNumber, run);
  return run.room;
}

export function applyLoot(run, enemy, log) {
  const fortune = trainedLevel(getProfile(), 'fortune');
  const hasRelic = run.itemsFound.some((id) => DATA.items[id]?.tier === 4);
  const loot = rollLoot(enemy, fortune, run.roomNumber, hasRelic);
  // Greed shrine boon multiplies kill coins (run.coinMult, default 1).
  const coins = Math.round(loot.coins * (run.coinMult ?? 1));
  run.coins += coins;
  run.xp += loot.xp;
  run.kills += 1;
  log(`+${coins} coins, +${loot.xp} XP`, 'loot');
  if (loot.itemId) {
    run.itemsFound.push(loot.itemId);
    const found = DATA.items[loot.itemId];
    // T4 relics get a burning EPIC ITEM line (0.063 — replaced the modal popup).
    // { item } parts are rendered rarity-colored by hud.logLine — run/ stays
    // free of UI imports (0.079).
    if (found.tier === 4) log(['✦ EPIC ITEM ✦  You found ', { item: found }, '!'], 'relic');
    else log(`Found: ${found.name}!`, 'loot');
  }
  if (potionDrop()) {
    if (addPotion(run)) log('Found a healing potion!', 'loot');
    else log(`Found a healing potion — satchel full, sold for ${satchelSellCoins()} coins.`, 'loot');
  }
}

function satchelSellCoins() {
  return DATA.difficulty.potions?.fullSatchelSellCoins ?? 10;
}

// Put one potion in the satchel. At the cap it's sold on the spot instead
// (coins into the run purse), so a full satchel never wastes a pickup.
// Returns true when the potion was kept.
export function addPotion(run) {
  if (run.potions < (run.potionCap ?? Infinity)) {
    run.potions += 1;
    return true;
  }
  run.coins += satchelSellCoins();
  return false;
}

// Returns { healed, free, armor } on success, false when undrinkable.
// free: Efficiency alchemy — the potion is not consumed.
// armor: Infusion alchemy — temporary armor until the room ends.
export function drinkPotion(run) {
  if (run.potions <= 0 || run.hp >= run.maxHp) return false;
  const healed = potionHealAmount(); // potency-trained
  const free = Math.random() < efficiencyChance();
  if (!free) run.potions -= 1;
  run.hp = Math.min(run.maxHp, run.hp + healed);
  const armor = infusionArmor();
  if (armor > 0) run.tempArmor = (run.tempArmor ?? 0) + armor;
  return { healed, free, armor };
}

// Single transaction: run earnings -> profile. Idempotent (0.077): the old
// screen stays clickable during its 1s fade-out, and a double-clicked
// Retreat used to bank the whole run twice. run.over latches here.
export function settleRun(run, outcome) {
  const p = getProfile();
  if (run.over) return p;
  p.xp += run.xp;
  p.records.kills += run.kills;
  p.records.runs += 1;
  p.records.bestRoom = Math.max(p.records.bestRoom, run.roomNumber);
  if (outcome === 'death') p.records.deaths += 1;
  // Potions are a persistent stock (0.080): what you didn't drink comes
  // home — on retreat AND on death (the toll only takes coins).
  p.potions = Math.max(0, Math.min(run.potions, p.potionCap));
  // Items auto-equip into their slots at run end (kept even on death);
  // replaced/weaker items are salvaged for coins.
  const equip = equipItems(p, run.itemsFound);
  run.coins += equip.coins;
  // Death toll: the castle takes half of everything you carried out.
  // Retreat banks the full purse.
  run.coinsLost = outcome === 'death' ? Math.floor(run.coins / 2) : 0;
  run.coinsRetrieved = run.coins - run.coinsLost;
  run.equipSummary = equip;
  p.coins += run.coinsRetrieved;
  persist();
  run.over = true;
  return p;
}

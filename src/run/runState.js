// run/runState.js — everything that exists ONLY during a dungeon run.
// The run accumulates its own earnings; meta/profile is only touched
// via settleRun() when the run ends (death or retreat). This is the
// single write-path from run state to meta state — keep it that way.

import { getProfile, persist } from '../meta/profile.js';
import { derivedStats, trainedLevel, playerLevel } from '../meta/stats.js';
import { recordRun } from '../meta/history.js';
import { potionHealAmount, efficiencyChance, infusionArmor } from '../meta/leveling.js';
import { equipItems, salvageValue } from '../meta/equipment.js';
import { generateRoom } from './roomGen.js';
import { rollLoot, potionDrop } from './loot.js';
import { rollTreasureRoom } from './treasure.js';
import { DATA } from '../shared/data.js';

// One shrine in every stretch of bossEvery rooms (0.091 — it used to be
// once per run): shrineRoomRange is the room range WITHIN a stretch, so
// rooms 2-7, 10-15, 18-23, ... Each stretch picks its room on entry —
// never the run's treasure room (0.155).
function randomShrineRoom(stretch = 0, treasureRoom = null) {
  const [lo, hi] = DATA.difficulty.shrineRoomRange ?? [2, 7];
  const rooms = [];
  for (let n = lo; n <= hi; n++) if (stretch * DATA.difficulty.bossEvery + n !== treasureRoom) rooms.push(stretch * DATA.difficulty.bossEvery + n);
  return rooms[Math.floor(Math.random() * rooms.length)];
}

export function createRun() {
  const stats = derivedStats();
  const treasureRoom = rollTreasureRoom(); // (0.155: one in a while, room number or null)
  return {
    roomNumber: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    stats,                       // snapshot of dmg/armor/crit at run start
    coins: 0,
    xp: 0,
    itemsFound: [],              // item ids picked up this run (upgrades only, 0.091)
    // What the gear will look like after settleRun equips this run's finds:
    // a drop that can't beat it is salvaged on the spot (0.091).
    gearPreview: structuredClone(getProfile().equipment),
    relicFound: false,           // per-run relic cap, even if the relic was salvaged
    potions: stats.potions,      // drawn from the persistent stock (0.080)
    potionCap: stats.potionCap,  // satchel size — pickups beyond it are sold
    kills: 0,
    buffs: [], // shrine blessings: {icon, label} — run-scoped, die with the run
    shrineRooms: [randomShrineRoom(0, treasureRoom)], // one per stretch of bossEvery rooms, added on entry
    treasureRoom,                // the run's treasure room (run/treasure.js), or null
    seenBackgrounds: [],         // paintings shown this run: none twice while the pool lasts (0.156)
    revive: stats.revive ?? false, // Heart of the Dying Moon — once per run
    // run history (0.095, meta/history.js): who went in, and the tallies
    startedAt: Date.now(),
    level: playerLevel(),
    turns: 0, potionsDrunk: 0, bossesBeaten: 0, killedBy: null,
    perf: null, // 0.130: frame-rate summary, filled in as the run ends (core/perfMonitor.js)
    tempArmor: 0,                // Infusion potions: armor until the room ends
    coinMult: 1,                 // Greed boon: x kill coins
    over: false,
    room: null,
    // filled in by settleRun (0.115: the whole run shape lives here)
    tollPct: 0, coinsLost: 0, coinsRetrieved: null, equipSummary: null,
  };
}

export function enterNextRoom(run) {
  run.roomNumber += 1;
  const stretch = Math.floor((run.roomNumber - 1) / DATA.difficulty.bossEvery);
  run.shrineRooms[stretch] ??= randomShrineRoom(stretch, run.treasureRoom);
  run.tempArmor = 0; // Infusion armor dies with the room
  run.room = generateRoom(run.roomNumber, run);
  return run.room;
}

export function applyLoot(run, enemy, log) {
  // Boss summons (0.092) count as kills but carry nothing.
  if (enemy.summoned) { run.kills += 1; return { itemId: null, kept: false }; }
  const fortune = trainedLevel(getProfile(), 'fortune');
  const loot = rollLoot(enemy, fortune, run.roomNumber, run.relicFound);
  // Greed shrine boon multiplies kill coins (run.coinMult, default 1).
  const coins = Math.round(loot.coins * run.coinMult);
  run.coins += coins;
  run.xp += loot.xp;
  run.kills += 1;
  log(`+${coins} coins, +${loot.xp} XP`, 'loot');
  let kept = false;
  if (loot.itemId) {
    const found = DATA.items[loot.itemId];
    if (found.tier === 4) run.relicFound = true;
    // Would it be equipped at settle? (Same rules, run against the preview.)
    kept = equipItems({ equipment: run.gearPreview }, [loot.itemId]).equipped.length > 0;
    if (kept) {
      run.itemsFound.push(loot.itemId);
      // T4 relics get a burning EPIC ITEM line (0.063 — replaced the modal popup).
      // { item } parts are rendered rarity-colored by hud.logLine — run/ stays
      // free of UI imports (0.079).
      if (found.tier === 4) log(['✦ EPIC ITEM ✦  You found ', { item: found }, '!'], 'relic');
      else log(['Found: ', { item: found }, '!'], 'loot');
    } else {
      // Not an upgrade: it would only be salvaged at the end — take the
      // coins now instead of piling up junk (0.091). Same value, same toll.
      const value = salvageValue(loot.itemId);
      run.coins += value;
      log(`+${value} coins (salvaged ${found.name})`, 'loot');
    }
  }
  if (potionDrop()) {
    if (addPotion(run)) log('Found a healing potion!', 'loot');
    else log(`Found a healing potion — satchel full, sold for ${satchelSellCoins()} coins.`, 'loot');
  }
  return { itemId: loot.itemId, kept };
}

function satchelSellCoins() {
  return DATA.difficulty.potions?.fullSatchelSellCoins;
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
  run.potionsDrunk += 1;
  run.hp = Math.min(run.maxHp, run.hp + healed);
  const armor = infusionArmor();
  if (armor > 0) run.tempArmor += armor;
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
  run.tollPct = DATA.difficulty.deathCoinToll; // difficulty.json (0.097)
  run.coinsLost = outcome === 'death' ? Math.floor(run.coins * run.tollPct) : 0;
  run.coinsRetrieved = run.coins - run.coinsLost;
  run.equipSummary = equip;
  p.coins += run.coinsRetrieved;
  recordRun(p, run, outcome); // 0.095: the run history (analytics)
  persist();
  run.over = true;
  return p;
}

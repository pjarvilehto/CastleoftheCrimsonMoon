// run/runState.js — everything that exists ONLY during a dungeon run.
// The run accumulates its own earnings; meta/profile is only touched
// via settleRun() when the run ends (death or retreat). This is the
// single write-path from run state to meta state — keep it that way.

import { getProfile, persist } from '../meta/profile.js';
import { derivedStats, playerLevel } from '../meta/stats.js';
import { recordRun } from '../meta/history.js';
import { potionHealAmount, efficiencyChance, infusionArmor } from '../meta/leveling.js';
import { equipItems } from '../meta/equipment.js';
import { generateRoom, generateInterlude } from './roomGen.js';
import { rollLoot, potionDrop, takeItem } from './loot.js';
import { rollTreasureRoom } from './treasure.js';
import { DATA } from '../shared/data.js';
import { pick } from '../shared/balance.js';

// One shrine in every stretch of bossEvery rooms (0.091 — it used to be
// once per run): shrineRoomRange is the room range WITHIN a stretch, so
// the shrine comes on the way to room 2-7, 10-15, 18-23, ... (0.171: as an
// interlude, not in that room's place). Each stretch picks its room on
// entry — never the one the run's treasure room leads to (0.155).
function randomShrineRoom(stretch = 0, treasureRoom = null) {
  const [lo, hi] = DATA.difficulty.shrineRoomRange;
  const rooms = [];
  for (let n = lo; n <= hi; n++) if (stretch * DATA.difficulty.bossEvery + n !== treasureRoom) rooms.push(stretch * DATA.difficulty.bossEvery + n);
  return pick(rooms);
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
    shrineRooms: [randomShrineRoom(0, treasureRoom)], // the shrine comes before these rooms: one per stretch, added on entry
    treasureRoom,                // the treasure room comes before this room (run/treasure.js), or null
    interludeShown: 0,           // the room whose interlude (shrine / treasure) was already met (0.171)
    seenBackgrounds: [],         // paintings shown this run: none twice while the pool lasts (0.156)
    revive: stats.revive,        // Heart of the Dying Moon — once per run (loot.js tryRevive)
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

// The next room: a numbered fight, or first the interlude on the way to
// it (0.171: shrines and treasure rooms aren't numbered — run.roomNumber
// counts fights, the boss's included).
export function enterNextRoom(run) {
  const next = run.roomNumber + 1;
  const stretch = Math.floor((next - 1) / DATA.difficulty.bossEvery);
  run.shrineRooms[stretch] ??= randomShrineRoom(stretch, run.treasureRoom);
  run.tempArmor = 0; // Infusion armor dies with the room
  const interlude = run.interludeShown === next ? null
    : run.shrineRooms.includes(next) ? 'shrine' : run.treasureRoom === next ? 'treasure' : null;
  if (interlude) {
    run.interludeShown = next;
    run.room = generateInterlude(interlude, next, run);
  } else {
    run.roomNumber = next;
    run.room = generateRoom(next, run);
  }
  return run.room;
}

export function applyLoot(run, enemy, log) {
  // Boss summons (0.092) count as kills but carry nothing.
  if (enemy.summoned) { run.kills += 1; return { itemId: null, kept: false }; }
  const loot = rollLoot(enemy, run.stats.fortuneBonus, run.roomNumber, run.relicFound);
  // Greed shrine boon multiplies kill coins (run.coinMult, default 1).
  const coins = Math.round(loot.coins * run.coinMult);
  run.coins += coins;
  run.xp += loot.xp;
  run.kills += 1;
  log(`+${coins} coins, +${loot.xp} XP`, 'loot');
  const kept = loot.itemId ? takeItem(run, loot.itemId, log).kept : false;
  if (potionDrop()) {
    if (addPotion(run)) log('Found a healing potion!', 'loot');
    else log(`Found a healing potion — satchel full, sold for ${satchelSellCoins()} coins.`, 'loot');
  }
  return { itemId: loot.itemId, kept };
}

function satchelSellCoins() {
  return DATA.difficulty.potions.fullSatchelSellCoins; // (dataCheck lists it: a boot error, never NaN coins)
}

// Put one potion in the satchel. At the cap it's sold on the spot instead
// (coins into the run purse), so a full satchel never wastes a pickup.
// Returns true when the potion was kept.
export function addPotion(run) {
  if (run.potions < run.potionCap) {
    run.potions += 1;
    return true;
  }
  run.coins += satchelSellCoins();
  return false;
}

// Returns { healed, free, armor } on success, false when undrinkable.
// free: Efficiency alchemy — the potion is not consumed.
// armor: Infusion alchemy — temporary armor until the room ends; none
// between rooms (inCombat false), where enterNextRoom would discard it
// (0.00223: a potion drunk after the win announced armor the next room threw away).
export function drinkPotion(run, inCombat = true) {
  if (run.potions <= 0 || run.hp >= run.maxHp) return false;
  const healed = potionHealAmount(); // potency-trained
  const free = Math.random() < efficiencyChance();
  if (!free) run.potions -= 1;
  run.potionsDrunk += 1;
  run.hp = Math.min(run.maxHp, run.hp + healed);
  const armor = inCombat ? infusionArmor() : 0;
  if (armor > 0) run.tempArmor += armor;
  return { healed, free, armor };
}

// The room the knight fell in: the one an interlude led to when the
// reliquary killed him (0.155 / 0.171; 0.00223 — a reliquary death was
// recorded one room short, so the run's end, the history and the dashboard
// counted a cleared room and a beaten boss as lost).
export const deathRoom = (run) => (run.room?.number === null && run.room.depth ? run.room.depth : run.roomNumber);

// Single transaction: run earnings -> profile. Idempotent (0.077): the old
// screen stays clickable during its 1s fade-out, and a double-clicked
// Retreat used to bank the whole run twice. run.over latches here.
export function settleRun(run, outcome) {
  const p = getProfile();
  if (run.over) return p;
  if (outcome === 'death') run.roomNumber = deathRoom(run); // a reliquary death counts as a death THERE, as a fight death in that room would
  // Items auto-equip into their slots at run end (kept even on death);
  // replaced/weaker items are salvaged for coins. (First: the one path that
  // could throw on a foreign item id — the profile is never left half-settled, 0.00223.)
  const equip = equipItems(p, run.itemsFound);
  p.xp += run.xp;
  p.records.kills += run.kills;
  p.records.runs += 1;
  p.records.bestRoom = Math.max(p.records.bestRoom, run.roomNumber);
  if (outcome === 'death') p.records.deaths += 1;
  // Potions are a persistent stock (0.080): what you didn't drink comes
  // home — on retreat AND on death (the toll only takes coins).
  p.potions = Math.max(0, Math.min(run.potions, p.potionCap));
  p.potionsBought = 0; // the potion price ladder starts over after every run (0.00204: 10, 20, 25, +5 each; meta/leveling.js potionCost)
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

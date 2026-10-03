// run/treasure.js — treasure rooms (0.155): rare rooms with three chests,
// one to open. Pure rules (no UI); ui/treasureUI.js draws them.
//
// Where: a run has one treasure room at most — with `treasure.chance`, once
// the save's best room has reached `treasure.unlockRoom` (a silent unlock),
// at a room between `treasure.minRoom` and the save's best room (so it's
// within reach), never a boss room; the stretch's shrine steps aside
// (runState.js). 0.171: an interlude on the way to that room, outside the
// room count; room.depth (the room it leads to) sets what's inside.
// What: an Iron Coffer (a haul of coins, `coffer.fights` fights' worth at
// that depth), a Gilded Chest (one piece of gear of the depth's tier, made
// for a slot it improves — salvaged if none can be) or a Sealed Reliquary
// (blood: `reliquary.hpCost` of max HP as damage, which can kill; inside,
// rarely a crimson relic — room t4MinRoom on, one per run — else fine gear).
// Everything lands in the run object (rule 1), gear through the usual
// upgrade-or-salvage check against run.gearPreview (loot.js takeItem).

import { DATA } from '../shared/data.js';
import { getProfile } from '../meta/profile.js';
import { equipItems } from '../meta/equipment.js';
import { rollCoins, randInt, pick } from '../shared/balance.js';
import { roomEnemies } from './roomGen.js';
import { takeItem, relicIds, tryRevive, droppable } from './loot.js';

const T = () => DATA.difficulty.treasure;

// The run's treasure room number, or null (decided at run start).
export function rollTreasureRoom(bestRoom = getProfile().records.bestRoom) {
  const t = T(), every = DATA.difficulty.bossEvery;
  if (!(bestRoom >= t.unlockRoom) || Math.random() >= t.chance) return null;
  const rooms = [];
  for (let n = t.minRoom; n <= bestRoom; n++) if (n % every !== 0) rooms.push(n);
  return rooms.length ? pick(rooms) : null;
}

// The three chests, always in this order.
export const CHESTS = ['coffer', 'gilded', 'reliquary'];

// Blood price of the reliquary, in HP (never touches max HP).
export const reliquaryCost = (run) => Math.round(run.maxHp * T().reliquary.hpCost);

// An item of `tier` for a slot it would improve (against the run's gear
// as it will be), or any item of that tier when none would.
function gearFor(run, tier) {
  const ids = Object.keys(DATA.items).filter((id) => DATA.items[id].tier === tier && droppable(id)); // (0.00265: never a class's starting kit)
  const better = ids.filter((id) => equipItems({ equipment: structuredClone(run.gearPreview) }, [id]).equipped.length > 0);
  return pick(better.length ? better : ids);
}

// The chests' pictures (assets/icons/, 0.177): read here by the treasure
// room's cards (ui/treasureUI.js) and warmed with the Descend essentials
// (shared/preload.js) — one table since 0.00197.
export const CHEST_ICONS = Object.fromEntries(CHESTS.map((k) => [k, `assets/icons/chest_${k}.webp`]));

// Open one chest. Returns { kind, coins?, itemId?, kept?, died? }.
export function openChest(run, room, kind, log) {
  const t = T();
  if (room.opened) return { kind: room.opened }; // (0.00197: a second call pays nothing again — the rule layer guards, not only the re-render)
  room.opened = kind;
  if (kind === 'coffer') {
    const fights = randInt(t.coffer.fights);
    let coins = 0;
    for (let i = 0; i < fights; i++) for (const e of roomEnemies(room.depth)) coins += rollCoins(e);
    coins = Math.round(coins * (1 + run.stats.fortuneBonus) * run.coinMult);
    run.coins += coins;
    log(`The coffer spills its hoard: +${coins} coins!`, 'multi');
    return { kind, coins };
  }
  if (kind === 'gilded') {
    const tier = room.depth >= t.gilded.tier3Room ? t.gilded.tierFrom : t.gilded.tierBefore;
    return { kind, ...takeItem(run, gearFor(run, tier), log) };
  }
  // the reliquary: blood first
  const cost = reliquaryCost(run);
  run.hp -= cost;
  log(`The seal drinks your blood. (-${cost} HP)`, 'atk');
  if (run.hp <= 0) {
    const revived = tryRevive(run);
    if (revived) log(revived, 'revive');
    else {
      run.hp = 0;
      run.killedBy = 'reliquary'; // run history: what killed the knight
      log('The reliquary takes everything. The knight falls...', 'sys');
      return { kind, died: true };
    }
  }
  const relicOk = room.depth >= DATA.difficulty.t4MinRoom && !run.relicFound;
  if (relicOk && Math.random() < t.reliquary.relicChance + run.stats.fortuneBonus) {
    return { kind, ...takeItem(run, pick(relicIds()), log) };
  }
  return { kind, ...takeItem(run, gearFor(run, t.reliquary.itemTier), log) };
}

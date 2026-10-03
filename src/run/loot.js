// run/loot.js — drops after kills. Fortune stat shifts luck.

import { DATA } from '../shared/data.js';
import { rollCoins, isElite, pick } from '../shared/balance.js';
import { equipItems, salvageValue } from '../meta/equipment.js';

export const RELIC_TIER = 4;
export const relicIds = () => Object.keys(DATA.items).filter((id) => DATA.items[id].tier === RELIC_TIER);
// The classes' starting kits (0.00265, items.json `starter: true`) never drop: a kill's loot and the gilded chest leave them out.
export const droppable = (id) => !DATA.items[id]?.starter;

// Returns { coins, xp, itemId|null } for one killed enemy. fortuneBonus:
// run.stats.fortuneBonus (meta/stats.js). roomNumber gates T4 relics by
// depth (0.071, t4MinRoom); direct calls default deep. hasRelic caps relics
// at ONE per run (0.072) — they're build-defining drops, not a per-room
// income stream.
export function rollLoot(enemy, fortuneBonus, roomNumber = Infinity, hasRelic = false) {
  const diff = DATA.difficulty;

  const coins = Math.round(rollCoins(enemy) * (1 + fortuneBonus));
  const xp = enemy.xp;

  let itemId = null;
  // T4 crimson relics: their own rare roll, and only bosses and T3-strength
  // elites (maxHp >= eliteMinHp) can carry one — and only from t4MinRoom on
  // (0.071), so early elites can't hand out top-tier gear.
  const relicEligible = isElite(enemy) && roomNumber >= diff.t4MinRoom && !hasRelic;
  if (relicEligible && Math.random() < diff.t4Chance + fortuneBonus) {
    const relics = relicIds();
    if (relics.length) itemId = pick(relics);
  } else if (Math.random() < diff.dropChance + fortuneBonus) {
    const pool = Object.keys(DATA.items).filter(
      (id) => DATA.items[id].tier <= maxTierFor(enemy) && droppable(id)
    );
    if (pool.length) itemId = pick(pool);
  }

  return { coins, xp, itemId };
}

// An item into the run (kill loot, a treasure chest): kept when it would
// be equipped at settle (the same rules, run against run.gearPreview), else
// salvaged on the spot — it would only be salvaged at the end, so take the
// coins now instead of piling up junk (0.091; same value, same toll).
// log(text, cls, extra) prints the line: { item, id } parts are rendered
// rarity-colored (with the item's picture, 0.00260) by hud.logLine — run/
// stays free of UI imports (0.079). A kept find's line also carries
// extra.find = { id, slot, index, from }: the slot it takes in the preview
// and what it replaces (null: an empty slot) — combat's find card.
// Returns { itemId, kept, coins? }.
export function takeItem(run, itemId, log) {
  const item = DATA.items[itemId];
  if (item.tier === RELIC_TIER) run.relicFound = true; // the per-run relic cap, kept or not
  const preview = equipItems({ equipment: run.gearPreview }, [itemId]); // (moves the preview on: the next find is judged against this one)
  if (preview.equipped.length > 0) {
    run.itemsFound.push(itemId);
    const change = preview.changes.find((c) => c.to === itemId) ?? preview.changes[0];
    const find = { id: itemId, slot: change?.slot ?? item.slot, index: change?.index, from: change?.from ?? null };
    // T4 relics get a burning EPIC ITEM line (0.063 — replaced the modal popup).
    if (item.tier === RELIC_TIER) log(['✦ EPIC ITEM ✦  You found ', { item, id: itemId }, '!'], 'relic', { find });
    else log(['Found: ', { item, id: itemId }, '!'], 'loot', { find });
    return { itemId, kept: true };
  }
  const coins = salvageValue(itemId);
  run.coins += coins;
  log(`+${coins} coins (salvaged ${item.name})`, 'loot');
  return { itemId, kept: false, coins };
}

function maxTierFor(enemy) {
  if (isElite(enemy)) return 3;
  if (enemy.maxHp >= DATA.difficulty.tier2LootMinHp) return 2;
  return 1;
}

export function potionDrop() {
  // 0.072: was hardcoded 0.15 — at ~110 kills per deep run that rained
  // ~16 potions/run and made the shop pointless.
  return Math.random() < DATA.difficulty.potionDropChance;
}

// The Heart of the Dying Moon (a T4 relic): a killing blow — in combat or
// the reliquary's blood price — leaves the knight at player.reviveHpPct of
// max HP instead, once per run. Returns the log line, or null when it
// could not save him.
export function tryRevive(run) { // (0.00223: here from runState.js — treasure.js and runState.js imported each other)
  if (!run.revive) return null;
  const pct = DATA.difficulty.player.reviveHpPct;
  run.revive = false;
  run.hp = Math.ceil(run.maxHp * pct);
  return `The Heart of the Dying Moon beats again! You rise at ${pct === 0.5 ? 'half' : `${Math.round(pct * 100)}% of full`} health.`;
}

// meta/equipment.js — equipment slots and auto-equip logic.
//
// Rules: 1 weapon, 1 armor, 1 boots, 2 rings, 1 trinket, 1 amulet.
// A new item auto-equips into its slot only if it beats what's there;
// anything it replaces (or that loses the comparison) is salvaged for coins.
// This module is pure logic over the profile object — no DOM, no storage.

import { DATA } from '../shared/data.js';
import { canUse } from '../shared/classGear.js';

export function emptyEquipment() {
  return { weapon: null, armor: null, boots: null, rings: [null, null], trinket: null, amulet: null };
}

// What a new knight carries (0.116: moved here from profile.js).
export function startingEquipment() {
  const eq = emptyEquipment();
  const g = DATA.difficulty.player.startingGear; // (data since 0.00197)
  eq.weapon = g.weapon;
  eq.armor = g.armor;
  return eq;
}

export function equippedItemIds(eq) {
  return [eq.weapon, eq.armor, eq.boots, ...eq.rings, eq.trinket, eq.amulet].filter(Boolean);
}

// Rough "is this an upgrade" ordering: tier first, then total stat value
// (weights in difficulty.json itemValue since 0.093).
export function itemValue(id) {
  const it = DATA.items[id];
  if (!it) return -1;
  const w = DATA.difficulty.itemValue;
  return it.tier * w.tier
    + (it.dmg || 0) * w.dmg
    + (it.armor || 0) * w.armor
    + (it.hp || 0) * w.hp
    + (it.lifesteal || 0) * w.lifesteal
    + (it.crit || 0) * w.crit;
}

export function salvageValue(id) {
  const it = DATA.items[id];
  return it ? it.tier * DATA.difficulty.salvagePerTier : 0; // (an unknown id salvages for nothing, 0.00223)
}

// Auto-equip a list of item ids into the profile. Returns a summary
// { equipped: [{id,name,tier}], salvaged: [{id,name,tier}], coins, changes } for UI display.
// `equipped` lists only what is still worn at the end: a find that a later
// find replaced in the same call shows under salvaged only (0.097).
// The worn slots in the hall's order (0.00248): a key, and the ring's index.
export const GEAR_SLOTS = [['weapon'], ['armor'], ['boots'], ['rings', 0], ['rings', 1], ['trinket'], ['amulet']];
const wornIn = (eq, [key, i]) => (i === undefined ? eq[key] : eq[key]?.[i]) ?? null;

export function equipItems(profile, itemIds) {
  const summary = { equipped: [], salvaged: [], coins: 0, changes: [] };
  const worn = []; // ids equipped by this call, in order (parallel to summary.equipped)
  const eq = profile.equipment;
  const before = GEAR_SLOTS.map((s) => wornIn(eq, s)); // (0.00248: what each slot held, for the hall's reveal)

  const heroId = profile.hero?.id ?? null; // (0.00274: the item matrix — what the class can't use is salvaged, marked offClass; no hero chosen: anything goes)
  for (const id of itemIds) {
    const item = DATA.items[id];
    if (!item) continue;
    if (!canUse(heroId, id)) { salvage(id, summary, true); continue; }

    if (item.slot === 'ring') {
      const emptyIdx = eq.rings.indexOf(null);
      if (emptyIdx !== -1) {
        eq.rings[emptyIdx] = id;
        summary.equipped.push({ id, name: item.name, tier: item.tier });
        worn.push(id);
        continue;
      }
      const weakerIdx = itemValue(eq.rings[0]) <= itemValue(eq.rings[1]) ? 0 : 1;
      if (itemValue(id) > itemValue(eq.rings[weakerIdx])) {
        swapOut(eq.rings, weakerIdx, id, summary);
        summary.equipped.push({ id, name: item.name, tier: item.tier });
        worn.push(id);
      } else {
        salvage(id, summary);
      }
      continue;
    }

    const current = eq[item.slot];
    if (!current || itemValue(id) > itemValue(current)) {
      if (current) {
        salvage(current, summary);
      }
      eq[item.slot] = id;
      summary.equipped.push({ id, name: item.name, tier: item.tier });
      worn.push(id);
    } else {
      salvage(id, summary);
    }
  }
  // Drop the finds that didn't survive the call (newest entries win when
  // the same id is worn twice, e.g. two identical rings).
  const left = equippedItemIds(eq).reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map());
  const keep = worn.map(() => false);
  for (let i = worn.length - 1; i >= 0; i--) {
    if ((left.get(worn[i]) ?? 0) > 0) { keep[i] = true; left.set(worn[i], left.get(worn[i]) - 1); }
  }
  summary.equipped = summary.equipped.filter((_, i) => keep[i]);
  // Every slot the run's finds changed, in the hall's order (0.00248): the
  // Great Hall shows the old item there first, then the new one taking its
  // place (hubScene.js reveal).
  summary.changes = GEAR_SLOTS.map((s, n) => ({ slot: s[0], index: s[1], from: before[n], to: wornIn(eq, s) })).filter((c) => c.to && c.to !== c.from);
  return summary;
}

function swapOut(arr, idx, newId, summary) {
  salvage(arr[idx], summary);
  arr[idx] = newId;
}

function salvage(id, summary, offClass = false) {
  const it = DATA.items[id];
  if (!it) return; // an item the data no longer lists (0.00223): nothing to sell
  summary.salvaged.push({ id, name: it.name, tier: it.tier, ...(offClass ? { offClass: true } : {}) }); // (0.00260: the id, for the run end's pictures; 0.00274: offClass = another class's gear)
  summary.coins += salvageValue(id);
}

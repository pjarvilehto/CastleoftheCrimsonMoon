// meta/equipment.js — equipment slots and auto-equip logic.
//
// Rules: 1 weapon, 1 armor, 1 boots, 2 rings, 1 trinket, 1 amulet.
// A new item auto-equips into its slot only if it beats what's there;
// anything it replaces (or that loses the comparison) is salvaged for coins.
// This module is pure logic over the profile object — no DOM, no storage.

import { DATA } from '../shared/data.js';

// Single-item slots. Rings are the only multi-slot (handled separately).
export const SINGLE_SLOTS = ['weapon', 'armor', 'boots', 'trinket', 'amulet'];
export const RING_SLOTS = 2;

export function emptyEquipment() {
  return { weapon: null, armor: null, boots: null, rings: [null, null], trinket: null, amulet: null };
}

export function equippedItemIds(eq) {
  return [eq.weapon, eq.armor, eq.boots, ...eq.rings, eq.trinket, eq.amulet].filter(Boolean);
}

// Rough "is this an upgrade" ordering: tier first, then total stat value.
export function itemValue(id) {
  const it = DATA.items[id];
  if (!it) return -1;
  return it.tier * 100
    + (it.dmg || 0) * 4
    + (it.armor || 0) * 4
    + (it.hp || 0) * 0.5
    + (it.lifesteal || 0) * 200
    + (it.crit || 0) * 100;
}

function salvageValue(id) {
  return DATA.items[id].tier * DATA.difficulty.salvagePerTier;
}

// Auto-equip a list of item ids into the profile. Returns a summary
// { equipped: [{name,tier}], salvaged: [{name,tier}], coins } for UI display.
export function equipItems(profile, itemIds) {
  const summary = { equipped: [], salvaged: [], coins: 0 };
  const eq = profile.equipment;

  for (const id of itemIds) {
    const item = DATA.items[id];
    if (!item) continue;

    if (item.slot === 'ring') {
      const emptyIdx = eq.rings.indexOf(null);
      if (emptyIdx !== -1) {
        eq.rings[emptyIdx] = id;
        summary.equipped.push({ name: item.name, tier: item.tier });
        continue;
      }
      const weakerIdx = itemValue(eq.rings[0]) <= itemValue(eq.rings[1]) ? 0 : 1;
      if (itemValue(id) > itemValue(eq.rings[weakerIdx])) {
        swapOut(eq.rings, weakerIdx, id, summary);
        summary.equipped.push({ name: item.name, tier: item.tier });
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
      summary.equipped.push({ name: item.name, tier: item.tier });
    } else {
      salvage(id, summary);
    }
  }
  return summary;
}

function swapOut(arr, idx, newId, summary) {
  salvage(arr[idx], summary);
  arr[idx] = newId;
}

function salvage(id, summary) {
  const it = DATA.items[id];
  summary.salvaged.push({ name: it.name, tier: it.tier });
  summary.coins += salvageValue(id);
}

// meta/profile.js — the persistent player profile (meta state).
// Owns coins, XP, permanent stat levels, equipment, records.

import { loadProfile, saveProfile, wipeProfile, exportProfile, importProfile } from './storage.js';
import { DATA } from '../shared/data.js';
import { emptyEquipment, equippedItemIds, equipItems } from './equipment.js';

const DEFAULTS = {
  coins: 0,
  xp: 0,
  stats: { power: 0, vitality: 0, fortune: 0, precision: 0, endurance: 0 },
  alchemy: { potency: 0, efficiency: 0, infusion: 0 },
  forged: {}, // itemId -> enhancement level (The Forge)
  equipment: null, // filled below; one item per slot (see meta/equipment.js)
  potions: 2,
  potionsBought: 0, // lifetime purchases — drives the escalating potion price
  records: { kills: 0, bestRoom: 0, runs: 0, deaths: 0 },
};

function startingEquipment() {
  const eq = emptyEquipment();
  eq.weapon = 'rusty_sword';
  eq.armor = 'oak_shield';
  return eq;
}

let profile = null;

export function getProfile() {
  if (!profile) {
    profile = { ...structuredClone(DEFAULTS), ...(loadProfile() || {}) };
    migrateProfile(profile);
  }
  return profile;
}

// Migrate old saves forward.
function migrateProfile(p) {
  // Forward-compat: new stats get defaults — the top-level load merge is
  // shallow, so an old save's `stats` object would otherwise shadow
  // DEFAULTS.stats entirely and lack new keys.
  p.stats = { ...structuredClone(DEFAULTS.stats), ...(p.stats || {}) };
  // 0.059: stats.alchemy (single track) -> alchemy.potency; precision and
  // endurance arrive via the merge above; the Scribe's xpExchange is gone.
  p.alchemy = { ...structuredClone(DEFAULTS.alchemy), ...(p.alchemy || {}) };
  if (typeof p.stats.alchemy === 'number') {
    p.alchemy.potency = Math.max(p.alchemy.potency, p.stats.alchemy);
    delete p.stats.alchemy;
  }
  p.forged = { ...(p.forged || {}) };
  if (!p.equipment) {
    const oldInventory = p.inventory || [];
    p.equipment = startingEquipment();
    const res = equipItems(p, oldInventory); // dupes/weaker gear salvage into coins
    p.coins += res.coins;
    delete p.inventory;
  }
}

export function persist() {
  saveProfile(profile);
}

// ---- save transfer (title screen) ----

export function exportSave() {
  persist(); // flush in-memory state so the code is current
  return exportProfile();
}

// Accept a pasted save code. On success the in-memory profile is
// replaced (merged over defaults, migrated) and persisted.
export function importSave(code) {
  const data = importProfile(code);
  if (!data) return false;
  profile = { ...structuredClone(DEFAULTS), ...data };
  migrateProfile(profile);
  persist();
  return true;
}

// Wipe the save and reset the in-memory profile to a fresh start.
export function resetProfile() {
  wipeProfile();
  profile = { ...structuredClone(DEFAULTS) };
  profile.equipment = startingEquipment();
  persist();
}

// ---- derived combat stats (base + permanent levels + gear) ----

// Breakthroughs: every 5th trained level in a discipline counts double.
// Level 12 therefore lands as 14 effective levels.
export function trainedLevel(p, stat) {
  const lvl = p.stats[stat] ?? 0;
  const every = DATA.difficulty.breakthroughEvery ?? 5;
  return lvl + Math.floor(lvl / every);
}

// The Forge: an equipped item's stats scale by (1 + boost*level).
export function itemWithForge(id, p = getProfile()) {
  const base = DATA.items[id];
  if (!base) return null;
  const lvl = p.forged?.[id] ?? 0;
  if (!lvl) return base;
  const mult = 1 + (DATA.difficulty.forge?.statBoostPerLevel ?? 0.2) * lvl;
  const boosted = { ...base, forgeLvl: lvl };
  for (const k of ['dmg', 'armor', 'hp', 'thorns']) if (boosted[k]) boosted[k] = Math.round(boosted[k] * mult);
  for (const k of ['crit', 'lifesteal', 'dodge']) if (boosted[k]) boosted[k] *= mult;
  return boosted;
}

// Precision crit curve (0.062): +1% per level for 1-10, +0.5% for 11-20,
// +0.2% for 21-30, +0.1% beyond. Diminishing returns; total crit is still
// capped at 60% in derivedStats.
export function precisionCrit(lvl) {
  return 0.01 * Math.min(lvl, 10)
       + 0.005 * Math.min(Math.max(lvl - 10, 0), 10)
       + 0.002 * Math.min(Math.max(lvl - 20, 0), 10)
       + 0.001 * Math.max(lvl - 30, 0);
}

export function derivedStats(p = getProfile()) {
  const gear = equippedItemIds(p.equipment).map((id) => itemWithForge(id, p)).filter(Boolean);
  const gearDmg = gear.reduce((s, g) => s + (g.dmg || 0), 0);
  const gearArmor = gear.reduce((s, g) => s + (g.armor || 0), 0);
  const gearHp = gear.reduce((s, g) => s + (g.hp || 0), 0);
  const lifesteal = gear.reduce((s, g) => s + (g.lifesteal || 0), 0);
  const crit = 0.05 + precisionCrit(trainedLevel(p, 'precision')) + gear.reduce((s, g) => s + (g.crit || 0), 0);

  // T4 relic powers
  const dodge = Math.min(0.35, gear.reduce((s, g) => s + (g.dodge || 0), 0));
  const thorns = gear.reduce((s, g) => s + (g.thorns || 0), 0);
  const heavyCdMax = Math.max(1, 3 - gear.reduce((s, g) => s + (g.heavyCd || 0), 0));
  const revive = gear.some((g) => g.revive);

  return {
    maxHp: 40 + trainedLevel(p, 'vitality') * 9 + gearHp, // 0.072: was 12 — HP stacking out-scaled everything
    dmg: 6 + trainedLevel(p, 'power') * 3 + gearDmg,
    armor: trainedLevel(p, 'endurance') + gearArmor,
    crit: Math.min(0.6, crit),
    lifesteal,
    dodge,
    thorns,
    heavyCdMax,
    revive,
    potions: p.potions,
  };
}

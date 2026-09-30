// meta/leveling.js — spending XP/coins on permanent upgrades.
// Pure functions over the profile; caller persists.
//
// Currency split (0.059): XP buys character disciplines only; coins buy
// potions, alchemy tracks, and Forge item enhancements. The two never mix.

import { getProfile, persist, precisionCrit } from './profile.js';
import { DATA } from '../shared/data.js';

// ---- Disciplines (XP-only) ----

export const STAT_DEFS = {
  power:     { name: 'Power',     key: 'p' },
  vitality:  { name: 'Vitality',  key: 'v' },
  fortune:   { name: 'Fortune',   key: 'f' },
  precision: { name: 'Precision', key: 'r' },
  endurance: { name: 'Endurance', key: 'e' },
};

// Hub line for a discipline, built from difficulty.json `player` (0.079) —
// hand-typed "+3 damage" text went stale the moment the numbers were tuned.
export function statDesc(stat, currentLevel) {
  const pl = DATA.difficulty.player ?? {};
  switch (stat) {
    case 'power': return `+${pl.dmgPerPower ?? 3} damage per level`;
    case 'vitality': return `+${pl.hpPerVitality ?? 9} max HP per level`;
    case 'endurance': return `+${pl.armorPerEndurance ?? 1} armor per level`;
    case 'precision': return precisionDesc(currentLevel);
    default: return 'Better loot drops';
  }
}

// Precision's hub line shows the ACTUAL gain of the next click: the taper
// bands (precisionCrit in profile.js) including ★ breakthrough doubles,
// so a breakthrough click reads "+2%". The taper is self-evident as the
// number changes: +1%, then +0.5%, +0.2%, +0.1%.
export function precisionDesc(currentLevel) {
  const every = DATA.difficulty.breakthroughEvery ?? 5;
  const now = currentLevel + Math.floor(currentLevel / every);
  const after = (currentLevel + 1) + Math.floor((currentLevel + 1) / every);
  const gain = (precisionCrit(after) - precisionCrit(now)) * 100;
  return `increase Crit Chance +${Number(gain.toFixed(1))}%`;
}

export function statCost(currentLevel) {
  return { xp: (DATA.difficulty.statTrainXpBase ?? 15) * (currentLevel + 1) };
}

export function canAfford(stat) {
  const p = getProfile();
  return p.xp >= statCost(p.stats[stat]).xp;
}

// Returns 'breakthrough' when the new level is a doubling milestone,
// true for an ordinary level, false when unaffordable.
export function buyStat(stat) {
  const p = getProfile();
  if (!canAfford(stat)) return false;
  p.xp -= statCost(p.stats[stat]).xp;
  p.stats[stat] += 1;
  persist();
  const every = DATA.difficulty.breakthroughEvery ?? 5;
  return p.stats[stat] % every === 0 ? 'breakthrough' : true;
}

// ---- Potions (coins) ----

// Potion price escalates per potion BOUGHT (profile.potionsBought):
// first 20c, then 40c, 60c, ... — base + step * bought, from difficulty.json.
export function potionCost() {
  const p = getProfile();
  const d = DATA.difficulty;
  return (d.potionBasePrice ?? 20) + (d.potionPriceStep ?? 20) * (p.potionsBought ?? 0);
}

export function restockPotion() {
  const p = getProfile();
  const cost = potionCost();
  if (p.coins < cost) return false;
  p.coins -= cost;
  p.potions += 1;
  p.potionsBought = (p.potionsBought ?? 0) + 1;
  persist();
  return true;
}

// ---- Alchemy tracks (coins) ----

export const ALCHEMY_DEFS = {
  potency:    { name: 'Potency',    key: 'a' },
  efficiency: { name: 'Efficiency', key: 'y' },
  infusion:   { name: 'Infusion',   key: 'n' },
};

function trackData(track) {
  return DATA.difficulty.alchemyTracks?.[track] ?? {};
}

export function alchemyCost(track) {
  const p = getProfile();
  return (trackData(track).base ?? 60) * ((p.alchemy[track] ?? 0) + 1);
}

export function trainAlchemy(track) {
  const p = getProfile();
  const cost = alchemyCost(track);
  if (p.coins < cost) return false;
  p.coins -= cost;
  p.alchemy[track] = (p.alchemy[track] ?? 0) + 1;
  persist();
  return true;
}

export function potionHealAmount() {
  const p = getProfile();
  return (DATA.difficulty.potionHeal ?? 30)
    + (p.alchemy.potency ?? 0) * (trackData('potency').healPerLevel ?? 5);
}

// Chance a drunk potion is not consumed.
export function efficiencyChance() {
  const p = getProfile();
  const t = trackData('efficiency');
  return Math.min(t.cap ?? 0.4, (p.alchemy.efficiency ?? 0) * (t.chancePerLevel ?? 0.08));
}

// Temporary armor granted per potion (lasts until the room ends).
export function infusionArmor() {
  const p = getProfile();
  return (p.alchemy.infusion ?? 0) * (trackData('infusion').armorPerLevel ?? 2);
}

// ---- The Forge (coins): enhance equipped items ----

export function forgeCost(itemId) {
  const p = getProfile();
  const item = DATA.items[itemId];
  const f = DATA.difficulty.forge ?? {};
  const lvl = p.forged[itemId] ?? 0;
  return ((f.baseCost ?? 50) + (f.costPerTier ?? 50) * (item.tier - 1)) * (lvl + 1);
}

export function forgeMaxed(itemId) {
  const p = getProfile();
  return (p.forged[itemId] ?? 0) >= (DATA.difficulty.forge?.maxLevel ?? 3);
}

export function forgeItem(itemId) {
  const p = getProfile();
  if (!DATA.items[itemId] || forgeMaxed(itemId)) return false;
  if ((DATA.items[itemId].tier ?? 1) < 2) return false; // tier 1 gear is not forgeable (0.068)
  const cost = forgeCost(itemId);
  if (p.coins < cost) return false;
  p.coins -= cost;
  p.forged[itemId] = (p.forged[itemId] ?? 0) + 1;
  persist();
  return true;
}

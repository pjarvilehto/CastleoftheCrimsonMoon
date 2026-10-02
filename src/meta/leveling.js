// meta/leveling.js — spending XP/coins on permanent upgrades.
// Pure functions over the profile; caller persists.
//
// Currency split (0.059): XP buys character disciplines only; coins buy
// potions, alchemy tracks, and Forge item enhancements. The two never mix.

import { getProfile, persist } from './profile.js';
import { precisionCrit, taper, itemWithForge, effectiveLevel } from './stats.js';
import { equippedItemIds } from './equipment.js';
import { DATA } from '../shared/data.js';

// ---- Disciplines (XP-only) ----

export const STAT_DEFS = {
  power:     { name: 'Power',     key: 'p' },
  vitality:  { name: 'Vitality',  key: 'v' },
  fortune:   { name: 'Fortune',   key: 'f' },
  precision: { name: 'Precision', key: 'r' },
  endurance: { name: 'Endurance', key: 'e' },
};

// What the next Precision level adds (0.116: numbers here, the hub's
// wording in ui/hubText.js): crit chance by the taper (stats.precisionCrit)
// including ★ breakthrough doubles, but never past the crit cap with gear;
// crit damage = Precision's own per level (0.113) + any chance past the cap
// (0.112).
export function precisionGain(currentLevel) {
  const now = effectiveLevel(currentLevel);
  const after = effectiveLevel(currentLevel + 1);
  const pl = DATA.difficulty.player;
  const gain = precisionCrit(after) - precisionCrit(now);
  const room = Math.max(0, pl.critCap - critBeforePrecision() - precisionCrit(now)); // chance left under the cap
  return {
    chance: Math.min(gain, room),
    critDamage: (after - now) * pl.critDamagePerPrecision + Math.max(0, gain - room) * pl.critOverflowDamage,
  };
}

// Base crit + gear crit (what Precision adds on top of).
function critBeforePrecision(p = getProfile()) {
  return DATA.difficulty.player.baseCrit
    + equippedItemIds(p.equipment).reduce((s, id) => s + (itemWithForge(id, p)?.crit || 0), 0);
}

export function statCost(currentLevel) {
  return { xp: DATA.difficulty.statTrainXpBase * (currentLevel + 1) };
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
  const every = DATA.difficulty.breakthroughEvery;
  return p.stats[stat] % every === 0 ? 'breakthrough' : true;
}

// ---- Potions (coins) ----

// 0.080: potions are a persistent stock capped by the satchel
// (profile.potionCap). They're consumables now, so the price is flat — the
// old escalating price only made sense when a purchase was permanent.
const POT = () => DATA.difficulty.potions;

export function potionCost() {
  return POT().price;
}

export function satchelFull(p = getProfile()) {
  return p.potions >= p.potionCap;
}

export function restockPotion() {
  const p = getProfile();
  const cost = potionCost();
  if (p.coins < cost || satchelFull(p)) return false;
  p.coins -= cost;
  p.potions += 1;
  persist();
  return true;
}

// Satchel upgrades: +1 potion cap each, priced base * growth^upgradesSoFar
// (300, 600, 1200, ...) — a deliberately expensive long-term coin sink.
export function satchelCost(p = getProfile()) {
  const pc = POT();
  const upgrades = p.potionCap - pc.startCap;
  return Math.round(pc.capUpgradeBase * Math.pow(pc.capUpgradeGrowth, Math.max(0, upgrades)));
}

export function satchelMaxed(p = getProfile()) {
  return p.potionCap >= POT().maxCap;
}

export function expandSatchel() {
  const p = getProfile();
  const cost = satchelCost(p);
  if (satchelMaxed(p) || p.coins < cost) return false;
  p.coins -= cost;
  p.potionCap += 1;
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
  return DATA.difficulty.alchemyTracks[track];
}

export function alchemyCost(track) {
  const p = getProfile();
  return trackData(track).base * ((p.alchemy[track] ?? 0) + 1);
}

export function trainAlchemy(track) {
  const p = getProfile();
  const cost = alchemyCost(track);
  if (p.coins < cost || alchemyMaxed(track)) return false;
  p.coins -= cost;
  p.alchemy[track] = (p.alchemy[track] ?? 0) + 1;
  persist();
  return true;
}

export function potionHealAmount() {
  const p = getProfile();
  return DATA.difficulty.potionHeal
    + (p.alchemy.potency ?? 0) * trackData('potency').healPerLevel;
}

// Chance a drunk potion is not consumed. 0.112: tapers (stats.taper:
// +8% for the first 3 levels, then smaller and smaller steps toward the
// track's max) — it used to stop dead at 40% while the price kept rising.
export function efficiencyChance(level = getProfile().alchemy.efficiency ?? 0) {
  const t = trackData('efficiency');
  return taper(level, { perLevel: t.perLevel, linear: t.linear, tail: t.tail, max: t.max });
}

// A track whose next level would add (almost) nothing shows MAX instead of
// taking coins for it (0.113; potency/infusion are linear and never max).
export function alchemyMaxed(track) {
  if (track !== 'efficiency') return false;
  const lvl = getProfile().alchemy.efficiency ?? 0;
  return efficiencyChance(lvl + 1) - efficiencyChance(lvl) < trackData('efficiency').minStep;
}

// Temporary armor granted per potion (lasts until the room ends).
export function infusionArmor() {
  const p = getProfile();
  return (p.alchemy.infusion ?? 0) * trackData('infusion').armorPerLevel;
}

// ---- The Forge (coins): enhance equipped items ----

export function forgeCost(itemId) {
  const p = getProfile();
  const item = DATA.items[itemId];
  const f = DATA.difficulty.forge;
  const lvl = p.forged[itemId] ?? 0;
  return (f.baseCost + f.costPerTier * (item.tier - 1)) * (lvl + 1);
}

export function forgeMaxed(itemId) {
  const p = getProfile();
  return (p.forged[itemId] ?? 0) >= DATA.difficulty.forge.maxLevel;
}

export function forgeItem(itemId) {
  const p = getProfile();
  if (!DATA.items[itemId] || forgeMaxed(itemId)) return false;
  if (!forgeable(itemId)) return false; // tier 1 gear is not forgeable (0.068)
  const cost = forgeCost(itemId);
  if (p.coins < cost) return false;
  p.coins -= cost;
  p.forged[itemId] = (p.forged[itemId] ?? 0) + 1;
  persist();
  return true;
}

// Tier 1 is never forged (0.00197: one rule; it used to be spelled out in three places).
export const forgeable = (id) => DATA.items[id]?.tier > 1;

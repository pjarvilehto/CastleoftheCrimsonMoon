// meta/leveling.js — spending XP/coins on permanent upgrades.
// Pure functions over the profile; caller persists.
//
// Currency split (0.059): XP buys character disciplines only; coins buy
// potions, alchemy tracks, and Forge item enhancements. The two never mix.

import { getProfile, persist, precisionCrit, taper } from './profile.js';
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
    case 'vitality': return `+${pl.hpPerVitality ?? 90} max HP per level`;
    case 'endurance': return `+${pl.armorPerEndurance ?? 10} armor per level`;
    case 'precision': return precisionDesc(currentLevel);
    default: return 'Better loot drops';
  }
}

// Precision's hub line shows the ACTUAL gain of the next click: the taper
// (precisionCrit in profile.js) including ★ breakthrough doubles, so a
// breakthrough click reads double. Once crit chance (with gear) is at the
// cap, the next click shows the crit DAMAGE it adds instead (0.112).
const pct = (x) => `${Number((x * 100).toFixed(1))}%`;
export function precisionDesc(currentLevel) {
  const every = DATA.difficulty.breakthroughEvery ?? 5;
  const now = currentLevel + Math.floor(currentLevel / every);
  const after = (currentLevel + 1) + Math.floor((currentLevel + 1) / every);
  const pl = DATA.difficulty.player ?? {};
  const gain = precisionCrit(after) - precisionCrit(now);
  const room = Math.max(0, (pl.critCap ?? 0.6) - critBeforePrecision() - precisionCrit(now)); // chance left under the cap
  const chance = Math.min(gain, room);
  // crit damage: Precision's own per level (0.113) + any chance past the cap
  const dmg = (after - now) * (pl.critDamagePerPrecision ?? 0.01) + Math.max(0, gain - room) * (pl.critOverflowDamage ?? 1.5);
  if (chance >= 0.0005) return `Crit Chance +${pct(chance)}, crit damage +${pct(dmg)}`;
  return `crit chance maxed: crit damage +${pct(dmg)}`;
}

// Base crit + gear crit (what Precision adds on top of).
function critBeforePrecision(p = getProfile()) {
  const gear = Object.values(p.equipment ?? {}).flat().filter(Boolean);
  return (DATA.difficulty.player?.baseCrit ?? 0.05) + gear.reduce((s, id) => s + critOf(id, p), 0);
}
function critOf(id, p) {
  const it = DATA.items[id];
  if (!it?.crit) return 0;
  return it.crit * (1 + (DATA.difficulty.forge?.statBoostPerLevel ?? 0.2) * (p.forged?.[id] ?? 0));
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

// 0.080: potions are a persistent stock capped by the satchel
// (profile.potionCap). They're consumables now, so the price is flat — the
// old escalating price only made sense when a purchase was permanent.
const POT = () => DATA.difficulty.potions ?? {};

export function potionCost() {
  return POT().price ?? 30;
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
  const upgrades = p.potionCap - (pc.startCap ?? 4);
  return Math.round((pc.capUpgradeBase ?? 300) * Math.pow(pc.capUpgradeGrowth ?? 2, Math.max(0, upgrades)));
}

export function satchelMaxed(p = getProfile()) {
  return p.potionCap >= (POT().maxCap ?? 10);
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
  return DATA.difficulty.alchemyTracks?.[track] ?? {};
}

export function alchemyCost(track) {
  const p = getProfile();
  return (trackData(track).base ?? 60) * ((p.alchemy[track] ?? 0) + 1);
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
  return (DATA.difficulty.potionHeal ?? 300)
    + (p.alchemy.potency ?? 0) * (trackData('potency').healPerLevel ?? 50);
}

// Chance a drunk potion is not consumed. 0.112: tapers (profile.taper:
// +8% for the first 3 levels, then smaller and smaller steps toward the
// track's max) — it used to stop dead at 40% while the price kept rising.
export function efficiencyChance(level = getProfile().alchemy.efficiency ?? 0) {
  const t = trackData('efficiency');
  return taper(level, { perLevel: t.perLevel ?? 0.08, linear: t.linear ?? 3, tail: t.tail ?? 1.5, max: t.max });
}

// Hub line: now and what the next level adds.
export function efficiencyDesc() {
  const lvl = getProfile().alchemy.efficiency ?? 0;
  const now = efficiencyChance(lvl);
  if (alchemyMaxed('efficiency')) return `chance a potion is not consumed (${Math.round(now * 100)}%, max)`;
  return `chance a potion is not consumed (now ${Math.round(now * 100)}%, next +${pct(efficiencyChance(lvl + 1) - now)})`;
}

// A track whose next level would add (almost) nothing shows MAX instead of
// taking coins for it (0.113; potency/infusion are linear and never max).
export function alchemyMaxed(track) {
  if (track !== 'efficiency') return false;
  const lvl = getProfile().alchemy.efficiency ?? 0;
  return efficiencyChance(lvl + 1) - efficiencyChance(lvl) < (trackData('efficiency').minStep ?? 0.0005);
}

// Temporary armor granted per potion (lasts until the room ends).
export function infusionArmor() {
  const p = getProfile();
  return (p.alchemy.infusion ?? 0) * (trackData('infusion').armorPerLevel ?? 20);
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

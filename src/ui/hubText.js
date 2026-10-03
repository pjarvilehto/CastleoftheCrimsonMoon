// ui/hubText.js — the Great Hall's upgrade lines (0.116: moved out of
// meta/leveling.js, which now only computes the numbers). Built from the
// data, never hand-typed — "+3 damage" text went stale the moment the
// numbers were tuned (0.079).

import { DATA } from '../shared/data.js';
import { getProfile } from '../meta/profile.js';
import { precisionGain, efficiencyChance, alchemyMaxed, potionHealFor, infusionArmor } from '../meta/leveling.js';
import { heroOf } from '../shared/heroes.js';

const pct = (x) => `${Number((x * 100).toFixed(1))}%`;

// short (0.00208): the phone's wording — the same numbers in a 45%-wide
// sheet (hubScene's phone assembly); the desktop keeps the sentences.
// 0.00232 (the developer's ask): every line is the small, muted text under a
// row's title (name + level, hubSections.js rowText) — compact, the
// level never repeated here.
export function statDesc(stat, currentLevel, short = false) {
  const pl = DATA.difficulty.player;
  switch (stat) {
    case 'power': return short ? `+${pl.dmgPerPower} dmg / lv` : `+${pl.dmgPerPower} damage / level`;
    case 'vitality': return short ? `+${pl.hpPerVitality} hp / lv` : `+${pl.hpPerVitality} max HP / level`;
    case 'endurance': return short ? `+${pl.armorPerEndurance} armor / lv` : `+${pl.armorPerEndurance} armor / level`;
    case 'precision': return precisionDesc(currentLevel, short);
    default: return short ? 'better loot' : 'Better loot drops';
  }
}

// The ACTUAL gain of the next click (a breakthrough click reads double);
// once crit chance is at the cap, only the crit damage it adds.
export function precisionDesc(currentLevel, short = false) {
  const { chance, critDamage } = precisionGain(currentLevel);
  if (chance >= 0.0005) return short ? `+${pct(chance)} crit, +${pct(critDamage)} crit dmg` : `+${pct(chance)} crit chance, +${pct(critDamage)} crit damage`;
  return short ? `crit maxed: +${pct(critDamage)} crit dmg` : `crit chance maxed · +${pct(critDamage)} crit damage`;
}

// Efficiency: now and what the next level adds.
export function efficiencyDesc(short = false) {
  const lvl = getProfile().alchemy.efficiency ?? 0;
  const now = efficiencyChance(lvl);
  if (alchemyMaxed('efficiency')) return short ? `potion not spent: ${Math.round(now * 100)}% (max)` : `${Math.round(now * 100)}% chance to keep a potion (max)`;
  const next = pct(efficiencyChance(lvl + 1) - now);
  return short ? `potion not spent: ${Math.round(now * 100)}% (+${next})` : `${Math.round(now * 100)}% chance to keep a potion (next +${next})`;
}

// The alchemy rows' other lines, long and short.
export function alchemyDesc(track, short = false) {
  const t = DATA.difficulty.alchemyTracks;
  if (track === 'potency') return short ? `+${t.potency.healPerLevel} heal / lv (now ${potionHealFor(heroOf(getProfile()).class)})` : `+${t.potency.healPerLevel} healing / level (now ${potionHealFor(heroOf(getProfile()).class)} HP)`;
  if (track === 'infusion') return short ? `potion armor +${infusionArmor()} (+${t.infusion.armorPerLevel} / lv)` : `potion armor +${infusionArmor()} for the room (+${t.infusion.armorPerLevel} / level)`;
  return efficiencyDesc(short);
}
// (0.00232: the count is the row's title, potionCount; this is the small line under it)
export const potionCount = (p) => `${p.potions}/${p.potionCap}`;
export function potionDesc(p, short = false) {
  return short ? 'price climbs per buy' : 'kept between runs · price resets each run';
}
export function satchelDesc(p, maxed, short = false) {
  if (maxed) return short ? `carries ${p.potionCap} (max)` : `holds ${p.potionCap} potions (max)`;
  return short ? `+1 capacity (now ${p.potionCap})` : `+1 capacity (now ${p.potionCap})`;
}

// The lifetime records, one line (the hub's RECORDS panel, the phone hall's
// foot, the title's welcome — one copy, 0.00209).
export const recordsLine = (p) => `${p.records.runs} runs, ${p.records.kills} kills, deepest room ${p.records.bestRoom}.`;

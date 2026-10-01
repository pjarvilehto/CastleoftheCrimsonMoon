// ui/hubText.js — the Great Hall's upgrade lines (0.116: moved out of
// meta/leveling.js, which now only computes the numbers). Built from the
// data, never hand-typed — "+3 damage" text went stale the moment the
// numbers were tuned (0.079).

import { DATA } from '../shared/data.js';
import { getProfile } from '../meta/profile.js';
import { precisionGain, efficiencyChance, alchemyMaxed } from '../meta/leveling.js';

const pct = (x) => `${Number((x * 100).toFixed(1))}%`;

export function statDesc(stat, currentLevel) {
  const pl = DATA.difficulty.player;
  switch (stat) {
    case 'power': return `+${pl.dmgPerPower} damage per level`;
    case 'vitality': return `+${pl.hpPerVitality} max HP per level`;
    case 'endurance': return `+${pl.armorPerEndurance} armor per level`;
    case 'precision': return precisionDesc(currentLevel);
    default: return 'Better loot drops';
  }
}

// The ACTUAL gain of the next click (a breakthrough click reads double);
// once crit chance is at the cap, only the crit damage it adds.
export function precisionDesc(currentLevel) {
  const { chance, critDamage } = precisionGain(currentLevel);
  if (chance >= 0.0005) return `Crit Chance +${pct(chance)}, crit damage +${pct(critDamage)}`;
  return `crit chance maxed: crit damage +${pct(critDamage)}`;
}

// Efficiency: now and what the next level adds.
export function efficiencyDesc() {
  const lvl = getProfile().alchemy.efficiency ?? 0;
  const now = efficiencyChance(lvl);
  if (alchemyMaxed('efficiency')) return `chance a potion is not consumed (${Math.round(now * 100)}%, max)`;
  return `chance a potion is not consumed (now ${Math.round(now * 100)}%, next +${pct(efficiencyChance(lvl + 1) - now)})`;
}

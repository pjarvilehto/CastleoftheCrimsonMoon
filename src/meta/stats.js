// meta/stats.js — what the profile adds up to (split out of profile.js in
// 0.116): the character level, trained levels with breakthroughs, the
// Forge's boost on gear, the shared taper for capped upgrades, and the
// derived combat stats a run snapshots at the door. Pure reads of the
// profile + the data; nothing here saves.

import { DATA } from '../shared/data.js';
import { levelFromStats } from '../shared/level.js';
import { equippedItemIds } from './equipment.js';
import { getProfile } from './profile.js';

// Character level: one per five trained discipline levels (shown on the
// combat card and in the Great Hall, 0.080).
export function playerLevel(p = getProfile()) {
  return levelFromStats(p.stats, DATA.difficulty.levelEvery);
}

// ---- derived combat stats (base + permanent levels + gear) ----

// Breakthroughs: every 5th trained level in a discipline counts double.
// Level 12 therefore lands as 14 effective levels.
export const effectiveLevel = (lvl) => lvl + Math.floor(lvl / DATA.difficulty.breakthroughEvery);
export function trainedLevel(p, stat) {
  return effectiveLevel(p.stats[stat] ?? 0);
}

// The Forge: an equipped item's stats scale by (1 + boost*level).
export function itemWithForge(id, p = getProfile()) {
  const base = DATA.items[id];
  if (!base) return null;
  const lvl = p.forged?.[id] ?? 0;
  if (!lvl) return base;
  const mult = 1 + DATA.difficulty.forge.statBoostPerLevel * lvl;
  const boosted = { ...base, forgeLvl: lvl };
  for (const k of ['dmg', 'armor', 'hp', 'thorns']) if (boosted[k]) boosted[k] = Math.round(boosted[k] * mult);
  for (const k of ['crit', 'lifesteal', 'dodge']) if (boosted[k]) boosted[k] *= mult;
  return boosted;
}

// Player base stats + per-level gains (difficulty.json `player`, 0.078).
const P = () => DATA.difficulty.player;

// Diminishing returns (0.112): `perLevel` for each of the first `linear`
// levels, then every further level closes a share of the remaining gap to
// `max` — each level still adds something, a little less than the one
// before, and the total never passes `max`. (Efficiency used to hit a hard
// cap at level 5 and keep charging for nothing.)
// Without a `rate`, the taper is smooth: its first step equals `perLevel`
// and every later one shrinks by the same ratio (no cliff after `linear`).
// With `tail` (0.113) the steps instead shrink like a power law —
// perLevel * (linear / L)^tail — a long tail that still adds visibly at
// level 80 (the geometric fall was ~0 by level 40); `max` (optional) is then
// a hard ceiling.
export function taper(level, { perLevel = 0, linear = 0, max = Infinity, rate, tail } = {}) {
  const L = Math.max(0, Math.floor(level));
  const head = perLevel * Math.min(L, linear);
  if (L <= linear) return head;
  if (tail) {
    let total = head;
    for (let k = linear + 1; k <= L; k++) total += perLevel * (linear / k) ** tail;
    return Math.min(max, total);
  }
  const gap = Math.max(0, max - perLevel * linear);
  const r = rate ?? Math.min(1, gap > 0 ? perLevel / gap : 1);
  return head + gap * (1 - (1 - r) ** (L - linear));
}

// Precision -> crit chance (0.062 bands; 0.112 a taper in difficulty.json
// player.precisionTaper — the bands fell to +0.1%/level after 30 levels,
// worth ~1/5 of Power for the same XP in tools/stat-study.mjs).
export function precisionCrit(lvl) {
  return taper(lvl, P().precisionTaper);
}

export function derivedStats(p = getProfile()) {
  const gear = equippedItemIds(p.equipment).map((id) => itemWithForge(id, p)).filter(Boolean);
  const gearDmg = gear.reduce((s, g) => s + (g.dmg || 0), 0);
  const gearArmor = gear.reduce((s, g) => s + (g.armor || 0), 0);
  const gearHp = gear.reduce((s, g) => s + (g.hp || 0), 0);
  const lifesteal = gear.reduce((s, g) => s + (g.lifesteal || 0), 0);
  const pl = P();
  const crit = pl.baseCrit + precisionCrit(trainedLevel(p, 'precision')) + gear.reduce((s, g) => s + (g.crit || 0), 0);
  const critCap = pl.critCap;

  // T4 relic powers
  const dodge = Math.min(pl.dodgeCap, gear.reduce((s, g) => s + (g.dodge || 0), 0));
  const thorns = gear.reduce((s, g) => s + (g.thorns || 0), 0);
  const heavyCdMax = Math.max(1, pl.baseHeavyCd - gear.reduce((s, g) => s + (g.heavyCd || 0), 0));
  const revive = gear.some((g) => g.revive);

  return {
    // 0.072: hpPerVitality was 12 — HP stacking out-scaled everything
    maxHp: pl.baseHp + trainedLevel(p, 'vitality') * pl.hpPerVitality + gearHp,
    dmg: pl.baseDmg + trainedLevel(p, 'power') * pl.dmgPerPower + gearDmg,
    armor: trainedLevel(p, 'endurance') * pl.armorPerEndurance + gearArmor,
    crit: Math.min(critCap, crit),
    // 0.112: crit chance past the cap isn't lost — it becomes crit damage
    // (critOverflowDamage x the excess, added to the crit multiplier)
    // + (0.113) Precision's own crit damage: a flat bit per trained level,
    // so late Precision levels never stop counting
    critBonus: Math.max(0, crit - critCap) * pl.critOverflowDamage
      + trainedLevel(p, 'precision') * pl.critDamagePerPrecision,
    lifesteal,
    dodge,
    thorns,
    heavyCdMax,
    revive,
    // Fortune: the loot bonus (a share added to drop chances and coin
    // rolls) — snapshotted like the rest, read by run/loot.js and treasure.js
    fortuneBonus: trainedLevel(p, 'fortune') * DATA.difficulty.fortuneLootBonus,
    potions: p.potions,
    potionCap: p.potionCap,
  };
}

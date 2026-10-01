// shared/dataCheck.js — the tuning the code reads, checked once at load
// (0.116). Since 0.079 every balance number lives in assets/data/*.json,
// but the code used to carry its own `?? N` fallback copies of them —
// copies that silently drifted (the boss multipliers and the T4 drop
// chance still had pre-0.092 values). The fallbacks are gone; instead
// this list names every number the code reads, and a missing or
// non-numeric one is reported at boot (console) and fails the smoke suite.
// New knob in the data? Add its path here.

const NUM = {
  difficulty: [
    'hpGrowth', 'dmgGrowth', 'xpGrowth', 'maxEnemies', 'spillThreshold', 'bossEvery', 'potionHeal',
    'statTrainXpBase', 'breakthroughEvery', 'deathCoinToll', 'logDelayMs', 't4Chance', 't4MinRoom',
    'potionDropChance', 'eliteMinHp', 'tier2LootMinHp', 'fortuneLootBonus',
    ...['startCount', 'startCap', 'maxCap', 'price', 'capUpgradeBase', 'capUpgradeGrowth', 'fullSatchelSellCoins'].map((k) => `potions.${k}`),
    'alchemyTracks.potency.base', 'alchemyTracks.potency.healPerLevel',
    ...['base', 'perLevel', 'linear', 'tail', 'minStep'].map((k) => `alchemyTracks.efficiency.${k}`),
    'alchemyTracks.infusion.base', 'alchemyTracks.infusion.armorPerLevel',
    ...['baseCost', 'costPerTier', 'statBoostPerLevel', 'maxLevel'].map((k) => `forge.${k}`),
    ...['playerAttackMs', 'heavyAttackMs', 'enemyAttackMs', 'summonMs'].map((k) => `combatPacing.${k}`),
    'boss.depthBonus', 'boss.hpMult', 'boss.dmgMult',
    ...['every', 'maxAlive', 'hpScale', 'dmgScale', 'depthBonus'].map((k) => `boss.summon.${k}`),
    ...['baseHp', 'hpPerVitality', 'baseDmg', 'dmgPerPower', 'armorPerEndurance', 'baseCrit', 'critCap',
      'critOverflowDamage', 'critDamagePerPrecision', 'dodgeCap', 'baseHeavyCd', 'reviveHpPct'].map((k) => `player.${k}`),
    'player.precisionTaper.perLevel', 'player.precisionTaper.linear', 'player.precisionTaper.max',
    ...['heavyMult', 'critMult', 'critJitter', 'megaCritChance', 'megaCritMult', 'armorMinTakenPct', 'enemyDmgJitter'].map((k) => `combat.${k}`),
    ...['tier', 'dmg', 'armor', 'hp', 'lifesteal', 'crit'].map((k) => `itemValue.${k}`),
  ],
  shrines: ['coinCostGrowthPerRoom', 'minMaxHp', 'minDmg'],
  audio: [
    'musicLevel', 'sfxLevel', 'pan.width', 'music.fadeS',
    ...['threshold', 'knee', 'ratio', 'attack', 'release'].map((k) => `limiter.${k}`),
    'duck.db', 'duck.attack', 'duck.release',
    'sweeteners.crit.ringDb', 'sweeteners.mega.ringDb', 'sweeteners.mega.deepDb', 'sweeteners.mega.deepRate', 'sweeteners.overkill.boomDb',
  ],
  backgrounds: ['parallax.swayHitShare'],
};

const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Problems in `data` (the DATA singleton): [] when everything is there.
export function checkData(data) {
  const out = [];
  for (const [file, paths] of Object.entries(NUM)) {
    for (const p of paths) if (!isNum(at(data[file], p))) out.push(`${file}.json: ${p} missing or not a number`);
  }
  // per-entry numbers: every item has a tier, every clip a trim, every
  // shrine boon the numbers its case in run/shrine.js reads
  for (const [id, it] of Object.entries(data.items ?? {})) if (!isNum(it?.tier)) out.push(`items.json: ${id}.tier`);
  for (const [id, c] of Object.entries(data.audio?.clips ?? {})) {
    if (!isNum(c?.gainDb)) out.push(`audio.json: clips.${id}.gainDb`);
    if (!c?.file === !c?.synth) out.push(`audio.json: clips.${id} needs a file or synth: true (one of them)`);
    if (c?.rate && !(c.rate.length === 2 && c.rate.every(isNum))) out.push(`audio.json: clips.${id}.rate`);
  }
  for (const [id, t] of Object.entries(data.audio?.music?.tracks ?? {})) {
    if (typeof t?.file !== 'string' || !['loopS', 'tailS', 'gainDb'].every((k) => isNum(t[k]))) out.push(`audio.json: music.tracks.${id} (file, loopS, tailS, gainDb)`);
  }
  for (const [id, v] of Object.entries(data.audio?.variation ?? {})) {
    if (v.eq && !['lo', 'hi', 'db', 'q'].every((k) => isNum(v.eq[k]))) out.push(`audio.json: variation.${id}.eq`);
  }
  const NEEDS = { armor: ['potionCost', 'armorMin', 'armorMult'], bulwark: ['armorPct', 'armorAdd', 'dmgCostPct'], glasscannon: ['minArmor', 'dmgMult', 'armorCostPct'] };
  for (const o of data.shrines?.offers ?? []) {
    for (const k of NEEDS[o.id] ?? []) if (!isNum(o[k])) out.push(`shrines.json: ${o.id}.${k}`);
  }
  return out;
}

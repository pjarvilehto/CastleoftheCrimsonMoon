// shared/dataCheck.js — the tuning the code reads, checked once at load
// (0.116). Since 0.079 every balance number lives in assets/data/*.json,
// but the code used to carry its own `?? N` fallback copies of them —
// copies that silently drifted (the boss multipliers and the T4 drop
// chance still had pre-0.092 values). The fallbacks are gone; instead
// this list names every number the code reads, and a missing or
// non-numeric one is reported at boot (console) and fails the smoke suite.
// New knob in the data? Add its path here.

import { compareVersions } from './version.js';

const NUM = {
  difficulty: [
    'hpGrowth', 'dmgGrowth', 'xpGrowth', 'tierRooms', 'budgetBase', 'budgetPerRoom', 'enemyCost.1', 'enemyCost.2', 'enemyCost.3',
    'maxEnemies', 'spillThreshold', 'bossEvery', 'finalBossRoom', 'shrineRoomRange.0', 'shrineRoomRange.1', 'dropChance', 'potionHeal', 'lowHpShare',
    'statTrainXpBase', 'levelEvery', 'breakthroughEvery', 'deathCoinToll', 'logDelayMs', 't4Chance', 't4MinRoom',
    'potionDropChance', 'eliteMinHp', 'tier2LootMinHp', 'fortuneLootBonus', 'salvagePerTier',
    ...['chance', 'unlockRoom', 'minRoom', 'coffer.fights.0', 'coffer.fights.1', 'gilded.tier3Room', 'gilded.tierBefore', 'gilded.tierFrom', 'reliquary.hpCost', 'reliquary.relicChance', 'reliquary.itemTier'].map((k) => `treasure.${k}`),
    ...['startCount', 'startCap', 'maxCap', 'priceStep', 'capUpgradeBase', 'capUpgradeGrowth', 'fullSatchelSellCoins', 'lowShareHud'].map((k) => `potions.${k}`), // (priceSteps: the whole list, below; lowShare went with hubScene.potionsLow, 0.00223)
    'alchemyTracks.potency.base', 'alchemyTracks.potency.healPerLevel',
    ...['base', 'perLevel', 'linear', 'tail', 'minStep'].map((k) => `alchemyTracks.efficiency.${k}`),
    'alchemyTracks.infusion.base', 'alchemyTracks.infusion.armorPerLevel',
    ...['baseCost', 'costPerTier', 'statBoostPerLevel', 'maxLevel'].map((k) => `forge.${k}`),
    ...['playerAttackMs', 'heavyAttackMs', 'enemyAttackMs', 'summonMs', 'restackMs', 'deathMaxMs'].map((k) => `combatPacing.${k}`),
    'boss.depthBonus', 'boss.hpMult', 'boss.dmgMult',
    ...['every', 'maxAlive', 'hpScale', 'dmgScale', 'depthBonus'].map((k) => `boss.summon.${k}`),
    ...['baseHp', 'hpPerVitality', 'baseDmg', 'dmgPerPower', 'armorPerEndurance', 'baseCrit', 'critCap',
      'critOverflowDamage', 'critDamagePerPrecision', 'dodgeCap', 'baseHeavyCd', 'reviveHpPct'].map((k) => `player.${k}`),
    'player.precisionTaper.perLevel', 'player.precisionTaper.linear', 'player.precisionTaper.max',
    ...['heavyMult', 'critMult', 'critJitter', 'megaCritChance', 'megaCritMult', 'armorMinTakenPct', 'enemyDmgJitter'].map((k) => `combat.${k}`),
    ...['tier', 'dmg', 'armor', 'hp', 'lifesteal', 'crit'].map((k) => `itemValue.${k}`),
  ],
  shrines: ['coinCostGrowthPerRoom', 'minMaxHp', 'minDmg', 'dealCount'],
  audio: [
    'musicLevel', 'sfxLevel', 'pan.width', 'music.fadeS', 'transition.peakAtMs', 'volumes.master', 'volumes.music', 'volumes.sfx',
    'voices.maxPerClip', 'voices.maxTotal', 'voices.retriggerMs', 'voices.stackDb',
    ...['threshold', 'knee', 'ratio', 'attack', 'release'].map((k) => `limiter.${k}`),
    'duck.db', 'duck.attack', 'duck.release',
    'sweeteners.crit.ringDb', 'sweeteners.mega.ringDb', 'sweeteners.mega.ringRate', 'sweeteners.mega.deepDb', 'sweeteners.mega.deepRate', 'sweeteners.overkill.boomDb',
    ...['targetDb', 'gapS', 'maxWaitS', 'roomEntryDelayMs', 'combatDelayMs'].map((k) => `narration.${k}`),
  ],
  backgrounds: [
    ...['depthScale', 'pivot', 'yawDeg', 'pitchDeg', 'yawPeriodS', 'pitchPeriodS', 'speed', 'joltDeg', 'swayDeg', 'swayHitShare', 'fovDeg', 'overscan',
      'grid.0', 'grid.1', 'maxFps', 'motionMaxFps', 'fadeMs', 'maxPixels', 'minFps', 'fog', 'fogScale', 'fogSpeed', 'fogWind.0', 'fogWind.1', 'fogWind.2', 'fogFadeMs',
      'maxDpr', 'lights.dist', 'lights.radius', 'lights.rise', 'quality.windowMs', 'quality.gapMs', 'quality.slowWindows', 'quality.reachShare',
      'puffDiv', 'phone.maxDpr', 'phone.maxFps', 'phone.motionMaxFps', 'phone.puffDiv'].map((k) => `parallax.${k}`),
    ...['count', 'size.0', 'size.1', 'y.0', 'y.1', 'width', 'near', 'far', 'nearBand', 'farBand', 'soft', 'opacity',
      'drift.0', 'drift.1', 'rock.0', 'rock.1', 'period.0', 'period.1', 'bob', 'breathe', 'shadeVar.0', 'shadeVar.1', 'alphaVar.0', 'alphaVar.1',
      'turbulence', 'turbulencePeriod', 'pulse', 'pulsePeriod', 'flow', 'flowScale', 'flowAmount'].map((k) => `parallax.puffs.${k}`),
    ...['shade', 'litTint.0', 'litTint.1', 'litTint.2', 'shadeTint.0', 'shadeTint.1', 'shadeTint.2', 'sceneLight', 'nearBright'].map((k) => `parallax.mist.${k}`),
    ...['density', 'curve', 'high', 'strength', 'max'].map((k) => `parallax.haze.${k}`),
    'parallax.push.dist', 'parallax.push.inMs', 'parallax.push.outMs',
    ...['crit', 'megacrit', 'overkill', 'potion', 'revive'].flatMap((kind) =>
      ['color.0', 'color.1', 'color.2', 'strength', 'fade', 'life'].map((k) => `parallax.lights.${kind}.${k}`)),
  ],
  telemetry: ['benchmarkPromptRoom', 'perf.nearShare', 'perf.paceShare', 'perf.goodShare', 'perf.okFps', 'report.runs', 'report.stalls'],
  cards: [ // the card effects (0.183): ui/cardFx.js, combatFx.js, fxParts.js
    ...['amt', 'speed', 'scale', 'fps', 'panelAmt', 'phone.fps', 'saverFps'].map((k) => `fx.${k}`),
    ...['budget', 'max', 'keepFloor', 'dprCap', 'phone.budget', 'phone.dprCap'].map((k) => `particles.${k}`),
    ...['kickDeg', 'kickMs', 'critKick', 'heavyKick', 'overkillKick', 'enterMs', 'enterDelayMs', 'enterStaggerMs'].map((k) => `motion.${k}`),
    ...['strength', 'band', 'hitMs', 'enterMs'].map((k) => `glint.${k}`),
  ],
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
  const SLOTS = new Set(['weapon', 'armor', 'boots', 'ring', 'trinket', 'amulet']);
  for (const [id, it] of Object.entries(data.items ?? {})) {
    if (!isNum(it?.tier)) out.push(`items.json: ${id}.tier`);
    if (!SLOTS.has(it?.slot)) out.push(`items.json: ${id}.slot (${it?.slot}) is not a slot`); // (0.00197: an unknown slot made a find vanish on equip)
  }
  // every enemy's numbers and its coin range (run/combat.js, run/loot.js read them without fallbacks)
  for (const [id, e] of Object.entries(data.enemies ?? {})) {
    if (!['hp', 'dmg', 'xp'].every((k) => isNum(e?.[k]))) out.push(`enemies.json: ${id} hp / dmg / xp`);
    if (!(e?.coins?.length === 2 && e.coins.every(isNum))) out.push(`enemies.json: ${id}.coins ([lo, hi])`);
  }
  // the boss and the knight's first gear (0.00197: data, were names in src)
  if (!data.enemies?.[data.difficulty?.boss?.enemy]) out.push(`difficulty.json: boss.enemy (${data.difficulty?.boss?.enemy}) is not in enemies.json`);
  for (const slot of ['weapon', 'armor']) if (!data.items?.[data.difficulty?.player?.startingGear?.[slot]]) out.push(`difficulty.json: player.startingGear.${slot} is not an item`);
  // every portrait is named in the data (0.184): enemies.json art, cards.json player.art
  for (const [id, e] of Object.entries(data.enemies ?? {})) if (typeof e?.art !== 'string' || !e.art) out.push(`enemies.json: ${id}.art (the portrait file in assets/chars/)`);
  if (typeof data.cards?.player?.art !== 'string' || !data.cards.player.art) out.push('cards.json: player.art (the knight\'s portrait file in assets/chars/)');
  // the character classes (0.00248): every hero whole, the default one of them
  const heroes = Array.isArray(data.heroes?.heroes) ? data.heroes.heroes : [];
  if (!heroes.length) out.push('heroes.json: heroes (a list)');
  for (const h of heroes) {
    if (typeof h?.id !== 'string' || !h.id || typeof h.name !== 'string' || !h.name) out.push(`heroes.json: ${h?.id ?? '?'} needs an id and a name`);
    if (!Array.isArray(h?.looks) || !h.looks.length || !h.looks.every((l) => typeof l?.art === 'string' && l.art && isNum(l.fh) && l.fh > 0 && l.fh <= 1)) out.push(`heroes.json: ${h?.id}.looks (one per look: art, the figure file in assets/heroes/, and fh, its share of the sheet's height, 0-1)`);
    if (!Array.isArray(h?.traits) || typeof h?.epithet !== 'string' || typeof h?.lore !== 'string') out.push(`heroes.json: ${h?.id} needs epithet, lore and traits`);
    // the class (0.00258): every number present, the heavy one the engine knows
    const c = h?.class;
    const NUMS = ['hpMult', 'dmgMult', 'armorMult', 'potionHealMult', 'dodge', 'heavyCd', 'heavyMult', 'charges', 'cleaveShare', 'rage', 'drainShare', 'thrallShare', 'wildTurns', 'wildMult', 'mend', 'blightShare', 'potionArmor'];
    if (!c || typeof c.heavyName !== 'string' || !c.heavyName || !NUMS.every((k) => isNum(c[k])) || !['blow', 'cleave', 'fireball', 'drain', 'mark', 'censer', 'wildshape'].includes(c.heavy)) out.push(`heroes.json: ${h?.id}.class (heavyName, every number of the block, and heavy one of blow | cleave | fireball | drain | mark | censer | wildshape)`);
    // the class colour theme (0.00254): the plate's colour, the card light's look and tint
    const th = h?.theme;
    if (!/^#[0-9a-f]{6}$/i.test(th?.plate ?? '') || !['fog', 'blood', 'flames', 'embers', 'ether'].includes(th?.light) || !(Array.isArray(th?.tint) && th.tint.length === 3 && th.tint.every((v) => isNum(v) && v >= 0 && v <= 2))) out.push(`heroes.json: ${h?.id}.theme (plate #rrggbb, light fog | blood | flames | embers | ether, tint [r, g, b] 0-2)`);
  }
  if (heroes.length && !heroes.some((h) => h.id === data.heroes.default)) out.push(`heroes.json: default (${data.heroes?.default}) is not a hero`);
  for (const [id, c] of Object.entries(data.audio?.clips ?? {})) {
    if (!isNum(c?.gainDb)) out.push(`audio.json: clips.${id}.gainDb`);
    if (!c?.file === !c?.synth) out.push(`audio.json: clips.${id} needs a file or synth: true (one of them)`);
    if (c?.rate && !(c.rate.length === 2 && c.rate.every(isNum) && c.rate[0] > 0)) out.push(`audio.json: clips.${id}.rate (two numbers above 0)`); // (a 0 rate = a voice of infinite length, 0.00197)
    if (c?.jitterDb !== undefined && !isNum(c.jitterDb)) out.push(`audio.json: clips.${id}.jitterDb (a number of dB; a NaN there throws on the gain and the clip is silently dropped)`);
  }
  for (const [id, t] of Object.entries(data.audio?.music?.tracks ?? {})) {
    if (typeof t?.file !== 'string' || !['loopS', 'tailS', 'gainDb'].every((k) => isNum(t[k]))) out.push(`audio.json: music.tracks.${id} (file, loopS, tailS, gainDb)`);
  }
  for (const [id, v] of Object.entries(data.audio?.variation ?? {})) {
    if (v.rate && !(v.rate.length === 2 && v.rate.every(isNum) && v.rate[0] > 0)) out.push(`audio.json: variation.${id}.rate`);
    if (v.eq && !['lo', 'hi', 'db', 'q'].every((k) => isNum(v.eq[k]))) out.push(`audio.json: variation.${id}.eq`);
    if (v.layers) {
      if (!(v.layerRate?.length === 2 && v.layerRate.every(isNum) && isNum(v.layerDb))) out.push(`audio.json: variation.${id} layerRate / layerDb`);
      for (const l of v.layers) if (!data.audio.clips?.[l.name]?.synth || !isNum(l.p) || !isNum(l.db)) out.push(`audio.json: variation.${id} layer ${l?.name} (a synth clip, p, db)`);
    }
  }
  for (const [name, secs] of Object.entries(data.audio?.duck?.clips ?? {})) {
    if (!data.audio.clips?.[name]) out.push(`audio.json: duck.clips.${name} is not a clip`);
    if (!isNum(secs)) out.push(`audio.json: duck.clips.${name} must be seconds`); // (mixer.js: a NaN there dropped the sound, 0.00197)
  }
  // the room change's swoosh (0.173): a file clip with its loudest moment measured
  const tr = data.audio?.transition?.clip;
  if (!data.audio?.clips?.[tr]?.file || !isNum(data.audio.clips[tr].peakMs)) out.push(`audio.json: transition.clip (${tr}) must be a file clip with peakMs`);
  // the summoned enemy and every painting's name (run/roomGen.js reads them without fallbacks)
  const summon = data.difficulty?.boss?.summon?.enemy;
  if (!data.enemies?.[summon]) out.push(`difficulty.json: boss.summon.enemy (${summon}) is not in enemies.json`);
  const bg = data.backgrounds ?? {};
  if (typeof data.telemetry?.benchmarkPrompt !== 'boolean') out.push('telemetry.json: benchmarkPrompt (true / false)');
  if (!/^\d+(\.\d+)+$/.test(String(data.telemetry?.benchmarkSince))) out.push('telemetry.json: benchmarkSince (a build number: results from older builds do not count)');
  if (!/^\d+(\.\d+)+$/.test(String(data.telemetry?.perf?.hzSince))) out.push('telemetry.json: perf.hzSince (the first build whose refresh-rate reading is trusted)');
  if (typeof bg.shrineName !== 'string') out.push('backgrounds.json: shrineName');
  // room 1 is always one of these (0.171): fight paintings, so they're named
  if (!(bg.entrance?.length > 0) || bg.entrance.some((f) => !bg.rooms?.includes(f))) out.push('backgrounds.json: entrance (fight paintings for room 1)');
  // the room before each boss is one of these, and only that room (0.171)
  if (!(bg.antechambers?.length > 0) || bg.antechambers.some((f) => !bg.rooms?.includes(f) || bg.entrance?.includes(f))) out.push('backgrounds.json: antechambers (fight paintings, not entrance ones)');
  // the paintings the code reads whole (0.00223): the four named ones, the three lists, a fight painting outside the antechambers
  for (const k of ['title', 'hub', 'death', 'shrine']) if (typeof bg[k] !== 'string' || !bg[k]) out.push(`backgrounds.json: ${k}`);
  for (const k of ['rooms', 'bosses', 'treasure']) if (!(bg[k]?.length > 0)) out.push(`backgrounds.json: ${k} is empty`);
  if (bg.rooms?.length && bg.rooms.every((f) => bg.antechambers?.includes(f))) out.push('backgrounds.json: rooms has no fight painting outside antechambers');
  // the potions' price ladder is read whole; the shrine deals from its offers; room 1 needs a tier-1 enemy; the benchmark round is a build at most one ahead of this one
  const steps = data.difficulty?.potions?.priceSteps;
  if (!(Array.isArray(steps) && steps.length > 0 && steps.every(isNum))) out.push('difficulty.json: potions.priceSteps (a non-empty list of numbers)');
  if (!(data.shrines?.dealCount <= data.shrines?.offers?.length)) out.push('shrines.json: dealCount above the offers');
  if (!Object.values(data.enemies ?? {}).some((e) => e?.tier === 1 && !e.boss)) out.push('enemies.json: no tier-1 enemy for room 1');
  const nextBuild = (v) => { const [a, b] = String(v).split('.'); return `${a}.${String(Number(b) + 1).padStart(b?.length ?? 5, '0')}`; }; // (the build about to ship: the suite runs before ship.mjs bumps)
  if (data.build?.version && data.telemetry?.benchmarkSince && compareVersions(data.telemetry.benchmarkSince, nextBuild(data.build.version)) > 0) out.push('telemetry.json: benchmarkSince is more than one build above this one');
  for (const f of [...(bg.rooms ?? []), ...(bg.bosses ?? []), ...(bg.treasure ?? [])]) {
    if (typeof bg.roomNames?.[f] !== 'string') out.push(`backgrounds.json: roomNames.${f}`);
  }
  // the voice-over (0.161): every line in narration.json has a rule with a
  // chance, every rule a line with measured takes on disk
  const rules = data.audio?.narration?.lines ?? {};
  const lines = data.narration?.lines ?? {};
  for (const [id, r] of Object.entries(rules)) {
    if (!isNum(r?.chance)) out.push(`audio.json: narration.lines.${id}.chance`);
    if (r?.cooldownMs !== undefined && !isNum(r.cooldownMs)) out.push(`audio.json: narration.lines.${id}.cooldownMs`);
    if (!lines[id]?.length) out.push(`narration.json: no takes for ${id} (audio.json names it)`);
  }
  for (const [id, takes] of Object.entries(lines)) {
    if (!rules[id]) out.push(`audio.json: narration.lines.${id} missing (narration.json has takes)`);
    for (const t of takes) if (typeof t?.file !== 'string' || !isNum(t?.measuredDb) || !isNum(t?.take)) out.push(`narration.json: ${id} take ${t?.take} needs take + file + measuredDb`);
  }
  const NEEDS = {
    dmg: ['hpCostPct', 'dmgMult'], crit: ['coinCost', 'critAdd', 'critCap'], armor: ['potionCost', 'armorMin', 'armorMult'],
    leech: ['hpCostPct', 'lifestealAdd', 'lifestealCap'], bulwark: ['armorPct', 'armorAdd', 'dmgCostPct'], secondwind: ['coinCost', 'potionsAdd'],
    quicken: ['hpCostPct', 'cdReduce'], greed: ['dmgCostPct', 'coinMultAdd'], glasscannon: ['minArmor', 'dmgMult', 'armorCostPct'],
  };
  for (const o of data.shrines?.offers ?? []) {
    for (const k of NEEDS[o.id] ?? []) if (!isNum(o[k])) out.push(`shrines.json: ${o.id}.${k}`);
    if (typeof o.img !== 'string') out.push(`shrines.json: ${o.id}.img (its icon picture, 0.177)`);
  }
  return out;
}

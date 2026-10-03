// shared/dataCheck.js — the tuning the code reads, checked once at load
// (0.116). Since 0.079 every balance number lives in assets/data/*.json,
// but the code used to carry its own `?? N` fallback copies of them —
// copies that silently drifted (the boss multipliers and the T4 drop
// chance still had pre-0.092 values). The fallbacks are gone; instead
// this list names every number the code reads, and a missing or
// non-numeric one is reported at boot (console) and fails the smoke suite.
// New knob in the data? Add its path here.

import { compareVersions } from './version.js';
import { HEAVY_KINDS, CLASS_KEYS, ELEMENTS, HEAVIES } from '../run/classes.js';
import { BOONS } from '../run/shrine.js'; // (0.00299: each boon's `needs` — the registry's, not a copy here)

const NUM = {
  difficulty: [
    'hpGrowth', 'dmgGrowth', 'xpGrowth', 'tierRooms', 'budgetBase', 'budgetPerRoom', 'enemyCost.1', 'enemyCost.2', 'enemyCost.3',
    'maxEnemies', 'spillThreshold', 'bossEvery', 'finalBossRoom', 'shrineRoomRange.0', 'shrineRoomRange.1', 'dropChance', 'classDropShare', 'potionHeal', 'lowHpShare',
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
      'critOverflowDamage', 'critDamagePerPrecision', 'dodgeCap', 'reviveHpPct'].map((k) => `player.${k}`), // (baseHeavyCd went in 0.00299: the cooldown is heroes.json class.heavyCd, the knight's 3 among them)
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
    ...['crit', 'megacrit', 'overkill', 'potion', 'revive', 'find1', 'find2', 'find3', 'find4'].flatMap((kind) => // (find1-4, 0.00319: a find's light by its rarity, findFx.js)
      ['color.0', 'color.1', 'color.2', 'strength', 'fade', 'life'].map((k) => `parallax.lights.${kind}.${k}`)),
    ...['find1', 'find2', 'find3', 'find4'].map((kind) => `parallax.lights.${kind}.radius`), 'parallax.lights.find.settle', 'parallax.lights.find.flare', 'parallax.lights.find.shrink', // (0.00320: a find's own reach, its flare and its shrink)
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
export const WEAPON_KINDS = ['sword', 'axe', 'mace', 'staff', 'dagger', 'scythe', 'crossbow', 'censer'];
export const ARMOR_KINDS = ['heavy', 'hide', 'cloth'];

export function checkData(data) {
  const out = [];
  for (const [file, paths] of Object.entries(NUM)) {
    for (const p of paths) if (!isNum(at(data[file], p))) out.push(`${file}.json: ${p} missing or not a number`);
  }
  // per-entry numbers: every item has a tier, every clip a trim, every
  // shrine boon the numbers its entry in run/shrine.js BOONS reads (below)
  const SLOTS = new Set(['weapon', 'armor', 'boots', 'ring', 'trinket', 'amulet']);
  for (const [id, it] of Object.entries(data.items ?? {})) {
    if (!isNum(it?.tier)) out.push(`items.json: ${id}.tier`);
    if (!SLOTS.has(it?.slot)) out.push(`items.json: ${id}.slot (${it?.slot}) is not a slot`); // (0.00197: an unknown slot made a find vanish on equip)
  }
  // every enemy's numbers and its coin range (run/combat.js, run/loot.js read them without fallbacks)
  for (const [id, e] of Object.entries(data.enemies ?? {})) {
    if (!['hp', 'dmg', 'xp'].every((k) => isNum(e?.[k]))) out.push(`enemies.json: ${id} hp / dmg / xp`);
    if (!(e?.coins?.length === 2 && e.coins.every(isNum))) out.push(`enemies.json: ${id}.coins ([lo, hi])`);
    // its immunities (0.00293): a chance 0-1 per element, every element on every enemy (0 = none)
    for (const el of ELEMENTS) if (!(isNum(e?.immune?.[el]) && e.immune[el] >= 0 && e.immune[el] <= 1)) out.push(`enemies.json: ${id}.immune.${el} (a chance 0-1)`);
    // its lore line (0.00295): the stats card's last line
    if (!(typeof e?.lore === 'string' && e.lore.trim())) out.push(`enemies.json: ${id}.lore (a line of text)`);
  }
  for (const [kind, h] of Object.entries(HEAVIES)) if (h.element && !ELEMENTS.includes(h.element)) out.push(`classes.js: the ${kind} heavy's element (${h.element}) is not one of ${ELEMENTS.join(', ')}`);
  // the boss and the knight's first gear (0.00197: data, were names in src)
  if (!data.enemies?.[data.difficulty?.boss?.enemy]) out.push(`difficulty.json: boss.enemy (${data.difficulty?.boss?.enemy}) is not in enemies.json`);
  for (const slot of ['weapon', 'armor']) if (!data.items?.[data.difficulty?.player?.startingGear?.[slot]]) out.push(`difficulty.json: player.startingGear.${slot} is not an item`);
  // every portrait is named in the data (0.184): enemies.json art, cards.json player.art
  for (const [id, e] of Object.entries(data.enemies ?? {})) { // (0.00303: art = the variants a fight deals, ref = the original the redraws were made from)
    if (!Array.isArray(e?.art) || !e.art.length || !e.art.every((f) => typeof f === 'string' && f)) out.push(`enemies.json: ${id}.art (a list of its portrait files in assets/chars/, the variants a fight deals)`);
    if (typeof e?.ref !== 'string' || !e.ref) out.push(`enemies.json: ${id}.ref (its original portrait in assets/chars/, the redraws' reference)`);
  }
  if (typeof data.cards?.player?.art !== 'string' || !data.cards.player.art) out.push('cards.json: player.art (the knight\'s portrait file in assets/chars/)');
  // every item names its picture (0.00260): items.json art, the file in assets/items/ (tools/gen-items.mjs --import)
  for (const [id, it] of Object.entries(data.items ?? {})) if (typeof it?.art !== 'string' || !/\.webp$/.test(it.art)) out.push(`items.json: ${id}.art (the item's picture, a .webp in assets/items/)`);
  for (const [id, it] of Object.entries(data.items ?? {})) { // the item matrix (0.00274): a weapon or body armor has a kind; a class item names a hero; mastery only on a class item
    if (it?.slot === 'weapon' && !WEAPON_KINDS.includes(it.kind)) out.push(`items.json: ${id}.kind (a weapon kind: ${WEAPON_KINDS.join(', ')})`);
    if (it?.slot === 'armor' && !ARMOR_KINDS.includes(it.kind)) out.push(`items.json: ${id}.kind (an armor weight: ${ARMOR_KINDS.join(', ')})`);
    if (it?.class !== undefined && !(data.heroes?.heroes ?? []).some((h) => h.id === it.class)) out.push(`items.json: ${id}.class (a hero id)`);
    if (it?.mastery !== undefined && (!it.class || !isNum(it.mastery))) out.push(`items.json: ${id}.mastery (a number, on a class item)`);
  }
  if (typeof data.difficulty?.potions?.art !== 'string' || !/\.webp$/.test(data.difficulty.potions.art)) out.push('difficulty.json: potions.art (the healing potion\'s picture, a .webp in assets/items/; 0.00263)');
  // the character classes (0.00248): every hero whole, the default one of them
  const heroes = Array.isArray(data.heroes?.heroes) ? data.heroes.heroes : [];
  if (!heroes.length) out.push('heroes.json: heroes (a list)');
  for (const h of heroes) {
    if (typeof h?.id !== 'string' || !h.id || typeof h.name !== 'string' || !h.name) out.push(`heroes.json: ${h?.id ?? '?'} needs an id and a name`);
    if (!Array.isArray(h?.looks) || !h.looks.length || !h.looks.every((l) => typeof l?.art === 'string' && l.art && isNum(l.fh) && l.fh > 0 && l.fh <= 1)) out.push(`heroes.json: ${h?.id}.looks (one per look: art, the figure file in assets/heroes/, and fh, its share of the sheet's height, 0-1)`);
    // the item matrix (0.00274): two weapon kinds, one armor weight, a mastery whose key is a class key
    if (!Array.isArray(h?.wields) || h.wields.length < 1 || !h.wields.every((k) => WEAPON_KINDS.includes(k))) out.push(`heroes.json: ${h?.id}.wields (weapon kinds: ${WEAPON_KINDS.join(', ')})`);
    if (!ARMOR_KINDS.includes(h?.wears)) out.push(`heroes.json: ${h?.id}.wears (one armor weight: ${ARMOR_KINDS.join(', ')})`);
    if (!h?.mastery || !Object.hasOwn(h.class ?? {}, h.mastery.key) || !isNum(h.mastery.per) || typeof h.mastery.label !== 'string') out.push(`heroes.json: ${h?.id}.mastery (key: a key of its class block, per: a number, label)`);
    for (const slot of ['weapon', 'armor']) { const id = h?.kit?.[slot]; if (data.items?.[id]?.slot !== slot) out.push(`heroes.json: ${h?.id}.kit.${slot} (the class's starting ${slot}, an item of that slot; 0.00265)`); }
    if (!Array.isArray(h?.traits) || typeof h?.epithet !== 'string' || typeof h?.lore !== 'string') out.push(`heroes.json: ${h?.id} needs epithet, lore and traits`);
    if (typeof h?.heavyName !== 'string' || !h.heavyName.trim()) out.push(`heroes.json: ${h?.id}.heavyName (the heavy attack's name on the button and the STATS row, 0.00267)`);
    // the special's key (0.00286): one letter of its own name (so the button underlines it), never a key combat already
    // answers to — A Attack, P Drink Potion, D Push Deeper, R Retreat (H is every class's second key: the knight's and the Hex's own)
    if (!/^[a-z]$/.test(h?.heavyKey ?? '') || !String(h?.heavyName).toLowerCase().includes(h.heavyKey) || 'apdr'.includes(h.heavyKey)) out.push(`heroes.json: ${h?.id}.heavyKey (a letter of heavyName, not A / P / D / R, 0.00286)`);
    for (const k of ['atk', 'heavy', 'hurt']) if (!data.audio?.clips?.[`${k}_${h?.id}`]) out.push(`audio.json: clips.${k}_${h?.id} (the class's own ${k === 'hurt' ? 'get-hit' : k === 'heavy' ? 'heavy' : 'attack'} sound, 0.00270)`);
    // the class (0.00258, live 0.00267): every number present, the heavy one the engine knows — both lists the registry's (run/classes.js, 0.00283)
    const c = h?.class;
    for (const k of CLASS_KEYS) if (!isNum(c?.[k])) out.push(`heroes.json: ${h?.id}.class.${k} missing or not a number`);
    if (!HEAVY_KINDS.includes(c?.heavy)) out.push(`heroes.json: ${h?.id}.class.heavy (${c?.heavy}) is not a heavy kind: ${HEAVY_KINDS.join(' | ')}`);
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
    if (t?.crossfade !== undefined && !['gain', 'power'].includes(t.crossfade)) out.push(`audio.json: music.tracks.${id}.crossfade ('gain' for an exact loop, 'power' for a generated bed's own continuation)`);
  }
  for (const [id, v] of Object.entries(data.audio?.variation ?? {})) {
    if (v.rate && !(v.rate.length === 2 && v.rate.every(isNum) && v.rate[0] > 0)) out.push(`audio.json: variation.${id}.rate`);
    if (v.eq && !['lo', 'hi', 'db', 'q'].every((k) => isNum(v.eq[k]))) out.push(`audio.json: variation.${id}.eq`);
    if (v.layers) {
      if (!(v.layerRate?.length === 2 && v.layerRate.every(isNum) && isNum(v.layerDb))) out.push(`audio.json: variation.${id} layerRate / layerDb`);
      for (const l of v.layers) if (!data.audio.clips?.[l.name] || !isNum(l.p) || !isNum(l.db)) out.push(`audio.json: variation.${id} layer ${l?.name} (a clip — synth or a recording since 0.00305 — p, db)`);
    }
  }
  for (const [name, secs] of Object.entries(data.audio?.duck?.clips ?? {})) {
    if (!data.audio.clips?.[name]) out.push(`audio.json: duck.clips.${name} is not a clip`);
    if (!isNum(secs)) out.push(`audio.json: duck.clips.${name} must be seconds`); // (mixer.js: a NaN there dropped the sound, 0.00197)
  }
  // the room change's whooshes (0.173; a list since 0.00297): file clips with their loudest moment measured, one picked per change
  const trs = data.audio?.transition?.clips;
  if (!Array.isArray(trs) || !trs.length) out.push('audio.json: transition.clips must list at least one clip');
  for (const tr of trs ?? []) if (!data.audio?.clips?.[tr]?.file || !isNum(data.audio.clips[tr].peakMs)) out.push(`audio.json: transition.clips ${tr} must be a file clip with peakMs`);
  // the death hit is timed to the YOU DIED dialog by its loudest moment (dungeonScene.js, 0.00297)
  if (!isNum(data.audio?.clips?.death?.peakMs)) out.push('audio.json: clips.death needs peakMs');
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
  // the title's fly-in (0.00307, ui/titleIntro.js): the clip, its kill switch and its three timings
  if (typeof bg.intro?.enabled !== 'boolean') out.push('backgrounds.json: intro.enabled (true / false)');
  if (typeof bg.intro?.file !== 'string' || !bg.intro.file) out.push('backgrounds.json: intro.file');
  if (typeof bg.intro?.phone?.file !== 'string' || !bg.intro.phone.file) out.push('backgrounds.json: intro.phone.file (the 720p film a phone fetches)');
  for (const k of ['waitMs', 'holdMs', 'leadMs', 'fadeMs', 'whooshAtMs', 'whooshDb']) if (!isNum(bg.intro?.[k])) out.push(`backgrounds.json: intro.${k}`);
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
  for (const k of ['hero', 'foe']) if (typeof data.audio?.cries?.[k] !== 'boolean') out.push(`audio.json: cries.${k} (true / false: the get-hit recordings on or off, 0.00287)`);
  // every shrine boon is one the registry knows (run/shrine.js BOONS, 0.00299) and carries the numbers its entry reads
  for (const o of data.shrines?.offers ?? []) {
    const boon = BOONS[o?.id];
    if (!boon) { out.push(`shrines.json: ${o?.id} is not a boon the code knows (run/shrine.js BOONS: ${Object.keys(BOONS).join(', ')})`); continue; }
    for (const k of boon.needs) if (!isNum(o[k])) out.push(`shrines.json: ${o.id}.${k}`);
    if (typeof o.img !== 'string') out.push(`shrines.json: ${o.id}.img (its icon picture, 0.177)`);
  }
  return out;
}

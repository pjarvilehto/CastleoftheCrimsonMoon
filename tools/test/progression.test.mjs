// tools/test/progression.test.mjs — the meta game: settle, potions, saves, alchemy, disciplines, forge, hub, loot, 0.097 fixes.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, t, fresh, registry, El, DATA, show, createRun, scaleEnemy, createCombat, playerAttack, acceptOffer, dungeonScene, hubScene, titleScene, resetProfile, getProfile, readFileSync, statSync } from './harness.mjs';

fresh();

// T10: settleRun — death takes 50% coin toll, retreat banks all
{
  const rd = createRun(); rd.coins = 100; rd.roomNumber = 5;
  const { settleRun } = await import('../../src/run/runState.js');
  settleRun(rd, 'death');
  const rr = createRun(); rr.coins = 100; rr.roomNumber = 5;
  settleRun(rr, 'retreat');
  ok('death toll 50%, retreat full', rd.coinsRetrieved === 50 && rd.coinsLost === 50 && rr.coinsRetrieved === 100);
}

// T12: 0.080 — potions: flat price, capped by the satchel; the satchel
// upgrade doubles in price and stops at the max cap.
{
  const { restockPotion, potionCost, satchelCost, expandSatchel, satchelMaxed } = await import('../../src/meta/leveling.js');
  const pc = DATA.difficulty.potions;
  resetProfile();
  const p = getProfile();
  ok('fresh profile: 2/4 potions', p.potions === pc.startCount && p.potionCap === pc.startCap);
  p.coins = 1000;
  const c0 = potionCost();
  restockPotion(); const c1 = potionCost(); restockPotion();
  ok('potion price climbs: 10, 20, then 25 and +5 each (0.00204)', c0 === 10 && c1 === 20 && potionCost() === 25 && p.potions === 4 && p.coins === 1000 - 30
    && p.potionsBought === 2 && potionCost({ potionsBought: 3 }) === 30 && potionCost({ potionsBought: 10 }) === 65 && potionCost({}) === 10);
  { const { settleRun } = await import('../../src/run/runState.js'); const r = createRun(); settleRun(r, 'retreat'); }
  ok('the price ladder starts over after a run', getProfile().potionsBought === 0 && potionCost() === 10);
  ok('cannot buy past the cap', restockPotion() === false && p.potions === 4);
  const s0 = satchelCost();
  expandSatchel();
  ok('satchel +1 cap, price doubles', s0 === pc.capUpgradeBase && p.potionCap === 5 && satchelCost() === pc.capUpgradeBase * pc.capUpgradeGrowth);
  p.coins = 1e9;
  for (let i = 0; i < 20; i++) expandSatchel();
  ok('satchel stops at max cap', p.potionCap === pc.maxCap && satchelMaxed() && expandSatchel() === false);
}

// T15: save transfer round-trip (export code -> wipe -> import restores)
{
  const { exportSave, importSave } = await import('../../src/meta/profile.js');
  resetProfile();
  getProfile().coins = 777;
  const code = exportSave();
  resetProfile();
  ok('importSave restores coins from code', typeof code === 'string' && importSave(code) === true && getProfile().coins === 777);
  ok('importSave rejects garbage', importSave('not-a-save-code') === false && getProfile().coins === 777);
  // 0.00223: an unknown item id (a retired item, a foreign code), a foreign forge entry and a numeric string are made whole — settleRun and kill loot used to throw on them
  const { settleRun, createRun: newRun } = await import('../../src/run/runState.js');
  const base = JSON.parse(JSON.stringify(getProfile()));
  const odd = { ...base, equipment: { ...base.equipment, weapon: 'no_such_item', rings: ['x', null] }, forged: { no_such_item: 2, [Object.keys(DATA.items)[0]]: '3' }, stats: { ...base.stats, power: '3' }, potions: 'two' };
  let threw = null;
  ok('importSave makes an odd code whole: unknown ids off, numbers numbers, the rest at their defaults', importSave(Buffer.from(JSON.stringify(odd)).toString('base64')) === true && getProfile().equipment.weapon === null
    && getProfile().equipment.rings[0] === null && !('no_such_item' in getProfile().forged) && getProfile().forged[Object.keys(DATA.items)[0]] === 3 && getProfile().stats.power === 3 && getProfile().potions === 2);
  try { settleRun(newRun(), 'retreat'); } catch (e) { threw = e; }
  ok('...and a run settles on it', threw === null, threw && threw.message);
  resetProfile();
}

// T17: alchemy tracks — escalating costs, potency drives heal, legacy save migrates
{
  const { trainAlchemy, alchemyCost, potionHealAmount } = await import('../../src/meta/leveling.js');
  const { drinkPotion } = await import('../../src/run/runState.js');
  resetProfile();
  const p = getProfile();
  p.coins = 1000;
  const h0 = potionHealAmount();
  const ac0 = alchemyCost('potency');
  trainAlchemy('potency');
  const ac1 = alchemyCost('potency');
  const run = createRun();
  run.hp = 100; run.maxHp = 1000; run.potions = 1;
  drinkPotion(run);
  ok('alchemy: potency cost 60 -> 120, heal +50, applied on drink', h0 === 300 && ac0 === 60 && ac1 === 120
    && potionHealAmount() === 350 && run.hp === 450 && p.coins === 940);
  // Legacy save with stats.alchemy = 3 migrates to alchemy.potency = 3
  const { importSave } = await import('../../src/meta/profile.js');
  const old = JSON.parse(JSON.stringify(p));
  delete old.alchemy; delete old.forged;
  delete old.saveVersion; // real pre-0.079 saves are unversioned (0.079)
  old.stats.alchemy = 3;
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(old))));
  importSave(code);
  const m = getProfile();
  ok('legacy stats.alchemy migrates to potency', m.alchemy.potency === 3 && m.stats.alchemy === undefined
    && m.forged && typeof m.forged === 'object' && m.stats.precision === 0 && m.stats.endurance === 0);
}

// T18: record-depth tag — at/past best-ever room, never on the first run
{
  registry.app.innerHTML = '';
  Object.assign(getProfile(), {
    coins: 0, xp: 0, stats: { power: 14, vitality: 10, fortune: 0, precision: 0, endurance: 0 },
    equipment: { weapon: 'executioner_axe', armor: 'dragonscale_mail', boots: null, rings: [null, null], trinket: null, amulet: null },
    potions: 5, records: { kills: 0, bestRoom: 5, runs: 3, deaths: 0 },
  });
  dungeonScene().enter(registry.app);
  ok('no record tag below best depth', !t().includes('Record depth'));
  getProfile().records.bestRoom = 1; // frontier: room 1 is at the record
  dungeonScene().enter(registry.app);
  ok('record tag at frontier depth', t().includes('Record depth'));
  getProfile().records.runs = 0; // first run ever: never tag
  dungeonScene().enter(registry.app);
  ok('no record tag on first run', !t().includes('Record depth'));
}

// T19: hub records box shows lifetime stats
{
  registry.app.innerHTML = '';
  Object.assign(getProfile(), {
    coins: 0, xp: 0, stats: { power: 0, vitality: 0, fortune: 0, precision: 0, endurance: 0 },
    equipment: { weapon: 'rusty_sword', armor: 'oak_shield', boots: null, rings: [null, null], trinket: null, amulet: null },
    potions: 2, records: { kills: 126, bestRoom: 6, runs: 9, deaths: 4 },
  });
  hubScene().enter(registry.app);
  ok('hub records line', t().includes('9 runs, 126 kills, deepest room 6.'));
}

// T22: disciplines — XP-only training, new stats feed derived, breakthroughs double
{
  const { buyStat, statCost } = await import('../../src/meta/leveling.js');
  const { derivedStats, trainedLevel } = await import('../../src/meta/stats.js');
  resetProfile();
  const p = getProfile();
  p.coins = 0; p.xp = 10000;
  p.equipment = { weapon: null, armor: null, boots: null, rings: [null, null], trinket: null, amulet: null };
  ok('training is XP-only', statCost(0).xp === 15 && statCost(0).coins === undefined);
  buyStat('power'); // lvl 1, 15xp
  ok('buyStat spends xp, not coins', p.coins === 0 && p.xp === 10000 - 15 && p.stats.power === 1);
  p.stats.power = 4;
  const r = buyStat('power'); // -> lvl 5 = breakthrough
  ok('breakthrough doubles every 5th level', r === 'breakthrough' && trainedLevel(p, 'power') === 6);
  p.stats.precision = 5; p.stats.endurance = 7; p.stats.vitality = 0;
  const d = derivedStats(p);
  ok('precision/endurance feed crit/armor (tapered crit)', Math.abs(d.crit - (0.05 + 0.03 * 6)) < 1e-9 && d.armor === 80
    && d.dmg === 24 && d.maxHp === 400);
}

// T23: alchemy tracks — base costs, efficiency free drinks, infusion temp armor
{
  const { alchemyCost, efficiencyChance, infusionArmor } = await import('../../src/meta/leveling.js');
  const { drinkPotion, enterNextRoom, createRun } = await import('../../src/run/runState.js');
  resetProfile();
  getProfile().coins = 10000;
  ok('three track base costs 60/80/100', alchemyCost('potency') === 60
    && alchemyCost('efficiency') === 80 && alchemyCost('infusion') === 100);
  getProfile().alchemy.efficiency = 3; // 3 x 0.08, then the long tail (0.113)
  ok('efficiency: +8%/level to 24% at level 3, still growing after (0.113)', Math.abs(efficiencyChance() - 0.24) < 1e-9 && efficiencyChance(5) > 0.3 && efficiencyChance(20) < 0.55);
  getProfile().alchemy.infusion = 3;
  ok('infusion armor = lvl x 20', infusionArmor() === 60);
  const run = createRun();
  run.hp = 100; run.maxHp = 1000; run.potions = 2;
  const origRandom = Math.random;
  Math.random = () => 0.0; // force the efficiency roll to succeed
  const sip = drinkPotion(run);
  Math.random = origRandom;
  ok('efficiency: potion not consumed', sip.free === true && run.potions === 2 && run.hp === 400);
  ok('infusion: temp armor applied', sip.armor === 60 && run.tempArmor === 60);
  enterNextRoom(run);
  ok('infusion: temp armor clears next room', run.tempArmor === 0);
  run.hp = 100; run.potions = 2;
  const late = drinkPotion(run, false); // between rooms (after the win)
  ok('infusion: no armor from a potion drunk between rooms (0.00223: it used to arm the knight for a room that never came)', late.armor === 0 && run.tempArmor === 0 && run.hp > 100);
}

// T24: The Forge — per-item enhancement, escalating cost, derived stats boosted
{
  const { forgeCost, forgeItem, forgeMaxed } = await import('../../src/meta/leveling.js');
  const { itemWithForge, derivedStats } = await import('../../src/meta/stats.js');
  resetProfile();
  const p = getProfile();
  p.coins = 10000;
  p.equipment = { weapon: 'moonbrand', armor: null, boots: null, rings: [null, null], trinket: null, amulet: null };
  ok('forge cost T3 lvl0 = 150c', forgeCost('moonbrand') === 150);
  ok('forge item to +1', forgeItem('moonbrand') && p.forged.moonbrand === 1 && p.coins === 9850);
  const boosted = itemWithForge('moonbrand');
  ok('forge boosts stats 20%', boosted.dmg === Math.round(14 * 1.2) && boosted.forgeLvl === 1);
  ok('derived dmg includes forge boost', derivedStats(p).dmg === 6 + Math.round(14 * 1.2));
  forgeItem('moonbrand'); forgeItem('moonbrand'); // +2 (300c), +3 (450c)
  ok('forge maxes at +3', forgeMaxed('moonbrand') && !forgeItem('moonbrand') && p.coins === 9100);
}

// T25: hub render — five disciplines, three alchemy tracks, XP-only buttons, no Scribe
{
  registry.app.innerHTML = '';
  Object.assign(getProfile(), {
    coins: 500, xp: 500,
    stats: { power: 0, vitality: 0, fortune: 0, precision: 0, endurance: 0 },
    alchemy: { potency: 0, efficiency: 0, infusion: 0 }, forged: {},
    equipment: { weapon: 'knights_blade', armor: 'oak_shield', boots: null, rings: [null, null], trinket: null, amulet: null },
    potions: 2, records: { kills: 0, bestRoom: 0, runs: 0, deaths: 0 },
  });
  hubScene().enter(registry.app);
  const html = t();
  ok('hub: five disciplines', ['Power', 'Vitality', 'Fortune', 'Precision', 'Endurance'].every((n) => html.includes(n)));
  ok('hub: three alchemy tracks', ['Potency', 'Efficiency', 'Infusion'].every((n) => html.includes(n)));
  ok('hub: xp-only train buttons', html.includes('Train (15xp)'));
  ok('hub: scribe removed', !html.includes('Scribe'));
  ok('hub: forge button on equipped item', html.includes('+100c')); // knights_blade T2 lvl0 (T1 gear gets no button since 0.068)
}

// T28: 0.062 — precision taper, armor floor, title panel docked low
{
  const { precisionCrit, derivedStats } = await import('../../src/meta/stats.js');
  const T = DATA.difficulty.player.precisionTaper; // 0.112: +3%/level for 10 levels, then tapering to 40%
  const steps = Array.from({ length: 80 }, (_, l) => precisionCrit(l + 1) - precisionCrit(l));
  ok('precision taper: +3% for the first 10, then every level adds less, never nothing', Math.abs(precisionCrit(10) - T.perLevel * 10) < 1e-9
    && steps.every((g) => g > 0) && steps.slice(10).every((g, i, a) => !i || g < a[i - 1]) && precisionCrit(500) <= T.max + 1e-9);

  resetProfile();
  const p = getProfile();
  p.stats.precision = 10; // trained 12
  ok('derived crit uses the taper (0.05 base + precision)', Math.abs(derivedStats(p).crit - (0.05 + precisionCrit(12))) < 1e-9);

  // Armor floor: a blow always lands at least 15% of its raw damage
  const run = createRun();
  run.stats.dmg = 1; run.stats.armor = 5000;
  const cb = createCombat(run, { enemies: [{ id: 'golem', name: 'Fellblade', maxHp: 500, dmg: 200, xp: 1, coins: [1, 1] }] });
  const origRandom = Math.random;
  Math.random = () => 0.5; // raw = 200 + floor(0.5 x 21) = 210; the floor share of it beats 210-5000
  const evs = playerAttack(cb, 0, false);
  Math.random = origRandom;
  const hit = evs.find((e) => e.type === 'dmg');
  const floorPct = DATA.difficulty.combat.armorMinTakenPct;
  ok('armor soaks at most 83% of a blow (floor 17%, 0.093)', floorPct === 0.17 && hit && hit.taken === Math.ceil(210 * floorPct), hit?.taken);

  titleScene().enter(registry.app);
  ok('title dialog carries the low-dock class',
    registry.app.all((e) => (e.className || '').includes('title-panel')).length === 1);
}

// T31: 0.067 — precision desc shows the next click's ACTUAL gain (taper bands
// including ★ breakthrough doubles: lvl 4→5 counts double, hence '+2%').
{
  const { precisionDesc } = await import('../../src/ui/hubText.js');
  const { precisionCrit, trainedLevel } = await import('../../src/meta/stats.js');
  const eff = (l) => l + Math.floor(l / 5);
  const pct = (x) => `${Number((x * 100).toFixed(1))}%`;
  const want = (l) => { // 0.113: every level also adds crit damage, so none reads +0%
    const gain = precisionCrit(eff(l + 1)) - precisionCrit(eff(l));
    const dmg = pct((eff(l + 1) - eff(l)) * DATA.difficulty.player.critDamagePerPrecision);
    return gain >= 0.0005 ? `Crit Chance +${pct(gain)}, crit damage +${dmg}` : `crit chance maxed: crit damage +${dmg}`;
  };
  resetProfile();
  ok('precisionDesc shows the next click\'s actual gain (breakthroughs count double)', [0, 4, 9, 10, 19, 20, 30, 45].every((l) => precisionDesc(l) === want(l))
    && precisionDesc(0) === 'Crit Chance +3%, crit damage +1%' && precisionDesc(4) === 'Crit Chance +6%, crit damage +2%',
    [0, 4, 30].map(precisionDesc).join(' | '));
  ok('late precision never reads +0% (0.113)', [30, 46, 60, 99].every((l) => !precisionDesc(l).includes('+0%')), precisionDesc(46));
  getProfile().stats.precision = 12;
  hubScene().enter(registry.app);
  ok('hub shows the tapered gain at lvl 12', registry.app.textContent.includes(`Lv 12 — ${want(12)}`));
  // at the crit cap (crit gear), precision turns into crit damage instead
  const eq = getProfile().equipment;
  eq.trinket = 'fang_of_the_crimson_moon'; eq.weapon = 'moonbrand'; eq.rings = ['ring_of_the_blood_moon', 'ring_of_the_blood_moon'];
  getProfile().stats.precision = 30;
  const { derivedStats } = await import('../../src/meta/stats.js');
  const ds = derivedStats(getProfile());
  ok('crit past the cap becomes crit damage (0.112)', ds.crit === DATA.difficulty.player.critCap && ds.critBonus > 0
    && Math.abs(ds.critBonus - ((0.05 + 0.36 + precisionCrit(trainedLevel(getProfile(), 'precision')) - 0.6) * 1.5
      + trainedLevel(getProfile(), 'precision') * DATA.difficulty.player.critDamagePerPrecision)) < 1e-9
    && precisionDesc(30).startsWith('crit chance maxed: crit damage +'));
  resetProfile();
}

// T40: 0.079 — save schema versioning: old unversioned saves migrate once
// to SAVE_VERSION; fresh and imported saves carry the version.
{
  const { exportSave, importSave } = await import('../../src/meta/profile.js');
  const { SAVE_VERSION } = await import('../../src/meta/migrations.js');
  ok('save version defined', Number.isInteger(SAVE_VERSION) && SAVE_VERSION >= 1);
  resetProfile();
  ok('fresh profile carries saveVersion', getProfile().saveVersion === SAVE_VERSION);
  // A pre-0.079 save: no version, old single alchemy stat, flat inventory.
  const legacy = { coins: 5, xp: 1, stats: { power: 2, alchemy: 3 }, records: { runs: 4 },
    inventory: ['rusty_sword', 'rusty_sword'] };
  const code = Buffer.from(JSON.stringify({ ...legacy, equipment: {} })).toString('base64');
  // importSave requires equipment/records; build the legacy case directly too.
  localStorage.setItem('castle-roguelike-profile-v1', JSON.stringify(legacy));
  const mod = await import('../../src/meta/profile.js?legacy');
  const p = mod.getProfile();
  ok('legacy save migrates to current version', p.saveVersion === SAVE_VERSION
    && p.alchemy.potency === 3 && p.stats.alchemy === undefined
    && p.equipment && p.equipment.weapon === 'rusty_sword' && p.inventory === undefined
    && p.records.kills === 0 && p.records.runs === 4);
  ok('import stamps saveVersion', importSave(code) === true && getProfile().saveVersion === SAVE_VERSION);
  // the code carries the in-memory profile even when the browser refuses the write
  const setItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  getProfile().coins = 4321;
  const blocked = JSON.parse(Buffer.from(exportSave(), 'base64').toString('utf8'));
  localStorage.setItem = setItem;
  ok('export save reads the live profile, not the (possibly refused) store', blocked.coins === 4321);
  resetProfile();
}

// T42: 0.080 — potions persist between runs: unused ones come home (retreat
// and death), pickups past the cap are sold, the save migrates v1 -> v2,
// and the Great Hall shows the player level.
{
  const { settleRun, addPotion, drinkPotion } = await import('../../src/run/runState.js');
  resetProfile();
  const p = getProfile();
  const r1 = createRun();
  ok('run draws the stock and cap', r1.potions === 2 && r1.potionCap === 4);
  r1.hp = 1; drinkPotion(r1);
  settleRun(r1, 'retreat');
  ok('unused potions come home (retreat)', p.potions === 1);
  const r2 = createRun(); r2.potions = 3;
  settleRun(r2, 'death');
  ok('unused potions come home (death)', p.potions === 3);
  const r3 = createRun(); r3.potions = 4; r3.coins = 0;
  ok('pickup at the cap is sold', addPotion(r3) === false && r3.potions === 4 && r3.coins === DATA.difficulty.potions.fullSatchelSellCoins);
  const r4 = createRun(); r4.potions = 1;
  ok('pickup under the cap is kept', addPotion(r4) === true && r4.potions === 2);
  const sw = DATA.shrines.offers.find((o) => o.id === 'secondwind');
  const r5 = createRun(); r5.potions = 4; r5.coins = 1000; r5.roomNumber = 2; r5.hp = 1;
  acceptOffer(r5, sw);
  ok('secondwind goes over the satchel cap by design (0.091)', r5.potions === 6 && r5.hp === r5.maxHp);
  settleRun(r5, 'retreat');
  ok('...and leftovers are capped at settle', p.potions === p.potionCap);

  // v1 save (pre-0.080) with a big permanent potion count
  const { importSave } = await import('../../src/meta/profile.js');
  const { SAVE_VERSION } = await import('../../src/meta/migrations.js');
  const v1 = { ...JSON.parse(JSON.stringify(p)), saveVersion: 1, potions: 7, potionsBought: 5 };
  delete v1.potionCap;
  ok('v1 save migrates: count becomes a full satchel', importSave(Buffer.from(JSON.stringify(v1)).toString('base64'))
    && getProfile().potionCap === 7 && getProfile().potions === 7 && getProfile().potionsBought === 0 // (the v2 step drops the old count; the whole-making puts the 0.00204 field back at its default)
    && getProfile().saveVersion === SAVE_VERSION);
  const v1small = { ...v1, potions: 2 };
  importSave(Buffer.from(JSON.stringify(v1small)).toString('base64'));
  ok('small v1 stock keeps its potions, cap starts at 4', getProfile().potionCap === 4 && getProfile().potions === 2);
  const v1huge = { ...v1, potions: 25 };
  importSave(Buffer.from(JSON.stringify(v1huge)).toString('base64'));
  ok('huge v1 stock clamps to max cap', getProfile().potionCap === 10 && getProfile().potions === 10);

  resetProfile();
  const hub = hubScene();
  const root = new El('main');
  hub.enter(root);
  const txt = root.textContent;
  ok('Great Hall shows Level before Coins', txt.indexOf('Level') !== -1 && txt.indexOf('Level') < txt.indexOf('Coins'));
  ok('Great Hall shows potions as n/max and the satchel', txt.includes('2/4') && txt.includes('Potion Satchel'));
}

// T43: 0.081 — Great Hall stat boxes: 3 columns (Level/Coins/XP,
// Attack/HP/Armor, Potions centered), label top-left, value bottom-right.
{
  resetProfile();
  const root = new El('main');
  hubScene().enter(root);
  const grid = root.all((n) => n.className.includes('hub-stats'))[0];
  const labels = grid ? grid.children.map((b) => b.children[0].textContent) : [];
  ok('hub stat order', labels.join(',') === 'Level,Coins,XP,Attack,HP,Armor,Potions', labels.join(','));
  ok('potions box centered', grid && grid.children[6].className.includes('stat-potions'));
  const css = readFileSync('styles.css', 'utf8');
  ok('hub stats: 3 columns, label top-left, value bottom-right',
    css.includes('.hub-wrap .stat-grid.hub-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }')
    && css.includes('.hub-stats .stat-box .label { align-self: flex-start; }')
    && css.includes('.hub-stats .stat-box .value { align-self: flex-end;')
    && css.includes('.hub-stats .stat-potions { grid-column: 2; }'));
}

// T54: 0.091 — drops that can't beat the gear (as it will be after this
// run's finds) are salvaged on the spot for their salvage value; upgrades
// still drop; the per-run relic cap counts salvaged relics too.
{
  const { applyLoot } = await import('../../src/run/runState.js');
  const { salvageValue } = await import('../../src/meta/equipment.js');
  resetProfile();
  const p = getProfile();
  p.equipment.weapon = 'crimson_reaver'; // a T4 weapon: any other weapon is junk
  const run = createRun();
  const origR = Math.random;
  const items = DATA.items;
  const weaker = Object.keys(items).find((id) => items[id].slot === 'weapon' && items[id].tier === 1);
  const ring = Object.keys(items).find((id) => items[id].slot === 'ring' && items[id].tier === 1);
  // drive a rat's drop (tier-1 pool) to a chosen item: keep every higher
  // tier (equipped gear must resolve) plus only that one tier-1 item
  const only = (id) => {
    const keep = DATA.items;
    DATA.items = Object.fromEntries(Object.entries(keep).filter(([k, v]) => v.tier > 1 || k === id));
    return () => { DATA.items = keep; };
  };
  Math.random = () => 0.001;
  let undo = only(weaker);
  const lines = [];
  const c0 = run.coins;
  const r1 = applyLoot(run, scaleEnemy('rat', 1), (t, c) => lines.push(t));
  undo();
  ok('non-upgrade salvaged on the spot', r1.itemId === weaker && !r1.kept && !run.itemsFound.includes(weaker)
    && lines.some((l) => typeof l === 'string' && l.includes(`salvaged ${items[weaker].name}`)));
  ok('...for its salvage value', run.coins - c0 >= salvageValue(weaker));
  undo = only(ring);
  const r2 = applyLoot(run, scaleEnemy('rat', 1), () => {});
  undo();
  Math.random = origR;
  ok('upgrade (empty ring slot) still drops as an item', r2.kept && run.itemsFound.includes(ring));
  const { takeItem, relicIds } = await import('../../src/run/loot.js');
  const rr = createRun(), relic = relicIds()[0];
  takeItem(rr, relic, () => {}); // worn
  rr.relicFound = false;
  const again = takeItem(rr, relic, () => {}); // the same relic again: not an upgrade, salvaged
  ok('relic cap tracks salvaged relics too', !again.kept && rr.relicFound === true);
  resetProfile();
}

// T59: 0.097 review fixes — the dashboard sanitises pasted saves (and
// defuses spreadsheet formulas in its CSV), run-end counts cleared rooms
// right, the equip summary no longer lists a replaced find as equipped, a
// refused save write can't break the game, the death toll is a knob, and
// the panel blur is gone.
{
  const st = await import('../../analytics/stats.js');
  const evil = {
    playerId: '<b>id</b>-very-long-identifier', coins: '5<img src=x>', xp: 3, stats: { power: '<script>' }, equipment: { weapon: 'rusty_sword', rings: ['x'] },
    records: { runs: '<img src=x onerror=alert(1)>', bestRoom: 4, deaths: 1, kills: 2 }, secret: 'dropped',
    history: [{ at: 1, build: '0.095<i>', outcome: '<b>', room: '<svg>', killedBy: 'golem', boons: ['crit', { x: 1 }], extra: 'dropped' }],
  };
  const code = Buffer.from(JSON.stringify(evil)).toString('base64');
  const p = st.decodeSave(code);
  const numbersOnly = [p.coins, p.xp, ...Object.values(p.stats), ...Object.values(p.records)].every((v) => typeof v === 'number');
  ok('dashboard: pasted saves become plain numbers / short strings', numbersOnly && p.records.runs === 0 && p.coins === 0 && p.stats.power === 0
    && p.secret === undefined && p.playerId.length <= 16);
  const r = p.history[0];
  ok('...run records too (unknown fields dropped, outcome whitelisted)', typeof r.room === 'number' && r.outcome === 'death' && r.extra === undefined
    && r.boons.every((b) => typeof b === 'string') && r.killedBy === 'golem');
  const csv = st.toCsv([{ player: 'a', n: 1, at: 0, build: '=HYPERLINK("x")', outcome: 'death', room: -3, killedBy: '+cmd', boons: ['@x'] }]);
  const row = csv.split('\n')[1];
  ok('CSV: formula-looking text is defused, numbers untouched', row.includes(`"'=HYPERLINK(""x"")"`) && row.includes("'+cmd") && row.includes("'@x") && row.includes(',-3,'));

  // Run end: rooms cleared
  const { runEndScene } = await import('../../src/ui/scenes/runEndScene.js');
  const shown = (run, outcome) => {
    const root = new El('div');
    runEndScene(run, outcome).enter(root);
    const box = root.all((e) => e.className === 'stat-box').find((b) => b.textContent.startsWith('Rooms Cleared'));
    return box.textContent.replace('Rooms Cleared', '');
  };
  const base = { roomNumber: 9, kills: 1, coins: 10, coinsRetrieved: 5, coinsLost: 5, xp: 1, itemsFound: [], tollPct: 0.5 };
  ok('run end: dying in room 9 = 8 rooms cleared; retreating after 9 = 9', shown(base, 'death') === '8' && shown(base, 'retreat') === '9');

  // Equip summary: a find replaced by a later find is salvaged, not "equipped"
  const { equipItems } = await import('../../src/meta/equipment.js');
  const weapons = Object.entries(DATA.items).filter(([, v]) => v.slot === 'weapon');
  const t2 = weapons.find(([, v]) => v.tier === 2)[0], t3 = weapons.find(([, v]) => v.tier === 3)[0];
  const prof = { equipment: { weapon: 'rusty_sword', armor: null, boots: null, rings: [null, null], trinket: null, amulet: null } };
  const sum = equipItems(prof, [t2, t3]);
  ok('equip summary lists only what is still worn', sum.equipped.length === 1 && sum.equipped[0].name === DATA.items[t3].name
    && sum.salvaged.some((x) => x.name === DATA.items[t2].name));
  const ring = Object.keys(DATA.items).find((id) => DATA.items[id].slot === 'ring' && DATA.items[id].tier === 1);
  const twin = equipItems({ equipment: { weapon: null, armor: null, boots: null, rings: [null, null], trinket: null, amulet: null } }, [ring, ring]);
  ok('...two identical rings both stay listed', twin.equipped.length === 2);

  // A refused save write
  const { saveProfile } = await import('../../src/meta/storage.js');
  const { persist } = await import('../../src/meta/profile.js');
  const realSet = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  let threw = false;
  let res = null;
  try { res = saveProfile({ a: 1 }); persist(); } catch { threw = true; }
  globalThis.localStorage.setItem = realSet;
  ok('a refused save write never throws into the game', !threw && res === false);

  // Death toll knob
  const { settleRun } = await import('../../src/run/runState.js');
  resetProfile();
  const toll = DATA.difficulty.deathCoinToll; // (restored after — 0.00223: the test used to put 0.5 back by hand and read the file to check it)
  DATA.difficulty.deathCoinToll = 0.25;
  const dr = createRun(); dr.coins = 100; dr.roomNumber = 3;
  settleRun(dr, 'death');
  DATA.difficulty.deathCoinToll = toll;
  ok('death toll comes from difficulty.json', dr.coinsLost === 25 && dr.coinsRetrieved === 75 && toll > 0 && toll < 1);
  resetProfile();

  // Blur gone, small favicon, dead code gone
  const css = readFileSync('styles.css', 'utf8');
  ok('panels have no backdrop blur', !/\n[^/\n]*backdrop-filter:\s*blur/.test(css));
  const html = readFileSync('index.html', 'utf8');
  ok('small favicon', html.includes('href="icon-64.png"') && statSync('icon-64.png').size < 20000 && !html.includes('href="icon.png"'));
  const bl = await import('../../src/ui/battleLine.js');
  ok('dead code removed', bl.playerCard === undefined && !readFileSync('src/meta/equipment.js', 'utf8').includes('SINGLE_SLOTS'));
}

// T75: 0.112 — the stat review: no upgrade charges for nothing. Every
// level of every coin/XP track adds something; the shared taper; crit
// overflow reaches combat; the hub lines show the next level's gain.
{
  const { taper } = await import('../../src/meta/stats.js');
  const lv = await import('../../src/meta/leveling.js');
  const cfg = { perLevel: 0.08, linear: 3, max: 0.6 };
  ok('taper: linear, then a smooth fall (first step = perLevel), toward max', Math.abs(taper(3, cfg) - 0.24) < 1e-9 && Math.abs(taper(4, cfg) - 0.32) < 1e-9
    && taper(5, cfg) - taper(4, cfg) < 0.08 && taper(1000, cfg) <= 0.6 + 1e-9 && taper(-3, cfg) === 0
    && Math.abs(taper(6, { perLevel: 0.08, linear: 5, max: 0.6, rate: 0.12 }) - (0.4 + 0.2 * 0.12)) < 1e-9);
  const effSteps = Array.from({ length: 40 }, (_, l) => lv.efficiencyChance(l + 1) - lv.efficiencyChance(l));
  ok('efficiency: every level adds (none wasted), each a little less after 4', effSteps.every((g) => g > 0) && effSteps.slice(4).every((g, i, a) => !i || g < a[i - 1])
    && lv.efficiencyChance(20) > 0.49 && lv.efficiencyChance(20) < 0.51 && lv.efficiencyChance(40) - lv.efficiencyChance(20) > 0.04);
  resetProfile();
  getProfile().alchemy.efficiency = 20;
  ok('efficiency hub line: now and next', /now 50%, next \+0\.\d+%/.test((await import('../../src/ui/hubText.js')).efficiencyDesc()), (await import('../../src/ui/hubText.js')).efficiencyDesc());
  // 0.113: once a level would add < minStep the track is done — MAX, no button, no charge
  getProfile().alchemy.efficiency = 200; getProfile().coins = 1e6;
  const { canSpendCoins, canSpendAlchemy } = await import('../../src/ui/scenes/hubScene.js');
  hubScene().enter(registry.app);
  ok('maxed efficiency: MAX, not trainable, not counted as spendable', lv.alchemyMaxed('efficiency') && !lv.trainAlchemy('efficiency')
    && getProfile().coins === 1e6 && (await import('../../src/ui/hubText.js')).efficiencyDesc().includes('max') && registry.app.textContent.includes('MAX')
    && !lv.alchemyMaxed('potency') && !lv.alchemyMaxed('infusion'));
  getProfile().alchemy.potency = 1e9; getProfile().alchemy.infusion = 1e9; getProfile().potions = getProfile().potionCap; getProfile().potionCap = DATA.difficulty.potions.maxCap; getProfile().potions = getProfile().potionCap;
  ok('canSpendCoins skips maxed tracks (0.00209: by behaviour — every track maxed or priced out, the satchel full and maxed: nothing to buy)', !canSpendAlchemy(getProfile()) && !canSpendCoins(getProfile()));
  const { critMultiplier } = await import('../../src/run/combat.js');
  const src = readFileSync('src/run/combat.js', 'utf8');
  ok('crit overflow raises the crit multiplier in combat', src.includes('critMult: tune.critMult + combat.run.stats.critBonus')
    && critMultiplier({ critMult: 1.8, critJitter: 0 }, false) === 1.8);
  ok('stat study tool exists', readFileSync('tools/stat-study.mjs', 'utf8').includes('export async function statStudy'));
  resetProfile();
}

// T81: 0.116 — profile.js split: a new profile is built at the current
// save version from the data (no longer a "version 0" save run through
// every migration); stats/migrations/names have their own modules.
{
  const prof = await import('../../src/meta/profile.js');
  const { derivedStats } = await import('../../src/meta/stats.js');
  const { MIGRATIONS, SAVE_VERSION } = await import('../../src/meta/migrations.js').then((m) => ({ ...m, MIGRATIONS: m.MIGRATIONS ?? null }));
  getProfile().playerId = 'keepme12'; getProfile().name = 'Kept';
  prof.resetProfile();
  const p = getProfile(), pc = DATA.difficulty.potions;
  ok('fresh profile: current version, data potions, starting gear, same id + name', p.saveVersion === SAVE_VERSION && p.potions === pc.startCount
    && p.potionCap === pc.startCap && p.equipment.weapon === 'rusty_sword' && p.equipment.armor === 'oak_shield' && p.playerId === 'keepme12' && p.name === 'Kept');
  ok('fresh profile stats from the data', derivedStats(p).maxHp === DATA.difficulty.player.baseHp && derivedStats(p).dmg === DATA.difficulty.player.baseDmg + 4);
  resetProfile();
}

// tools/test/content.test.mjs — data/art integrity, relics, elite markers, CSS integrity.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, sleep, t, fresh, registry, El, DATA, show, handleKey, setBackground, transitionTo, createRun, generateRoom,
  scaleEnemy, createCombat, playerAttack, shrineOffers, canAffordOffer, acceptOffer, dungeonScene, hubScene, titleScene,
  resetProfile, getProfile, loadData, readFileSync, readdirSync, statSync } from './harness.mjs';

fresh();

// T16: content integrity — data JSONs, art files, and apply logic stay in
// sync (guards every future content drop)
{
  const { readdirSync } = await import('fs');
  const chars = readdirSync('assets/chars');
  const enemiesOk = Object.keys(DATA.enemies).every((id) => chars.includes(`${id}.webp`));
  const slots = new Set(['weapon', 'armor', 'boots', 'ring', 'trinket', 'amulet']);
  const itemsOk = Object.values(DATA.items).every((i) => slots.has(i.slot) && i.tier >= 1 && i.tier <= 4);
  ok('content integrity: enemy portraits + item slots', enemiesOk && itemsOk);

  // Every shrine offer id must have real apply logic — acceptOffer's
  // default branch silently pushes the buff without mutating anything.
  let shrineOk = true;
  for (const offer of DATA.shrines.offers) {
    const run = createRun();
    run.coins = 500; run.potions = 3; run.stats.armor = 8; // afford everything
    const strip = ({ buffs, ...rest }) => JSON.stringify(rest);
    const before = strip(run);
    acceptOffer(run, offer);
    if (strip(run) === before) shrineOk = false;
  }
  ok('every shrine offer mutates run state', shrineOk);

  // quicken: heavy cooldown drops to 2
  const { useHeavy } = await import('../../src/run/combat.js');
  const run = createRun();
  acceptOffer(run, DATA.shrines.offers.find((o) => o.id === 'quicken'));
  const cb = createCombat(run, { enemies: [] });
  useHeavy(cb);
  ok('quicken boon: heavy cooldown 3 -> 2', cb.heavyCd === 2);

  // greed: kill coins multiplied x1.4
  const { applyLoot } = await import('../../src/run/runState.js');
  const gr = createRun();
  acceptOffer(gr, DATA.shrines.offers.find((o) => o.id === 'greed'));
  // Read the kill-coins line: a junk drop salvaged on the spot (0.091) or a
  // sold potion adds its own coins on top — that's not the boon's doing.
  const lines = [];
  applyLoot(gr, { ...DATA.enemies.rat, hp: 14 }, (text) => lines.push(text));
  const gained = Number(String(lines[0]).match(/^\+(\d+) coins/)?.[1] ?? -1);
  ok('greed boon: kill coins x1.4', gained >= Math.round(3 * 1.4) && gained <= Math.round(7 * 1.4), gained);
}

// T20: (retired 0.082) cachebust.mjs stamping — superseded by the versioned
// boot in index.html (see T44), which busts caches on every host.

// T26: T4 crimson relics — drop gating, new powers, combat events, forge pricing
{
  const { rollLoot } = await import('../../src/run/loot.js');
  const { forgeCost } = await import('../../src/meta/leveling.js');
  const { createCombat, playerAttack } = await import('../../src/run/combat.js');
  const relics = Object.entries(DATA.items).filter(([, i]) => i.tier === 4);
  const slots = ['weapon', 'armor', 'boots', 'ring', 'trinket', 'amulet'];
  ok('seven T4 relics, valid slots', relics.length === 7 && relics.every(([, i]) => slots.includes(i.slot)));

  // Drop gating: weak enemies never carry relics, bosses roll the relic table
  const origRandom = Math.random;
  Math.random = () => 0.001;
  const ratLoot = rollLoot({ ...DATA.enemies.rat, maxHp: 14 }, 0);
  ok('relics never drop from weak enemies', ratLoot.itemId === null || DATA.items[ratLoot.itemId].tier < 4);
  const bossLoot = rollLoot({ boss: true, maxHp: 100, xp: 50, coins: [50, 60] }, 0);
  ok('bosses roll the relic table', bossLoot.itemId !== null && DATA.items[bossLoot.itemId].tier === 4);
  // 0.071: relics are depth-gated — before room 11 even bosses can't drop T4
  const bossShallow = rollLoot({ boss: true, maxHp: 100, xp: 50, coins: [50, 60] }, 0, 5);
  ok('no relics before room 11', bossShallow.itemId === null || DATA.items[bossShallow.itemId].tier < 4);
  const bossDeep = rollLoot({ boss: true, maxHp: 100, xp: 50, coins: [50, 60] }, 0, 11);
  ok('relics from room 11 on', bossDeep.itemId !== null && DATA.items[bossDeep.itemId].tier === 4);
  ok('t4MinRoom tunable is 11', DATA.difficulty.t4MinRoom === 11);
  Math.random = origRandom;

  // New powers reach derived stats
  resetProfile();
  const p = getProfile();
  p.equipment = {
    weapon: 'fang_of_the_eclipse', armor: 'bloodmoon_aegis', boots: 'umbral_treads',
    rings: ['ring_of_the_red_veil', null], trinket: 'heart_of_the_dying_moon', amulet: null,
  };
  const { derivedStats } = await import('../../src/meta/stats.js');
  const d = derivedStats(p);
  ok('relic powers: dodge 14%, thorns 4, heavy cd 2, revive', Math.abs(d.dodge - 0.14) < 1e-9
    && d.thorns === 4 && d.heavyCdMax === 2 && d.revive === true);
  ok('forge T4 base cost = 200c', forgeCost('fang_of_the_eclipse') === 200);

  // Combat: dodge avoids the blow entirely
  const run = createRun();
  run.stats.dmg = 1;
  const cb = createCombat(run, { enemies: [{ id: 'golem', name: 'Fellblade', maxHp: 500, dmg: 50, xp: 1, coins: [1, 1] }] });
  Math.random = () => 0.0; // dodge roll 0 < 0.14
  let evs = playerAttack(cb, 0, false);
  ok('dodge avoids the blow', evs.some((e) => e.type === 'dodge') && run.hp === run.maxHp);
  Math.random = origRandom;

  // Combat: thorns wound but never finish
  p.equipment = { weapon: null, armor: 'bloodmoon_aegis', boots: null, rings: [null, null], trinket: null, amulet: null };
  const run2 = createRun();
  run2.stats.dmg = 1;
  const cb2 = createCombat(run2, { enemies: [{ id: 'golem', name: 'Fellblade', maxHp: 10, dmg: 1, xp: 1, coins: [1, 1] }] });
  Math.random = () => 0.5; // no crit, no forced dodge
  evs = playerAttack(cb2, 0, false);
  Math.random = origRandom;
  const foe = cb2.enemies[0];
  ok('thorns wound the attacker', foe.hp === Math.max(1, 9 - 4) && evs.some((e) => e.type === 'thorns'));

  // Combat: the Heart revives once at half health
  p.equipment = { weapon: null, armor: null, boots: null, rings: [null, null], trinket: 'heart_of_the_dying_moon', amulet: null };
  const run3 = createRun(); // maxHp 500, armor 50, revive true
  run3.stats.dmg = 1;
  const cb3 = createCombat(run3, { enemies: [{ id: 'golem', name: 'Fellblade', maxHp: 500, dmg: 1000, xp: 1, coins: [1, 1] }] });
  Math.random = () => 0.5;
  evs = playerAttack(cb3, 0, false);
  Math.random = origRandom;
  ok('heart revives at half health, once', run3.revive === false && run3.hp === Math.ceil(run3.maxHp / 2)
    && evs.some((e) => e.type === 'revive') && !cb3.over);
}

// T27: elite star markers + epic relic log line
{
  const { isElite } = await import('../../src/shared/balance.js');
  const { enemyCard } = await import('../../src/ui/battleLine.js');
  const { rollLoot } = await import('../../src/run/loot.js');
  const rat = scaleEnemy('rat', 1);
  const golem = scaleEnemy('golem', 1);   // 70 maxHp — T3-strength elite
  const boss = scaleEnemy('vampire_lord', 8);
  ok('isElite: rat is not elite', !isElite(rat));
  ok('isElite: Fellblade (70hp) is elite', isElite(golem));
  ok('isElite: boss is elite', isElite(boss));

  const opts = { printing: false, combatOver: false, onAttack() {} };
  ok('elite card shows the star marker', enemyCard(golem, 0, 70, opts).textContent.includes('\u2605'));
  ok('boss card shows the star marker', enemyCard(boss, 0, boss.maxHp, opts).textContent.includes('\u2605'));
  ok('plain enemy card has no star', !enemyCard(rat, 0, 14, opts).textContent.includes('\u2605'));

  // 0.063: modal removed — relics announce themselves in the combat log
  resetProfile();
  const { applyLoot } = await import('../../src/run/runState.js');
  const runL = createRun();
  runL.roomNumber = 12; // past the t4MinRoom gate (0.071) so relics can roll
  const lines = [];
  const origR = Math.random;
  Math.random = () => 0.001; // force relic + potion drops
  applyLoot(runL, scaleEnemy('golem', 1), (text, cls) => lines.push({ text, cls }));
  const epic = lines.find((l) => l.cls === 'relic');
  ok('T4 drop logs a burning EPIC ITEM line', !!epic && Array.isArray(epic.text)
    && epic.text.some((s) => typeof s === 'string' && s.includes('EPIC ITEM'))
    && epic.text.some((n) => n && n.item && n.item.tier === 4));
  {
    // 0.079: run/ emits a DOM-free { item } part; hud.logLine renders it
    // as the rarity-4 span.
    const { logLine } = await import('../../src/ui/hud.js');
    const { el: mkEl } = await import('../../src/core/dom.js');
    const logBox = mkEl('div', {});
    logLine(logBox, epic.text, 'relic');
    ok('relic line renders rarity-colored name', logBox.all((n) => n.className === 'rarity-4').length === 1);
  }
  const lines2 = [];
  applyLoot(runL, scaleEnemy('rat', 1), (text, cls) => lines2.push({ text, cls }));
  Math.random = origR;
  ok('normal drops log a loot line (upgrade found, or salvaged on the spot — 0.091)', lines2.some((l) => l.cls === 'loot'
    && ((Array.isArray(l.text) && l.text[0] === 'Found: ') || (typeof l.text === 'string' && /\(salvaged /.test(l.text)))));
  ok('relic modal module is gone', await import('../../src/ui/relicModal.js').then(() => false, () => true));

  // loot.js and battleLine.js share one elite rule: starred enemies carry relics
  const origRandom = Math.random;
  Math.random = () => 0.001;
  const eliteDrop = rollLoot(golem, 0);
  Math.random = origRandom;
  ok('star-marked elites roll the relic table', eliteDrop.itemId !== null && DATA.items[eliteDrop.itemId].tier === 4);
  const { rarityClass } = await import('../../src/ui/hud.js');
  ok('T4 items use the crimson rarity class', rarityClass(DATA.items.umbral_treads) === 'rarity-4');
}

// T29: styles.css integrity — an unbalanced/stray brace silently eats the
// next rule (0.063 shipped a dead .title-panel rule this way).
{
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8')
    .replace(/\/\*[^*]*\*\//g, ''); // strip comments
  let depth = 0; let intact = true;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth < 0) { intact = false; break; }
  }
  ok('styles.css braces balanced', intact && depth === 0);
  ok('title-panel docking rule present', css.includes('#app > .panel.title-panel'));
}

// T80: 0.116 — every number the code reads is in the data (checked at
// load), and the code keeps no `?? N` fallback copies of them (they had
// drifted: boss x1.5/x1.25 vs 1.2/0.7 in the data, T4 chance 5% vs 2%).
{
  const { checkData } = await import('../../src/shared/dataCheck.js');
  ok('data check: every tuning number the code reads is present', checkData(DATA).length === 0, checkData(DATA).join('; '));
  const broken = structuredClone({ ...DATA });
  delete broken.difficulty.boss.hpMult;
  broken.difficulty.player.baseHp = 'lots';
  broken.audio.clips.attack = {};
  const probs = checkData(broken);
  ok('data check names what is missing or not a number', probs.some((p) => p.includes('boss.hpMult')) && probs.some((p) => p.includes('player.baseHp'))
    && probs.some((p) => p.includes('clips.attack.gainDb')), probs.join('; '));
  ok('loadData runs the check', readFileSync('src/shared/data.js', 'utf8').includes('checkData(DATA)'));
  const leaves = new Set(readFileSync('src/shared/dataCheck.js', 'utf8').match(/'[a-zA-Z.]+'/g).map((s) => s.slice(1, -1).split('.').pop()));
  const files = readdirSync('src', { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => `src/${f}`);
  const copies = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\.(\w+) \?\? -?[\d.]+/g)]
    .filter((m) => leaves.has(m[1]) && !f.endsWith('migrations.js') && !f.endsWith('history.js')).map((m) => `${f}: ${m[0]}`));
  ok('no fallback copies of data numbers in src (the shipped migration step and run records aside)', copies.length === 0, copies.join('; '));
}

// T88: the Particle Lab lives at particle-lab/, opened from the ?debug
// corner column; it loads the game's real art, not copies.
{
  const lab = readFileSync('particle-lab/index.html', 'utf8');
  const idx = readFileSync('index.html', 'utf8');
  ok('PARTICLE LAB is a ?debug corner button (no URL forward)', readFileSync('src/ui/debugToggles.js', 'utf8').includes("open?.('particle-lab/'") && !/particle_lab/i.test(idx));
  const refs = [...lab.matchAll(/\.\.\/assets\/[\w/.-]+\.(?:webp|ttf|jpg|json)/g)].map((m) => m[0].slice(3));
  ok('particle lab: every asset it loads exists', refs.length >= 6 && refs.every((f) => { try { return statSync(f).isFile(); } catch { return false; } }), refs.join(', '));
  ok('particle lab: no embedded copies, not indexed', !lab.includes('base64') && lab.includes('name="robots" content="noindex"'));
}

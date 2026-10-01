// tools/test/shrines.test.mjs — shrine placement, the shrine room, boon tuning text, the buff bar.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, sleep, t, fresh, registry, El, DATA, show, handleKey, setBackground, transitionTo, createRun, generateRoom,
  scaleEnemy, createCombat, playerAttack, shrineOffers, canAffordOffer, acceptOffer, dungeonScene, hubScene, titleScene,
  resetProfile, getProfile, loadData, readFileSync, readdirSync, statSync } from './harness.mjs';

fresh();

// T5: a shrine in every 8-room stretch (rooms 2-7, 10-15, ... — 0.091;
// it used to be only once per run); boon math
{
  const { enterNextRoom } = await import('../../src/run/runState.js');
  let placement = true;
  for (let i = 0; i < 40; i++) {
    const r = createRun();
    if (r.shrineRooms[0] < 2 || r.shrineRooms[0] > 7) placement = false;
    if (generateRoom(r.shrineRooms[0], r).kind !== 'shrine') placement = false;
    const kinds = [];
    for (let n = 0; n < 24; n++) kinds.push(enterNextRoom(r).kind);
    for (let s = 0; s < 3; s++) {
      const stretch = kinds.slice(s * 8, s * 8 + 8);
      const at = stretch.indexOf('shrine');
      if (stretch.filter((k) => k === 'shrine').length !== 1 || at < 1 || at > 6 || stretch[7] !== 'boss') placement = false;
    }
  }
  ok('one shrine in every 8-room stretch (2-7, 10-15, 18-23), boss at 8/16/24', placement);
  const run = createRun();
  const [dmg, crit, armor] = shrineOffers();
  const hp0 = run.maxHp, d0 = run.stats.dmg;
  acceptOffer(run, dmg);
  ok('dmg boon: -15% HP, +25% dmg, logged', run.stats.dmg === Math.round(d0 * 1.25) && run.maxHp < hp0 && run.buffs.length === 1);
  run.coins = 100; run.roomNumber = 6; const c0 = run.stats.crit;
  acceptOffer(run, crit);
  ok('crit boon (0.091): flat -30c at any depth, +15% crit', run.coins === 70 && Math.abs(run.stats.crit - (c0 + 0.15)) < 1e-9);
  run.potions = 2; run.stats.armor = 80;
  acceptOffer(run, armor);
  ok('armor boon: +25% of current, at least +30 (80 -> 110)', run.potions === 1 && run.stats.armor === 110);
  run.potions = 2; run.stats.armor = 400;
  acceptOffer(run, armor);
  ok('armor boon: +25% when that is more (400 -> 500)', run.stats.armor === 500);
  const leech = shrineOffers().find((o) => o.id === 'leech');
  const ls0 = run.stats.lifesteal || 0; const lh0 = run.maxHp;
  acceptOffer(run, leech);
  ok('leech boon: -15% HP, +100% lifesteal (0.093: x10 with HP)', leech.lifestealAdd === 1 && run.stats.lifesteal === Math.min(leech.lifestealCap, ls0 + 1) && run.maxHp < lh0);
  const bulwark = shrineOffers().find((o) => o.id === 'bulwark');
  const bd0 = run.stats.dmg; const ba0 = run.stats.armor;
  acceptOffer(run, bulwark);
  ok('bulwark boon: +20% armor (min +50), -10% dmg', run.stats.armor === ba0 + Math.max(50, Math.round(ba0 * 0.2)) && run.stats.dmg === Math.round(bd0 * 0.9));
  const secondwind = shrineOffers().find((o) => o.id === 'secondwind');
  run.coins = 100; run.hp = 1; const pw0 = run.potions;
  acceptOffer(run, secondwind);
  ok('secondwind boon (0.091): flat -40c, +2 potions, full heal', run.coins === 60 && run.potions === pw0 + 2 && run.hp === run.maxHp);
  const poor = createRun(); poor.coins = 10; poor.potions = 0;
  ok('affordability gates', !canAffordOffer(poor, crit) && !canAffordOffer(poor, armor) && canAffordOffer(poor, dmg) && !canAffordOffer(poor, secondwind) && canAffordOffer(poor, leech));
}

// T6: full shrine integration — walk to it, accept via hotkey, buff bar shows
{
  registry.app.innerHTML = ''; // NOT .children = [] — read-only, like real DOM
  // Strong profile so the walker survives to the shrine. NOTE: the profile
  // module caches in memory — mutate the live object, don't re-seed
  // localStorage (a weak profile can legitimately die first — that's the
  // game, not a bug).
  // vitality 40: this profile was tuned when vitality gave +12 HP/level;
  // 0.072 made it +9, and the walker started dying before the shrine.
  Object.assign(getProfile(), {
    // Overwhelming ON PURPOSE: the walk to the shrine must not be subject to
    // combat RNG at all (power 60 one-shots everything through room 7, 800+
    // HP cannot be drained by 2-6 dmg floor hits). This tests shrine
    // integration, not survival — survival curves are the simulator's job.
    coins: 500, xp: 0, stats: { power: 60, vitality: 80, fortune: 0, precision: 0, endurance: 0 },
    equipment: { weapon: 'executioner_axe', armor: 'dragonscale_mail', boots: null, rings: [null, null], trinket: null, amulet: null },
    potions: 5, records: { kills: 0, bestRoom: 0, runs: 1, deaths: 0 },
  });
  const scene = dungeonScene();
  scene.enter(registry.app);
  let guard = 0;
  while (!t().includes('shrine hums') && guard++ < 120) {
    if (t().includes('YOU DIED')) break; // fail fast — don't burn the guard loop
    if (t().includes('Push Deeper')) { handleKey('d'); await sleep(1600); continue; }
    // Drink below 60% HP ("HP 26/92" on the player card) — potions are a
    // no-op at full HP, and the pre-0.072 walker never drank at all.
    const hp = t().match(/HP (\d+)\/(\d+)/);
    if (hp && Number(hp[1]) < Number(hp[2]) * 0.6) { handleKey('p'); await sleep(300); }
    for (let k = 0; k < 3; k++) { handleKey('a'); await sleep(900); }
  }
  if (!t().includes('shrine hums')) {
    const { derivedStats: dd2 } = await import('../../src/meta/stats.js');
    const dd = dd2();
    console.log(`    [t6 debug] guard=${guard} died=${t().includes('YOU DIED')} profileNow: dmg=${dd.dmg} maxHp=${dd.maxHp} vit=${getProfile().stats.vitality} tail=${JSON.stringify(t().slice(-160))}`);
  }
  ok('shrine reached by walking', t().includes('shrine hums'));
  // Accept a boon via hotkey — the FIRST ENABLED one, not blindly '1'
  // (0.072c): runs start with 0 coins, so coin-priced boons (crit,
  // secondwind) are disabled at shrine depth 2-7 — when the shuffle deals
  // one into slot 1 (~22%), pressing '1' clicks nothing and the old test
  // flaked. Also retry: the shrine mounts through a 1000ms transition timer
  // that can fire late under load, dropping early keypresses.
  let bar, items = [];
  for (let i = 0; i < 6; i++) {
    const key = ['1', '2', '3'].find((k) => document.querySelectorAll(`button[data-key="${k}"]:not([disabled])`).length);
    if (key) handleKey(key);
    await sleep(500);
    bar = registry.app.all((e) => e.attrs && e.attrs.id === 'buffs')[0];
    items = bar ? bar.all((e) => e.className === 'buff') : [];
    if (items.length === 1 && t().includes('Retreat with Loot')) break;
  }
  if (!(items.length === 1 && t().includes('Retreat with Loot'))) {
    const btns = registry.app.all((e) => e.tagName === 'button');
    const txt = t();
    console.log(`    [t6b debug] items=${items.length} hums=${txt.includes('shrine hums')} fades=${txt.includes('light fades')} len=${txt.length} btns=${btns.map((b) => `${String(b.textContent).slice(0, 18)}[${b.attrs['data-key'] || '-'}${b.attrs.disabled !== undefined ? '!' : ''}]`).join(' ')} tail=${JSON.stringify(txt.slice(-300))}`);
  }
  ok('buff bar shows blessing after accept', items.length === 1 && t().includes('Retreat with Loot'));
}

// T39: 0.079 — tuning lives in data: shrine card text agrees with the
// boon's numbers, and hub discipline text is generated from player knobs.
{
  const pct = (x) => `${Math.round(x * 100)}%`;
  const expect = {
    dmg: (o) => [pct(o.dmgMult - 1), pct(o.hpCostPct)],
    crit: (o) => [pct(o.critAdd), String(o.coinCost)],
    armor: (o) => [`${pct(o.armorMult - 1)} ARMOR (MIN +${o.armorMin})`, `${o.potionCost} POTION`],
    leech: (o) => [pct(o.lifestealAdd), pct(o.hpCostPct)],
    bulwark: (o) => [`${pct(o.armorPct)} ARMOR (MIN +${o.armorAdd})`, pct(o.dmgCostPct)],
    secondwind: (o) => [`${o.potionsAdd} POTION`, String(o.coinCost)],
    quicken: (o) => [String(o.cdReduce), pct(o.hpCostPct)],
    greed: (o) => [pct(o.coinMultAdd), pct(o.dmgCostPct)],
    glasscannon: (o) => [pct(o.dmgMult - 1), pct(o.armorCostPct)],
  };
  const bad = DATA.shrines.offers.filter((o) => {
    const [buff, cost] = expect[o.id](o);
    return !o.buff.includes(buff) || !o.costDesc.includes(cost);
  }).map((o) => o.id);
  ok('shrine text matches shrine numbers', bad.length === 0, bad.join(','));
  const { statDesc } = await import('../../src/ui/hubText.js');
  const pl = DATA.difficulty.player;
  ok('hub stat text generated from data', statDesc('power', 0).includes(`+${pl.dmgPerPower} `)
    && statDesc('vitality', 0).includes(`+${pl.hpPerVitality} `) && statDesc('precision', 0).startsWith('Crit Chance +'));
}

// T58: 0.096 — compact buff bar: short labels from shrines.json (full
// text as the tooltip), repeated boons merge into one icon with a ×2
// badge, and in combat the bar is capped to the gap before the log.
{
  const { updateBuffs } = await import('../../src/ui/buffs.js');
  ok('every boon has a short label', DATA.shrines.offers.every((o) => typeof o.short === 'string' && o.short.length > 0 && o.short.length <= 16));
  const run = createRun();
  run.coins = 1000; run.potions = 3;
  const crit = DATA.shrines.offers.find((o) => o.id === 'crit');
  acceptOffer(run, crit);
  const b0 = run.buffs[0];
  ok('accepted boons carry short + full text', b0.label === crit.short && b0.full === crit.buff && b0.id === 'crit');
  acceptOffer(run, crit);
  acceptOffer(run, DATA.shrines.offers.find((o) => o.id === 'bulwark'));
  const bar = new El('div');
  updateBuffs(bar, run.buffs);
  const cells = bar.all((e) => e.className === 'buff');
  const badge = bar.all((e) => e.className === 'buff-count');
  ok('the same boon twice = one icon with a ×2 badge', cells.length === 2 && badge.length === 1 && badge[0].textContent === '×2');
  ok('cells show the short label, tooltip the full text', cells[0].textContent.includes(crit.short) && cells[0].attrs.title.startsWith(crit.buff) && cells[0].attrs.title.includes('x2'));
  const css = readFileSync('styles.css', 'utf8');
  ok('combat buff bar: capped before the log, wraps upward, 2-line labels',
    css.includes('max-width: calc(50vw - max(23vw, 170px) - 13.5vw)') && /#buffs \{[^}]*flex-wrap: wrap-reverse/.test(css) && css.includes('-webkit-line-clamp: 2'));
}

// 0.155 — treasure rooms: one per run at most, with `chance`, once the
// save's best room reaches unlockRoom (silently), never a boss room, the
// shrine stepping aside; three chests: coins, gear made to be an upgrade,
// the reliquary's blood price (it can kill) and its rare relic
{
  const T = DATA.difficulty.treasure;
  const tr = await import('../../src/run/treasure.js');
  const rs = await import('../../src/run/runState.js');
  const { generateRoom } = await import('../../src/run/roomGen.js');
  const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const real = Math.random;
  Math.random = seeded(11);
  let locked = 0, seen = 0, bad = 0;
  for (let i = 0; i < 2000; i++) {
    if (tr.rollTreasureRoom(T.unlockRoom - 1) !== null) locked++;
    const n = tr.rollTreasureRoom(20);
    if (n !== null) { seen++; if (n < T.minRoom || n > 20 || n % DATA.difficulty.bossEvery === 0) bad++; }
  }
  ok('treasure: locked until the best room reaches unlockRoom; then about `chance` of runs get one, in reach and never a boss room',
    locked === 0 && Math.abs(seen / 2000 - T.chance) < 0.04 && bad === 0, `${locked} ${seen} ${bad}`);
  fresh();
  getProfile().records.bestRoom = 20;
  let clash = 0, made = 0;
  for (let i = 0; i < 300; i++) {
    const run = rs.createRun();
    if (run.treasureRoom === null) continue;
    made++;
    for (let r = 0; r < run.treasureRoom; r++) rs.enterNextRoom(run);
    if (run.shrineRooms.includes(run.treasureRoom) || run.room.kind !== 'treasure') clash++;
  }
  ok('treasure: the room is a treasure room (its own painting), the stretch\'s shrine steps aside', made > 50 && clash === 0, `${made} ${clash}`);
  const room = () => ({ ...generateRoom(12, { treasureRoom: 12 }) });
  ok('treasure: a treasure room has no enemies and a treasure painting', room().kind === 'treasure' && room().enemies.length === 0 && DATA.backgrounds.treasure.includes(room().background));
  const run1 = rs.createRun(), log = () => {};
  const c0 = run1.coins, got1 = tr.openChest(run1, room(), 'coffer', log);
  ok('treasure: the coffer pays coins into the run', got1.coins > 0 && run1.coins === c0 + got1.coins);
  const run2 = rs.createRun(), got2 = tr.openChest(run2, room(), 'gilded', log);
  ok('treasure: the gilded chest\'s gear is an upgrade (kept) while one exists, of the depth\'s tier',
    got2.kept && run2.itemsFound.includes(got2.itemId) && DATA.items[got2.itemId].tier === (12 >= T.gilded.tier3Room ? 3 : 2));
  const run3 = rs.createRun(), max3 = run3.maxHp, cost = tr.reliquaryCost(run3);
  const got3 = tr.openChest(run3, room(), 'reliquary', log);
  ok('treasure: the reliquary costs hpCost of max HP as damage, max HP untouched', run3.hp === max3 - cost && run3.maxHp === max3 && !got3.died && got3.itemId);
  const run4 = rs.createRun(); run4.hp = cost; run4.revive = false;
  const got4 = tr.openChest(run4, room(), 'reliquary', log);
  ok('treasure: the reliquary can kill (no loot then, killed by the reliquary)', got4.died && run4.hp === 0 && run4.killedBy === 'reliquary' && !got4.itemId);
  let relics = 0;
  for (let i = 0; i < 400; i++) { const r = rs.createRun(); if (DATA.items[tr.openChest(r, room(), 'reliquary', log).itemId]?.tier === 4) relics++; }
  let early = 0;
  for (let i = 0; i < 200; i++) { const r = rs.createRun(); if (DATA.items[tr.openChest(r, { ...generateRoom(6, { treasureRoom: 6 }) }, 'reliquary', log).itemId]?.tier === 4) early++; }
  ok('treasure: the reliquary\'s relic is rare (about relicChance), and never before t4MinRoom', Math.abs(relics / 400 - T.reliquary.relicChance) < 0.06 && early === 0, `${relics} ${early}`);
  Math.random = real;
  // 0.157: a reliquary death leaves no live way on under the YOU DIED dialog
  // (Space used to click Push Deeper and carry a dead knight into the next room)
  {
    const { renderTreasureRoom } = await import('../../src/ui/treasureUI.js');
    const { handleKey } = await import('../../src/core/hotkeys.js');
    const { showDeathModal } = await import('../../src/ui/deathModal.js');
    const { el } = await import('../../src/core/dom.js');
    const run = rs.createRun(); run.hp = tr.reliquaryCost(run); run.revive = false;
    const rm = room();
    let deeper = 0, died = 0, dlg = null;
    const h = { title: ['T'], logEl: el('div'), buffBar: el('div'), coins: 0, xp: 0, onDeeper: () => deeper++, onRetreat: () => {},
      onDeath: () => { died++; dlg = showDeathModal(run, () => {}); }, refresh: () => renderTreasureRoom(registry.app, run, rm, h) };
    renderTreasureRoom(registry.app, run, rm, h);
    registry.app.all((e) => e.tagName === 'button' && e.textContent.includes('Open'))[2].click(); // the reliquary
    const buttons = registry.app.all((e) => e.tagName === 'button');
    ok('treasure: the reliquary\'s kill closes the chests and takes the way on away', died === 1 && run.hp === 0 && buttons.length === 0);
    handleKey(' ');
    ok('treasure: Space goes to the death dialog, not to Push Deeper', deeper === 0 && dlg && !dlg.isOpen());
  }
  fresh();
}

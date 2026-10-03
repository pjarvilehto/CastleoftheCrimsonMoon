// tools/test/items.test.mjs — the gear's pictures (0.00260): the files and
// the prompt sheet, what a find is worth over what it replaced, and every
// place a picture shows — the log line, the find card in combat, the hall's
// slots (desktop and phone), the hero card's inventory, the run's end.
// Run via tools/smoke-test.mjs.

import { existsSync, readFileSync } from 'node:fs';
import { ok, fresh, El, DATA, createRun, getProfile, withAnimations, sleep, byClass, handleKey } from './harness.mjs';

fresh();
const { itemArtUrl, itemArtUrls, potionArtUrl, gainLine } = await import('../../src/shared/itemArt.js');

// the files: every item names a WebP in assets/items/ that is on disk (dataCheck fails a missing name at load)
{
  const bad = Object.keys(DATA.items).filter((id) => { const u = itemArtUrl(id); return !u || !existsSync(u) || readFileSync(u).subarray(8, 12).toString() !== 'WEBP'; });
  ok('every item has its picture: a WebP in assets/items/ named by items.json art', bad.length === 0, bad.join(', '));
  const urls = itemArtUrls(['moonbrand']);
  ok('the preload list: every item\'s picture once, the worn gear first, the potion\'s last', urls[0] === itemArtUrl('moonbrand') && urls.length === Object.keys(DATA.items).length + 1 && urls.at(-1) === potionArtUrl() && new Set(urls).size === urls.length);
  const { checkData } = await import('../../src/shared/dataCheck.js').then((m) => ({ checkData: m.checkData ?? m.default ?? Object.values(m).find((f) => typeof f === 'function') }));
  const broken = structuredClone(DATA);
  delete broken.items.moonbrand.art;
  const out = checkData(broken);
  ok('dataCheck names an item with no picture', Array.isArray(out) && out.some((m) => /items\.json: moonbrand\.art/.test(m)), String(out).slice(0, 200));
}

// the prompt sheet and the tool: a line per item, the style block, and --import's edit keeps items.json's own layout
{
  const { readDoc, promptOf, setArt } = await import('../gen-items.mjs');
  const { style, lines } = readDoc();
  ok('docs/item-prompts.md: the style block and a line for every item and the potion', /Unreal Engine 5/.test(style) && /Mignola/.test(style)
    && Object.keys(DATA.items).every((id) => lines[id]) && !!lines.healing_potion, Object.keys(lines).length);
  ok('...a prompt is the style, then "The object:" and the line (+ a direction)', promptOf('S', 'L', 'H') === 'S\n\nThe object: L\nDirection: H');
  const text = '{\n  "a": {\n    "name": "A",\n    "tier": 1,\n    "dmg": 4\n  },\n  "b": {\n    "name": "B",\n    "tier": 2,\n    "art": "b_v1.webp",\n    "armor": 3\n  }\n}\n';
  const once = setArt(text, 'a', 'a_v1.webp'), twice = setArt(once, 'b', 'b_v2.webp');
  ok('...an import adds the art line after the tier, or changes it, leaving the file\'s layout', once.includes('"tier": 1,\n    "art": "a_v1.webp",\n    "dmg": 4') && twice.includes('"art": "b_v2.webp"') && !twice.includes('b_v1') && JSON.parse(twice).a.dmg === 4);
}

// what a find is worth over what it replaced
const I = DATA.items, dmgUp = I.moonbrand.dmg - I.rusty_sword.dmg; // (from the data: the balance moves the numbers)
ok('gainLine: the stats a find raises, two at most', gainLine('rusty_sword', 'moonbrand') === `+${dmgUp} dmg, +${Math.round(I.moonbrand.crit * 100)}% crit`, gainLine('rusty_sword', 'moonbrand'));
ok('...into an empty slot it is the item\'s own', gainLine(null, 'vampiric_ring') === '+30% lifesteal');
ok('...nothing raised is an empty line; a revive or a quicker heavy is named first', gainLine('moonbrand', 'rusty_sword') === '' && gainLine('relic_of_the_first_knight', 'heart_of_the_dying_moon').startsWith('a revive')
  && gainLine('moonbrand', 'fang_of_the_eclipse').startsWith('faster heavy'));

// run/loot.js takeItem: a kept find's line carries the slot it takes and what it replaces
{
  const { takeItem } = await import('../../src/run/loot.js');
  const run = createRun();
  run.gearPreview = { weapon: 'rusty_sword', armor: null, boots: null, rings: ['ring_of_might', null], trinket: null, amulet: null };
  const calls = [];
  takeItem(run, 'moonbrand', (text, cls, extra) => calls.push({ text, cls, extra }));
  const c = calls[0];
  ok('a kept find logs Found: with the item\'s id, and the find: its slot and what it replaces', c?.cls === 'loot' && c.text[1].id === 'moonbrand'
    && c.extra?.find?.id === 'moonbrand' && c.extra.find.slot === 'weapon' && c.extra.find.from === 'rusty_sword', JSON.stringify(c?.extra));
  calls.length = 0;
  takeItem(run, 'vampiric_ring', (text, cls, extra) => calls.push({ text, cls, extra }));
  ok('...a ring into the empty second slot: rings, index 1, nothing replaced', calls[0]?.extra?.find?.slot === 'rings' && calls[0].extra.find.index === 1 && calls[0].extra.find.from === null);
  calls.length = 0;
  takeItem(run, 'rusty_sword', (text, cls, extra) => calls.push({ text, cls, extra }));
  ok('...a salvaged drop carries no find', calls.length === 1 && calls[0].extra === undefined);

  // combatQueue: the line becomes a playback item with the find as its effect
  const { queueEvents } = await import('../../src/ui/combatQueue.js');
  const runQ = createRun();
  runQ.gearPreview = { weapon: 'rusty_sword', armor: null, boots: null, rings: [null, null], trinket: null, amulet: null };
  const queued = [];
  const origR = Math.random, origDrop = DATA.difficulty.dropChance;
  Math.random = () => 0.5; DATA.difficulty.dropChance = 1; // (a drop on every kill; which item is the pool's middle)
  try {
    const enemy = { ...DATA.enemies.rat, id: 'rat', hp: 0, maxHp: 10 };
    queueEvents([{ type: 'kill', enemy, text: 'The rat falls.' }], { run: runQ, combat: { enemies: [enemy] }, playback: { enqueue: (it) => queued.push(it) } });
  } finally { Math.random = origR; DATA.difficulty.dropChance = origDrop; }
  const found = queued.find((it) => it.fx?.kind === 'find');
  const kept = runQ.itemsFound.length > 0;
  ok('a kill\'s kept find prints with a find effect: the item, its slot, what it replaces', kept && found?.fx.id === runQ.itemsFound[0] && found.cls === 'loot' && 'from' in found.fx && !!found.fx.slot, JSON.stringify(found?.fx ?? runQ.itemsFound));
}

// the log line: the picture before the name, rimmed in its rarity
{
  const { logLine, itemPic, gearLabel } = await import('../../src/ui/hud.js');
  const box = new El('div');
  logLine(box, ['Found: ', { item: DATA.items.moonbrand, id: 'moonbrand' }, '!'], 'loot');
  const pic = box.all((n) => n.className?.includes?.('log-art'))[0];
  ok('a Found: line leads with the item\'s picture (tier-3 rim) and its name', !!pic && pic.attrs.src === itemArtUrl('moonbrand') && pic.className.includes('tier-3') && box.textContent.includes('Moonbrand'));
  ok('itemPic: null for an unknown item; gearLabel names the ring slots', itemPic('no_such_item') === null && gearLabel({ slot: 'rings', index: 1 }) === 'Ring II' && gearLabel({ slot: 'boots' }) === 'Boots');
}

// the find card in combat (ui/findFx.js): built, placed over the foes, flown to the hero
{
  const { findCard, findPop } = await import('../../src/ui/findFx.js');
  const { describeItem } = await import('../../src/ui/hud.js');
  const card = findCard({ id: 'moonbrand', slot: 'weapon', from: 'rusty_sword' });
  const text = card.textContent;
  ok('the find card: tier-3, FOUND · Weapon, the name, its stats, what it replaces and the gain', card.className === 'find-pop tier-3'
    && /Found · Weapon/.test(text) && text.includes('Moonbrand') && text.includes(describeItem(I.moonbrand)) && text.includes('replaces Rusty Sword') && text.includes(`+${dmgUp} dmg`));
  ok('...a ring into an empty slot says so', findCard({ id: 'vampiric_ring', slot: 'rings', index: 1, from: null }).textContent.includes('an empty slot'));
  const { lootSpot } = await import('../../src/ui/findFx.js');
  const box = (left, top, width, height) => () => ({ left, top, width, height, right: left + width, bottom: top + height });
  // the LOOT row bottom left: a label and a tray holding one chip; the counters above it
  const lootRow = () => {
    const res = Object.assign(new El('div'), { getBoundingClientRect: box(20, 700, 200, 90) });
    const row = Object.assign(new El('div'), { getBoundingClientRect: box(20, 760, 160, 30) });
    const tray = Object.assign(new El('span'), { getBoundingClientRect: box(80, 762, 30, 26) }); tray.className = 'loot-tray'; // (0.00299: found by its class — the row is a button, its children under el()'s label span)
    tray.append(new El('img'));
    row.append(new El('span'), tray);
    res.append(row);
    return row;
  };
  const spot = lootSpot(lootRow()), ahead = lootSpot(lootRow(), 2);
  ok('lootSpot: the tray\'s next free place, a chip\'s size; a find still flying puts the next one further along', spot.x === 125 && spot.y === 775 && spot.size === 30 && ahead.x === 125 + 2 * 33);
  const hidden = lootRow(); hidden.getBoundingClientRect = box(0, 0, 0, 0);
  const phone = lootSpot(hidden);
  ok('...a hidden row (a phone): the counters it sits under; nothing at all: null', phone.x === 220 - 45 && phone.y === 745 && lootSpot(null) === null);
  await withAnimations(async () => {
    const layer = new El('div');
    const unit = (left) => ({ card: Object.assign(new El('div'), { getBoundingClientRect: box(left, 200, 100, 300) }), portrait: null });
    const foes = [unit(600), unit(720)], hero = unit(40);
    const ctx = { layer, unit: (i) => (i === 'player' ? hero : foes[i] ?? null), loot: lootRow, lootAhead: () => 0 };
    const ms = findPop({ id: 'moonbrand', slot: 'weapon', from: 'rusty_sword' }, ctx);
    const pop = layer.children[0];
    const anim = pop?.animations?.[0], end = anim?.kf[3].transform ?? '';
    const [dx, dy] = (end.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/) ?? []).slice(1).map(Number);
    ok('findPop: the card over the foes, rising in, then flying down-left into the LOOT row; it says when it lands', !!pop && typeof ms === 'number' && ms > 1500
      && parseFloat(pop.style.left) > 500 && anim.kf.length === 4 && dx < -400 && dy > 400 && /scale\(0\.\d+\)/.test(end) && !hero.card.animations, end);
    findPop({ id: 'vampiric_ring', slot: 'rings', index: 0, from: null }, ctx);
    ok('...a second find in the same moment sits under the first', layer.children.length === 2 && parseFloat(layer.children[1].style.top) > parseFloat(layer.children[0].style.top));
  });
}

// the hall: the picture behind each worn slot — the desktop's knight panel and the phone's Equipment rows
{
  const { knightSection, equipSection } = await import('../../src/ui/hubSections.js');
  const p = getProfile();
  p.equipment = { weapon: 'moonbrand', armor: null, boots: 'traveler_boots', rings: ['vampiric_ring', null], trinket: null, amulet: null };
  const { panel } = knightSection(p, () => {});
  const slots = panel.all((n) => n.className?.startsWith?.('gear-slot'));
  const art = (s) => s.all((n) => n.className?.includes?.('item-pic'))[0];
  const weapon = slots.find((s) => s.attrs['data-row'] === 'slot-Weapon'), armor = slots.find((s) => s.attrs['data-row'] === 'slot-Armor');
  ok('desktop hall: a worn slot carries its item\'s picture (has-art), an empty one none', weapon.className.includes('has-art') && art(weapon)?.attrs.src === itemArtUrl('moonbrand')
    && !armor.className.includes('has-art') && !art(armor));
  const rows = equipSection(p, () => {}).all((n) => n.className?.startsWith?.('item-row') && n.attrs['data-row']?.startsWith('slot-'));
  const ring = rows.find((r) => r.attrs['data-row'] === 'slot-Ring I');
  ok('phone hall: the Equipment rows too', ring.className.includes('has-art') && art(ring)?.attrs.src === itemArtUrl('vampiric_ring') && !rows.find((r) => r.attrs['data-row'] === 'slot-Amulet').className.includes('has-art'));
}

// the run's end: a card per slot the finds changed, the salvage as chips
{
  const { runEndScene } = await import('../../src/ui/scenes/runEndScene.js');
  const root = new El('div');
  const changes = [
    { slot: 'weapon', from: 'rusty_sword', to: 'moonbrand' },
    { slot: 'amulet', from: null, to: 'amulet_of_the_blood_eclipse' },
  ];
  runEndScene({ roomNumber: 9, kills: 4, coins: 10, coinsRetrieved: 10, xp: 5, itemsFound: ['moonbrand', 'amulet_of_the_blood_eclipse'],
    equipSummary: { equipped: [], salvaged: [{ id: 'rusty_sword', name: 'Rusty Sword', tier: 1 }], coins: 8, changes } }, 'retreat').enter(root);
  const cards = root.all((n) => n.className?.startsWith?.('find-card'));
  ok('run end: a find card per changed slot — the slot, the name, what it beat and the gain; a relic tagged', cards.length === 2
    && cards[0].textContent.includes('Weapon') && cards[0].textContent.includes('over Rusty Sword') && cards[0].textContent.includes(`+${dmgUp} dmg`)
    && cards[1].className.includes('tier-4') && byClass(cards[1], 'fc-tag')[0]?.textContent === 'Relic' && cards[1].textContent.includes('into an empty slot'));
  const chips = byClass(root, 'salvage-chip');
  ok('...what was salvaged as small pictures with the coins', chips.length === 1 && chips[0].all((n) => n.className?.includes?.('item-pic')).length === 1 && root.textContent.includes('+8 coins'));
}

// the hero card's inventory page: the worn gear, each slot a strip with its item's picture (0.00290; the run's finds no longer listed there)
{
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  const run = createRun();
  run.itemsFound.push('fang_of_the_eclipse');
  const u = createPlayerUnit(run, { onHeavy() {}, onPotion() {} });
  const worn = byClass(u.el, 'inv-row').filter((r) => !String(r.className).split(' ').includes('empty'));
  const pics = worn.map((r) => byClass(r, 'slot-art')[0]?.children[0]?.attrs?.src);
  const eq = getProfile().equipment;
  ok('the hero card\'s inventory: each worn item\'s picture on its strip, the run\'s finds not listed', worn.length > 0 && pics[0] === itemArtUrl(eq.weapon) && pics.every(Boolean)
    && !pics.includes(itemArtUrl('fang_of_the_eclipse')) && !Object.values(eq).flat().includes('fang_of_the_eclipse'));
}

// the dungeon's LOOT row under XP / COINS (the developer named it): there from the first room, hidden until a find;
// 0.00299: a button keyed I — the one action on the combat screen that had no key — opening the LOOT pop-up once there is a find
{
  const { show, sleep, t, registry, dungeonScene, handleKey, withSeedAsync } = await import('./harness.mjs');
  const { anyDialogOpen, closeAllDialogs } = await import('../../src/ui/dialog.js');
  fresh();
  await withSeedAsync(11, async () => {
    show(dungeonScene());
    await sleep(1500);
    const row = registry.app.all((n) => n.className?.includes?.('res-loot'))[0];
    ok('the LOOT row: labelled LOOT, hidden while the run has found nothing', !!row && row.textContent === 'LOOT' && row.classList.contains('none') && t().includes('COINS'));
    ok('…a button keyed I (0.00299); with nothing found, I opens nothing', row.tagName === 'button' && row.attrs['data-key'] === 'i' && (handleKey('i'), !anyDialogOpen()));
    DATA.difficulty.dropChance = 1; // (a drop on every kill; the first into an empty slot is kept — fresh() puts the knob back)
    for (let i = 0; i < 80 && !t().includes('Found:') && !t().includes('YOU DIED'); i++) {
      if (t().includes('Push Deeper')) { handleKey('d'); await sleep(4500); } else { handleKey('a'); await sleep(900); }
    }
    const found = t().includes('Found:');
    handleKey('i');
    const strips = byClass(document.body, 'loot-list')[0]?.children ?? [];
    ok('…once the run has a find, I opens the LOOT pop-up with it', found && anyDialogOpen() && strips.length >= 1, `found ${found}, ${strips.length} strips`);
    handleKey('c');
    ok('…and C closes it', !anyDialogOpen());
    closeAllDialogs();
  });
}

// the hero card's INVENTORY page's FINDS line (0.00299): the run's finds counted, a tap opens the LOOT pop-up (the phone's way
// to it — its top strip has no LOOT row); gone while nothing is found; not a <button> (the unit's first button is the heavy's)
{
  fresh();
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  const { anyDialogOpen, closeAllDialogs } = await import('../../src/ui/dialog.js');
  const run = createRun();
  const u = createPlayerUnit(run, { onHeavy() {}, onPotion() {} });
  const line = () => byClass(u.card, 'inv-finds')[0];
  ok('no finds: the FINDS line is hidden, a div with the button\'s role', line()?.classList.contains('none') && line().tagName === 'div' && line().attrs.role === 'button' && u.el.all((n) => n.tagName === 'button')[0]?.textContent.startsWith(run.hero.heavyName));
  run.itemsFound.push('vampiric_ring', 'moonbrand');
  u.update({ hp: run.hp, heavyCd: 0, heavyReady: true, dead: false, printing: false });
  await u.card.listeners.click[0](); await u.card.listeners.click[0](); // (front → STATS → INVENTORY: the shown page refreshes)
  ok('two finds: "Finds · 2 ›" on the INVENTORY page', !line().classList.contains('none') && line().textContent === 'Finds · 2 ›');
  const flips = u.card.listeners.click.length;
  line().listeners.click[0]({ stopPropagation() { this.stopped = true; } });
  ok('…a tap opens the LOOT pop-up with both finds, and stays in the line (the card would turn over)', anyDialogOpen() && byClass(document.body, 'loot-list')[0]?.children.length === 2 && u.card.listeners.click.length === flips);
  closeAllDialogs();
}

// the healing potion (0.00263): its picture on the hero card's count; a found potion's card flies into that count,
// which holds the potion back until it lands, then counts it
{
  const { potionPic } = await import('../../src/ui/hud.js');
  const { potionCard, potionPop } = await import('../../src/ui/findFx.js');
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  const { checkData } = await import('../../src/shared/dataCheck.js');
  const u = potionArtUrl();
  ok('the potion\'s picture: difficulty.json potions.art, a WebP on disk; dataCheck names a missing one', !!u && existsSync(u) && potionPic().attrs.src === u
    && (() => { const b = structuredClone(DATA); delete b.difficulty.potions.art; return checkData(b).some((m) => /potions\.art/.test(m)); })());
  const run = createRun();
  run.potions = 2; run.potionCap = 4;
  const hero = createPlayerUnit(run, { onHeavy() {}, onPotion() {} });
  const count = () => byClass(hero.potionsEl, 'potion-count')[0].textContent;
  ok('the hero card: the potion\'s picture and the count', hero.potionsEl.all((n) => n.className?.includes?.('potion-ic'))[0]?.attrs.src === u && count() === '2/4');
  run.potions = 3; hero.holdPotion();
  hero.update({ hp: run.hp, heavyCd: 0, heavyReady: false, dead: false, printing: true });
  ok('...a potion on its way is held back, through the card\'s updates', count() === '2/4');
  hero.landPotion();
  ok('...and counted as it lands', count() === '3/4');
  const card = potionCard(run);
  { const { logLine } = await import('../../src/ui/hud.js'); const b = new El('div'); logLine(b, ['Found a ', { potion: true }, 'healing potion!'], 'loot');
    ok('the log\'s potion line carries the potion\'s picture', b.all((n) => n.className?.includes?.('potion-pic'))[0]?.attrs.src === u && b.textContent.includes('healing potion')); }
  ok('the potion\'s card: FOUND · Potion, what it heals, the satchel', card.className === 'find-pop potion-pop' && /Found · Potion/.test(card.textContent) && card.textContent.includes('Healing Potion') && card.textContent.includes('3 / 4'));
  // the flight: from the queue's hold to the landing
  const { queueEvents } = await import('../../src/ui/combatQueue.js');
  const runQ = createRun(), queued = [];
  let held = 0;
  const origR = Math.random, origDrop = DATA.difficulty.dropChance;
  Math.random = () => 0.001; DATA.difficulty.dropChance = 0; // (a potion drops; no item)
  try {
    runQ.potions = 0;
    const enemy = { ...DATA.enemies.rat, id: 'rat', hp: 0, maxHp: 10 };
    queueEvents([{ type: 'kill', enemy, text: 'The rat falls.' }], { run: runQ, combat: { enemies: [enemy] }, playback: { enqueue: (it) => queued.push(it) }, potionQueued: () => held++ });
  } finally { Math.random = origR; DATA.difficulty.dropChance = origDrop; }
  ok('a found potion prints with a potion effect and asks the card to hold it', queued.some((it) => it.fx?.kind === 'potion' && it.text[0] === 'Found a ' && it.text[1]?.potion && it.text[2] === 'healing potion!') && held === 1 && runQ.potions === 1);
  await withAnimations(async () => {
    const box = (left, top, width, height) => () => ({ left, top, width, height, right: left + width, bottom: top + height });
    const layer = new El('div');
    const unitAt = (left) => ({ card: Object.assign(new El('div'), { getBoundingClientRect: box(left, 200, 100, 300) }), portrait: null });
    const landed = [];
    const heroU = { potionsEl: Object.assign(new El('div'), { getBoundingClientRect: box(60, 560, 80, 20) }), landPotion: () => landed.push(1) };
    const ms = potionPop({ layer, unit: (i) => (i === 'player' ? heroU : [unitAt(600)][i] ?? null), run: () => run });
    const end = layer.children[0]?.animations?.[0]?.kf[3].transform ?? '';
    const [dx, dy] = (end.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/) ?? []).slice(1).map(Number);
    ok('...its card rises over the foes and flies down-left into the hero card\'s count', ms > 1500 && dx < -400 && dy > 200 && landed.length === 0, end);
    await sleep(ms + 10);
    ok('...where it is counted as it lands', landed.length === 1);
  });
}

// the classes' starting kits (0.00265): a weapon and an armor per class, the knight's the Rusty Sword and the Oak Shield;
// the same numbers as those (the classes play alike so far), never dropped, worn by a new save on PROCEED
{
  const { heroList, heroById, heroKit } = await import('../../src/shared/heroes.js');
  const { rollLoot, droppable } = await import('../../src/run/loot.js');
  const { checkData } = await import('../../src/shared/dataCheck.js');
  const { wearKit } = await import('../../src/ui/scenes/heroScene.js');
  const stats = (id) => { const { name, slot, tier, art, starter, kind, class: c, ...rest } = DATA.items[id]; return JSON.stringify(rest); };
  const g = DATA.difficulty.player.startingGear, kits = heroList().map((h) => heroKit(h));
  ok('every class has a kit: a weapon and an armor, with the starting gear\'s numbers, the knight\'s that gear', kits.length === 7 && kits.every((k) => DATA.items[k.weapon]?.slot === 'weapon' && DATA.items[k.armor]?.slot === 'armor'
    && stats(k.weapon) === stats(g.weapon) && stats(k.armor) === stats(g.armor)) && heroKit(heroById('knight')).weapon === g.weapon && new Set(kits.flatMap((k) => [k.weapon, k.armor])).size === 2 + 12);
  const starters = Object.keys(DATA.items).filter((id) => DATA.items[id].starter);
  ok('...the twelve new ones and the knight\'s two are starters with their pictures; a starter never drops (0.00299: the knight\'s used to drop as another class\'s off-class junk)', starters.length === 14 && starters.every((id) => existsSync(itemArtUrl(id)) && !droppable(id)) && !droppable('oak_shield'));
  const origR = Math.random, seen = new Set();
  try { for (let i = 0; i < 2000; i++) { Math.random = () => (i * 0.6180339) % 1; const r = rollLoot({ ...DATA.enemies.rat, id: 'rat', maxHp: 10 }, 1, 1, true); if (r.itemId) seen.add(r.itemId); } } finally { Math.random = origR; }
  ok('...a kill\'s loot never rolls one', seen.size > 3 && ![...seen].some((id) => DATA.items[id].starter), [...seen].join());
  const b = structuredClone(DATA); b.heroes.heroes[2].kit.armor = 'grave_knife';
  ok('...dataCheck names a kit item of the wrong slot', checkData(b).some((m) => /wizard\.kit\.armor/.test(m)));
  const fresh1 = { equipment: { weapon: g.weapon, armor: g.armor } };
  wearKit(fresh1, heroById('plaguesister'));
  const found = { equipment: { weapon: 'moonbrand', armor: g.armor } };
  wearKit(found, heroById('wizard'));
  ok('wearKit: the class\'s kit over the default gear, never over a find', fresh1.equipment.weapon === 'tin_censer' && fresh1.equipment.armor === 'sisters_habit'
    && found.equipment.weapon === 'moonbrand' && found.equipment.armor === 'threadbare_robe');
}

// the stat colours (0.00266, the developer's call): a stat's words and numbers in its colour, the same as the Train
// row that raises it — Power and damage, Vitality and HP, Endurance and armor, Precision and crit, Fortune and loot
{
  const { statText, statKind, ST_TRAIN, statBox } = await import('../../src/ui/hud.js');
  const kinds = (s) => statText(s).filter((x) => typeof x !== 'string').map((x) => `${x.className.replace('st st-', '')}:${x.textContent}`).join(' | ');
  ok('statText: each stat with its number in its colour, the rest plain', kinds('+40 armor, +80 HP') === 'armor:+40 armor | hp:+80 HP'
    && kinds('+3% crit chance, +1% crit damage') === 'crit:+3% crit chance | crit:+1% crit damage' && kinds('+3% crit, +1% crit dmg') === 'crit:+3% crit | crit:+1% crit dmg'
    && kinds('+6 dmg') === 'dmg:+6 dmg' && kinds('Better loot drops') === 'loot:Better loot drops' && kinds('30% lifesteal, 8% dodge') === 'ls:30% lifesteal | dodge:8% dodge'
    && kinds('faster heavy recharge') === '' && statText('a, b').join('') === 'a, b', kinds('+3% crit, +1% crit dmg'));
  ok('...every Train discipline names a stat with a colour', Object.keys(ST_TRAIN).sort().join() === Object.keys((await import('../../src/meta/leveling.js')).STAT_DEFS).sort().join()
    && Object.values(ST_TRAIN).every((k) => readFileSync('styles.css', 'utf8').includes(`--st-${k}:`)) && statKind('Max HP') === 'hp');
  const { trainSection, knightSection } = await import('../../src/ui/hubSections.js');
  const p = getProfile();
  const rows = trainSection(p, false, () => {}).all((n) => n.className?.startsWith?.('item-row'));
  const power = rows.find((r) => r.attrs['data-row'] === 'power'), vit = rows.find((r) => r.attrs['data-row'] === 'vitality');
  ok('TRAIN: each row wears its stat\'s colour, its effect too', power.classList.contains('st-dmg') && power.classList.contains('st-row') && vit.classList.contains('st-hp')
    && power.all((n) => n.className === 'st st-dmg').length === 1);
  const boxes = knightSection(p, () => {}).boxes;
  ok('...and the stat boxes the same: Attack with Power, HP with Vitality, Crit with Precision', boxes.Attack.classList.contains('st-dmg') && boxes.HP.classList.contains('st-hp') && boxes.Crit.classList.contains('st-crit') && boxes.Armor.classList.contains('st-armor')
    && !statBox('Coins', 1).classList.contains('st-box'));
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  const hero = createPlayerUnit(createRun(), { onHeavy() {}, onPotion() {} });
  const backRow = (label) => hero.card.all((n) => n.className?.startsWith?.('back-row') && n.children[0]?.textContent === label)[0];
  ok('the hero card: DMG and ARMOR in their colours; its STATS page by stat, the potion\'s heal as HP', hero.card.all((n) => n.className === 'weapon-dmg st st-dmg').length === 1
    && backRow('Attack').classList.contains('st-dmg') && backRow('Crit damage').classList.contains('st-crit') && backRow('Potion heals').classList.contains('st-hp') && !backRow('Heavy Attack').classList.contains('st')); // (0.00267: the heavy's row is named per class — the knight's is Heavy Attack)
}

// the item matrix (0.00274, the developer's call; docs/item-matrix.md): weapon kinds, one armor weight per class, items
// named for a class; another class's gear still drops and is salvaged at the run's end; a class's two signature items
// feed its mechanic (+1 at tier 3, +2 at tier 4); a save's gear the class can't use becomes its kit
{
  const { canUse, usersText, fitGearToClass, masteryText } = await import('../../src/shared/classGear.js');
  const { describeItem } = await import('../../src/ui/hud.js');
  const { heroList, heroById } = await import('../../src/shared/heroes.js');
  ok('who can use what: plate is the knight\'s, a robe the casters\', the Knight\'s Blade his alone, boots everyone\'s', !canUse('wizard', 'plate_armor') && canUse('knight', 'plate_armor')
    && canUse('wizard', 'scholars_robe') && canUse('plaguesister', 'scholars_robe') && !canUse('barbarian', 'scholars_robe') && canUse('wizard', 'ritual_dagger') && !canUse('hexhunter', 'ritual_dagger')
    && !canUse('hexhunter', 'knights_blade') && canUse('hexhunter', 'moonbrand') && !canUse('knight', 'executioner_axe') && canUse('barbarian', 'flanged_mace') && canUse('plaguesister', 'flanged_mace')
    && heroList().every((h) => canUse(h.id, 'hobnailed_boots')) && canUse(null, 'plate_armor') && usersText('hobnailed_boots') === 'Everyone' && usersText('plate_armor') === 'Knight');
  const droppable = (id) => !DATA.items[id].starter;
  const cover = heroList().map((h) => [2, 3, 4].map((t) => {
    const ids = Object.keys(DATA.items).filter((id) => DATA.items[id].tier === t && droppable(id) && canUse(h.id, id));
    return [ids.filter((id) => DATA.items[id].slot === 'weapon').length, ids.filter((id) => DATA.items[id].slot === 'armor').length];
  }));
  ok('every class has two weapons and an armor to find at tiers 2, 3 and 4', cover.every((tiers) => tiers.every(([w, a]) => w >= 2 && a >= 1)), JSON.stringify(cover));
  ok('...each class wears one weight and its kit is its own', heroList().every((h) => typeof h.wears === 'string' && canUse(h.id, h.kit.weapon) && canUse(h.id, h.kit.armor) && heroList().filter((o) => o.id !== h.id).every((o) => !canUse(o.id, h.kit.armor))));
  const sig = heroList().map((h) => Object.values(DATA.items).filter((it) => it.class === h.id && it.mastery).map((it) => `${it.tier}:${it.mastery}`).sort().join());
  ok('...each class has two signature items: +1 at tier 3, +2 at tier 4', sig.every((s) => s === '3:1,4:2'), sig.join(' | '));
  ok('plate is stronger than cloth, tier for tier', [2, 3, 4].every((t) => {
    const val = (kind) => Math.max(...Object.values(DATA.items).filter((it) => it.tier === t && it.slot === 'armor' && it.kind === kind && !it.starter).map((it) => (it.armor ?? 0) * 0.4 + (it.hp ?? 0) * 0.05));
    return val('heavy') > val('hide') && val('hide') > val('cloth');
  }));
  ok('a signature item says what it feeds', describeItem(DATA.items.chained_grimoire).endsWith('+1 Fireball charge') && describeItem(DATA.items.archmages_starstone).endsWith('+2 Fireball charges')
    && masteryText(heroById('barbarian'), 2) === '+30% Cleave reach');
  // the mastery in the run's class block
  const { derivedStats } = await import('../../src/meta/stats.js');
  const { emptyEquipment } = await import('../../src/meta/equipment.js');
  const prof = (hero, eq) => ({ ...structuredClone(getProfile()), hero: { id: hero, look: 0 }, equipment: { ...emptyEquipment(), ...eq } });
  const base = heroById('wizard').class.charges;
  ok('the mastery feeds the class: +1 and +2 Fireball charges; another class\'s signature nothing', derivedStats(prof('wizard', { trinket: 'chained_grimoire' })).klass.charges === base + 1
    && derivedStats(prof('wizard', { trinket: 'chained_grimoire', amulet: 'archmages_starstone' })).klass.charges === base + 3
    && derivedStats(prof('druid', { amulet: 'heartwood_of_the_elder_grove' })).klass.entangleTurns === heroById('druid').class.entangleTurns + 2
    && derivedStats(prof('knight', {})).klass.heavyMult === heroById('knight').class.heavyMult);
  // equipping: another class's gear is salvaged, marked
  const { equipItems } = await import('../../src/meta/equipment.js');
  const wiz = prof('wizard', { weapon: 'apprentices_staff', armor: 'threadbare_robe' });
  const sum = equipItems(wiz, ['plate_armor', 'scholars_robe']);
  ok('equipItems: a wizard wears the robe; the plate is salvaged as another class\'s', wiz.equipment.armor === 'scholars_robe' && sum.salvaged.some((s) => s.id === 'plate_armor' && s.offClass) && sum.coins > 0);
  // a find: another class's gear is carried, with its line, not judged
  const { takeItem, rollLoot } = await import('../../src/run/loot.js');
  const run = createRun();
  run.heroId = 'wizard'; run.gearPreview = structuredClone(wiz.equipment);
  const lines = [];
  const r = takeItem(run, 'bearhide_mantle', (text, cls, extra) => lines.push({ text, extra }));
  ok('takeItem: another class\'s gear goes in the run\'s loot, its line says whose and that it is salvaged at the end', r.offClass && !r.kept && run.itemsFound.includes('bearhide_mantle')
    && lines[0].text.join('').includes('salvaged at the end') && /Barbarian, Druid|another class/.test(lines[0].extra.find.offClass), JSON.stringify(lines[0]?.extra));
  // drops: classDropShare of them from the class's own pool
  const origR = Math.random, share = DATA.difficulty.classDropShare;
  const rolls = (s) => { DATA.difficulty.classDropShare = s; const seen = new Set(); let i = 0; Math.random = () => ((i++ * 0.6180339887) % 1); for (let k = 0; k < 600; k++) { const it = rollLoot({ ...DATA.enemies.skeleton, id: 'skeleton', maxHp: 999 }, 1, 30, true, 'wizard').itemId; if (it) seen.add(it); } return [...seen]; };
  try {
    const own = rolls(1), any = rolls(0);
    ok('rollLoot: all from the class\'s pool at share 1, another class\'s gear at share 0', own.length > 5 && own.every((id) => canUse('wizard', id)) && any.some((id) => !canUse('wizard', id)), `${own.length} / ${any.length}`);
  } finally { Math.random = origR; DATA.difficulty.classDropShare = share; }
  // a save fitted to its class: the kit where it can't, an accessory off
  const p = { hero: { id: 'wizard', look: 0 }, equipment: { ...emptyEquipment(), weapon: 'moonbrand', armor: 'plate_armor', boots: 'knights_greaves', rings: ['ring_of_might', 'witchfinders_signet'], trinket: 'chained_grimoire' } };
  const changed = fitGearToClass(p);
  ok('fitGearToClass: the wizard\'s kit for the sword and the plate, the Greaves and the Signet off, his own Grimoire kept', p.equipment.weapon === 'apprentices_staff' && p.equipment.armor === 'threadbare_robe'
    && p.equipment.boots === null && p.equipment.rings.join() === 'ring_of_might,' && p.equipment.trinket === 'chained_grimoire' && changed.length === 4, changed.join());
  const { migrateProfile } = await import('../../src/meta/migrations.js');
  const DEFAULTS = { coins: 0, xp: 0, potions: 2, potionCap: 4, potionsBought: 0, stats: {}, alchemy: {}, records: {} }; // (as heroes.test does: profile.js keeps its own)
  const { SAVE_VERSION } = await import('../../src/meta/migrations.js');
  const old = { ...structuredClone(DEFAULTS), saveVersion: SAVE_VERSION, hero: { id: 'barbarian', look: 0 }, equipment: { ...emptyEquipment(), weapon: 'moonbrand', armor: 'crimson_plate' } };
  migrateProfile(old, DEFAULTS);
  ok('...on every load: an old Barbarian in a knight\'s gear wakes up in his own kit', old.equipment.weapon === 'notched_hand_axe' && old.equipment.armor === 'wolfhide_jerkin');
  // the run's end: "Can't use · salvaged"
  const { runEndScene } = await import('../../src/ui/scenes/runEndScene.js');
  const root = new El('div');
  runEndScene({ roomNumber: 3, kills: 4, coins: 10, coinsRetrieved: 10, xp: 5, itemsFound: ['bearhide_mantle'], equipSummary: { equipped: [], changes: [], coins: 24,
    salvaged: [{ id: 'rusty_sword', name: 'Rusty Sword', tier: 1 }, { id: 'bearhide_mantle', name: 'Bearhide Mantle', tier: 3, offClass: true }] } }, 'retreat').enter(root);
  const offRow = root.all((n) => n.className?.includes?.('off-class-row'))[0];
  ok('run end: another class\'s gear on its own row, "Can\'t use · salvaged", the coins after it', !!offRow && offRow.textContent.startsWith("Can't use · salvaged") && offRow.textContent.includes('Bearhide Mantle') && offRow.textContent.endsWith('+24 coins')
    && root.all((n) => n.className === 'loot-summary salvage-row')[0]?.textContent.includes('Rusty Sword'));
  const { findCard } = await import('../../src/ui/findFx.js');
  const card = findCard({ id: 'bearhide_mantle', slot: 'armor', from: null, offClass: 'Barbarian, Druid and Hexhunter armor' });
  ok('the find card: another class\'s gear greyed, whose it is, salvaged at the end', card.className.includes('off-class') && card.textContent.includes('salvaged at the end') && !card.textContent.includes('replaces'));
}

// The LOOT pop-up (0.00292): the run's finds as strips, newest first, each with what becomes of it when the run ends
// (0.00299: judged against run.gearPreview, what settleRun will wear — a find a later one beat reads Beaten · salvaged;
// another class's gear Salvage); the arrow keys scroll a strip and its gap; the dialog closes on C / Escape / Enter.
{
  fresh();
  const { openLootDialog } = await import('../../src/ui/lootDialog.js');
  const { anyDialogOpen } = await import('../../src/ui/dialog.js');
  const { takeItem } = await import('../../src/run/loot.js');
  const run = createRun();
  run.heroId = 'knight';
  const other = Object.keys(DATA.items).find((id) => DATA.items[id].slot === 'weapon' && DATA.items[id].class && DATA.items[id].class !== 'knight');
  for (const id of ['knights_blade', 'moonbrand', 'vampiric_ring', other]) takeItem(run, id, () => {}); // (the blade beaten by Moonbrand: both stay in itemsFound, the preview wears Moonbrand)
  run.itemsFound.push('no_such_item');
  const dlg = openLootDialog(run);
  const list = byClass(document.body, 'loot-list')[0], strips = list?.children ?? [];
  const tags = strips.map((r) => byClass(r, 'inv-tag')[0]);
  const tag = (i) => `${tags[i].textContent}${String(tags[i].className).includes('inv-off') ? ' (off)' : ''}`;
  ok('the LOOT pop-up: every find of the run as a strip, newest first (an unknown id skipped), the picture on each', anyDialogOpen() && strips.length === 4
    && strips[0].textContent.includes(DATA.items[other].name.toUpperCase()) && strips[2].textContent.includes('MOONBRAND') && byClass(strips[2], 'slot-art')[0]?.children[0]?.attrs?.src === itemArtUrl('moonbrand'));
  ok('…another class\'s gear Salvage; a worn find its slot (Ring I ↑, Weapon ↑); a find a later one beat Beaten · salvaged (0.00299)',
    tag(0) === 'Salvage (off)' && tag(1) === 'Ring I ↑' && tag(2) === 'Weapon ↑' && tag(3) === 'Beaten · salvaged (off)' && run.gearPreview.weapon === 'moonbrand', [0, 1, 2, 3].map(tag).join(' | '));
  ok('…the sub-line says the best of each slot is worn', byClass(document.body, 'loot-sub')[0]?.textContent === '4 found this run · the best of each slot is worn when the run ends');
  const calls = [];
  list.scrollBy = (o) => calls.push(o);
  strips[0].offsetTop = 0; strips[0].offsetHeight = 64; strips[1].offsetTop = 72; // (a strip and the 8px gap under it)
  handleKey('arrowdown');
  ok('↓ scrolls one strip and its gap', calls.length === 1 && calls[0].top === 72 && calls[0].behavior === 'smooth', JSON.stringify(calls));
  handleKey('arrowup');
  ok('↑ scrolls back by the same', calls.length === 2 && calls[1].top === -72);
  handleKey('c');
  ok('…and C closes it (dialog.js closeKeys: Escape and Enter too)', !anyDialogOpen() && !dlg.isOpen());
  const again = openLootDialog(run); handleKey('escape');
  ok('…Escape as well', !again.isOpen());
  const css = readFileSync('styles.css', 'utf8');
  ok('…four strips in view, the rest scrolled to; two on a phone (the 94svh modal keeps Close in view)', css.includes('.loot-list { display: flex; flex-direction: column; gap: 8px; max-height: calc(4 * 64px + 3 * 8px); overflow-y: auto;') && css.includes('.loot-list .inv-row { flex: none; height: 64px;')
    && css.includes('html.phone .loot-list { max-height: calc(2 * 64px + 8px); }'));
}

// tools/test/items.test.mjs — the gear's pictures (0.00260): the files and
// the prompt sheet, what a find is worth over what it replaced, and every
// place a picture shows — the log line, the find card in combat, the hall's
// slots (desktop and phone), the hero card's inventory, the run's end.
// Run via tools/smoke-test.mjs.

import { existsSync, readFileSync } from 'node:fs';
import { ok, fresh, El, DATA, createRun, getProfile, withAnimations, sleep } from './harness.mjs';

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
    const tray = Object.assign(new El('span'), { getBoundingClientRect: box(80, 762, 30, 26) });
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
    && cards[1].className.includes('tier-4') && cards[1].all((n) => n.className === 'fc-tag')[0]?.textContent === 'Relic' && cards[1].textContent.includes('into an empty slot'));
  const chips = root.all((n) => n.className === 'salvage-chip');
  ok('...what was salvaged as small pictures with the coins', chips.length === 1 && chips[0].all((n) => n.className?.includes?.('item-pic')).length === 1 && root.textContent.includes('+8 coins'));
}

// the hero card's inventory page: the run's finds with their pictures
{
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  const run = createRun();
  run.itemsFound.push('moonbrand');
  const u = createPlayerUnit(run, { onHeavy() {}, onPotion() {} });
  const pics = u.el.all((n) => n.className?.includes?.('inv-pic'));
  ok('the hero card\'s inventory: each find of the run with its picture', pics.length === 1 && pics[0].attrs.src === itemArtUrl('moonbrand'));
}

// the dungeon's LOOT row under XP / COINS (the developer named it): there from the first room, hidden until a find
{
  const { show, sleep, t, registry, dungeonScene } = await import('./harness.mjs');
  fresh();
  show(dungeonScene());
  await sleep(1500);
  const row = registry.app.all((n) => n.className?.includes?.('res-loot'))[0];
  ok('the LOOT row: labelled LOOT, hidden while the run has found nothing', !!row && row.textContent === 'LOOT' && row.classList.contains('none') && t().includes('COINS'));
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
  const count = () => hero.potionsEl.all((n) => n.className === 'potion-count')[0].textContent;
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

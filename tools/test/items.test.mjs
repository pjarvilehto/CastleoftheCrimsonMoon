// tools/test/items.test.mjs — the gear's pictures (0.00259): the files and
// the prompt sheet, what a find is worth over what it replaced, and every
// place a picture shows — the log line, the find card in combat, the hall's
// slots (desktop and phone), the hero card's inventory, the run's end.
// Run via tools/smoke-test.mjs.

import { existsSync, readFileSync } from 'node:fs';
import { ok, fresh, El, DATA, createRun, getProfile, withAnimations } from './harness.mjs';

fresh();
const { itemArtUrl, itemArtUrls, gainLine } = await import('../../src/shared/itemArt.js');

// the files: every item names a WebP in assets/items/ that is on disk (dataCheck fails a missing name at load)
{
  const bad = Object.keys(DATA.items).filter((id) => { const u = itemArtUrl(id); return !u || !existsSync(u) || readFileSync(u).subarray(8, 12).toString() !== 'WEBP'; });
  ok('every item has its picture: a WebP in assets/items/ named by items.json art', bad.length === 0, bad.join(', '));
  const urls = itemArtUrls(['moonbrand']);
  ok('the preload list: every item\'s picture once, the worn gear first', urls[0] === itemArtUrl('moonbrand') && urls.length === Object.keys(DATA.items).length && new Set(urls).size === urls.length);
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
  ok('docs/item-prompts.md: the style block and a line for every item, nothing else', /Unreal Engine 5/.test(style) && /Mignola/.test(style)
    && Object.keys(lines).sort().join() === Object.keys(DATA.items).sort().join(), Object.keys(lines).length);
  ok('...a prompt is the style, then "The object:" and the line (+ a direction)', promptOf('S', 'L', 'H') === 'S\n\nThe object: L\nDirection: H');
  const text = '{\n  "a": {\n    "name": "A",\n    "tier": 1,\n    "dmg": 4\n  },\n  "b": {\n    "name": "B",\n    "tier": 2,\n    "art": "b_v1.webp",\n    "armor": 3\n  }\n}\n';
  const once = setArt(text, 'a', 'a_v1.webp'), twice = setArt(once, 'b', 'b_v2.webp');
  ok('...an import adds the art line after the tier, or changes it, leaving the file\'s layout', once.includes('"tier": 1,\n    "art": "a_v1.webp",\n    "dmg": 4') && twice.includes('"art": "b_v2.webp"') && !twice.includes('b_v1') && JSON.parse(twice).a.dmg === 4);
}

// what a find is worth over what it replaced
ok('gainLine: the stats a find raises, two at most', gainLine('rusty_sword', 'moonbrand') === '+10 dmg, +10% crit');
ok('...into an empty slot it is the item\'s own', gainLine(null, 'vampiric_ring') === '+30% lifesteal');
ok('...nothing raised is an empty line; a revive or a quicker heavy is named', gainLine('moonbrand', 'rusty_sword') === '' && gainLine('relic_of_the_first_knight', 'heart_of_the_dying_moon').includes('a revive'));

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
  const card = findCard({ id: 'moonbrand', slot: 'weapon', from: 'rusty_sword' });
  const text = card.textContent;
  ok('the find card: tier-3, FOUND · Weapon, the name, its stats, what it replaces and the gain', card.className === 'find-pop tier-3'
    && /Found · Weapon/.test(text) && text.includes('Moonbrand') && text.includes('+14 dmg, +10% crit') && text.includes('replaces Rusty Sword') && text.includes('+10 dmg'));
  ok('...a ring into an empty slot says so', findCard({ id: 'vampiric_ring', slot: 'rings', index: 1, from: null }).textContent.includes('an empty slot'));
  await withAnimations(async () => {
    const layer = new El('div');
    const unit = (left) => ({ card: Object.assign(new El('div'), { getBoundingClientRect: () => ({ left, top: 200, width: 100, height: 300, right: left + 100, bottom: 500 }) }), portrait: null }); // (no portrait: the arrival's glint sweep skips, as in the shim)
    const foes = [unit(600), unit(720)], hero = unit(40);
    const ctx = { layer, unit: (i) => (i === 'player' ? hero : foes[i] ?? null) };
    const ms = findPop({ id: 'moonbrand', slot: 'weapon', from: 'rusty_sword' }, ctx);
    const pop = layer.children[0];
    const anim = pop?.animations?.[0];
    ok('findPop: the card over the foes, rising in, then flying to the hero\'s card; it says when it lands', !!pop && typeof ms === 'number' && ms > 1500
      && parseFloat(pop.style.left) > 500 && anim.kf.length === 4 && /translate\(-?\d/.test(anim.kf[3].transform) && anim.kf[3].transform.includes('scale(0.18)'));
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
    && cards[0].textContent.includes('Weapon') && cards[0].textContent.includes('over Rusty Sword') && cards[0].textContent.includes('+10 dmg')
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

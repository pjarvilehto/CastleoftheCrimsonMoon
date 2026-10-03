// ui/heroCard.js — the hero's card on the combat screen (0.00325: out of
// battleLine.js, which keeps the enemy units and the card parts both use).
// createPlayerUnit builds it ONCE per room and hands back update(), which
// the playback ticks call to patch it (HP, the potions, the heavy's
// cooldown or charges, the buttons); the class is the run's (run.hero —
// id, name, heavyName, theme, look, snapshotted by runState.js createRun
// and rebuilt by the debug SWITCH CLASS), the gear the profile's as worn.
// A click turns the card over: front → STATS → INVENTORY → front
// (cardBack; 0.00256 / 0.00258, the developer's call), the INVENTORY
// page's FINDS line opening the LOOT pop-up (0.00299). The potion's
// picture and count hold a found potion back until its card lands
// (holdPotion / landPotion, 0.00263).

import { el } from '../core/dom.js';
import { isLowHp, potionPic, itemStrip, itemTitle, gearLabel, wornId } from './hud.js';
import { openLootDialog } from './lootDialog.js';
import { getProfile } from '../meta/profile.js';
import { itemWithForge, playerLevel } from '../meta/stats.js';
import { DATA } from '../shared/data.js';
import { attachCardFx, cardStyle } from './cardFx.js';
import { heroById, lookUrl, lookIsSprite } from '../shared/heroes.js';
import { usesCharges } from '../run/classes.js';
import { potionHealFor } from '../meta/leveling.js';
import { GEAR_SLOTS } from '../meta/equipment.js';
import { portrait, hpLine, flipCard, frame, bandStyle, withGlint, setClass, setText, disabler } from './battleLine.js';

// The hero's figure for the run's class and look (run.hero, 0.00283 — the
// combat UI reads the class from the run, never the profile; shared/portraits.js
// portraitUrl('player') is the hall's, off the profile): the look's file in
// assets/heroes/, every look's (0.00291: the knight's crouch too — it used to
// draw the old photoreal cards.json player.art; `sprite` now only places it).
export const heroArt = (hero) => lookUrl(heroById(hero.id), hero.look);

// The hero card's back (0.00256, the developer's call): a tap turns the
// card around to STATS — the run's own numbers (run.stats: base, training,
// gear and the shrine boons), the totals only — a second to INVENTORY
// (0.00258; 0.00290: the gear worn as strips, this run's finds behind the
// FINDS line that opens the LOOT pop-up, 0.00299), a third back to the hero.
// set() refreshes the shown page; the update tick calls it while the card
// is turned.
const PAGES = ['front', 'stats', 'inv'];
const dots = (n) => el('div', { class: 'page-dots' }, ...PAGES.map((_, k) => el('i', { class: k === n ? 'on' : '' })));
function statsPage(run) {
  const tune = DATA.difficulty.combat;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const rows = [
    ['Health', () => `${run.hp} / ${run.maxHp}`, 'hp'], // (0.00266: each stat in its colour — the Train row that raises it wears the same)
    ['Attack', () => `${run.stats.dmg}`, 'dmg'],
    ['Armor', () => `${run.stats.armor}${run.tempArmor > 0 ? ` +${run.tempArmor}` : ''}`, 'armor'],
    ['Crit chance', () => pct(run.stats.crit), 'crit'],
    ['Crit damage', () => `×${(tune.critMult + run.stats.critBonus).toFixed(2)}`, 'crit'],
    ['Lifesteal', () => (run.stats.lifesteal > 0 ? pct(run.stats.lifesteal) : '—'), 'ls'],
    [run.hero.heavyName, () => `×${+(tune.heavyMult * run.stats.klass.heavyMult).toFixed(2)} · ${usesCharges(run.stats.klass) ? `${run.stats.klass.charges} charges` : `${run.stats.heavyCdMax} turns`}`], // (0.00267: the class's name for its heavy — the run's, 0.00283; 0.00277: its own factor, and charges for a charge class)
    ['Potions', () => `${run.potions} / ${run.potionCap}`],
    ['Potion heals', () => `${potionHealFor(run.stats.klass)} HP`, 'hp'], // (0.00277: the class's share in it)
  ].map(([label, val, st]) => ({ val, b: el('b', {}, val()), label, st }));
  const page = el('div', { class: 'back-page back-stats' },
    el('h2', {}, 'Stats'), el('div', { class: 'back-rule' }),
    ...rows.map((r) => el('div', { class: `back-row${r.st ? ` st st-${r.st}` : ''}` }, el('span', {}, r.label), r.b)),
    dots(1), el('div', { class: 'back-hint' }, 'tap for inventory'));
  return { el: page, set: () => rows.forEach((r) => setText(r.b, r.val())) };
}
// The gear as worn (forge levels in), a strip per slot like the Great Hall's
// slots (0.00290, the developer's layout): the item's picture on the right,
// fading into the dark under its name and stats on the left — the save's
// gear, which does not change mid-run. Under the strips the run's finds as a
// count, "FINDS · n ›" (0.00299), a button that opens the LOOT pop-up
// (ui/lootDialog.js): on a phone, whose top strip has no LOOT row, the one
// way to it; it carries no key — the desktop's LOOT row answers to I — and
// is a div with the button's role, not a <button>: the unit's first button is
// the heavy's. Its click stays in it (the card's own click would turn it over).
function invPage(run) {
  const p = getProfile();
  const worn = GEAR_SLOTS.map((slot) => {
    const id = wornId(p.equipment, slot);
    const item = id ? itemWithForge(id, p) : null;
    if (!item) return el('div', { class: 'inv-row empty' }, el('span', { class: 'inv-name inv-empty' }, `${gearLabel({ slot: slot[0], index: slot[1] })} — empty`));
    return itemStrip(id, item);
  });
  const found = () => run.itemsFound?.length ?? 0; // (the tests' bare runs carry no list)
  const count = el('b', {}, String(found()));
  const finds = el('div', { class: 'inv-finds', role: 'button', tabindex: '0', onclick: (e) => { e?.stopPropagation?.(); if (found()) openLootDialog(run); } }, 'Finds · ', count, ' ›');
  const page = el('div', { class: 'back-page back-inv' },
    el('h2', {}, 'Inventory'), el('div', { class: 'back-rule' }), el('div', { class: 'inv-list inv-strips' }, ...worn),
    finds, dots(2), el('div', { class: 'back-hint' }, 'tap to turn back'));
  return { el: page, set: () => { setText(count, String(found())); setClass(finds, 'none', found() === 0); } };
}
function cardBack(run) {
  const stats = statsPage(run), inv = invPage(run);
  inv.set();
  return { el: el('div', { class: 'card-back' }, stats.el, inv.el), set: (page) => (page === 'inv' ? inv : stats).set() };
}

// Player unit. update({ hp, printing, heavyReady, heavyCd, dead })
// The class is the run's (run.hero, 0.00283: id, name, heavyName, theme,
// look — runState.js createRun snapshots it, the debug SWITCH CLASS rebuilds
// it); the gear is the profile's, as worn.
export function createPlayerUnit(run, { onHeavy, onPotion }) {
  const p = getProfile(), hero = run.hero;
  const weapon = p.equipment.weapon ? itemWithForge(p.equipment.weapon, p) : null;
  const armor = p.equipment.armor ? itemWithForge(p.equipment.armor, p) : null;
  const hp = hpLine(run.hp, run.maxHp);
  const chip = el('div', { class: 'hud-chip' }, hp.line);
  // the potions (0.00263): the potion's picture and the count — a found potion's card flies into it, so the count holds
  // that potion back until it lands (holdPotion, from the queue) and then glows and counts it (landPotion)
  let held = 0;
  const shownPotions = () => `${Math.max(0, run.potions - held)}/${run.potionCap}`;
  const potionCount = el('span', { class: 'potion-count' }, shownPotions());
  const potionIcon = potionPic('potion-ic');
  const potions = el('div', { class: 'card-sub potions' }, potionIcon ?? 'POTIONS ', potionCount);
  const art = heroArt(hero);
  const img = portrait(art, 'player', 'player');
  // Total armor (like the weapon line's total damage), plus the Infusion
  // potion bonus while it lasts: "14 ARMOR" / "14+2 ARMOR" (0.089).
  const armorText = () => `${run.stats.armor}${run.tempArmor > 0 ? `+${run.tempArmor}` : ''} ARMOR`;
  const armorVal = el('span', { class: 'weapon-dmg st st-armor' }, armorText()); // (0.00266: the stat colours)
  const plate = frame(hero.theme);
  // The card's top (0.00251, the developer's layout): the class name sits
  // ABOVE the card (hero-title, in the unit), and the gear takes the top
  // of the card as two columns — the weapon and armor names (rarity
  // colours) on the left, the LV badge, the ACTUAL total damage
  // (run.stats.dmg = base + power + gear + shrine boons) and the total
  // armor on the right — so the figure stands tall behind them.
  const gear = el('div', { class: 'gear-block' },
    el('div', { class: 'gear-names' },
      weapon ? itemTitle(weapon, { upper: true, inside: true }) : el('span', {}, 'UNARMED'), // (0.00299: hud.js itemTitle — the name and its forge level, built once for every place they show)
      armor ? itemTitle(armor, { upper: true, inside: true }) : el('span', { class: 'no-item' }, 'NO ARMOR'),
      el('span', { class: 'info-i', 'aria-hidden': 'true' }, 'i')), // (0.00258: says the card turns over)
    el('div', { class: 'gear-vals' },
      el('span', { class: 'lv-badge' }, `LV${playerLevel(p)}`),
      el('span', { class: 'weapon-dmg st st-dmg' }, `${run.stats.dmg} DMG`),
      armorVal));
  const card = el('div', { class: `char-card player-card${lookIsSprite(heroById(hero.id), hero.look) ? '' : ' hero-standing'}` }, // (0.00250: a standing hero's figure stands taller than the knight's wide sprite; 0.00264: the knight stands too, but for his crouching look)
    plate, gear, img, chip, potions);
  const back = cardBack(run);
  card.append(back.el);
  let page = 0, flipping = false;
  card.addEventListener('click', async () => { // front → stats → inventory → front
    if (flipping) return;
    flipping = true;
    await flipCard(card, () => {
      page = (page + 1) % PAGES.length;
      back.set(PAGES[page]);
      setClass(card, 'flipped', page > 0);
      setClass(card, 'page-inv', PAGES[page] === 'inv');
    });
    flipping = false;
  });
  attachCardFx(card, cardStyle('player', false, hero.theme), { into: plate }); // the shader light behind the hero (0.183), in the class's theme (0.00254)
  const cd = el('span', { class: 'heavy-cd' }, '');
  // The special's key (0.00286): a letter of its own name, underlined like Attack's A (heroes.json
  // heavyKey — C for Cleave, F for Fireball…), and H on every class as before (data-key-alt).
  const heavyBtn = el('button', { key: hero.heavyKey, 'data-key-alt': 'h', onclick: onHeavy }, hero.heavyName, cd); // (0.00267: the class's own name)
  const potionBtn = el('button', { key: 'p', onclick: onPotion }, 'Drink Potion');
  const unit = el('div', { class: 'unit player-unit', style: bandStyle() }, el('div', { class: 'hero-title card-name' }, hero.name.toUpperCase()), card, el('div', { class: 'unit-actions' }, heavyBtn, potionBtn)); // (0.00248: the chosen class; 0.00251: above the card)
  const heavyDisabled = disabler(heavyBtn), potionDisabled = disabler(potionBtn);
  const update = (s) => {
    hp.set(s.hp, run.maxHp);
    const low = isLowHp(s.hp, run.maxHp);
    setClass(chip, 'lowhp', low); // the HP bar glows (0.126)
    setText(potionCount, shownPotions());
    setText(armorVal, armorText());
    if (page > 0) back.set(PAGES[page]);
    // 0.00267, the classes: a charge class (the wizard) shows its charges
    // left as pips in place of the cooldown
    const k = run.stats.klass;
    const charges = Math.max(0, Math.min(k.charges, Number(s.charges) || 0));
    setText(cd, usesCharges(k) ? ` ${'◆'.repeat(charges)}${'◇'.repeat(k.charges - charges)}`
      : s.heavyCd > 0 ? ` (${s.heavyCd})` : '');
    setClass(heavyBtn, 'ready', s.heavyReady);
    heavyDisabled(!s.heavyReady);
    // Drinkable after a cleared room too (0.080) — just not once dead.
    potionDisabled(s.dead || s.printing || run.potions <= 0 || run.hp >= run.maxHp);
    // Low on health with potions left: Drink Potion pulses red (0.126) —
    // kept on while a turn prints, so the glow doesn't restart every blow.
    const remind = low && !s.dead && run.potions > 0;
    setClass(potionBtn, 'active', remind);
    setClass(potionBtn, 'active-red', remind);
    setClass(potionBtn, 'potion-remind', remind);
  };
  const holdPotion = () => { held++; setText(potionCount, shownPotions()); };
  const landPotion = () => {
    held = Math.max(0, held - 1);
    setText(potionCount, shownPotions());
    for (const [node, peak] of [[potionCount, 1.7], [potionIcon, 1.5]]) node?.animate?.([ // (one-shot: the count glows and counts the potion in)
      { transform: 'scale(1)', filter: 'brightness(1)' },
      { transform: `scale(${peak})`, filter: 'brightness(2.4) drop-shadow(0 0 6px rgba(255, 90, 60, 0.95))', offset: 0.25 },
      { transform: 'scale(1)', filter: 'brightness(1)' },
    ], { duration: 700, easing: 'ease-out' });
  };
  return withGlint({ el: unit, card, portrait: img, art, id: 'player', family: 'player', glintEl: null, update, potionsEl: potions, holdPotion, landPotion });
}

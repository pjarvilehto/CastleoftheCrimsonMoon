// ui/battleLine.js — card components for the combat screen.
// Player unit anchored left, enemies right (see dungeonScene). Each unit
// is CARD + ACTIONS-ROW-BELOW. HP is a single line: text left, bar right;
// player potions sit on the row beneath.
// Portraits: WebP with alpha in assets/chars/ (0.078: q85 — 9.6MB of PNGs
// became 1.5MB), the file named in the data (shared/portraits.js, 0.184).

import { el } from '../core/dom.js';
import { DEATH_TINT } from './fxParts.js';
import { hpBar, rarityClass, isLowHp, describeItem, itemPic, potionPic, statText } from './hud.js';
import { getProfile } from '../meta/profile.js';
import { itemWithForge, playerLevel } from '../meta/stats.js';
import { isElite } from '../shared/balance.js';
import { DATA } from '../shared/data.js';
import { attachCardFx, cardStyle } from './cardFx.js';
import { reducedMotion } from '../shared/motion.js';
import { portraitUrl as ART } from '../shared/portraits.js';
import { heroOf, cleanHero, lookIsSprite } from '../shared/heroes.js';
import { potionHealAmount } from '../meta/leveling.js';
import { GEAR_SLOTS } from '../meta/equipment.js';

// Idle motion families (0.087): one CSS loop per family (styles.css
// .idle-<family>), keyed by enemy ID — display names differ (golem is
// "Fellblade", ghoul is "Cinderborn").
export const IDLE_FAMILY = {
  bat: 'hover', wraith: 'hover',
  golem: 'heavy', blood_knight: 'heavy', gargoyle: 'heavy',
  // 0.089: rat + spider moved from a twitchy 'skitter' loop to the sway
  hollow_hound: 'prowl', ghoul: 'prowl', cultist: 'prowl', skeleton: 'prowl', rat: 'prowl', crypt_spider: 'prowl',
  vampire_lord: 'boss',
};

// A portrait with its idle loop, started at a random phase so a room of
// identical skeletons doesn't breathe in unison.
function portrait(id, alt, family) {
  const img = el('img', { class: `portrait idle-${family}`, src: ART(id), alt, draggable: 'false' }); // never a native image drag (0.159)
  img.style.animationDelay = `-${(Math.random() * 6).toFixed(2)}s`;
  return img;
}
// The glint (0.183): a second copy of the portrait, bright, inside a band
// (styles.css .glint-band: three cards wide, masked to a soft stripe) that
// fxParts.js glintSweep slides across the figure as the card turns. The
// copy runs the same idle loop at the same phase, so it sits on the
// figure. 0.00222: mounted for the sweep's length only, through the unit's
// `glint` getter (mountGlint) — six invisible copies used to run their
// idle loops and blend-plus-filter surfaces all fight long.
function glintBand(id, family, img) {
  const g = el('img', { class: `portrait glint idle-${family}`, src: ART(id), alt: '', draggable: 'false', 'aria-hidden': 'true' });
  g.style.animationDelay = img.style.animationDelay;
  return el('div', { class: 'glint-band', 'aria-hidden': 'true' }, g);
}
// The unit's band, mounted right after its portrait; unmountGlint takes it
// away again (the sweep's end, fxParts.js).
export function mountGlint(u) {
  if (u.glintEl) return u.glintEl;
  const band = glintBand(u.id, u.family, u.portrait);
  const kids = u.card.children;
  u.card.insertBefore(band, kids[Array.prototype.indexOf.call(kids, u.portrait) + 1] ?? null);
  u.glintEl = band;
  return band;
}
export function unmountGlint(u) {
  u.glintEl?.remove();
  u.glintEl = null;
}
const withGlint = (u) => Object.defineProperty(u, 'glint', { get() { return mountGlint(this); }, enumerable: false });
// --band: the glint's half-width (cards.json), on the unit for its two portraits.
const bandStyle = () => `--band:${DATA.cards.glint.band}%`;
// The card's frame art (0.195: a layer instead of a ::before, so the shader
// light can live inside it — styles.css .card-frame carries the art and
// the card's see-through opacity; the light screens over the art within it).
// the plate's layer; with a theme (the player's class, 0.00254) a colour-blend `.tone` sits on the art under the shader light
const frame = (theme = null) => el('div', { class: 'card-frame', style: theme ? `--theme:${theme.plate}` : null }, theme ? el('div', { class: 'tone' }) : null);

// Death collapse (0.087): sink, flash red, fade — then the card turns
// and away. Without the Web Animations API (tests) it's instant.
const COLLAPSE_MS = 700;
// u: the unit, whose baseFilter fxParts.js caches on the first hit (0.00222: a getComputedStyle here mid-turn was a forced style resolution per death)
function collapse(img, done, u = null) {
  if (!img.animate || reducedMotion()) { done(); return; }
  const base = u ? (u.baseFilter ??= getComputedStyle(img).filter) : getComputedStyle(img).filter;
  const red = `${base === 'none' ? '' : base} ${DEATH_TINT}`;
  img.animate([
    { translate: '0 0', opacity: 1, filter: base },
    { translate: '0 4%', opacity: 1, filter: red, offset: 0.3 },
    { translate: '0 14%', opacity: 0, filter: `${red} brightness(0.2)` },
  ], { duration: COLLAPSE_MS, easing: 'ease-in', fill: 'forwards' }).finished.then(done, done);
}

// A fallen enemy's whole unit fades out and leaves the row (summons since
// 0.092 — a long boss fight filled the line with skulls; every enemy since
// 0.00216).
function vanish(unit, done) {
  const out = () => { unit.remove(); done?.(); };
  if (!unit.animate) { out(); return; }
  unit.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.then(out, out);
}

// "Giant Rat LV3" -> ["Giant Rat", "LV3"]; levelless -> ["Giant Rat", "LV1"]
function splitName(full) {
  const m = full.match(/^(.*?) LV(\d+)$/);
  return m ? [m[1], `LV${m[2]}`] : [full, 'LV1'];
}

// Single-line health: "HP 26/92" left, bar filling the rest of the row.
// Returns the line plus a setter that patches it in place (0.086).
function hpLine(cur, max) {
  const num = el('span', {}, `${cur}/${max}`);
  const text = el('span', { class: 'hp-text' }, el('span', { class: 'st st-hp' }, 'HP '), num); // (0.00266: the HP word in its stat's colour)
  const bar = hpBar(cur, max);
  const line = el('div', { class: 'hp-line' }, text, bar);
  let lastHp = cur, lastMax = max;
  const set = (hp, maxHp = max) => {
    if (hp === lastHp && maxHp === lastMax) return; // (0.00223: no write when nothing changed)
    lastHp = hp; lastMax = maxHp;
    num.textContent = `${hp}/${maxHp}`;
    bar.children[0].style.width = `${Math.max(0, Math.round((hp / maxHp) * 100))}%`;
  };
  return { line, set };
}

// Idempotent writes (0.00223: every playback tick rewrote every unit's
// text, buttons and classes even when nothing changed): toggle with force
// runs no update steps on a present token; text and attributes compare
// first; a button's disabled state is remembered per button.
const setClass = (node, cls, on) => node.classList.toggle(cls, !!on);
const setText = (node, s) => { if (node.textContent !== s) node.textContent = s; };
const disabler = (btn) => { let cur = null; return (on) => { if (on === cur) return; cur = on; on ? btn.setAttribute('disabled', '') : btn.removeAttribute('disabled'); }; };

// ---- persistent units (0.086) ----
// The battle line is built ONCE per room; playback ticks only patch it
// (HP, dead state, buttons). Rebuilding it every 100ms used to restart any
// animation — this is what lets cards move.

// The knight card's back (0.00256, the developer's call): a tap turns the
// card around to STATS — the run's own numbers (run.stats: base, training,
// gear and the shrine boons), the totals only — a second to INVENTORY
// (0.00258: the gear worn, and this run's finds, worn from the run's end),
// a third back to the hero. set() refreshes the shown page; the update
// tick calls it while the card is turned.
const FLIP_MS = 420;
const PAGES = ['front', 'stats', 'inv'];
const dots = (n) => el('div', { class: 'page-dots' }, ...PAGES.map((_, k) => el('i', { class: k === n ? 'on' : '' })));
const SLOT_NAME = { weapon: 'Weapon', armor: 'Armor', boots: 'Boots', rings: 'Ring', ring: 'Ring', trinket: 'Trinket', amulet: 'Amulet' };
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
    ['Heavy blow', () => `×${tune.heavyMult} · ${run.stats.heavyCdMax} turns`],
    ['Potions', () => `${run.potions} / ${run.potionCap}`],
    ['Potion heals', () => `${potionHealAmount()} HP`, 'hp'],
  ].map(([label, val, st]) => ({ val, b: el('b', {}, val()), label, st }));
  const page = el('div', { class: 'back-page back-stats' },
    el('h2', {}, 'Stats'), el('div', { class: 'back-rule' }),
    ...rows.map((r) => el('div', { class: `back-row${r.st ? ` st st-${r.st}` : ''}` }, el('span', {}, r.label), r.b)),
    dots(1), el('div', { class: 'back-hint' }, 'tap for inventory'));
  return { el: page, set: () => rows.forEach((r) => setText(r.b, r.val())) };
}
// The gear as worn (forge levels in), one row per slot, then what this run
// has found so far (upgrades only, run.itemsFound) — the list grows mid-run.
const FOUND_SHOWN = 3;
function invPage(run) {
  const p = getProfile();
  const worn = GEAR_SLOTS.map(([key, i]) => {
    const id = i === undefined ? p.equipment[key] : p.equipment[key]?.[i];
    const item = id ? itemWithForge(id, p) : null;
    return el('div', { class: 'inv-row' }, el('span', { class: 'inv-kind' }, SLOT_NAME[key]),
      item ? el('span', { class: `inv-name ${rarityClass(item)}` }, item.name.toUpperCase() + (item.forgeLvl ? ` +${item.forgeLvl}` : '')) : el('span', { class: 'inv-name inv-empty' }, 'Empty'),
      el('span', { class: 'inv-desc' }, ...(item ? statText(describeItem(item)) : [''])));
  });
  const found = el('div', { class: 'inv-found-list' });
  let shown = -1;
  const set = () => {
    const ids = run.itemsFound;
    if (ids.length === shown) return;
    shown = ids.length;
    const known = ids.filter((id) => DATA.items[id]), items = known.map((id) => DATA.items[id]);
    found.textContent = '';
    found.append(el('div', { class: 'inv-head' }, items.length ? 'Found this run' : 'Nothing found yet this run'),
      ...known.slice(-FOUND_SHOWN).reverse().map((id) => { const it = DATA.items[id]; return el('div', { class: 'inv-found' }, itemPic(id, 'inv-pic'), // (0.00260: its picture)
        el('span', { class: rarityClass(it) }, it.name.toUpperCase()), el('small', {}, `${SLOT_NAME[it.slot] ?? it.slot} ↑`)); }),
      ...(items.length > FOUND_SHOWN ? [el('div', { class: 'inv-more' }, `+${items.length - FOUND_SHOWN} more`)] : []));
  };
  set();
  const page = el('div', { class: 'back-page back-inv' },
    el('h2', {}, 'Inventory'), el('div', { class: 'back-rule' }), ...worn, found,
    dots(2), el('div', { class: 'back-hint' }, 'tap to turn back'));
  return { el: page, set };
}
function cardBack(run) {
  const stats = statsPage(run), inv = invPage(run);
  return { el: el('div', { class: 'card-back' }, stats.el, inv.el), set: (page) => (page === 'inv' ? inv : stats).set() };
}

// Turns a card around its vertical axis in two halves, swapping its face at
// the edge-on moment (no backface: the plate and the light are isolated 3D
// groups); `composite: 'add'` over the idle loop and a kick in flight.
function flipCard(card, swap) {
  const half = (from, to, easing) => card.animate([{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }], { duration: FLIP_MS / 2, easing, composite: 'add' });
  if (reducedMotion() || typeof card.animate !== 'function') { swap(); return null; }
  const a = half(0, 90, 'ease-in');
  return new Promise((res) => { a.onfinish = () => { swap(); half(-90, 0, 'ease-out').onfinish = res; }; });
}

// Player unit. update({ hp, printing, heavyReady, heavyCd, dead })
export function createPlayerUnit(run, { onHeavy, onPotion }) {
  const p = getProfile();
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
  const potions = el('div', { class: 'card-sub potions', title: 'Potions' }, potionIcon ?? 'POTIONS ', potionCount);
  const img = portrait('player', 'player', 'player');
  // Total armor (like the weapon line's total damage), plus the Infusion
  // potion bonus while it lasts: "14 ARMOR" / "14+2 ARMOR" (0.089).
  const armorText = () => `${run.stats.armor}${run.tempArmor > 0 ? `+${run.tempArmor}` : ''} ARMOR`;
  const armorVal = el('span', { class: 'weapon-dmg st st-armor' }, armorText()); // (0.00266: the stat colours)
  const plate = frame(heroOf(p).theme);
  // The card's top (0.00251, the developer's layout): the class name sits
  // ABOVE the card (hero-title, in the unit), and the gear takes the top
  // of the card as two columns — the weapon and armor names (rarity
  // colours) on the left, the LV badge, the ACTUAL total damage
  // (run.stats.dmg = base + power + gear + shrine boons) and the total
  // armor on the right — so the figure stands tall behind them.
  const gear = el('div', { class: 'gear-block' },
    el('div', { class: 'gear-names' },
      weapon ? el('span', { class: rarityClass(weapon) }, weapon.name.toUpperCase() + (weapon.forgeLvl ? ` +${weapon.forgeLvl}` : '')) : el('span', {}, 'UNARMED'),
      armor ? el('span', { class: rarityClass(armor) }, armor.name.toUpperCase() + (armor.forgeLvl ? ` +${armor.forgeLvl}` : '')) : el('span', { class: 'no-item' }, 'NO ARMOR'),
      el('span', { class: 'info-i', 'aria-hidden': 'true' }, 'i')), // (0.00258: says the card turns over)
    el('div', { class: 'gear-vals' },
      el('span', { class: 'lv-badge' }, `LV${playerLevel(p)}`),
      el('span', { class: 'weapon-dmg st st-dmg' }, `${run.stats.dmg} DMG`),
      armorVal));
  const card = el('div', { class: `char-card player-card${lookIsSprite(heroOf(p), cleanHero(p.hero).look) ? '' : ' hero-standing'}` }, // (0.00250: a standing hero's figure stands taller than the knight's wide sprite; 0.00264: the knight stands too, but for his crouching look)
    plate, gear, img, chip, potions);
  const back = cardBack(run);
  card.append(back.el);
  card.setAttribute('title', 'Stats and inventory');
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
  attachCardFx(card, cardStyle('player'), { into: plate }); // the shader light behind the knight (0.183)
  const cd = el('span', { class: 'heavy-cd' }, '');
  const heavyBtn = el('button', { key: 'h', onclick: onHeavy }, 'Heavy Attack', cd);
  const potionBtn = el('button', { key: 'p', onclick: onPotion }, 'Drink Potion');
  const unit = el('div', { class: 'unit player-unit', style: bandStyle() }, el('div', { class: 'hero-title card-name' }, heroOf(p).name.toUpperCase()), card, el('div', { class: 'unit-actions' }, heavyBtn, potionBtn)); // (0.00248: the chosen class; 0.00251: above the card)
  const heavyDisabled = disabler(heavyBtn), potionDisabled = disabler(potionBtn);
  const update = (s) => {
    hp.set(s.hp, run.maxHp);
    const low = isLowHp(s.hp, run.maxHp);
    setClass(chip, 'lowhp', low); // the HP bar glows (0.126)
    setText(potionCount, shownPotions());
    setText(armorVal, armorText());
    if (page > 0) back.set(PAGES[page]);
    setText(cd, s.heavyCd > 0 ? ` (${s.heavyCd})` : '');
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
  return withGlint({ el: unit, card, portrait: img, id: 'player', family: 'player', glintEl: null, update, potionsEl: potions, holdPotion, landPotion });
}

// Enemy unit. update({ hp, dead, printing, combatOver, meter? })
// onGone: a fallen summon's card has left the row (0.092).
export function createEnemyUnit(e, i, { onAttack, onGone }) {
  const [name, lv] = splitName(e.name);
  const hp = hpLine(e.maxHp, e.maxHp);
  const family = IDLE_FAMILY[e.id] ?? 'prowl';
  const img = portrait(e.id, e.name, family);
  // Boss summon bar (0.092): fills each turn; full = a summon joins.
  const meterFill = e.summonEvery ? el('div', { class: 'summon-fill' }) : null;
  const meterLine = e.summonEvery
    ? el('div', { class: 'summon-line', title: `Summons a ${DATA.enemies[DATA.difficulty.boss.summon.enemy].name.toLowerCase()} every ${e.summonEvery} turns` },
      el('span', { class: 'summon-text' }, 'SUMMON'), el('div', { class: 'summon-bar' }, meterFill))
    : null;
  // Elites and bosses: a slow-pulsing glow behind the figure (0.089).
  const elite = isElite(e) && !e.summoned; // summons are never elite: applyLoot carries nothing for them (0.092; 0.00223 — they wore the star and the aura)
  const aura = elite ? el('div', { class: `aura${e.boss ? ' aura-boss' : ''}` }) : null;
  // A fallen enemy's figure collapses, then the whole unit fades and leaves
  // the row (0.00216, the developer's call: the faint skull cards went; the row
  // restacks and the cards grow into the room — fit() through onGone).
  // 0.155: the whole card is a target too — a click attacks, exactly as its
  // Attack button would (and only when that button could)
  const plate = frame();
  const card = el('div', { class: `char-card enemy-char enemy-${e.id}${e.boss ? ' boss-card' : ''}`, id: `enemy-${i}`, onclick: () => { if (canHit) onAttack(); } },
    plate,
    el('div', { class: 'card-head' },
      el('span', { class: 'card-name' }, name,
        elite ? el('span', { class: 'elite-star', title: `Elite - can drop crimson relics (room ${DATA.difficulty.t4MinRoom}+)` }, ' ★') : null),
      el('span', { class: 'lv-badge' }, lv)),
    aura,
    img,
    hp.line,
    meterLine);
  attachCardFx(card, cardStyle(e.id, !!e.boss), { into: plate }); // the shader light behind the figure, by its material (0.183)
  // A fallen enemy's Attack button stays mounted but hidden (ghost-btn)
  // through the collapse, so the bottom-aligned card can't shift before
  // vanish() removes the whole unit (0.00216).
  const atk = el('button', { key: 'a', onclick: onAttack }, 'Attack');
  const unit = el('div', { class: 'unit enemy-unit', style: bandStyle() }, card, el('div', { class: 'unit-actions' }, atk));
  let down = false; // dead state already applied (or collapsing)
  let canHit = false; // the Attack button is live (the card clicks through to it)
  const atkDisabled = disabler(atk);
  const update = (s) => {
    hp.set(Math.max(0, s.hp), e.maxHp);
    if (meterFill && s.meter != null) {
      const w = `${Math.round((100 * s.meter) / e.summonEvery)}%`;
      if (meterFill.style.width !== w) meterFill.style.width = w;
      setClass(meterLine, 'full', s.meter >= e.summonEvery);
    }
    if (s.dead && !down) {
      down = true;
      setClass(card, 'dying', true);
      collapse(img, () => { setClass(card, 'dying', false); vanish(unit, onGone); }, self);
    }
    setClass(atk, 'ghost-btn', s.dead);
    atkDisabled(s.dead || s.combatOver || s.printing);
    canHit = !(s.dead || s.combatOver || s.printing);
    setClass(card, 'targetable', canHit);
  };
  const self = withGlint({ el: unit, card, portrait: img, id: e.id, family, glintEl: null, summoned: !!e.summoned, update });
  return self;
}

// One-shot builder (tests): an enemy unit in a given state.
export function enemyCard(e, i, hp, s) {
  const u = createEnemyUnit(e, i, s);
  u.update({ hp, dead: hp <= 0, printing: s.printing, combatOver: s.combatOver });
  return u.el;
}

// ui/battleLine.js — card components for the combat screen.
// Player unit anchored left, enemies right (see dungeonScene). Each unit
// is CARD + ACTIONS-ROW-BELOW. HP is a single line: text left, bar right;
// player potions sit on the row beneath.
// Portraits: WebP with alpha in assets/chars/ (0.078: q85 — 9.6MB of PNGs
// became 1.5MB), the file named in the data (shared/portraits.js, 0.184).

import { el } from '../core/dom.js';
import { DEATH_TINT } from './fxParts.js';
import { hpBar, rarityClass, isLowHp } from './hud.js';
import { getProfile } from '../meta/profile.js';
import { itemWithForge, playerLevel } from '../meta/stats.js';
import { isElite } from '../shared/balance.js';
import { DATA } from '../shared/data.js';
import { attachCardFx, cardStyle } from './cardFx.js';
import { reducedMotion } from '../shared/motion.js';
import { portraitUrl as ART } from '../shared/portraits.js';

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
const frame = () => el('div', { class: 'card-frame' });

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
  const text = el('span', { class: 'hp-text' }, `HP ${cur}/${max}`);
  const bar = hpBar(cur, max);
  const line = el('div', { class: 'hp-line' }, text, bar);
  let lastHp = cur, lastMax = max;
  const set = (hp, maxHp = max) => {
    if (hp === lastHp && maxHp === lastMax) return; // (0.00223: no write when nothing changed)
    lastHp = hp; lastMax = maxHp;
    text.textContent = `HP ${hp}/${maxHp}`;
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

// Player unit. update({ hp, printing, heavyReady, heavyCd, dead })
export function createPlayerUnit(run, { onHeavy, onPotion }) {
  const p = getProfile();
  const weapon = p.equipment.weapon ? itemWithForge(p.equipment.weapon, p) : null;
  const armor = p.equipment.armor ? itemWithForge(p.equipment.armor, p) : null;
  const hp = hpLine(run.hp, run.maxHp);
  const chip = el('div', { class: 'hud-chip' }, hp.line);
  const potions = el('div', { class: 'card-sub potions' }, `POTIONS ${run.potions}/${run.potionCap}`);
  const img = portrait('player', 'player', 'player');
  // Total armor (like the weapon line's total damage), plus the Infusion
  // potion bonus while it lasts: "14 ARMOR" / "14+2 ARMOR" (0.089).
  const armorText = () => `${run.stats.armor}${run.tempArmor > 0 ? `+${run.tempArmor}` : ''} ARMOR`;
  const armorVal = el('span', { class: 'weapon-dmg' }, armorText());
  const plate = frame();
  const card = el('div', { class: 'char-card player-card' },
    plate,
    el('div', { class: 'card-head' },
      el('span', { class: 'card-name' }, 'THE CURIOUS KNIGHT'),
      el('span', { class: 'lv-badge' }, `LV${playerLevel(p)}`)),
    // Weapon line: rarity-colored name left, ACTUAL total damage right
    // (run.stats.dmg = base + power + gear + shrine boons) — mirrors the
    // card-head row (name left, LV badge right).
    el('div', { class: 'card-sub weapon-line' },
      weapon
        ? el('span', { class: rarityClass(weapon) }, weapon.name.toUpperCase() + (weapon.forgeLvl ? ` +${weapon.forgeLvl}` : ''))
        : el('span', {}, 'UNARMED'),
      el('span', { class: 'weapon-dmg' }, `${run.stats.dmg} DMG`)),
    // Armor line: equipped armor piece (rarity-colored) + TOTAL armor.
    el('div', { class: 'card-sub weapon-line' },
      armor
        ? el('span', { class: rarityClass(armor) }, armor.name.toUpperCase() + (armor.forgeLvl ? ` +${armor.forgeLvl}` : ''))
        : el('span', { class: 'no-item' }, 'NO ARMOR'),
      armorVal),
    img,
    chip,
    potions);
  attachCardFx(card, cardStyle('player'), { into: plate }); // the shader light behind the knight (0.183)
  const cd = el('span', { class: 'heavy-cd' }, '');
  const heavyBtn = el('button', { key: 'h', onclick: onHeavy }, 'Heavy Attack', cd);
  const potionBtn = el('button', { key: 'p', onclick: onPotion }, 'Drink Potion');
  const unit = el('div', { class: 'unit player-unit', style: bandStyle() }, card, el('div', { class: 'unit-actions' }, heavyBtn, potionBtn));
  const heavyDisabled = disabler(heavyBtn), potionDisabled = disabler(potionBtn);
  const update = (s) => {
    hp.set(s.hp, run.maxHp);
    const low = isLowHp(s.hp, run.maxHp);
    setClass(chip, 'lowhp', low); // the HP bar glows (0.126)
    setText(potions, `POTIONS ${run.potions}/${run.potionCap}`);
    setText(armorVal, armorText());
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
  return withGlint({ el: unit, card, portrait: img, id: 'player', family: 'player', glintEl: null, update });
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

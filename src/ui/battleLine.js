// ui/battleLine.js — card components for the combat screen.
// Player unit anchored left, enemies right (see dungeonScene). Each unit
// is CARD + ACTIONS-ROW-BELOW. HP is a single line: text left, bar right;
// player potions sit on the row beneath.
// Portrait convention: assets/chars/<enemy id>.webp, with alpha (0.078:
// WebP q85 — 9.6MB of PNGs became 1.5MB).

import { el } from '../core/dom.js';
import { hpBar, rarityClass, isLowHp } from './hud.js';
import { getProfile } from '../meta/profile.js';
import { itemWithForge, playerLevel } from '../meta/stats.js';
import { isElite } from '../shared/balance.js';
import { DATA } from '../shared/data.js';

const ART = (id) => `assets/chars/${id}.webp`;

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
  const img = el('img', { class: `portrait idle-${family}`, src: ART(id), alt });
  img.style.animationDelay = `-${(Math.random() * 6).toFixed(2)}s`;
  return img;
}

// Death collapse (0.087): sink, flash red, fade — then the card turns
// into the skull. Without the Web Animations API (tests) it's instant.
const COLLAPSE_MS = 700;
function collapse(img, done) {
  if (!img.animate || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { done(); return; }
  const base = getComputedStyle(img).filter;
  const red = `${base === 'none' ? '' : base} sepia(1) saturate(6) hue-rotate(-40deg) brightness(1.3)`;
  img.animate([
    { translate: '0 0', opacity: 1, filter: base },
    { translate: '0 4%', opacity: 1, filter: red, offset: 0.3 },
    { translate: '0 14%', opacity: 0, filter: `${red} brightness(0.2)` },
  ], { duration: COLLAPSE_MS, easing: 'ease-in', fill: 'forwards' }).finished.then(done, done);
}

// A fallen summon's whole unit fades out and leaves the row (0.092) —
// a long boss fight would otherwise fill the line with skulls.
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
  const set = (hp, maxHp = max) => {
    text.textContent = `HP ${hp}/${maxHp}`;
    bar.children[0].style.width = `${Math.max(0, Math.round((hp / maxHp) * 100))}%`;
  };
  return { line, set };
}

// Class toggling that also works in the smoke-test DOM shim (no toggle()).
const setClass = (node, cls, on) => (on ? node.classList.add(cls) : node.classList.remove(cls));
const setDisabled = (btn, on) => (on ? btn.setAttribute('disabled', '') : btn.removeAttribute('disabled'));

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
  const card = el('div', { class: 'char-card player-card' },
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
  const cd = el('span', { class: 'heavy-cd' }, '');
  const heavyBtn = el('button', { key: 'h', onclick: onHeavy }, 'Heavy Attack', cd);
  const potionBtn = el('button', { key: 'p', onclick: onPotion }, 'Drink Potion');
  const unit = el('div', { class: 'unit player-unit' }, card, el('div', { class: 'unit-actions' }, heavyBtn, potionBtn));
  const update = (s) => {
    hp.set(s.hp, run.maxHp);
    const low = isLowHp(s.hp, run.maxHp);
    setClass(chip, 'lowhp', low); // the HP bar glows (0.126)
    potions.textContent = `POTIONS ${run.potions}/${run.potionCap}`;
    armorVal.textContent = armorText();
    cd.textContent = s.heavyCd > 0 ? ` (${s.heavyCd})` : '';
    setClass(heavyBtn, 'ready', s.heavyReady);
    setDisabled(heavyBtn, !s.heavyReady);
    // Drinkable after a cleared room too (0.080) — just not once dead.
    setDisabled(potionBtn, s.dead || s.printing || run.potions <= 0 || run.hp >= run.maxHp);
    // Low on health with potions left: Drink Potion pulses red (0.126) —
    // kept on while a turn prints, so the glow doesn't restart every blow.
    const remind = low && !s.dead && run.potions > 0;
    setClass(potionBtn, 'active', remind);
    setClass(potionBtn, 'active-red', remind);
    setClass(potionBtn, 'potion-remind', remind);
  };
  return { el: unit, card, portrait: img, id: 'player', update };
}

// Enemy unit. update({ hp, dead, printing, combatOver, meter? })
// onGone: a fallen summon's card has left the row (0.092).
export function createEnemyUnit(e, i, { onAttack, onGone }) {
  const [name, lv] = splitName(e.name);
  const hp = hpLine(e.maxHp, e.maxHp);
  const img = portrait(e.id, e.name, IDLE_FAMILY[e.id] ?? 'prowl');
  // Boss summon bar (0.092): fills each turn; full = a summon joins.
  const meterFill = e.summonEvery ? el('div', { class: 'summon-fill' }) : null;
  const meterLine = e.summonEvery
    ? el('div', { class: 'summon-line', title: `Summons a ${DATA.enemies[DATA.difficulty.boss.summon.enemy].name.toLowerCase()} every ${e.summonEvery} turns` },
      el('span', { class: 'summon-text' }, 'SUMMON'), el('div', { class: 'summon-bar' }, meterFill))
    : null;
  // Elites and bosses: a slow-pulsing glow behind the figure (0.089).
  const aura = isElite(e) ? el('div', { class: `aura${e.boss ? ' aura-boss' : ''}` }) : null;
  // Portrait and skull both live in the card; the 'dead' class swaps them
  // (styles.css), so the card never has to be rebuilt.
  // 0.155: the whole card is a target too — a click attacks, exactly as its
  // Attack button would (and only when that button could)
  const card = el('div', { class: `char-card enemy-char enemy-${e.id}${e.boss ? ' boss-card' : ''}`, id: `enemy-${i}`, onclick: () => { if (canHit) onAttack(); } },
    el('div', { class: 'card-head' },
      el('span', { class: 'card-name' }, name,
        isElite(e) ? el('span', { class: 'elite-star', title: `Elite - can drop crimson relics (room ${DATA.difficulty.t4MinRoom}+)` }, ' ★') : null),
      el('span', { class: 'lv-badge' }, lv)),
    aura,
    img,
    el('div', { class: 'skull' }, '☠'),
    hp.line,
    meterLine);
  // Dead cards keep their slot: the button row stays mounted with the
  // button hidden (ghost-btn), so the bottom-aligned card can't shift.
  const atk = el('button', { key: 'a', onclick: onAttack }, 'Attack');
  const unit = el('div', { class: 'unit enemy-unit' }, card, el('div', { class: 'unit-actions' }, atk));
  let down = false; // dead state already applied (or collapsing)
  let canHit = false; // the Attack button is live (the card clicks through to it)
  const update = (s) => {
    hp.set(Math.max(0, s.hp), e.maxHp);
    if (meterFill && s.meter != null) {
      meterFill.style.width = `${Math.round((100 * s.meter) / e.summonEvery)}%`;
      setClass(meterLine, 'full', s.meter >= e.summonEvery);
    }
    if (s.dead && !down) {
      down = true;
      setClass(card, 'dying', true);
      collapse(img, () => {
        setClass(card, 'dying', false);
        if (e.summoned) vanish(unit, onGone); // no skull slot: summons crumble away
        else setClass(card, 'dead', true);
      });
    }
    setClass(unit, 'dead-unit', s.dead);
    setClass(atk, 'ghost-btn', s.dead);
    setDisabled(atk, s.dead || s.combatOver || s.printing);
    canHit = !(s.dead || s.combatOver || s.printing);
    setClass(card, 'targetable', canHit);
  };
  return { el: unit, card, portrait: img, id: e.id, summoned: !!e.summoned, update };
}

// One-shot builder (tests): an enemy unit in a given state.
export function enemyCard(e, i, hp, s) {
  const u = createEnemyUnit(e, i, s);
  u.update({ hp, dead: hp <= 0, printing: s.printing, combatOver: s.combatOver });
  return u.el;
}

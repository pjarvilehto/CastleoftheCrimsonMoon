// ui/battleLine.js — card components for the combat screen.
// Player unit anchored left, enemies right (see dungeonScene). Each unit
// is CARD + ACTIONS-ROW-BELOW. HP is a single line: text left, bar right;
// player potions sit on the row beneath.
// Portrait convention: assets/chars/<enemy id>.webp, with alpha (0.078:
// WebP q85 — 9.6MB of PNGs became 1.5MB).

import { el } from '../core/scene.js';
import { hpBar, rarityClass } from './hud.js';
import { getProfile, itemWithForge, playerLevel } from '../meta/profile.js';
import { isElite } from '../shared/balance.js';

const ART = (id) => `assets/chars/${id}.webp`;

// Right-hand cell of a gear line: the item's defensive stat.
function armorStat(item) {
  if (item.armor) return `+${item.armor} ARMOR`;
  if (item.hp) return `+${item.hp} HP`;
  return '';
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
    // Armor line: equipped armor piece (rarity-colored) + its defense.
    el('div', { class: 'card-sub weapon-line' },
      armor
        ? el('span', { class: rarityClass(armor) }, armor.name.toUpperCase() + (armor.forgeLvl ? ` +${armor.forgeLvl}` : ''))
        : el('span', { class: 'no-item' }, 'NO ARMOR'),
      armor ? el('span', { class: 'weapon-dmg' }, armorStat(armor)) : null),
    el('img', { class: 'portrait', src: ART('player'), alt: 'player' }),
    chip,
    potions);
  const cd = el('span', { class: 'heavy-cd' }, '');
  const heavyBtn = el('button', { key: 'h', onclick: onHeavy }, 'Heavy Attack', cd);
  const potionBtn = el('button', { key: 'p', onclick: onPotion }, 'Drink Potion');
  const unit = el('div', { class: 'unit player-unit' }, card, el('div', { class: 'unit-actions' }, heavyBtn, potionBtn));
  const update = (s) => {
    hp.set(s.hp, run.maxHp);
    setClass(chip, 'lowhp', s.hp / run.maxHp <= 0.25);
    potions.textContent = `POTIONS ${run.potions}/${run.potionCap}`;
    cd.textContent = s.heavyCd > 0 ? ` (${s.heavyCd})` : '';
    setClass(heavyBtn, 'ready', s.heavyReady);
    setDisabled(heavyBtn, !s.heavyReady);
    // Drinkable after a cleared room too (0.080) — just not once dead.
    setDisabled(potionBtn, s.dead || s.printing || run.potions <= 0 || run.hp >= run.maxHp);
  };
  return { el: unit, card, update };
}

// Enemy unit. update({ hp, dead, printing, combatOver })
export function createEnemyUnit(e, i, { onAttack }) {
  const [name, lv] = splitName(e.name);
  const hp = hpLine(e.maxHp, e.maxHp);
  // Portrait and skull both live in the card; the 'dead' class swaps them
  // (styles.css), so the card never has to be rebuilt.
  const card = el('div', { class: `char-card enemy-char enemy-${e.id}${e.boss ? ' boss-card' : ''}`, id: `enemy-${i}` },
    el('div', { class: 'card-head' },
      el('span', { class: 'card-name' }, name,
        isElite(e) ? el('span', { class: 'elite-star', title: 'Elite - can drop crimson relics (room 11+)' }, ' ★') : null),
      el('span', { class: 'lv-badge' }, lv)),
    el('img', { class: 'portrait', src: ART(e.id), alt: e.name }),
    el('div', { class: 'skull' }, '☠'),
    hp.line);
  // Dead cards keep their slot: the button row stays mounted with the
  // button hidden (ghost-btn), so the bottom-aligned card can't shift.
  const atk = el('button', { key: 'a', onclick: onAttack }, 'Attack');
  const unit = el('div', { class: 'unit enemy-unit' }, card, el('div', { class: 'unit-actions' }, atk));
  const update = (s) => {
    hp.set(Math.max(0, s.hp), e.maxHp);
    setClass(card, 'dead', s.dead);
    setClass(unit, 'dead-unit', s.dead);
    setClass(atk, 'ghost-btn', s.dead);
    setDisabled(atk, s.dead || s.combatOver || s.printing);
  };
  return { el: unit, card, update };
}

// One-shot builders (tests, previews): a unit in a given state.
export function playerCard(run, s) {
  const u = createPlayerUnit(run, s);
  u.update({ hp: run.hp, ...s });
  return u.el;
}

export function enemyCard(e, i, hp, s) {
  const u = createEnemyUnit(e, i, s);
  u.update({ hp, dead: hp <= 0, printing: s.printing, combatOver: s.combatOver });
  return u.el;
}

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
function hpLine(cur, max) {
  return el('div', { class: 'hp-line' },
    el('span', { class: 'hp-text' }, `HP ${cur}/${max}`),
    hpBar(cur, max));
}

export function playerCard(run, { printing, heavyReady, heavyCd, onHeavy, onPotion, lowhp, dead }) {
  const p = getProfile();
  const weapon = p.equipment.weapon ? itemWithForge(p.equipment.weapon, p) : null;
  const armor = p.equipment.armor ? itemWithForge(p.equipment.armor, p) : null;
  const level = playerLevel(p);
  const card = el('div', { class: 'char-card player-card' },
    el('div', { class: 'card-head' },
      el('span', { class: 'card-name' }, 'THE CURIOUS KNIGHT'),
      el('span', { class: 'lv-badge' }, `LV${level}`)),
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
    el('div', { class: `hud-chip${lowhp}` }, hpLine(run.hp, run.maxHp)),
    el('div', { class: 'card-sub potions' }, `POTIONS ${run.potions}/${run.potionCap}`));
  const actions = el('div', { class: 'unit-actions' },
    el('button', {
      class: heavyReady ? 'ready' : '',
      disabled: !heavyReady,
      key: 'h',
      onclick: onHeavy,
    }, `Heavy Attack${heavyCd > 0 ? ` (${heavyCd})` : ''}`),
    el('button', {
      // Drinkable after a cleared room too (0.080) — just not once dead.
      disabled: dead || printing || run.potions <= 0 || run.hp >= run.maxHp,
      key: 'p',
      onclick: onPotion,
    }, 'Drink Potion'));
  return el('div', { class: 'unit player-unit' }, card, actions);
}

export function enemyCard(e, i, hp, { printing, combatOver, onAttack }) {
  const dead = hp <= 0;
  const [name, lv] = splitName(e.name);
  const card = el('div', { class: `char-card enemy-char enemy-${e.id}${dead ? ' dead' : ''}${e.boss ? ' boss-card' : ''}`, id: `enemy-${i}` },
    el('div', { class: 'card-head' },
      el('span', { class: 'card-name' }, name,
        isElite(e) ? el('span', { class: 'elite-star', title: 'Elite - can drop crimson relics (room 11+)' }, ' ★') : null),
      el('span', { class: 'lv-badge' }, lv)),
    dead
      ? el('div', { class: 'skull' }, '☠')
      : el('img', { class: 'portrait', src: ART(e.id), alt: e.name }),
    hpLine(hp, e.maxHp));
  // Dead cards keep their slot in the row: the actions row stays mounted
  // with an invisible placeholder button, so losing the row can't shift
  // the card vertically (the battle line is bottom-aligned).
  if (dead) {
    const placeholder = el('div', { class: 'unit-actions' },
      el('button', { class: 'ghost-btn', disabled: true }, 'Attack'));
    return el('div', { class: 'unit enemy-unit dead-unit' }, card, placeholder);
  }
  const actions = el('div', { class: 'unit-actions' },
    el('button', { disabled: combatOver || printing, key: 'a', onclick: onAttack }, 'Attack'));
  return el('div', { class: 'unit enemy-unit' }, card, actions);
}

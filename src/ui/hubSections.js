// ui/hubSections.js — the Great Hall's three sections (0.00223: moved out of
// hubScene.js render, which had grown to ~150 lines): TRAIN (the five
// disciplines, XP only), ALCHEMY (potions, the satchel, the coin tracks)
// and EQUIPMENT (the slots, the Forge). Each builder returns the section's
// body; `done(row)` is the scene's "a purchase landed" — it names the row
// for the flash and re-renders (hubScene.js flashNext + render). The
// wording is hubText.js's (long and short, rule 8); `phone` picks the short.

import { el } from '../core/dom.js';
import { sfx } from '../audio/sfx.js';
import { narrate } from '../audio/narrator.js';
import { DATA } from '../shared/data.js';
import { getProfile } from '../meta/profile.js';
import { itemWithForge, playerLevel } from '../meta/stats.js';
import {
  STAT_DEFS, statCost, canAfford, buyStat,
  restockPotion, potionCost, satchelFull, satchelCost, satchelMaxed, expandSatchel,
  ALCHEMY_DEFS, alchemyCost, alchemyMaxed, trainAlchemy,
  forgeCost, forgeMaxed, forgeItem, forgeable } from '../meta/leveling.js';
import { describeItem, itemName } from './hud.js';
import { statDesc, alchemyDesc, potionDesc, potionCount, satchelDesc } from './hubText.js';

// A row's text (0.00232, the owner's ask): the title — the name and its
// level or count, what the eye looks for — over a small, muted line of
// what it does (the phone keeps both on one line, styles.css section 16).
const rowText = (title, level, desc) => el('div', { class: 'row-text' },
  el('div', { class: 'row-title' }, el('b', {}, ...title), level ? el('span', { class: 'row-lv' }, level) : null),
  el('div', { class: 'row-desc' }, desc));
const keyed = (name) => [el('u', {}, name[0]), name.slice(1)]; // (the hotkey's letter underlined)

// ---- TRAIN: five disciplines, XP-only. Breakthrough ★ every 5th level. ----
export function trainSection(p, phone, done) {
  const every = DATA.difficulty.breakthroughEvery;
  return el('div', {},
    el('h2', {}, 'Train (permanent upgrades)'),
    el('div', { class: 'subtitle' }, 'XP only · every 5th level is a ★ breakthrough, worth double'),
    ...Object.entries(STAT_DEFS).map(([key, def]) => {
      const lvl = p.stats[key];
      const star = lvl > 0 && lvl % every === 0 ? ' ★' : '';
      const desc = statDesc(key, lvl, phone);
      return el('div', { class: 'item-row', 'data-row': key },
        rowText(keyed(def.name), `Lv ${lvl}${star}`, desc),
        el('button', {
          disabled: !canAfford(key),
          key: def.key,
          onclick: () => {
            sfx('levelup');
            const lv = playerLevel(getProfile());
            buyStat(key);
            if (playerLevel(getProfile()) > lv) narrate('level_up'); // a character level (every 5 trained levels)
            done(key);
          },
        }, `Train (${statCost(lvl).xp}xp)`));
    }));
}

// ---- ALCHEMY: potions + three coin tracks. ----
export function alchemySection(p, phone, done) {
  return el('div', {},
    el('h2', {}, 'Alchemy (coins)'),
    // 0.080: potions are a persistent stock; the satchel caps it.
    el('div', { class: 'item-row', 'data-row': 'potion' },
      rowText([phone ? 'Potion' : 'Healing Potion'], potionCount(p), potionDesc(p, phone)),
      el('button', {
        disabled: p.coins < potionCost() || satchelFull(p),
        // able to buy one: the obvious next step (0.00216: it used to wait for the stock to run low, 0.090 — a player at 3/4 with the coins expected the glow)
        class: p.coins >= potionCost() && !satchelFull(p) ? 'active' : '',
        key: 'u', // b-u-y
        onclick: () => { restockPotion(); done('potion'); },
      }, satchelFull(p) ? 'Satchel full' : `Buy (${potionCost()}c)`)),
    el('div', { class: 'item-row', 'data-row': 'satchel' },
      rowText([phone ? 'Satchel' : 'Potion Satchel'], null, satchelDesc(p, satchelMaxed(p), phone)),
      satchelMaxed(p)
        ? el('span', { class: 'forge-max' }, 'MAX')
        : el('button', {
            disabled: p.coins < satchelCost(p),
            key: 'x', // e-x-pand
            onclick: () => { sfx('levelup'); expandSatchel(); done('satchel'); },
          }, `Expand (${satchelCost(p)}c)`)),
    ...Object.entries(ALCHEMY_DEFS).map(([track, def]) => {
      const lvl = p.alchemy[track] ?? 0;
      return el('div', { class: 'item-row', 'data-row': track },
        rowText(keyed(def.name), `Lv ${lvl}`, alchemyDesc(track, phone)), // (efficiency: 0.112's tapering, the next level's gain)
        alchemyMaxed(track)
          ? el('span', { class: 'forge-max' }, 'MAX')
          : el('button', {
            disabled: p.coins < alchemyCost(track),
            key: def.key,
            onclick: () => { sfx('levelup'); trainAlchemy(track); done(track); },
          }, `Train (${alchemyCost(track)}c)`));
    }));
}

// ---- EQUIPMENT with per-item Forge enhancement. ----
export function equipSection(p, done) {
  const eq = p.equipment;
  const slotRow = (label, id) => {
    const item = id ? itemWithForge(id, p) : null;
    const forgeLvl = id ? (p.forged[id] ?? 0) : 0;
    // The Forge only enhances tier 2+ gear — tier 1 starter junk is not
    // worth the coins, so it gets no enhance button at all (0.068).
    const canForge = !!item && forgeable(id);
    return el('div', { class: 'item-row', 'data-row': `slot-${label}` }, // (0.00209: classes, not inline styles — the phone layer restyles them)
      el('span', { class: 'equip-slot' }, label),
      item
        ? el('div', { class: 'equip-right' },
            el('div', { class: 'equip-item' },
              el('div', {}, itemName(item), forgeLvl ? ` +${forgeLvl}` : null),
              el('div', { class: 'equip-desc' }, describeItem(item))),
            !canForge
            ? null
            : forgeMaxed(id)
              ? el('span', { class: 'forge-max' }, 'MAX')
              : el('button', {
                  class: 'forge-btn',
                  disabled: p.coins < forgeCost(id),
                  onclick: () => { sfx('forge'); narrate('forge'); forgeItem(id); done(`slot-${label}`); },
                }, `+${forgeCost(id)}c`))
        : el('span', { class: 'equip-empty' }, '— empty —'));
  };
  return el('div', {},
    slotRow('Weapon', eq.weapon),
    slotRow('Armor', eq.armor),
    slotRow('Boots', eq.boots),
    slotRow('Ring I', eq.rings[0]),
    slotRow('Ring II', eq.rings[1]),
    slotRow('Trinket', eq.trinket),
    slotRow('Amulet', eq.amulet));
}

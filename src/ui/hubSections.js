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
import { itemWithForge, playerLevel, derivedStats } from '../meta/stats.js';
import { portraitUrl } from '../shared/portraits.js';
import { heroOf, cleanHero } from '../shared/heroes.js';
import { openLookPicker } from './lookPicker.js';
import {
  STAT_DEFS, statCost, canAfford, buyStat,
  restockPotion, potionCost, satchelFull, satchelCost, satchelMaxed, expandSatchel,
  ALCHEMY_DEFS, alchemyCost, alchemyMaxed, trainAlchemy,
  forgeCost, forgeMaxed, forgeItem, forgeable } from '../meta/leveling.js';
import { describeItem, itemName, rarityClass, statBox, potionLevel } from './hud.js';
import { statDesc, alchemyDesc, potionDesc, potionCount, satchelDesc } from './hubText.js';

// A row's text (0.00232, the developer's ask): the title — the name and its
// level or count, what the eye looks for — over a small, muted line of
// what it does (the phone keeps both on one line, styles.css section 16).
const rowText = (title, level, desc) => el('div', { class: 'row-text' },
  el('div', { class: 'row-title' }, el('b', {}, ...title), level ? el('span', { class: 'row-lv' }, level) : null),
  el('div', { class: 'row-desc' }, desc));
const keyed = (name) => [el('u', {}, name[0]), name.slice(1)]; // (the hotkey's letter underlined)

// A section's head (0.00238): its name, the purse it spends from (green
// while something in it can be bought) and a one-line hint. The phone's
// sheets hide it (their tabs carry the name and the dot, styles.css 16).
const secHead = (title, purse, amount, spend, hint) => [
  el('div', { class: 'sec-head' }, el('h2', {}, title),
    el('div', { class: `purse${spend ? ' spendable' : ''}` }, purse, el('b', {}, amount.toLocaleString('en-US')))),
  el('div', { class: 'sec-hint' }, hint)];

// ---- TRAIN: five disciplines, XP-only. Breakthrough ★ every 5th level. ----
export function trainSection(p, phone, done, spend = false) {
  const every = DATA.difficulty.breakthroughEvery;
  return el('div', { class: 'hall-sec' },
    ...secHead('Train', 'XP', p.xp, spend, `permanent · every ${every}th level ★ counts double`),
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
export function alchemySection(p, phone, done, spend = false) {
  return el('div', { class: 'hall-sec' },
    ...secHead('Alchemy', 'Coins', p.coins, spend, 'potions and their craft'),
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

// A worn slot's label in the hall, from the settle record's slot (0.00248).
const SLOT_LABEL = { weapon: 'Weapon', armor: 'Armor', boots: 'Boots', trinket: 'Trinket', amulet: 'Amulet' };
export const gearLabel = ({ slot, index }) => (slot === 'rings' ? ['Ring I', 'Ring II'][index] : SLOT_LABEL[slot]);
// The NEW tag on a slot this run's finds filled (0.00248; the hall's reveal).
const newTag = (found, label) => (found.has(label) ? el('span', { class: 'slot-new' }, 'New') : null);

// ---- EQUIPMENT with per-item Forge enhancement. ----
export function equipSection(p, done, found = new Set(), waiting = new Set()) {
  const eq = p.equipment;
  const slotRow = (label, id) => {
    const item = id ? itemWithForge(id, p) : null;
    const forgeLvl = id ? (p.forged[id] ?? 0) : 0;
    // The Forge only enhances tier 2+ gear — tier 1 starter junk is not
    // worth the coins, so it gets no enhance button at all (0.068).
    const canForge = !!item && forgeable(id) && !waiting.has(label);
    return el('div', { class: 'item-row', 'data-row': `slot-${label}` }, // (0.00209: classes, not inline styles — the phone layer restyles them)
      el('span', { class: 'equip-slot' }, label, newTag(found, label)),
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
  // the hero's look (0.00253): the phone has no portrait in its hall — a row on the Equipment sheet opens the picker
  const hero = heroOf(p), looks = hero.looks.length;
  const lookRow = el('div', { class: 'item-row', 'data-row': 'look' },
    el('span', { class: 'equip-slot' }, 'Look'),
    el('div', { class: 'equip-right' },
      el('div', { class: 'equip-item' }, el('div', {}, hero.name), el('div', { class: 'equip-desc' }, looks > 1 ? `Look ${cleanHero(p.hero).look + 1} of ${looks}` : 'one look so far')),
      looks > 1 ? el('button', { class: 'forge-btn', key: 'l', onclick: () => openLookPicker((changed) => { if (changed) done('look'); }) }, 'Look') : null));
  return el('div', {},
    lookRow,
    slotRow('Weapon', eq.weapon),
    slotRow('Armor', eq.armor),
    slotRow('Boots', eq.boots),
    slotRow('Ring I', eq.rings[0]),
    slotRow('Ring II', eq.rings[1]),
    slotRow('Trinket', eq.trinket),
    slotRow('Amulet', eq.amulet));
}

// ---- THE KNIGHT (0.00238, the desktop's left panel; the developer's layout): his
// name and level, the card with his gear around it — weapon, armor, boots
// on the left, the rings, trinket and amulet on the right, each slot as tall
// as the card allows and its Forge button in the outer top corner — and his
// numbers under it. `boxes` hands the scene the values that glow when a
// purchase moves them (hubScene.js settleStats).
export function knightSection(p, done, found = new Set(), waiting = new Set()) {
  const eq = p.equipment, s = derivedStats(p);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const slot = (label, id) => {
    const item = id ? itemWithForge(id, p) : null;
    if (!item) return el('div', { class: 'gear-slot empty', 'data-row': `slot-${label}` }, el('div', { class: 'slot-kind' }, label), el('div', { class: 'slot-name' }, '— empty —'));
    const forgeLvl = p.forged[id] ?? 0;
    return el('div', { class: `gear-slot gear-${rarityClass(item)}${found.has(label) ? ' found' : ''}`, 'data-row': `slot-${label}` },
      el('div', { class: 'slot-kind' }, label, newTag(found, label)),
      waiting.has(label) ? null
      : forgeable(id) && !forgeMaxed(id)
        ? el('button', {
            class: 'forge-btn',
            disabled: p.coins < forgeCost(id),
            onclick: () => { sfx('forge'); narrate('forge'); forgeItem(id); done(`slot-${label}`); },
          }, `Forge ${forgeCost(id)}c`)
        : forgeable(id) ? el('span', { class: 'forge-max' }, 'MAX') : null,
      el('div', { class: 'slot-name' }, itemName(item), forgeLvl ? el('span', { class: 'slot-plus' }, ` +${forgeLvl}`) : null),
      el('div', { class: 'slot-desc' }, describeItem(item)));
  };
  const hero = heroOf(p), looks = hero.looks.length;
  const level = el('div', { class: 'knight-level' }, el('span', {}, 'Level '), el('b', {}, String(playerLevel(p))));
  const vals = { Level: playerLevel(p), Attack: s.dmg, HP: s.maxHp, Armor: s.armor, Crit: pct(s.crit), Lifesteal: s.lifesteal ? pct(s.lifesteal) : '—', Potions: `${p.potions}/${p.potionCap}` };
  const chip = (k, cls = '') => statBox(k, vals[k], cls);
  const boxes = { Level: level, Attack: chip('Attack'), HP: chip('HP'), Armor: chip('Armor'), Crit: chip('Crit'), Lifesteal: chip('Lifesteal', s.lifesteal ? '' : 'none'), Potions: chip('Potions', potionLevel(p)) };
  const panel = el('div', { class: 'panel knight-panel' },
    el('div', { class: 'knight-name' }, p.name || heroOf(p).name),
    level,
    el('div', { class: 'sec-hint' }, 'worn gear · the forge enhances tier 2+ for coins'),
    el('div', { class: 'knight-doll' },
      el('div', { class: 'gear-col gear-left' }, slot('Weapon', eq.weapon), slot('Armor', eq.armor), slot('Boots', eq.boots)),
      // the portrait opens the look picker (0.00253): the same class, another of its looks
      el('div', { class: `knight-card${looks > 1 ? ' pickable' : ''}`, 'data-row': 'look', title: looks > 1 ? 'Change your look' : null, onclick: looks > 1 ? () => openLookPicker((changed) => { if (changed) done('look'); }) : null },
        el('img', { src: portraitUrl('player'), alt: '' }),
        el('div', { class: 'look-tag' }, looks > 1 ? `Look ${cleanHero(p.hero).look + 1} of ${looks} · click to change` : hero.name)),
      el('div', { class: 'gear-col gear-right' }, slot('Ring I', eq.rings[0]), slot('Ring II', eq.rings[1]), slot('Trinket', eq.trinket), slot('Amulet', eq.amulet))),
    el('div', { class: 'knight-stats' }, ...['Attack', 'HP', 'Armor', 'Crit', 'Lifesteal', 'Potions'].map((k) => boxes[k])));
  return { panel, boxes, vals };
}

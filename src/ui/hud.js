// ui/hud.js — small shared rendering helpers.

import { el } from '../core/dom.js';
import { DATA } from '../shared/data.js';
import { itemArtUrl, potionArtUrl } from '../shared/itemArt.js';
import { masteryText } from '../shared/classGear.js';
import { heroById } from '../shared/heroes.js';

// Low health (0.126): at or under difficulty.json lowHpShare of max HP the
// knight's HP bar glows red and, with potions left, Drink Potion pulses.
export const isLowHp = (hp, maxHp) => hp > 0 && hp / maxHp <= DATA.difficulty.lowHpShare;

// The way on, after a cleared room (0.00206): low on health with no potion
// left, Retreat with Loot is the advice (pulsing red) and Push Deeper is
// plain; otherwise Push Deeper pulses yellow as always (0.079). Call it on
// every update — a potion drunk after the win changes the answer.
export const shouldRetreat = (run) => isLowHp(run.hp, run.maxHp) && run.potions <= 0;
export function markWayOn(deeper, retreat, run) {
  const flee = shouldRetreat(run);
  if (deeper) deeper.classList.toggle('active', !flee);
  if (retreat) { retreat.classList.toggle('active', flee); retreat.classList.toggle('active-red', flee); }
}

// Potion count colour (0.089): green when the satchel is full, red when
// running low (1 or none, or a quarter of the satchel or less). The Great
// Hall's stat box and the panel rooms' HUD (styles.css .potions-*).
export function potionLevel(p) {
  if (p.potions >= p.potionCap) return 'potions-full';
  if (p.potions <= Math.max(1, Math.floor(p.potionCap * DATA.difficulty.potions.lowShareHud))) return 'potions-low';
  return 'potions-ok';
}

export function hpBar(current, max, color) {
  const pct = Math.max(0, Math.round((current / max) * 100));
  const fill = color ? `width:${pct}%;background:${color}` : `width:${pct}%`;
  return el('div', { class: 'hpbar' }, el('div', { style: fill }));
}

// st: the stat it shows (0.00266: 'dmg', 'hp', ...) — its colour (styles.css .st-box).
export function statBox(label, value, cls = '', st = null) {
  return el('div', { class: `stat-box${cls ? ` ${cls}` : ''}${st ? ` st-box st-${st}` : ''}` },
    el('div', { class: 'label' }, label),
    el('div', { class: 'value' }, String(value)));
}

// The stat colours (0.00266, the developer's call): a stat word with its number ("+6 dmg", "40 armor", "+3% crit chance",
// "better loot") in the stat's colour, the same one as the Train row that raises it (ST_TRAIN) — so training an attribute
// reads as the stat it moves. statText(str) is str as text and coloured spans, for el()'s children.
export const ST_TRAIN = { power: 'dmg', vitality: 'hp', endurance: 'armor', precision: 'crit', fortune: 'loot' };
const ST_RX = /([+×−-]?\d[\d.,]*%?\s*)?\b(max hp|hp|crit chance|crit damage|crit dmg|crit|damage|dmg|armor|lifesteal|dodge|healing|heal|better loot drops|better loot)\b/gi;
export function statKind(word) {
  const w = word.toLowerCase();
  if (/crit/.test(w)) return 'crit';
  if (/dmg|damage/.test(w)) return 'dmg';
  if (/hp|heal/.test(w)) return 'hp';
  if (/armor/.test(w)) return 'armor';
  if (/lifesteal/.test(w)) return 'ls';
  if (/dodge/.test(w)) return 'dodge';
  return /loot/.test(w) ? 'loot' : null;
}
export function statText(str) {
  const s = String(str ?? ''), out = [];
  let last = 0, m;
  ST_RX.lastIndex = 0;
  while ((m = ST_RX.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(el('span', { class: `st st-${statKind(m[2])}` }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

// Small glyph per line type, for faster log scanning.
const GLYPHS = { atk: '⚔ ', heal: '✚ ', loot: '◆ ', move: '➤ ', multi: '★ ', sys: '' };

// content: plain string, or an array of strings/Nodes/{ item } parts (rich
// line, e.g. rarity-colored item names inside a loot summary). An { item }
// part renders via itemName(), so game logic can name items without DOM.
// The dungeon log is one element for the whole run — a deep run prints
// thousands of lines, so only the newest LOG_MAX_LINES stay in the DOM.
// 0.00222: the newest line is the FIRST child and the box is a reversed
// flex column (styles.css #combat-log), which the browser keeps scrolled
// to its end on its own — a scroll-position write here (the element's
// full height) forced a synchronous layout of the whole room in the middle
// of every hit's frame.
const LOG_MAX_LINES = 200;

// 0.00260: an { item, id } part (run/loot.js takeItem) leads with the item's
// small picture, rimmed in its rarity.
export function logLine(logEl, content, cls = 'sys') {
  const parts = (Array.isArray(content) ? content : [content])
    .map((p) => (p && typeof p === 'object' && p.item ? [p.id ? itemPic(p.id, 'log-art') : null, itemName(p.item)] : p?.potion ? potionPic('log-art') : p)); // (0.00263: { potion } = the potion's picture)
  const line = el('div', { class: cls }, GLYPHS[cls] ?? '', ...parts);
  logEl.insertBefore(line, logEl.children[0] ?? null);
  while (logEl.children.length > LOG_MAX_LINES) logEl.children[logEl.children.length - 1].remove();
}

// Item rarity scheme driven by items.json `tier` (see styles.css):
// T1 worn ash, T2 rare azure (soft pulse), T3 epic amethyst (strong pulse),
// T4 crimson relics (rarityClass clamps at 4).
export function rarityClass(item) {
  const t = Math.min(4, Math.max(1, item.tier || 1));
  return `rarity-${t}`;
}

// Item name span colored by rarity tier.
export function itemName(item) {
  return el('span', { class: rarityClass(item) }, item.name);
}

// An item's picture (0.00260, items.json art): an <img> classed `item-pic
// tier-N` (+ cls) for the rarity rim, or null for an item with none.
export function itemPic(id, cls = '') {
  const src = itemArtUrl(id), item = DATA.items[id];
  return src ? el('img', { class: `item-pic tier-${Math.min(4, Math.max(1, item.tier || 1))}${cls ? ` ${cls}` : ''}`, src, alt: '', draggable: 'false' }) : null;
}

// The healing potion's picture (0.00263): the hero card's count, the potion's card in combat.
export function potionPic(cls = '') {
  const src = potionArtUrl();
  return src ? el('img', { class: `item-pic potion-pic${cls ? ` ${cls}` : ''}`, src, alt: '', draggable: 'false' }) : null;
}

// A worn slot's name (0.00248, from hubSections.js; 0.00260 here, so combat's
// find card names it too): the settle record's { slot, index }.
const SLOT_LABEL = { weapon: 'Weapon', armor: 'Armor', boots: 'Boots', trinket: 'Trinket', amulet: 'Amulet' };
export const gearLabel = ({ slot, index }) => (slot === 'rings' ? ['Ring I', 'Ring II'][index] : SLOT_LABEL[slot]);

// One-line description of an item's stat bonuses, e.g. "+9 dmg".
export function describeItem(item) {
  const parts = [];
  if (item.dmg) parts.push(`+${item.dmg} dmg`);
  if (item.armor) parts.push(`+${item.armor} armor`);
  if (item.hp) parts.push(`+${item.hp} HP`);
  if (item.lifesteal) parts.push(`${Math.round(item.lifesteal * 100)}% lifesteal`);
  if (item.crit) parts.push(`+${Math.round(item.crit * 100)}% crit`);
  if (item.dodge) parts.push(`${Math.round(item.dodge * 100)}% dodge`);
  if (item.thorns) parts.push(`${item.thorns} thorns`);
  if (item.heavyCd) parts.push('faster heavy recharge');
  if (item.revive) parts.push('revive once per run');
  if (item.mastery && item.class) parts.push(masteryText(heroById(item.class), item.mastery)); // (0.00274: a class's signature item feeds its mechanic)
  return parts.join(', ');
}

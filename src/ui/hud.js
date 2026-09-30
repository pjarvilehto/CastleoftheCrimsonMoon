// ui/hud.js — small shared rendering helpers.

import { el } from '../core/scene.js';

export function hpBar(current, max, color) {
  const pct = Math.max(0, Math.round((current / max) * 100));
  const fill = color ? `width:${pct}%;background:${color}` : `width:${pct}%`;
  return el('div', { class: 'hpbar' }, el('div', { style: fill }));
}

export function statBox(label, value, cls = '') {
  return el('div', { class: `stat-box${cls ? ` ${cls}` : ''}` },
    el('div', { class: 'label' }, label),
    el('div', { class: 'value' }, String(value)));
}

// Small glyph per line type, for faster log scanning.
const GLYPHS = { atk: '⚔ ', heal: '✚ ', loot: '◆ ', move: '➤ ', multi: '★ ', sys: '' };

// content: plain string, or an array of strings/Nodes/{ item } parts (rich
// line, e.g. rarity-colored item names inside a loot summary). An { item }
// part renders via itemName(), so game logic can name items without DOM.
// The dungeon log is one element for the whole run — a deep run prints
// thousands of lines, so only the newest LOG_MAX_LINES stay in the DOM.
const LOG_MAX_LINES = 200;

export function logLine(logEl, content, cls = 'sys') {
  const parts = (Array.isArray(content) ? content : [content])
    .map((p) => (p && typeof p === 'object' && p.item ? itemName(p.item) : p));
  const line = el('div', { class: cls }, GLYPHS[cls] ?? '', ...parts);
  logEl.append(line);
  while (logEl.children.length > LOG_MAX_LINES) logEl.children[0].remove();
  logEl.scrollTop = logEl.scrollHeight;
}

// Item rarity scheme driven by items.json `tier` (see styles.css):
// T1 worn ash, T2 rare azure (soft pulse), T3 epic amethyst (strong pulse).
export function rarityClass(item) {
  const t = Math.min(4, Math.max(1, item.tier || 1));
  return `rarity-${t}`;
}

// Item name span colored by rarity tier.
export function itemName(item) {
  return el('span', { class: rarityClass(item) }, item.name);
}

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
  return parts.join(', ');
}

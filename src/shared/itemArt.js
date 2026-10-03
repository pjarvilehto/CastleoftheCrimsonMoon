// shared/itemArt.js — the gear's pictures (0.00260). The file is data:
// items.json `art` per item, in assets/items/ (tools/gen-items.mjs
// --import; a redraw lands under a new name, rule 7). Also what a find is
// worth against what it replaced, for the find card in combat and the
// run's end (pure: no DOM).

import { DATA } from './data.js';

export const ITEM_ART_DIR = 'assets/items';
export const itemArtFile = (id) => DATA.items[id]?.art ?? null;
export const itemArtUrl = (id) => { const f = itemArtFile(id); return f ? `${ITEM_ART_DIR}/${f}` : null; };
/** Every item's picture, the gear the save wears first (the hall shows those on its first paint). */
export function itemArtUrls(worn = []) {
  const ids = [...new Set([...worn.filter((id) => DATA.items[id]), ...Object.keys(DATA.items)])];
  return ids.map(itemArtUrl).filter(Boolean);
}

// The stats a find can raise, in describeItem's order and wording.
const GAINS = [
  ['dmg', (v) => `+${v} dmg`], ['armor', (v) => `+${v} armor`], ['hp', (v) => `+${v} HP`],
  ['lifesteal', (v) => `+${Math.round(v * 100)}% lifesteal`], ['crit', (v) => `+${Math.round(v * 100)}% crit`],
  ['dodge', (v) => `+${Math.round(v * 100)}% dodge`], ['thorns', (v) => `+${v} thorns`],
];
/** What `toId` adds over `fromId` (null = an empty slot): the stats it raises, at most `max`, as one line ('' when it raises none). */
export function gainLine(fromId, toId, max = 2) {
  const a = DATA.items[fromId] ?? {}, b = DATA.items[toId];
  if (!b) return '';
  const up = [b.revive && !a.revive ? 'a revive' : null, b.heavyCd && !a.heavyCd ? 'faster heavy' : null].filter(Boolean); // (the rare powers first: the stats would crowd them out)
  up.push(...GAINS.map(([k, fmt]) => [(b[k] ?? 0) - (a[k] ?? 0), fmt]).filter(([d]) => d > 1e-9).map(([d, fmt]) => fmt(Math.round(d * 100) / 100)));
  return up.slice(0, max).join(', ');
}

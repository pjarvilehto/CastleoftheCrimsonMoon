// shared/classGear.js — who can use what (0.00273, the developer's item
// matrix, docs/item-matrix.md). Three layers, readable from an item's name:
// a weapon has a `kind` (sword, axe, mace, staff, dagger, scythe, crossbow,
// censer) and a class wields two kinds (heroes.json `wields`); a body armor
// has a weight (heavy, hide, cloth) and a class wears one (`wears`); an item
// named after a class carries `class` and is that class's alone, whatever
// its kind; everything else is everyone's. A class's MASTERY (heroes.json
// `mastery`: a key of its class block, what one point adds, the words) is
// fed by its two signature items — +1 at tier 3, +2 at tier 4 (items.json
// `mastery`). Pure: the data in, no DOM.

import { DATA } from './data.js';
import { heroById } from './heroes.js';

/** Can the class `heroId` use the item? An unknown class (no hero chosen yet) can use anything. */
export function canUse(heroId, itemId) {
  const it = DATA.items[itemId], hero = heroById(heroId);
  if (!it) return false;
  if (!hero) return true;
  if (it.class) return it.class === hero.id;
  if (it.slot === 'weapon' && it.kind) return hero.wields.includes(it.kind);
  if (it.slot === 'armor' && it.kind) return hero.wears === it.kind;
  return true;
}

/** The classes that can use an item (hero objects, heroes.json order). */
export const usersOf = (itemId) => DATA.heroes.heroes.filter((h) => canUse(h.id, itemId));

/** Who an item is for, in words: "Everyone", one class's name, or the names joined. */
export function usersText(itemId) {
  const users = usersOf(itemId);
  if (users.length === DATA.heroes.heroes.length) return 'Everyone';
  return users.map((h) => h.name.replace(/^The /, '').replace(/^Curious /, '')).join(', ');
}

/** What a number of mastery points does for a class, in words ("+2 Fireball charges", "+30% Cleave reach"). */
export function masteryText(hero, n) {
  const m = hero?.mastery;
  if (!m || !n) return '';
  const v = m.per * n;
  return m.pct ? `+${Math.round(v * 100)}% ${m.label}` : `+${v} ${v === 1 ? m.label : m.labelPlural ?? m.label}`;
}

/** The class block with the worn items' mastery added (stats.js derivedStats snapshots it as run.stats.klass). */
export function withMastery(cls, hero, gear) {
  const m = hero?.mastery;
  const n = gear.reduce((s, g) => s + (g?.class === hero?.id ? g.mastery || 0 : 0), 0);
  if (!m || !n) return { ...cls };
  return { ...cls, [m.key]: cls[m.key] + m.per * n };
}

/** The class's kit item for a slot (heroes.json kit), or null (only the weapon and the armor have one). */
export const kitFor = (hero, slot) => hero?.kit?.[slot] ?? null;

/** Fit a profile's worn gear to its class (the developer's call: what the class can't use becomes its kit, no payout;
 *  an accessory it can't use comes off). Returns the slots changed. No hero chosen: nothing. */
export function fitGearToClass(p) {
  const hero = heroById(p?.hero?.id);
  if (!hero || !p.equipment) return [];
  const changed = [];
  for (const slot of ['weapon', 'armor', 'boots', 'trinket', 'amulet']) {
    const id = p.equipment[slot];
    if (id && !canUse(hero.id, id)) { p.equipment[slot] = kitFor(hero, slot); changed.push(slot); }
  }
  p.equipment.rings = (p.equipment.rings ?? [null, null]).map((id, i) => { if (id && !canUse(hero.id, id)) { changed.push(`ring${i}`); return null; } return id; });
  return changed;
}

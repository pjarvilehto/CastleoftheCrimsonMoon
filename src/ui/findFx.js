// ui/findFx.js — a kept find in combat (0.00260, the developer's pick from
// the mockups): as its "Found:" line prints, the item rises as a card over
// the enemies still standing — its picture fading into the text (the hall's
// look), FOUND · the slot, the name in its rarity, its stats and what it
// replaces — holds long enough to read, then flies into the LOOT row at the
// bottom left (0.00262, the developer's call: a find joins the run's loot,
// not the hero — it is worn only after the run). The scene hands the row as
// ctx.loot(); a phone has no row (its top strip is the room title's), so
// there the card flies into the XP / COINS counters it would sit under.
// The fx descriptor is combatQueue.js's { kind: 'find', id, slot, index,
// from } (run/loot.js takeItem). A no-op without the Web Animations API
// (the smoke-test shim) or under reduced motion: the log line says it.

import { el } from '../core/dom.js';
import { DATA } from '../shared/data.js';
import { gainLine } from '../shared/itemArt.js';
import { itemPic, describeItem, gearLabel } from './hud.js';
import { can, reduced } from './fxParts.js';
import { unionRect } from './combatFx.js';

const IN_MS = 260, HOLD_MS = 1500, FLY_MS = 520; // (the look: in, read, away)
const MAX_UNITS = 12; // (a row never holds more: the boss and its summons, or six foes)

/** The card, built (exported for the tests: the shim has no animate). */
export function findCard(fx) {
  const it = DATA.items[fx.id];
  if (!it) return null;
  const from = fx.from && DATA.items[fx.from] ? DATA.items[fx.from] : null;
  const gain = gainLine(fx.from, fx.id);
  return el('div', { class: `find-pop tier-${Math.min(4, it.tier)}` },
    el('div', { class: 'fp-art' }, itemPic(fx.id)),
    el('div', { class: 'fp-text' },
      el('div', { class: 'fp-kind' }, 'Found · ', el('b', {}, gearLabel({ slot: fx.slot === 'ring' ? 'rings' : fx.slot, index: fx.index ?? 0 }) ?? it.slot)),
      el('div', { class: 'fp-name' }, it.name),
      el('div', { class: 'fp-desc' }, describeItem(it)),
      el('div', { class: 'fp-cmp' }, from ? `replaces ${from.name}` : 'an empty slot', gain ? [' · ', el('span', { class: 'up' }, gain)] : null)));
}

// The LOOT row's next free place (its tray's end) and a chip's size; on a
// phone, where the row is hidden, the counters' end; null with neither.
// `ahead`: finds still flying to it, each a chip further along.
export function lootSpot(row, ahead = 0) {
  const r = row?.getBoundingClientRect?.();
  if (r && r.width > 0) {
    const tray = row.children?.[1], t = tray?.getBoundingClientRect?.() ?? r, size = r.height;
    return { x: (tray?.children?.length ? t.right : t.left) + size / 2 + ahead * size * 1.1, y: r.top + r.height / 2, size };
  }
  const p = row?.parentElement?.getBoundingClientRect?.();
  return p && p.width > 0 ? { x: p.right - p.height / 2, y: p.top + p.height / 2, size: p.height } : null;
}

/** Plays the card; returns the ms until it lands (undefined when nothing plays). */
export function findPop(fx, ctx) {
  const layer = ctx.layer;
  if (!layer || !can(layer) || reduced()) return;
  const card = findCard(fx);
  if (!card) return;
  // over the foes still standing (the fallen card has left the row); the room's middle when none is
  const foes = [];
  for (let i = 0; i < MAX_UNITS; i++) { const u = ctx.unit(i); if (u) foes.push(u.card?.getBoundingClientRect?.() ?? null); }
  const W = globalThis.innerWidth ?? 1280, H = globalThis.innerHeight ?? 720;
  const area = unionRect(foes) ?? { left: W * 0.3, top: H * 0.2, width: W * 0.5, height: H * 0.5 };
  const stack = [...layer.children].filter((c) => c.classList?.contains('find-pop')).length; // (two finds in one blow: the second sits under the first)
  card.style.opacity = '0';
  layer.append(card);
  const w = card.offsetWidth || 0, h = card.offsetHeight || 0;
  const left = Math.max(8, Math.min(W - w - 8, area.left + area.width / 2 - w / 2));
  const top = Math.max(8, area.top + area.height * 0.22 + stack * (h + 10));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  // where it flies: the LOOT row's next free place, shrinking to a chip's size
  const spot = lootSpot(ctx.loot?.(), ctx.lootAhead?.() ?? 0);
  const dx = spot ? spot.x - (left + w / 2) : 0, dy = spot ? spot.y - (top + h / 2) : 0;
  const shrink = spot && w ? Math.min(0.3, Math.max(0.04, spot.size / w)) : 0.1;
  const total = IN_MS + HOLD_MS + FLY_MS, a = IN_MS / total, b = (IN_MS + HOLD_MS) / total;
  card.animate([
    { opacity: 0, transform: 'translateY(14px) scale(0.9)' },
    { opacity: 1, transform: 'none', offset: a },
    { opacity: 1, transform: 'none', offset: b, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)' },
    { opacity: spot ? 0.35 : 0, transform: spot ? `translate(${dx}px, ${dy}px) scale(${shrink.toFixed(3)})` : 'translateY(-20px)' },
  ], { duration: total, fill: 'forwards' }).finished.then(() => card.remove(), () => card.remove());
  return total; // (ms until it lands: the scene's LOOT row takes it then)
}

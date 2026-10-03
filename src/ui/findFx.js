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
import { potionPic, statText, findBody, tierOf } from './hud.js';
import { potionHealFor } from '../meta/leveling.js';
import { can, reduced } from './fxParts.js';
import { unionRect } from './combatFx.js';

const IN_MS = 260, HOLD_MS = 1500, FLY_MS = 520; // (the look: in, read, away)
const MAX_UNITS = 12; // (a row never holds more: the boss and its summons, or six foes)

/** The card, built (exported for the tests: the shim has no animate). Its body is hud.js findBody (0.00299), shared with the run end's card. */
export function findCard(fx) {
  const it = DATA.items[fx.id];
  if (!it) return null;
  return el('div', { class: `find-pop tier-${tierOf(it)}${fx.offClass ? ' off-class' : ''}` },
    ...findBody(fx.id, fx, 'fp', { kind: (label) => ['Found · ', el('b', {}, label)], over: 'replaces', empty: 'an empty slot' }));
}

// The LOOT row's next free place (its tray's end) and a chip's size; on a
// phone, where the row is hidden, the counters' end; null with neither.
// `ahead`: finds still flying to it, each a chip further along.
// the row's tray (0.00299: the row is a button since — el() wraps its children in a label span, so the tray is found by its class, at any depth)
const trayOf = (n) => (n?.classList?.contains?.('loot-tray') ? n : Array.from(n?.children ?? []).map(trayOf).find(Boolean) ?? null);
export function lootSpot(row, ahead = 0) {
  const r = row?.getBoundingClientRect?.();
  if (r && r.width > 0) {
    const tray = trayOf(row), t = tray?.getBoundingClientRect?.() ?? r, size = r.height;
    return { x: (tray?.children?.length ? t.right : t.left) + size / 2 + ahead * size * 1.1, y: r.top + r.height / 2, size };
  }
  const p = row?.parentElement?.getBoundingClientRect?.();
  return p && p.width > 0 ? { x: p.right - p.height / 2, y: p.top + p.height / 2, size: p.height } : null;
}

/** Plays the card; returns the ms until it lands (undefined when nothing plays). */
export function findPop(fx, ctx) {
  if (!ctx.layer || !can(ctx.layer) || reduced()) return;
  const card = findCard(fx);
  if (!card) return;
  // where it flies: the LOOT row's next free place
  return riseAndFly(card, ctx, () => lootSpot(ctx.loot?.(), ctx.lootAhead?.() ?? 0)); // (ms until it lands: the scene's LOOT row takes it then)
}

// A found potion (0.00263, the developer's ask): the same card, the potion's
// picture and what it does, flying into the hero card's potion count — which
// holds the new potion back until it lands, then glows and counts it
// (battleLine.js holdPotion / landPotion; the scene holds it as the line is
// queued, combatQueue.js potionQueued).
export function potionCard(run) {
  const heal = potionHealFor(run.stats.klass); // (0.00277: the class's share in it)
  return el('div', { class: 'find-pop potion-pop' },
    el('div', { class: 'fp-art' }, potionPic()),
    el('div', { class: 'fp-text' },
      el('div', { class: 'fp-kind' }, 'Found · ', el('b', {}, 'Potion')),
      el('div', { class: 'fp-name' }, 'Healing Potion'),
      el('div', { class: 'fp-desc' }, ...statText(`heals ${heal} HP`)),
      run ? el('div', { class: 'fp-cmp' }, 'into the satchel · ', el('span', { class: 'up' }, `${run.potions} / ${run.potionCap}`)) : null));
}
/** Plays it; the hero card's count takes it as it lands (at once without the animation). */
export function potionPop(ctx) {
  const hero = ctx.unit('player');
  if (!ctx.layer || !can(ctx.layer) || reduced()) { hero?.landPotion?.(); return; }
  const target = () => { const r = hero?.potionsEl?.getBoundingClientRect?.(); return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.height * 1.4 } : null; };
  const ms = riseAndFly(potionCard(ctx.run?.()), ctx, target);
  setTimeout(() => hero?.landPotion?.(), ms);
  return ms;
}

// The card rises over the foes still standing (the fallen card has left the row; the room's middle when none is),
// holds, then flies to spot() = { x, y, size }, shrinking to that size — or fades upward with no spot. Returns its ms.
function riseAndFly(card, ctx, spotOf) {
  const layer = ctx.layer;
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
  const spot = spotOf();
  const dx = spot ? spot.x - (left + w / 2) : 0, dy = spot ? spot.y - (top + h / 2) : 0;
  const shrink = spot && w ? Math.min(0.3, Math.max(0.04, spot.size / w)) : 0.1;
  const total = IN_MS + HOLD_MS + FLY_MS, a = IN_MS / total, b = (IN_MS + HOLD_MS) / total;
  card.animate([
    { opacity: 0, transform: 'translateY(14px) scale(0.9)' },
    { opacity: 1, transform: 'none', offset: a },
    { opacity: 1, transform: 'none', offset: b, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)' },
    { opacity: spot ? 0.35 : 0, transform: spot ? `translate(${dx}px, ${dy}px) scale(${shrink.toFixed(3)})` : 'translateY(-20px)' },
  ], { duration: total, fill: 'forwards' }).finished.then(() => card.remove(), () => card.remove());
  return total;
}

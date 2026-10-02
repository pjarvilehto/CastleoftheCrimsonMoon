// ui/fxParts.js — the reusable pieces of the combat effects (0.098: split
// out of combatFx.js, which keeps the choreography: which effect plays on
// which event, lunges, hit timing). Everything here is a no-op without
// the Web Animations API (the smoke-test shim) or with reduced motion.

import { DATA } from '../shared/data.js';
import { reducedMotion } from '../shared/motion.js';
import { burst, materialOf } from './particles.js';

export const reduced = reducedMotion; // (shared/motion.js, 0.00197)
export const can = (node) => !!node?.animate;
// The portrait's CSS filter (its drop shadow), which every flash layers a
// tint on. Read once per unit: getComputedStyle on an animating element is
// a forced style resolution, and it happened on every blow (0.157).
export const baseFilter = (u) => (u.baseFilter ??= getComputedStyle(u.portrait).filter);

// The glint (0.183): the unit's bright masked copy of its portrait
// (battleLine.js glint) sweeps its band across the figure over `ms`, in
// `dir` (1 = left to right), peaking at cards.json glint.strength.
export function glintSweep(u, ms, dir = 1, delay = 0) {
  const g = u?.glint;
  if (!can(g) || reduced()) return;
  const from = dir > 0 ? '-100%' : '200%', to = dir > 0 ? '200%' : '-100%';
  g.animate([
    { opacity: 0, maskPosition: `${from} 0`, WebkitMaskPosition: `${from} 0` },
    { opacity: DATA.cards.glint.strength, offset: 0.4, maskPosition: '50% 0', WebkitMaskPosition: '50% 0' },
    { opacity: 0, maskPosition: `${to} 0`, WebkitMaskPosition: `${to} 0` },
  ], { duration: ms, delay, easing: 'ease-out' });
}

// Particles out of a struck (or dying) unit, by what it's made of.
export function spray(u, dir, power = 1, big = false) {
  if (!u?.card?.getBoundingClientRect) return;
  const r = u.card.getBoundingClientRect();
  // a random point on the figure each burst (0.090) — not always dead centre
  // 0.128: one burst sized by the blow (hit / crit-or-heavy / kill — the
  // looks have their own crit and kill forms); ink drops land on the
  // card's floor.
  burst(materialOf(u.id),
    r.left + r.width * (0.5 + (Math.random() - 0.5) * 0.5),
    r.top + r.height * (0.3 + Math.random() * 0.3),
    { dir: big ? 0 : dir, size: r.height, kind: big ? 'kill' : power > 1.2 ? 'crit' : 'hit', floor: r.bottom - 4 });
}

// The whole battle line trembles (heavy blows, SMASH, multi-kills).
export function shake(ctx, power) {
  const line = ctx.unit('player')?.el?.parentElement;
  if (!can(line) || reduced()) return;
  const k = 0.55 * power; // vh
  line.animate([
    { transform: 'translate(0, 0)' },
    { transform: `translate(${k}vh, ${-k * 0.6}vh)` },
    { transform: `translate(${-k * 0.8}vh, ${k * 0.4}vh)` },
    { transform: `translate(${k * 0.5}vh, ${k * 0.3}vh)` },
    { transform: `translate(${-k * 0.25}vh, 0)` },
    { transform: 'translate(0, 0)' },
  ], { duration: 320, easing: 'ease-out' });
}

// HP bar feedback (0.089): flares bright green on a heal, flashes toward
// red when damage lands. The glow is on the bar, the colour shift on its
// fill (a gradient, so it's shifted with a filter).
export function barFlash(u, kind, delay = 0, ms = 450) {
  const bar = u?.card?.querySelector?.('.hp-line .hpbar');
  const fill = bar?.firstElementChild;
  if (!can(bar) || !fill) return;
  const heal = kind === 'heal';
  const rgb = heal ? '120,255,140' : '255,60,40';
  bar.animate([
    { boxShadow: `0 0 0 rgba(${rgb},0)` },
    { boxShadow: `0 0 ${heal ? 18 : 12}px rgba(${rgb},1), 0 0 ${heal ? 6 : 4}px rgba(${rgb},1)`, offset: 0.2 },
    { boxShadow: `0 0 0 rgba(${rgb},0)` },
  ], { duration: ms, delay, easing: 'ease-out' });
  fill.animate(heal
    ? [{ filter: 'none' }, { filter: 'brightness(1.9) saturate(1.6)', offset: 0.2 }, { filter: 'none' }]
    : [{ filter: 'none' }, { filter: 'hue-rotate(-110deg) saturate(2.2) brightness(1.4)', offset: 0.15 }, { filter: 'none' }],
  { duration: ms, delay, easing: 'ease-out' });
}

export function glow(u, tint, ms) {
  if (!can(u?.portrait)) return;
  const base = baseFilter(u);
  u.portrait.animate([
    { filter: base },
    { filter: `${base === 'none' ? '' : base} ${tint}`, offset: 0.3 },
    { filter: base },
  ], { duration: ms, easing: 'ease-out' });
}

// A number that pops out of the card and drifts up. Lives in the fx layer
// (not the card), positioned from the card's on-screen box. tag: a small
// caption above the number ("CRIT!", 0.095).
export function floatNumber(ctx, u, text, cls, delay = 0, tag = null) {
  if (!ctx.layer || !can(u?.card)) return;
  const r = u.card.getBoundingClientRect();
  const n = document.createElement('div');
  n.className = `fx-num ${cls}`;
  n.textContent = text;
  if (tag) {
    const t = document.createElement('span');
    t.className = 'fx-tag';
    t.textContent = tag;
    n.prepend(t);
  }
  n.style.left = `${r.left + r.width / 2 + (Math.random() - 0.5) * r.width * 0.3}px`;
  n.style.top = `${r.top + r.height * 0.3}px`;
  n.style.setProperty('--num', `${Math.max(16, r.height * 0.09)}px`); // styles scale it (crits 1.5x)
  n.style.opacity = '0';
  ctx.layer.append(n);
  const rise = r.height * 0.22;
  n.animate([
    { opacity: 0, transform: 'translate(-50%, 0) scale(0.6)' },
    { opacity: 1, transform: `translate(-50%, ${-rise * 0.25}px) scale(1.15)`, offset: 0.15 },
    { opacity: 1, transform: `translate(-50%, ${-rise * 0.6}px) scale(1)`, offset: 0.6 },
    { opacity: 0, transform: `translate(-50%, ${-rise}px) scale(0.95)` },
  ], { duration: 900, delay, easing: 'ease-out' }).finished.then(() => n.remove(), () => n.remove());
}

// A big number with a caption over a whole area (0.106: OVERKILL! across
// the enemy line) — the mega-crit look, bigger, held a beat longer.
export function floatBanner(ctx, r, text, cls, tag) {
  if (!ctx.layer || !r || !can(ctx.layer)) return;
  const n = document.createElement('div');
  n.className = `fx-num ${cls}`;
  n.textContent = text;
  const t = document.createElement('span');
  t.className = 'fx-tag';
  t.textContent = tag;
  n.prepend(t);
  n.style.left = `${r.left + r.width / 2}px`;
  n.style.top = `${r.top + r.height * 0.25}px`;
  n.style.setProperty('--num', `${Math.max(16, r.height * 0.09)}px`);
  n.style.opacity = '0';
  ctx.layer.append(n);
  const rise = r.height * 0.18;
  n.animate([
    { opacity: 0, transform: 'translate(-50%, 0) scale(0.4)' },
    { opacity: 1, transform: `translate(-50%, ${-rise * 0.2}px) scale(1.25)`, offset: 0.12 },
    { opacity: 1, transform: `translate(-50%, ${-rise * 0.5}px) scale(1)`, offset: 0.7 },
    { opacity: 0, transform: `translate(-50%, ${-rise}px) scale(1.05)` },
  ], { duration: 1500, easing: 'ease-out' }).finished.then(() => n.remove(), () => n.remove());
}


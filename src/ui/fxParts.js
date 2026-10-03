// ui/fxParts.js — the reusable pieces of the combat effects (0.098: split
// out of combatFx.js, which keeps the choreography: which effect plays on
// which event, the hit's timing; 0.00283: the lunge and its clock live
// here, shared with ui/classFx.js). Everything here is a no-op without
// the Web Animations API (the smoke-test shim) or with reduced motion.

import { DATA } from '../shared/data.js';
import { unmountGlint } from './battleLine.js';
import { reducedMotion } from '../shared/motion.js';
import { burst, burstClass, materialOf } from './particles.js';

export const reduced = reducedMotion; // (shared/motion.js, 0.00197)
export const can = (node) => !!node?.animate;
// The portrait's CSS filter (its drop shadow), which every flash layers a
// tint on. Read once per unit: getComputedStyle on an animating element is
// a forced style resolution, and it happened on every blow (0.157).
// The two red tints of a struck and a dying figure (0.00223: literal strings in two files before; side by side, both the shipped look).
export const HIT_TINT = 'sepia(1) saturate(5) hue-rotate(-35deg) brightness(1.15)';
export const DEATH_TINT = 'sepia(1) saturate(6) hue-rotate(-40deg) brightness(1.3)';
export const baseFilter = (u) => (u.baseFilter ??= getComputedStyle(u.portrait).filter);

// The lunge (0.00283: one helper for the three copies combatFx.js carried —
// the attack's, the dodge's and the thrall hit's). Its clock: LUNGE_MS long
// (a heavy 1.3x), the blow landing STRIKE_AT of the way; crits and heavies
// freeze the attacker at impact for HITSTOP_MS (0.088).
export const LUNGE_MS = 280;
export const STRIKE_AT = 0.45; // share of the lunge where the blow lands
export const HITSTOP_MS = 70;  // crits and heavies freeze for a beat at impact (0.088)
// When an attack's blow lands, ms after its line prints — its sound is
// scheduled for this moment (ui/combatSfx.js, 0.107).
export const strikeMs = (fx) => (fx?.heavy ? LUNGE_MS * 1.3 : LUNGE_MS) * STRIKE_AT;
// The attacker's unit lunges a slice of the way toward the defender's rect
// `rd`: anticipation (a pull back) -> strike -> recover; reachShare caps the
// reach at that share of the attacker's width (a heavy reaches further),
// overshoot stretches the strike alone (the swing that misses). Over the
// deal still settling the unit (composite add, 0.00197). Returns the
// animation (the hit-stop pauses it), or null where nothing can animate.
export function lunge(a, rd, { dur = LUNGE_MS, reachShare = 0.35, overshoot = 1 } = {}) {
  if (!can(a?.el) || !rd || reduced()) return null;
  const ra = a.el.getBoundingClientRect();
  const toward = (rd.left + rd.width / 2) - (ra.left + ra.width / 2);
  const reach = Math.sign(toward) * Math.min(Math.abs(toward) * 0.14, ra.width * reachShare);
  return a.el.animate([
    { transform: 'translateX(0)' },
    { transform: `translateX(${-reach * 0.18}px)`, offset: 0.25, easing: 'ease-in' },
    { transform: `translateX(${reach * overshoot}px)`, offset: STRIKE_AT, easing: 'ease-out' },
    { transform: 'translateX(0)' },
  ], { duration: dur, easing: 'ease-in-out', composite: 'add' });
}

// The glint (0.183): the unit's bright masked copy of its portrait sweeps
// across the figure over `ms`, in `dir`, peaking at cards.json
// glint.strength. 0.00222: the band (battleLine.js mountGlint, mounted
// for this sweep) carries the mask and slides across the card by a
// transform while the copy inside slides the other way, so the figure
// stays put under a travelling stripe — two compositor animations with
// the same timing (the mask's position used to animate: a style recalc
// and a repaint of a full portrait copy every frame per sweep, six at
// once on OVERKILL and every deal). The width is read once; a blow's
// spray has read this layout already.
export function glintSweep(u, ms, dir = 1, delay = 0) {
  if (!can(u?.portrait) || reduced()) return;
  const band = u.glint, img = band.children[0];
  if (!can(band) || !can(img)) return;
  const w = u.card?.clientWidth || 0;
  const from = (dir > 0 ? 1.6 : -1.6) * w, to = -from;
  band.live = (band.live ?? 0) + 1;
  const timing = { duration: ms, delay, easing: 'ease-out' };
  const a = band.animate([
    { opacity: 0, translate: `${from}px 0` },
    { opacity: DATA.cards.glint.strength, offset: 0.4, translate: '0 0' },
    { opacity: 0, translate: `${to}px 0` },
  ], timing);
  img.animate([{ translate: `${-from}px 0` }, { translate: '0 0', offset: 0.4 }, { translate: `${-to}px 0` }], { ...timing, composite: 'add' });
  const done = () => { if (--band.live <= 0) unmountGlint(u); };
  a.finished.then(done, done);
}

// Particles out of a struck (or dying) unit, by what it's made of.
// rect (0.00222): the card's rect when the caller has read it already (OVERKILL reads every victim's at once)
export function spray(u, dir, power = 1, big = false, rect = null) {
  if (!u?.card?.getBoundingClientRect) return;
  const r = rect ?? u.card.getBoundingClientRect();
  // a random point on the figure each burst (0.090) — not always dead centre
  // 0.128: one burst sized by the blow (hit / crit-or-heavy / kill — the
  // looks have their own crit and kill forms); ink drops land on the
  // card's floor.
  burst(materialOf(u.id),
    r.left + r.width * (0.5 + (Math.random() - 0.5) * 0.5),
    r.top + r.height * (0.3 + Math.random() * 0.3),
    { dir: big ? 0 : dir, size: r.height, kind: big ? 'kill' : power > 1.2 ? 'crit' : 'hit', floor: r.bottom - 4 });
}

// A class's own trace on a unit (0.00268, particleLooks.js spawnClassBurst):
// at the figure like spray(); `to` = a point the burst flies to (the
// drain's wisps), `kind` 'hit' | 'crit'. rect as spray()'s.
export function classSpray(u, look, { dir = 1, kind = 'hit', to = null, at = 'figure' } = {}, rect = null) {
  if (!u?.card?.getBoundingClientRect) return;
  const r = rect ?? u.card.getBoundingClientRect();
  if (!(r.width > 0)) return; // a card that has left the row
  const y = at === 'feet' ? r.top + r.height * 0.78 : r.top + r.height * (0.35 + Math.random() * 0.25); // (at: 'feet' — the Druid's roots rise from the card's floor, 0.00271)
  burstClass(look, r.left + r.width * (0.5 + (Math.random() - 0.5) * 0.3), y, { dir, kind, size: r.height, to });
}
// The middle of a unit's figure, for a burst that flies there.
export function centreOf(u) {
  const r = u?.card?.getBoundingClientRect?.();
  return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height * 0.45 } : null;
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
// rect (0.00223): the card's rect when the caller has read it already
export function floatNumber(ctx, u, text, cls, delay = 0, tag = null, rect = null) {
  if (!ctx.layer || !can(u?.card)) return;
  const r = rect ?? u.card.getBoundingClientRect();
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


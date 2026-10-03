// ui/classFx.js — the classes' choreography (0.00278: split out of
// combatFx.js, which keeps the core: fxFor / holdFor / playFx, the attack,
// the hit, the deal). The developer's ask (0.00268) was each class's
// attacks their own: a blow by the hero lays the class's trace over the
// foe's material burst (particleLooks.js spawnClassBurst draws them), and
// the class events — the Hex, Last Rites, Entangle, a charge back, the
// thrall's rise, a blow it took, its crumbling — burst on their own.
//
// The class is the RUN's (0.00278): ctx.run() -> run.stats.klass.heavy, the
// class block snapshotted at the run's start (meta/stats.js derivedStats;
// a debug SWITCH CLASS rebuilds it). A context without a run — the tests
// build bare ones — falls back to the profile's hero.

import { bgLight } from '../core/bg3d.js';
import { reduced, can, classSpray, centreOf, shake, glow, floatNumber, lunge, strikeMs } from './fxParts.js';
import { getProfile } from '../meta/profile.js';
import { heroOf } from '../shared/heroes.js';

// What the heavy button does for this run's class: heroes.json class.heavy
// (blow | cleave | fireball | drain | entangle | mark | censer).
export const heavyKindOf = (ctx) => ctx?.run?.()?.stats?.klass?.heavy ?? heroOf(getProfile()).class.heavy;

// Which trace a blow on a foe leaves, by the class and the blow: the
// knight's heavy a steel clash; the Barbarian's Cleave a crescent (its
// reach a smaller one), his blows embers; the Wizard's Fireball a bloom on
// every foe it takes, his blows arcane; the Necromancer's blows grave
// motes, his Soul Drain the wisps torn out of the foe flying to him; the Druid's heavy
// blow three rakes of the living staff (the roots themselves burst on the
// entangle line, 0.00271), his blows one; the Hexhunter's blows on the hexed
// foe flare its sigil, the others violet sparks (the Hex itself on the
// mark line); the Plague Sister's blows a swing of the censer, the blight's
// gnawing a wisp of it. null = the foe's own burst alone.
export function traceFor(fx, heavy) {
  if (fx.via === 'fireball') return 'fireball';
  if (fx.via === 'cleave') return 'cleavespill';
  if (fx.via === 'blight') return 'blight';
  if (fx.kind !== 'attack' || fx.from !== 'player') return null;
  switch (heavy) {
    case 'blow': return fx.heavy ? 'steel' : null;
    case 'cleave': return fx.heavy ? 'cleave' : 'rage';
    case 'fireball': return fx.heavy ? 'fireball' : 'arcane';
    case 'drain': return fx.heavy ? 'drain' : 'grave';
    case 'entangle': return fx.heavy ? 'claw' : 'thorn';
    case 'mark': return fx.marked ? 'hexhit' : 'hexspark';
    case 'censer': return 'incense';
    default: return null;
  }
}
// The class's own trace over the foe's burst, as a blow lands (combatFx.js hit()).
// rc: the card's rect the hit read already.
export function classTrace(u, fx, rc, ctx) {
  const look = traceFor(fx, heavyKindOf(ctx));
  if (!look) return;
  classSpray(u, look, { dir: 1, kind: fx.heavy || fx.crit ? 'crit' : 'hit', to: look === 'drain' ? centreOf(ctx.unit('player')) : null }, rc); // (the drain's wisps fly to the Necromancer)
}
// Hex: the sigil turns on the foe, which flares violet.
export function mark(fx, ctx) {
  const u = ctx.unit(fx.to);
  classSpray(u, 'hex');
  glow(u, 'sepia(1) saturate(4) hue-rotate(220deg) brightness(1.3)', 700);
}
// Last Rites: the censer's smoke settles on every foe still standing.
export function blight(ctx) {
  for (let i = 0; ctx.unit(i); i++) setTimeout(() => classSpray(ctx.unit(i), 'censer'), i * 60);
}
// Entangle (0.00271): roots burst from the ground at every foe's feet, a green light in the scene, the line trembles.
export function entangle(ctx) {
  for (let i = 0; ctx.unit(i); i++) setTimeout(() => classSpray(ctx.unit(i), 'roots', { at: 'feet' }), i * 70);
  shake(ctx, 0.5);
  bgLight('potion', ctx.unit('player')?.card?.getBoundingClientRect?.());
}
// A bound foe strains and fails: the roots tug, the card shivers in place, the word floats up.
export function entangled(fx, ctx) {
  const u = ctx.unit(fx.from);
  if (!u) return;
  classSpray(u, 'rooted', { at: 'feet' });
  if (can(u.el) && !reduced()) u.el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-2%)' }, { transform: 'translateX(2%)' }, { transform: 'translateX(-1%)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'ease-out', composite: 'add' });
  floatNumber(ctx, u, 'ENTANGLED', 'fx-miss');
}
// A foe rises again at the Necromancer's side.
export function thrall(ctx) {
  const p = ctx.unit('player');
  classSpray(p, 'thrall');
  glow(p, 'sepia(1) saturate(4) hue-rotate(80deg) brightness(1.3)', 800);
}
// A foe's blow lands on the thrall: the lunge, a green THRALL number (.fx-thrall), grave motes — the Necromancer stands untouched.
export function thrallHit(fx, ctx) {
  const a = ctx.unit(fx.from), p = ctx.unit('player');
  const strike = strikeMs(fx);
  if (can(p?.el)) lunge(a, p.el.getBoundingClientRect?.() ?? null);
  setTimeout(() => classSpray(p, 'thrallhit'), strike);
  if (fx.taken > 0) floatNumber(ctx, p, `-${fx.taken}`, 'fx-thrall', strike, 'THRALL');
}

// The class events by their effect kind (combatFx.js playFx hands them here).
export const CLASS_FX = {
  mark,
  blight: (fx, ctx) => blight(ctx),
  entangle: (fx, ctx) => entangle(ctx),
  entangled,
  charge: (fx, ctx) => classSpray(ctx.unit('player'), 'charge'),
  thrall: (fx, ctx) => thrall(ctx),
  thrallhit: thrallHit,
  thrallfall: (fx, ctx) => classSpray(ctx.unit('player'), 'thrallfall'),
};
export const CLASS_KINDS = Object.keys(CLASS_FX);

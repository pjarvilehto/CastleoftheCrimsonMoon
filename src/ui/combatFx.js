// ui/combatFx.js — combat animation layer (0.086+). The playback queue
// hands every printed line's `fx` descriptor to playFx(), so animations
// land on the same beat as the log line and its sound.
//
// Descriptor shape: { kind, from?, to?, dmg?, crit?, heavy?, amount?, share? }
//   share: a hit on the hero / the hero's max HP (sizes the big-hit sway)
//   from / to: an enemy index, or 'player'
//   kinds: attack, hit, dodge, heal, overkill, multi, revive, die, enter, deal, summon,
//     find, potion (a find's or a found potion's card, findFx.js, 0.00260 / 0.00263),
//     and the classes' (0.00268): mark, blight, entangle, entangled, charge, thrall,
//     thrallhit, thrallfall
//   (enter = the room is built: the units wait unseen; deal = the windows are
//   back: the cards are dealt in — scene.js whenWindowsBack, 0.184)
//
// Two animation systems, on purpose: idle loops are CSS animations on the
// portrait's independent translate/rotate/scale (styles.css .idle-*); every
// one-shot here is a Web Animation, which layers on top WITHOUT restarting
// the CSS loop. Lunges/knockbacks move the whole .unit (card + buttons);
// flashes act on the portrait. Death collapse lives in battleLine.js (the
// card owns its dead state).
// The reusable pieces (shake, particle spray, HP-bar flash, glow, floating
// numbers, the lunge and its clock) live in fxParts.js (0.098, 0.00283); the
// classes' choreography (the traces, the Hex, the thrall...) in classFx.js
// (0.00283). Browsers without element.animate (the smoke test shim, very old
// TVs) simply get no one-shots.

import { DATA } from '../shared/data.js';
import { bgJolt, bgSway, bgLight } from '../core/bg3d.js';
import { attachParticles, burst, materialOf } from './particles.js';
import { reduced, can, spray, classSpray, shake, barFlash, glow, floatNumber, floatBanner, baseFilter, glintSweep, HIT_TINT, lunge, strikeMs, LUNGE_MS, STRIKE_AT, HITSTOP_MS } from './fxParts.js';
import { classTrace, CLASS_FX } from './classFx.js';
import { markActivity } from '../core/perfSpans.js';
import { findPop, potionPop } from './findFx.js';

export { strikeMs } from './fxParts.js'; // (ui/combatSfx.js times the blow's sound by it)
export { traceFor } from './classFx.js'; // (the trace table, kept here for its readers)


// Combat event (run/combat.js) -> effect descriptor, or null.
// who: { maxHp } of the hero — sizes hits on the hero (big-hit sway).
export function fxFor(ev, who = {}) {
  switch (ev.type) {
    case 'atk': return { kind: 'attack', from: 'player', to: ev.target, dmg: ev.dmg, crit: !!ev.crit, mega: !!ev.megaCrit, heavy: !!ev.heavy, marked: !!ev.marked }; // (marked: the class's trace, 0.00268)
    case 'spill': return { kind: 'hit', to: ev.target, dmg: ev.dmg, via: ev.via }; // (via: the fire's, the cleave's or the blight's own trace)
    case 'thorns': return { kind: 'hit', to: ev.target, dmg: ev.dmg, thorns: true };
    case 'dmg': return { kind: 'attack', from: ev.source, to: 'player', dmg: ev.taken, share: who.maxHp ? ev.taken / who.maxHp : 0 };
    case 'dodge': return { kind: 'dodge', from: ev.source, to: 'player' };
    case 'heal': return { kind: 'heal', to: 'player', amount: ev.healed, drain: !!ev.drain, from: ev.drain ? ev.target : undefined }; // (the drain's wisps fly from the foe)
    case 'overkill': return { kind: 'overkill', dmg: ev.dmg, victims: ev.victims ?? [] };
    case 'multi': return { kind: 'multi' };
    case 'revive': return { kind: 'revive', to: 'player' };
    case 'summon': return { kind: 'summon', from: ev.source, to: ev.target };
    // the classes' events (0.00268): each bursts in its class's colour
    case 'mark': return { kind: 'mark', to: ev.target };
    case 'blight': return { kind: 'blight' };
    case 'entangle': return { kind: 'entangle' };
    case 'entangled': return { kind: 'entangled', from: ev.source };
    case 'charge': return { kind: 'charge', to: 'player' };
    case 'thrall': return { kind: 'thrall', to: 'player' };
    case 'thrallhit': return { kind: 'thrallhit', from: ev.source, to: 'player', taken: ev.taken };
    case 'thrallfall': return { kind: 'thrallfall', to: 'player' };
    default: return null;
  }
}

// How long the log waits after a line with this effect (0.087 pacing):
// attacks need time to read; everything else keeps logDelayMs.
export function holdFor(fx) {
  const p = DATA.difficulty.combatPacing;
  if (fx?.kind === 'summon') return p.summonMs;
  if (!fx || fx.kind !== 'attack') return undefined;
  if (fx.from === 'player') return fx.heavy ? p.heavyAttackMs : p.playerAttackMs;
  return p.enemyAttackMs;
}

// Play one effect. ctx: { unit(i | 'player') -> { el, card, portrait }, layer, run() } (ui/battleRoom.js fxContext)
export function playFx(fx, ctx) {
  markActivity(fx.kind); // a stall's label in the device report (0.00225)
  switch (fx.kind) {
    case 'attack': return attack(fx, ctx);
    case 'hit': return hit(ctx.unit(fx.to), fx, 0, ctx);
    case 'enter': attachParticles(ctx.layer); return enter(ctx);
    case 'deal': return deal(ctx);
    case 'die': return spray(ctx.unit(fx.to), 1, 0, true);
    case 'dodge': return dodge(fx, ctx);
    case 'heal': return heal(fx, ctx);
    case 'revive': return revive(ctx);
    case 'overkill': return overkill(fx, ctx);
    case 'multi': shake(ctx, 1.1); return bgSway(1.2, 1);
    case 'summon': return summon(fx, ctx);
    case 'find': return findPop(fx, ctx); // a kept find rises as a card and flies into the LOOT row (0.00260)
    case 'potion': return potionPop(ctx); // a found potion: its card flies into the hero card's count (0.00263)
    default: return CLASS_FX[fx.kind]?.(fx, ctx); // the classes' events (0.00268; ui/classFx.js since 0.00283), else nothing
  }
}

const OVERKILL_STAGGER_MS = 70;

// The box around a set of rects, empty ones dropped (a fallen enemy's unit
// has left the row since 0.00216 and its detached card reads 0x0 — the
// banner and the flash used to be placed from those; 0.00223). null when
// nothing is left.
export function unionRect(rects) {
  const live = rects.filter((r) => r && r.width > 0 && r.height > 0);
  if (!live.length) return null;
  const left = Math.min(...live.map((r) => r.left)), top = Math.min(...live.map((r) => r.top));
  const right = Math.max(...live.map((r) => r.right ?? r.left + r.width)), bottom = Math.max(...live.map((r) => r.bottom ?? r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}
// The victims' cards, read once (the sprays take these rects too).
export const overkillRects = (fx, ctx) => (fx.victims ?? []).map((i) => ctx.unit(i)?.card?.getBoundingClientRect?.() ?? null);
export const overkillArea = (fx, ctx) => unionRect(overkillRects(fx, ctx));
// OVERKILL (0.106): one blow wipes the room — the mega-crit treatment across
// the whole enemy line: a huge number + caption, a hard shake, the widest
// sway, and a red-hot flash lighting the scene where they stood.
function overkill(fx, ctx) {
  shake(ctx, 2);
  bgSway(2, 1);
  const rects = overkillRects(fx, ctx);
  const area = unionRect(rects);
  if (!area) return;
  bgLight('overkill', area);
  floatBanner(ctx, area, `-${fx.dmg}`, 'fx-crit fx-mega fx-overkill', 'OVERKILL!');
  // every enemy the blow wiped bursts as a kill and takes the kick, rippling down the line (0.128, 0.183)
  // (0.00222: each spray takes the rect read above — a getBoundingClientRect in its own later task was a forced layout per victim)
  (fx.victims ?? []).forEach((i, n) => setTimeout(() => { spray(ctx.unit(i), 0, 0, true, rects[n]); kick(ctx.unit(i), DATA.cards.motion.overkillKick, 1); }, n * OVERKILL_STAGGER_MS));
}

function attack(fx, ctx) {
  const a = ctx.unit(fx.from);
  const d = ctx.unit(fx.to);
  // the defender's rects once, before any write (0.00223: each printed line forced ~5 layouts — reads interleaved with the animations' writes)
  const rd = d?.el?.getBoundingClientRect?.() ?? null, rc = d?.card?.getBoundingClientRect?.() ?? null;
  const dur = fx.heavy ? LUNGE_MS * 1.3 : LUNGE_MS;
  const strike = strikeMs(fx);
  const stop = fx.crit || fx.heavy ? HITSTOP_MS : 0;
  // Lunge a slice of the way toward the target (fxParts.js lunge): a heavy reaches further.
  const swing = can(d?.el) ? lunge(a, rd, { dur, reachShare: fx.heavy ? 0.5 : 0.35 }) : null;
  // Hit-stop: freeze the attacker at the moment of impact.
  if (swing && stop) setTimeout(() => { swing.pause(); setTimeout(() => swing.play(), stop); }, strike);
  hit(d, fx, strike, ctx, stop, rd, rc);
  // The player's big blows shake the fighters and kick the camera; crits
  // shove the whole background along the blow, left -> right (0.092).
  if (fx.from === 'player' && (fx.heavy || fx.crit)) {
    setTimeout(() => {
      if (fx.heavy) shake(ctx, 1);
      if (fx.crit) {
        bgSway((fx.heavy ? 1.4 : 1) * (fx.mega ? 1.5 : 1), 1);
        bgLight(fx.mega ? 'megacrit' : 'crit', d?.card?.getBoundingClientRect?.()); // the blow lights the scene (0.100)
      } else bgJolt(1);
    }, strike);
  }
  // A crushing hit on the hero swings it back, right -> left.
  const big = DATA.backgrounds.parallax.swayHitShare;
  if (fx.to === 'player' && fx.share >= big) setTimeout(() => bgSway((0.8 * fx.share) / big, -1), strike);
}

// The kick (0.183, the Card Lab's pick): the card turns around its axis
// away from the blow — at its full angle within the first 6% of the kick
// (about two frames) and recovering slowly, a small counter-swing on the
// way. composite: 'add' lays it over the card's own transform. The glint
// sweeps the figure with the turn.
function kick(u, power, away, delay = 0) {
  const M = DATA.cards.motion, G = DATA.cards.glint;
  if (can(u?.card) && !reduced()) {
    const deg = M.kickDeg * power, dir = -away; // a blow from the left pushes the left edge back
    u.card.animate([
      { transform: 'rotateY(0deg)', easing: 'cubic-bezier(0.1, 0.9, 0.3, 1)' },
      { transform: `rotateY(${dir * deg}deg)`, offset: 0.06, easing: 'cubic-bezier(0.45, 0.05, 0.35, 1)' },
      { transform: `rotateY(${-dir * deg * 0.12}deg)`, offset: 0.72, easing: 'ease-in-out' },
      { transform: 'rotateY(0deg)' },
    ], { duration: M.kickMs, delay, easing: 'linear', composite: 'add' });
  }
  glintSweep(u, G.hitMs, away, delay);
}

// Defender: knockback shake + flash + floating number, after `delay` ms
// (the lunge's strike moment); the knockback waits out any hit-stop.
// re / rc: the unit's and the card's rects when the caller read them
// (attack() does, before its writes); a card still being dealt may move
// between the print and the strike — accepted.
function hit(u, fx, delay, ctx, stop = 0, re = null, rc = null) {
  if (!u) return;
  const away = u === ctx.unit('player') ? -1 : 1; // knocked back, away from the attacker's side
  const M = DATA.cards.motion;
  re ??= u.el?.getBoundingClientRect?.() ?? null; rc ??= u.card?.getBoundingClientRect?.() ?? null;
  kick(u, fx.mega || fx.crit ? M.critKick : fx.heavy ? M.heavyKick : 1, away, delay + stop);
  if (can(u.el) && !reduced() && re) {
    const k = (fx.heavy ? 1.6 : 1) * re.width * 0.03;
    u.el.animate([
      { transform: 'translateX(0)' },
      { transform: `translateX(${away * k}px)` },
      { transform: `translateX(${-away * k * 0.45}px)` },
      { transform: `translateX(${away * k * 0.2}px)` },
      { transform: 'translateX(0)' },
    ], { duration: 240, delay: delay + stop, easing: 'ease-out', composite: 'add' });
  }
  if (can(u.portrait)) {
    const base = baseFilter(u);
    const pre = base === 'none' ? '' : base;
    u.portrait.animate([
      { filter: `${pre} brightness(2.6) saturate(0.2)` },
      { filter: `${pre} ${HIT_TINT}`, offset: 0.35 },
      { filter: base },
    ], { duration: 260, delay, easing: 'ease-out' });
  }
  if (fx.dmg > 0) setTimeout(() => spray(u, away, fx.heavy || fx.crit ? 1.5 : 1, false, rc), delay);
  if (fx.dmg > 0 && u !== ctx.unit('player')) setTimeout(() => classTrace(u, fx, rc, ctx), delay); // the class's own trace over the foe's burst (0.00268)
  if (fx.dmg > 0) barFlash(u, 'damage', delay);
  if (fx.dmg > 0) {
    const cls = fx.mega ? 'fx-crit fx-mega' : fx.crit ? 'fx-crit' : fx.thorns ? 'fx-thorns' : 'fx-dmg';
    floatNumber(ctx, u, `-${fx.dmg}`, cls, delay, fx.mega ? 'MEGA CRIT!' : fx.crit ? 'CRIT!' : null, rc); // 0.095: CRIT! caption
  }
  return rc;
}

// Enemy swings and misses: the lunge still happens, the hero side-steps.
function dodge(fx, ctx) {
  const a = ctx.unit(fx.from), p = ctx.unit('player');
  if (can(a?.el) && can(p?.el) && !reduced()) {
    const rp = p.el.getBoundingClientRect();
    lunge(a, rp, { overshoot: 1.15 }); // the swing overreaches: nothing stopped it
    p.el.animate([
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-rp.width * 0.08}px, ${-rp.height * 0.015}px)`, offset: 0.4 },
      { transform: 'translate(0, 0)' },
    ], { duration: 320, delay: LUNGE_MS * STRIKE_AT * 0.6, easing: 'ease-out', composite: 'add' });
  }
  floatNumber(ctx, p, 'MISS', 'fx-miss', LUNGE_MS * STRIKE_AT);
}

// Lifesteal: green number + a soft green glow on the hero. A potion is
// an EVENT (0.089): a green aura swells out behind the hero, a longer
// glow, rising sparkles, and the HP bar flares green as it fills.
function heal(fx, ctx) {
  const p = ctx.unit(fx.to);
  if (fx.amount > 0) floatNumber(ctx, p, `+${fx.amount}`, fx.potion ? 'fx-heal fx-potion' : 'fx-heal');
  barFlash(p, 'heal', 0, fx.potion ? 1300 : 700);
  if (fx.drain) classSpray(p, 'grave'); // Soul Drain (0.00268): the wisps flew with the blow; the heal line is their arrival
  if (!fx.potion) { glow(p, 'sepia(1) saturate(4) hue-rotate(60deg) brightness(1.35)', 420); return; }
  glow(p, 'sepia(1) saturate(5) hue-rotate(65deg) brightness(1.6)', 1100);
  bgLight('potion', p?.card?.getBoundingClientRect?.()); // green light in the scene (0.100)
  if (!can(p?.card)) return;
  const aura = document.createElement('div');
  aura.className = 'heal-aura';
  p.card.append(aura);
  aura.animate([
    { opacity: 0, scale: '0.75' },
    { opacity: 1, scale: '1.05', offset: 0.3 },
    { opacity: 0, scale: '1.25' },
  ], { duration: 1300, easing: 'ease-out' }).finished.then(() => aura.remove(), () => aura.remove());
  const r = p.card.getBoundingClientRect();
  burst('heal', r.left + r.width / 2, r.top + r.height * 0.5, { size: r.height });
}

// Boss summon (0.092): the boss flares violet and the new card rises in
// front of it out of a burst of grave dust.
function summon(fx, ctx) {
  const boss = ctx.unit(fx.from), s = ctx.unit(fx.to);
  glow(boss, 'sepia(1) saturate(4) hue-rotate(225deg) brightness(1.5)', 800);
  shake(ctx, 0.5);
  bgJolt(0.6);
  if (can(s?.el) && !reduced()) {
    s.el.animate([
      { opacity: 0, transform: 'translateY(10%) scale(0.94)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], { duration: 560, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
  }
  if (s?.card?.getBoundingClientRect) {
    const r = s.card.getBoundingClientRect();
    burst(materialOf(s.id), r.left + r.width / 2, r.top + r.height * 0.75, { size: r.height, big: true, floor: r.bottom - 4 });
  }
}

// The Heart of the Dying Moon: a golden flare and a shake.
function revive(ctx) {
  const p = ctx.unit('player');
  glow(p, 'sepia(1) saturate(5) hue-rotate(5deg) brightness(1.9)', 900);
  floatNumber(ctx, p, 'REVIVED', 'fx-revive');
  shake(ctx, 0.8);
  bgJolt(1);
  bgLight('revive', p?.card?.getBoundingClientRect?.()); // golden light in the scene (0.100)
}

// The room's units, player first: [unit, side (the way it comes in), index].
function lineUp(ctx) {
  const units = [];
  for (let i = 0; ctx.unit(i); i++) units.push([ctx.unit(i), 1, i]);
  units.unshift([ctx.unit('player'), -1, 0]);
  return units;
}

// Room built (0.184): the units wait unseen until the windows are back and
// the deal comes — a room is rendered while the windows are fully faded
// out, so an entrance played here was never seen (0.154-0.183).
function enter(ctx) {
  if (reduced()) return;
  for (const [u] of lineUp(ctx)) if (can(u?.el)) u.el.style.opacity = '0';
}

// The deal (0.183: dealt, the Card Lab's pick; 0.184: once the windows are
// back): the cards come in from above and the side, turned and tilted like
// cards dealt to a table, the enemies from the right, staggered, the
// player from the left; the glint crosses each as it turns.
function deal(ctx) {
  if (reduced()) { for (const [u] of lineUp(ctx)) if (can(u?.el)) u.el.style.opacity = ''; return; } // motion may have been reduced since enter() hid them (0.00223)
  const M = DATA.cards.motion, G = DATA.cards.glint;
  for (const [u, side, i] of lineUp(ctx)) {
    if (!can(u?.el)) continue;
    const delay = M.enterDelayMs + i * M.enterStaggerMs;
    const show = () => { u.el.style.opacity = ''; };
    u.el.animate([
      { opacity: 0, transform: `translate(${side * 100}px, -50px) rotateY(${-side * 62}deg) rotateZ(${side * 9}deg) scale(0.92)` },
      { opacity: 1, transform: 'translate(0, 0) rotateY(0deg) rotateZ(0deg) scale(1)' },
    ], { duration: M.enterMs, delay, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' }).finished.then(show, show);
    setTimeout(show, delay); // the card is the animation's from here (an animation that never finishes must not hide it for good)
    glintSweep(u, G.enterMs, side, delay + 120);
  }
}

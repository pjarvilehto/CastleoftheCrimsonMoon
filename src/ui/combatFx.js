// ui/combatFx.js — combat animation layer (0.086+). The playback queue
// hands every printed line's `fx` descriptor to playFx(), so animations
// land on the same beat as the log line and its sound.
//
// Descriptor shape: { kind, from?, to?, dmg?, crit?, heavy?, amount? }
//   from / to: an enemy index, or 'player'
//   kinds: attack, hit, dodge, heal, smash, multi, revive, die, enter
//
// Two animation systems, on purpose: idle loops are CSS animations on the
// portrait's independent translate/rotate/scale (styles.css .idle-*); every
// one-shot here is a Web Animation, which layers on top WITHOUT restarting
// the CSS loop. Lunges/knockbacks move the whole .unit (card + buttons);
// flashes act on the portrait. Death collapse lives in battleLine.js (the
// card owns its dead state). Browsers without element.animate (the smoke
// test shim, very old TVs) simply get no one-shots.

import { DATA } from '../shared/data.js';

// Combat event (run/combat.js) -> effect descriptor, or null.
export function fxFor(ev) {
  switch (ev.type) {
    case 'atk': return { kind: 'attack', from: 'player', to: ev.target, dmg: ev.dmg, crit: !!ev.crit, heavy: !!ev.heavy };
    case 'spill': return { kind: 'hit', to: ev.target, dmg: ev.dmg };
    case 'thorns': return { kind: 'hit', to: ev.target, dmg: ev.dmg, thorns: true };
    case 'dmg': return { kind: 'attack', from: ev.source, to: 'player', dmg: ev.taken };
    case 'dodge': return { kind: 'dodge', from: ev.source, to: 'player' };
    case 'heal': return { kind: 'heal', to: 'player', amount: ev.healed };
    case 'smash': return { kind: 'smash', dmg: ev.dmg };
    case 'multi': return { kind: 'multi' };
    case 'revive': return { kind: 'revive', to: 'player' };
    default: return null;
  }
}

// How long the log waits after a line with this effect (0.087 pacing):
// attacks need time to read; everything else keeps logDelayMs.
export function holdFor(fx) {
  const p = DATA.difficulty.combatPacing ?? {};
  if (!fx || fx.kind !== 'attack') return undefined;
  if (fx.from === 'player') return fx.heavy ? (p.heavyAttackMs ?? 380) : (p.playerAttackMs ?? 300);
  return p.enemyAttackMs ?? 220;
}

const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const can = (node) => !!node?.animate;
const LUNGE_MS = 280;
const STRIKE_AT = 0.45; // share of the lunge where the blow lands

// Play one effect. ctx: { unit(i | 'player') -> { el, card, portrait }, layer }
export function playFx(fx, ctx) {
  switch (fx.kind) {
    case 'attack': return attack(fx, ctx);
    case 'hit': return hit(ctx.unit(fx.to), fx, 0, ctx);
    case 'enter': return enter(ctx);
    default: return undefined; // dodge/heal/smash/multi/revive: 0.088
  }
}

function attack(fx, ctx) {
  const a = ctx.unit(fx.from);
  const d = ctx.unit(fx.to);
  const dur = fx.heavy ? LUNGE_MS * 1.3 : LUNGE_MS;
  if (can(a?.el) && can(d?.el) && !reduced()) {
    // Lunge a slice of the way toward the target: anticipation (pull
    // back) -> strike -> recover.
    const ra = a.el.getBoundingClientRect(), rd = d.el.getBoundingClientRect();
    const toward = (rd.left + rd.width / 2) - (ra.left + ra.width / 2);
    const reach = Math.sign(toward) * Math.min(Math.abs(toward) * 0.14, ra.width * (fx.heavy ? 0.5 : 0.35));
    a.el.animate([
      { transform: 'translateX(0)' },
      { transform: `translateX(${-reach * 0.18}px)`, offset: 0.25, easing: 'ease-in' },
      { transform: `translateX(${reach}px)`, offset: STRIKE_AT, easing: 'ease-out' },
      { transform: 'translateX(0)' },
    ], { duration: dur, easing: 'ease-in-out' });
  }
  hit(d, fx, dur * STRIKE_AT, ctx);
}

// Defender: knockback shake + flash + floating number, after `delay` ms
// (the lunge's strike moment).
function hit(u, fx, delay, ctx) {
  if (!u) return;
  const away = u === ctx.unit('player') ? -1 : 1; // knocked back, away from the attacker's side
  if (can(u.el) && !reduced()) {
    const k = (fx.heavy ? 1.6 : 1) * u.el.getBoundingClientRect().width * 0.03;
    u.el.animate([
      { transform: 'translateX(0)' },
      { transform: `translateX(${away * k}px)` },
      { transform: `translateX(${-away * k * 0.45}px)` },
      { transform: `translateX(${away * k * 0.2}px)` },
      { transform: 'translateX(0)' },
    ], { duration: 240, delay, easing: 'ease-out' });
  }
  if (can(u.portrait)) {
    const base = getComputedStyle(u.portrait).filter;
    const pre = base === 'none' ? '' : base;
    u.portrait.animate([
      { filter: `${pre} brightness(2.6) saturate(0.2)` },
      { filter: `${pre} sepia(1) saturate(5) hue-rotate(-35deg) brightness(1.15)`, offset: 0.35 },
      { filter: base },
    ], { duration: 260, delay, easing: 'ease-out' });
  }
  if (fx.dmg > 0) floatNumber(ctx, u, `-${fx.dmg}`, 'fx-dmg', delay);
}

// A number that pops out of the card and drifts up. Lives in the fx layer
// (not the card), positioned from the card's on-screen box.
export function floatNumber(ctx, u, text, cls, delay = 0) {
  if (!ctx.layer || !can(u?.card)) return;
  const r = u.card.getBoundingClientRect();
  const n = document.createElement('div');
  n.className = `fx-num ${cls}`;
  n.textContent = text;
  n.style.left = `${r.left + r.width / 2 + (Math.random() - 0.5) * r.width * 0.3}px`;
  n.style.top = `${r.top + r.height * 0.3}px`;
  n.style.fontSize = `${Math.max(16, r.height * 0.09)}px`;
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

// Room entrance: enemies slide in from the right, staggered; the player
// from the left. Starts while the windows are still fading in.
function enter(ctx) {
  if (reduced()) return;
  const units = [];
  for (let i = 0; ctx.unit(i); i++) units.push([ctx.unit(i), 1, i]);
  units.unshift([ctx.unit('player'), -1, 0]);
  for (const [u, side, i] of units) {
    if (!can(u?.el)) continue;
    u.el.animate([
      { opacity: 0, transform: `translateX(${side * 60}px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 520, delay: 250 + i * 90, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' });
  }
}

// ui/combatFx.js — combat animation layer (0.086+). The playback queue
// hands every printed line's `fx` descriptor to playFx(), so animations
// land on the same beat as the log line and its sound.
//
// Descriptor shape: { kind, from?, to?, dmg?, crit?, heavy?, amount?, share? }
//   share: a hit on the knight / his max HP (sizes the big-hit sway)
//   from / to: an enemy index, or 'player'
//   kinds: attack, hit, dodge, heal, smash, multi, revive, die, enter, summon
//
// Two animation systems, on purpose: idle loops are CSS animations on the
// portrait's independent translate/rotate/scale (styles.css .idle-*); every
// one-shot here is a Web Animation, which layers on top WITHOUT restarting
// the CSS loop. Lunges/knockbacks move the whole .unit (card + buttons);
// flashes act on the portrait. Death collapse lives in battleLine.js (the
// card owns its dead state). Browsers without element.animate (the smoke
// test shim, very old TVs) simply get no one-shots.

import { DATA } from '../shared/data.js';
import { bgJolt, bgSway } from '../core/bg3d.js';
import { attachParticles, burst, materialOf } from './particles.js';

// Combat event (run/combat.js) -> effect descriptor, or null.
// who: { maxHp } of the knight — sizes hits on him (big-hit sway).
export function fxFor(ev, who = {}) {
  switch (ev.type) {
    case 'atk': return { kind: 'attack', from: 'player', to: ev.target, dmg: ev.dmg, crit: !!ev.crit, heavy: !!ev.heavy };
    case 'spill': return { kind: 'hit', to: ev.target, dmg: ev.dmg };
    case 'thorns': return { kind: 'hit', to: ev.target, dmg: ev.dmg, thorns: true };
    case 'dmg': return { kind: 'attack', from: ev.source, to: 'player', dmg: ev.taken, share: who.maxHp ? ev.taken / who.maxHp : 0 };
    case 'dodge': return { kind: 'dodge', from: ev.source, to: 'player' };
    case 'heal': return { kind: 'heal', to: 'player', amount: ev.healed };
    case 'smash': return { kind: 'smash', dmg: ev.dmg };
    case 'multi': return { kind: 'multi' };
    case 'revive': return { kind: 'revive', to: 'player' };
    case 'summon': return { kind: 'summon', from: ev.source, to: ev.target };
    default: return null;
  }
}

// How long the log waits after a line with this effect (0.087 pacing):
// attacks need time to read; everything else keeps logDelayMs.
export function holdFor(fx) {
  const p = DATA.difficulty.combatPacing ?? {};
  if (fx?.kind === 'summon') return p.summonMs ?? 650;
  if (!fx || fx.kind !== 'attack') return undefined;
  if (fx.from === 'player') return fx.heavy ? (p.heavyAttackMs ?? 380) : (p.playerAttackMs ?? 300);
  return p.enemyAttackMs ?? 220;
}

const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const can = (node) => !!node?.animate;
const LUNGE_MS = 280;
const STRIKE_AT = 0.45; // share of the lunge where the blow lands
const HITSTOP_MS = 70;  // crits and heavies freeze for a beat at impact (0.088)

// Play one effect. ctx: { unit(i | 'player') -> { el, card, portrait }, layer }
export function playFx(fx, ctx) {
  switch (fx.kind) {
    case 'attack': return attack(fx, ctx);
    case 'hit': return hit(ctx.unit(fx.to), fx, 0, ctx);
    case 'enter': attachParticles(ctx.layer); return enter(ctx);
    case 'die': return spray(ctx.unit(fx.to), 1, 0, true);
    case 'dodge': return dodge(fx, ctx);
    case 'heal': return heal(fx, ctx);
    case 'revive': return revive(ctx);
    case 'smash': shake(ctx, 1.6); return bgSway(1.5, 1);
    case 'multi': shake(ctx, 1.1); return bgSway(1.2, 1);
    case 'summon': return summon(fx, ctx);
    default: return undefined;
  }
}

function attack(fx, ctx) {
  const a = ctx.unit(fx.from);
  const d = ctx.unit(fx.to);
  const dur = fx.heavy ? LUNGE_MS * 1.3 : LUNGE_MS;
  const strike = dur * STRIKE_AT;
  const stop = fx.crit || fx.heavy ? HITSTOP_MS : 0;
  if (can(a?.el) && can(d?.el) && !reduced()) {
    // Lunge a slice of the way toward the target: anticipation (pull
    // back) -> strike -> recover.
    const ra = a.el.getBoundingClientRect(), rd = d.el.getBoundingClientRect();
    const toward = (rd.left + rd.width / 2) - (ra.left + ra.width / 2);
    const reach = Math.sign(toward) * Math.min(Math.abs(toward) * 0.14, ra.width * (fx.heavy ? 0.5 : 0.35));
    const lunge = a.el.animate([
      { transform: 'translateX(0)' },
      { transform: `translateX(${-reach * 0.18}px)`, offset: 0.25, easing: 'ease-in' },
      { transform: `translateX(${reach}px)`, offset: STRIKE_AT, easing: 'ease-out' },
      { transform: 'translateX(0)' },
    ], { duration: dur, easing: 'ease-in-out' });
    // Hit-stop: freeze the attacker at the moment of impact.
    if (stop) setTimeout(() => { lunge.pause(); setTimeout(() => lunge.play(), stop); }, strike);
  }
  hit(d, fx, strike, ctx, stop);
  // The player's big blows shake the fighters and kick the camera; crits
  // shove the whole background along the blow, left -> right (0.092).
  if (fx.from === 'player' && (fx.heavy || fx.crit)) {
    setTimeout(() => {
      if (fx.heavy) shake(ctx, 1);
      if (fx.crit) bgSway(fx.heavy ? 1.4 : 1, 1);
      else bgJolt(1);
    }, strike);
  }
  // A crushing hit on the knight swings it back, right -> left.
  const big = DATA.backgrounds?.parallax?.swayHitShare ?? 0.15;
  if (fx.to === 'player' && fx.share >= big) setTimeout(() => bgSway((0.8 * fx.share) / big, -1), strike);
}

// Defender: knockback shake + flash + floating number, after `delay` ms
// (the lunge's strike moment); the knockback waits out any hit-stop.
function hit(u, fx, delay, ctx, stop = 0) {
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
    ], { duration: 240, delay: delay + stop, easing: 'ease-out' });
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
  if (fx.dmg > 0) setTimeout(() => spray(u, away, fx.heavy || fx.crit ? 1.5 : 1), delay);
  if (fx.dmg > 0) barFlash(u, 'damage', delay);
  if (fx.dmg > 0) {
    const cls = fx.crit ? 'fx-crit' : fx.thorns ? 'fx-thorns' : 'fx-dmg';
    floatNumber(ctx, u, `-${fx.dmg}`, cls, delay, fx.crit ? 'CRIT!' : null); // 0.095: CRIT! caption
  }
}

// Particles out of a struck (or dying) unit, by what it's made of.
function spray(u, dir, power = 1, big = false) {
  if (!u?.card?.getBoundingClientRect) return;
  const r = u.card.getBoundingClientRect();
  // a random point on the figure each burst (0.090) — not always dead centre
  const burstOnce = () => burst(materialOf(u.id),
    r.left + r.width * (0.5 + (Math.random() - 0.5) * 0.5),
    r.top + r.height * (0.3 + Math.random() * 0.3),
    { dir: big ? 0 : dir, size: r.height, big });
  burstOnce();
  if (power > 1.2) burstOnce(); // heavy / crit: a second, overlapping burst
}

// The whole battle line trembles (heavy blows, SMASH, multi-kills).
function shake(ctx, power) {
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

// Enemy swings and misses: the lunge still happens, the knight side-steps.
function dodge(fx, ctx) {
  const a = ctx.unit(fx.from), p = ctx.unit('player');
  if (can(a?.el) && can(p?.el) && !reduced()) {
    const ra = a.el.getBoundingClientRect(), rp = p.el.getBoundingClientRect();
    const reach = -Math.min(Math.abs((ra.left + ra.width / 2) - (rp.left + rp.width / 2)) * 0.14, ra.width * 0.35);
    a.el.animate([
      { transform: 'translateX(0)' },
      { transform: `translateX(${-reach * 0.18}px)`, offset: 0.25 },
      { transform: `translateX(${reach * 1.15}px)`, offset: STRIKE_AT },
      { transform: 'translateX(0)' },
    ], { duration: LUNGE_MS, easing: 'ease-in-out' });
    p.el.animate([
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-rp.width * 0.08}px, ${-rp.height * 0.015}px)`, offset: 0.4 },
      { transform: 'translate(0, 0)' },
    ], { duration: 320, delay: LUNGE_MS * STRIKE_AT * 0.6, easing: 'ease-out' });
  }
  floatNumber(ctx, p, 'MISS', 'fx-miss', LUNGE_MS * STRIKE_AT);
}

// Lifesteal: green number + a soft green glow on the knight. A potion is
// an EVENT (0.089): a green aura swells out behind the knight, a longer
// glow, rising sparkles, and the HP bar flares green as it fills.
function heal(fx, ctx) {
  const p = ctx.unit(fx.to);
  if (fx.amount > 0) floatNumber(ctx, p, `+${fx.amount}`, fx.potion ? 'fx-heal fx-potion' : 'fx-heal');
  barFlash(p, 'heal', 0, fx.potion ? 1300 : 700);
  if (!fx.potion) { glow(p, 'sepia(1) saturate(4) hue-rotate(60deg) brightness(1.35)', 420); return; }
  glow(p, 'sepia(1) saturate(5) hue-rotate(65deg) brightness(1.6)', 1100);
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
    burst(materialOf(s.id), r.left + r.width / 2, r.top + r.height * 0.75, { size: r.height, big: true });
  }
}

// The Heart of the Dying Moon: a golden flare and a shake.
function revive(ctx) {
  const p = ctx.unit('player');
  glow(p, 'sepia(1) saturate(5) hue-rotate(5deg) brightness(1.9)', 900);
  floatNumber(ctx, p, 'REVIVED', 'fx-revive');
  shake(ctx, 0.8);
  bgJolt(1);
}

// HP bar feedback (0.089): flares bright green on a heal, flashes toward
// red when damage lands. The glow is on the bar, the colour shift on its
// fill (a gradient, so it's shifted with a filter).
function barFlash(u, kind, delay = 0, ms = 450) {
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

function glow(u, tint, ms) {
  if (!can(u?.portrait)) return;
  const base = getComputedStyle(u.portrait).filter;
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

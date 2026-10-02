// labs/cards/lab.js — the Card Lab (0.174). The game's real card units on a
// stage with three experiments on top, each with options: a shader
// background behind the portrait (cardFx.js), the cards in 3D (hit kicks,
// turning entrances, a mouse tilt) and a glint on the bitmap that sweeps
// as the card turns. Nothing here touches the game: the lab reads the
// profile for the knight's card and keeps its picks under its own key.

import { loadData, DATA } from '../../src/shared/data.js';
import { createEnemyUnit, createPlayerUnit, IDLE_FAMILY } from '../../src/ui/battleLine.js';
import { createRun } from '../../src/run/runState.js';
import { scaleEnemy } from '../../src/shared/balance.js';
import { MATERIAL } from '../../src/ui/particleLooks.js';
import { attachCardFx, LOOKS, TINTS } from './cardFx.js';

const KEY = 'castle-card-lab';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.filter((k) => k != null && k !== false)); return n; };

await loadData();

// ---- the options ----
const DEFAULTS = {
  bg: { mode: 'auto', look: 'fog', amt: 0.8, speed: 1, player: 'ether' },
  motion: { on: true, enter: 'turn', hit: 'tilt', deg: 10, ms: 480, hover: true },
  glint: { style: 'streak', strength: 0.8, band: 8, withHit: true, withEnter: true },
};
let O = JSON.parse(JSON.stringify(DEFAULTS));
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.bg) O = { bg: { ...O.bg, ...s.bg }, motion: { ...O.motion, ...s.motion }, glint: { ...O.glint, ...s.glint } }; } catch { /* fresh */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(O)); } catch { /* private mode */ } };

// the material -> look map (the particles' materials: flesh = blood)
const lookFor = (e) => (e.boss ? 'flames' : { embers: 'flames', wisps: 'ether', dust: 'fog' }[MATERIAL[e.id]] ?? 'blood');
const tintFor = (e, look) => (e.boss ? [0.9, 0.25, 0.15] : TINTS[look] ?? TINTS.fog);

// ---- the stage: the knight and four enemies of different materials ----
const run = createRun();
const ENEMIES = ['skeleton', 'ghoul', 'wraith', 'vampire_lord'].map((id) => ({ ...scaleEnemy(id, 9), hp: 0 }));
for (const e of ENEMIES) e.hp = e.maxHp;
const line = el('div', { class: 'battle-line p3d', style: `--n:${ENEMIES.length}` });
const player = createPlayerUnit(run, { onHeavy: () => hit(player, 1.6, true), onPotion: () => {} });
const units = ENEMIES.map((e, i) => createEnemyUnit(e, i, { onAttack: () => hit(unitsAt(i), 1), onGone: () => {} }));
const unitsAt = (i) => units[i];
const row = el('div', { class: 'enemy-row' }, ...units.map((u) => u.el));
line.append(player.el, row);
$('stage').append(line);
const all = [player, ...units];
for (const u of all) { u.enemy = u === player ? null : ENEMIES[units.indexOf(u)]; u.card.style.position = 'relative'; }
function refresh() {
  player.update({ hp: run.hp, printing: false, heavyReady: true, heavyCd: 0, dead: false });
  units.forEach((u, i) => u.update({ hp: ENEMIES[i].hp, dead: ENEMIES[i].hp <= 0, printing: false, combatOver: false }));
}
refresh();

// ---- the shader backgrounds ----
for (const u of all) {
  u.fx = attachCardFx(u.card);
  // the glint copy of the portrait (opacity 0 until a sweep)
  const g = u.portrait.cloneNode(false);
  g.classList.add('glint'); g.alt = ''; g.removeAttribute('draggable'); g.setAttribute('draggable', 'false');
  u.portrait.after(g); u.glint = g;
}
function applyBg() {
  for (const u of all) {
    const e = u.enemy;
    const look = O.bg.mode === 'off' ? 'none' : u === player ? O.bg.player : O.bg.mode === 'auto' ? lookFor(e) : O.bg.look;
    const tint = u === player ? (O.bg.player === 'ether' ? [0.5, 0.55, 1.0] : TINTS.gold) : O.bg.mode === 'auto' ? tintFor(e, look) : (TINTS[look] ?? TINTS.fog);
    u.fx.set({ look, tint, amt: O.bg.amt, speed: O.bg.speed });
  }
}

// ---- the 3D motion ----
const can = (n) => !!n?.animate;
function applyMotion() {
  line.classList.toggle('p3d', O.motion.on);
  for (const u of all) u.glint.className = `portrait glint ${O.glint.style === 'foil' ? 'foil' : O.glint.style === 'sheen' ? 'sheen' : ''} idle-${u === player ? 'player' : IDLE_FAMILY[u.enemy.id] ?? 'prowl'}`.trim();
  for (const u of all) { u.glint.style.animationDelay = u.portrait.style.animationDelay; u.glint.style.setProperty('--band', `${O.glint.band}%`); }
}
// A sweep of the glint over `ms`, the band crossing the portrait with the turn.
function sweep(u, ms, dir = 1) {
  if (O.glint.style === 'none' || !can(u.glint)) return;
  const g = u.glint, from = dir > 0 ? '-100%' : '200%', to = dir > 0 ? '200%' : '-100%';
  const frames = [{ opacity: 0, '--glint-x': from, maskPosition: `${from} 0`, WebkitMaskPosition: `${from} 0` },
    { opacity: O.glint.strength, offset: 0.4, maskPosition: '50% 0', WebkitMaskPosition: '50% 0' },
    { opacity: 0, maskPosition: `${to} 0`, WebkitMaskPosition: `${to} 0` }];
  if (O.glint.style === 'foil') { frames[0]['--hue'] = '0deg'; frames[2]['--hue'] = '360deg'; }
  g.animate(frames, { duration: ms, easing: 'ease-out' });
}
// A blow: the card kicks around its axis (rotateY away from the blow, a
// touch of rotateX) and springs back; the glint sweeps with it.
function hit(u, power = 1, fromRight = false) {
  if (!u) return;
  const dir = fromRight ? 1 : -1, deg = O.motion.deg * power;
  if (O.motion.on && O.motion.hit !== 'none' && can(u.card)) {
    const tilt = O.motion.hit === 'tilt' ? deg * 0.35 : 0;
    const kf = O.motion.hit === 'wobble'
      ? [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${dir * deg}deg) rotateX(${tilt}deg)`, offset: 0.18 }, { transform: `rotateY(${-dir * deg * 0.6}deg)`, offset: 0.45 },
        { transform: `rotateY(${dir * deg * 0.3}deg)`, offset: 0.7 }, { transform: `rotateY(${-dir * deg * 0.12}deg)`, offset: 0.86 }, { transform: 'rotateY(0deg)' }]
      : [{ transform: 'rotateY(0deg) rotateX(0deg)' }, { transform: `rotateY(${dir * deg}deg) rotateX(${tilt}deg)`, offset: 0.22, easing: 'ease-out' },
        { transform: `rotateY(${-dir * deg * 0.3}deg) rotateX(${-tilt * 0.4}deg)`, offset: 0.6 }, { transform: 'rotateY(0deg) rotateX(0deg)' }];
    u.card.animate(kf, { duration: O.motion.ms * (O.motion.hit === 'wobble' ? 1.8 : 1), easing: 'ease-in-out', composite: 'add' });
  }
  // the knockback the game plays on the whole unit (combatFx.js hit): kept, so the kick reads on top of it
  if (can(u.el)) { const k = u.el.getBoundingClientRect().width * 0.03 * power * (fromRight ? -1 : 1); u.el.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${k}px)` }, { transform: `translateX(${-k * 0.45}px)` }, { transform: 'translateX(0)' }], { duration: 240, easing: 'ease-out' }); }
  if (O.glint.withHit) sweep(u, Math.max(500, O.motion.ms * 1.1), -dir);
  flash(u);
}
function flash(u) {
  if (!can(u.portrait)) return;
  const base = getComputedStyle(u.portrait).filter, pre = base === 'none' ? '' : base;
  u.portrait.animate([{ filter: `${pre} brightness(2.4) saturate(0.3)` }, { filter: `${pre} sepia(1) saturate(5) hue-rotate(-35deg) brightness(1.15)`, offset: 0.35 }, { filter: base }], { duration: 260, easing: 'ease-out' });
}
// The entrance: slide in, and with 'turn' / 'deal' a rotation on the way.
function enter() {
  all.forEach((u, i) => {
    if (!can(u.el)) return;
    const side = u === player ? -1 : 1, delay = 150 + i * 110;
    const from = !O.motion.on || O.motion.enter === 'slide' ? `translateX(${side * 60}px)`
      : O.motion.enter === 'turn' ? `translateX(${side * 70}px) rotateY(${-side * 28}deg)`
      : `translate(${side * 100}px, -50px) rotateY(${-side * 62}deg) rotateZ(${side * 9}deg) scale(0.92)`;
    u.el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'translateX(0) rotateY(0deg)' }], { duration: O.motion.enter === 'deal' ? 720 : 560, delay, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' });
    if (O.glint.withEnter && O.motion.enter !== 'slide') setTimeout(() => sweep(u, 650, side), delay + 120);
  });
}
// The mouse: the card under it tilts toward the pointer (a card in the hand).
let hovered = null;
function hover(e) {
  if (!O.motion.on || !O.motion.hover) return;
  const u = all.find((x) => x.card.contains(e.target));
  if (hovered && hovered !== u) { hovered.card.style.transform = ''; hovered = null; }
  if (!u) return;
  const r = u.card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
  u.card.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 10}deg)`;
  u.card.style.transition = 'transform 120ms ease-out';
  hovered = u;
}
addEventListener('pointermove', hover);
addEventListener('pointerleave', () => { if (hovered) { hovered.card.style.transform = ''; hovered = null; } });

// ---- actions ----
const living = () => units.filter((u) => u.enemy.hp > 0);
function hitRandom(power = 1) { const l = living(); if (!l.length) return; hit(l[Math.floor(Math.random() * l.length)], power); }
function kill() {
  const l = living(); if (!l.length) return revive();
  const u = l[l.length - 1]; u.enemy.hp = 0; hit(u, 1.4); refresh();
}
function revive() { for (const e of ENEMIES) e.hp = e.maxHp; refresh(); }
let loop = null;
function toggleLoop() {
  if (loop) { clearInterval(loop); loop = null; status('Loop off.'); return; }
  loop = setInterval(() => { const r = Math.random(); if (r < 0.6) hitRandom(1); else if (r < 0.85) hitRandom(1.6); else hit(player, 1, true); }, 1300);
  status('Loop: hits every 1.3 s (L stops it).');
}

// ---- the panel ----
const panel = $('panel');
const st = el('div', { id: 'status' });
const status = (t) => { st.textContent = t; };
const syncs = [];
function slider(obj, key, label, min, max, step, note, after = () => {}) {
  const input = el('input', { type: 'range', min, max, step, title: note ?? label }), val = el('span', { class: 'v' });
  const show = () => { input.value = obj[key]; val.textContent = Number(obj[key]).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0); };
  input.oninput = () => { obj[key] = Number(input.value); show(); after(); save(); };
  syncs.push(show); show();
  return el('label', { class: 's', title: note ?? label }, el('span', {}, label), input, val);
}
function choice(obj, key, label, options, after = () => {}) {
  const sel = el('select', {}, ...options.map(([v, t]) => el('option', { value: v }, t)));
  const show = () => { sel.value = obj[key]; };
  sel.onchange = () => { obj[key] = sel.value; after(); save(); };
  syncs.push(show); show();
  return el('label', { class: 'c' }, el('span', {}, label), sel);
}
function check(obj, key, label, after = () => {}) {
  const c = el('input', { type: 'checkbox' });
  const show = () => { c.checked = !!obj[key]; };
  c.onchange = () => { obj[key] = c.checked; after(); save(); };
  syncs.push(show); show();
  return el('label', { class: 'c' }, el('span', {}, label), c);
}
const group = (title, small, open, ...kids) => { const d = el('details'); d.open = open; d.append(el('summary', {}, title, small ? el('small', {}, small) : null), ...kids); return d; };
const note = (t) => el('p', { class: 'note' }, t);
const button = (t, f, cls = '') => el('button', { class: cls, onclick: f }, t);
const rowOf = (...k) => el('div', { class: 'row' }, ...k);
const applyAll = () => { applyBg(); applyMotion(); };
const code = el('textarea', { rows: 7, readonly: '' });
panel.append(
  rowOf(button('Enter', enter), button('Hit', () => hitRandom(1), 'fire'), button('Crit', () => hitRandom(1.7), 'fire'), button('Knight hit', () => hit(player, 1, true), 'fire'), button('Kill', kill), button('Revive', revive), button('Loop', toggleLoop)),
  group('Background', 'a shader behind the portrait', true,
    choice(O.bg, 'mode', 'Enemies', [['auto', 'By material (flesh blood · bone fog · ember flames · wraith ether · boss flames)'], ['fixed', 'One look for all'], ['off', 'Off']], applyBg),
    choice(O.bg, 'look', 'Fixed look', LOOKS.filter((l) => l !== 'none').map((l) => [l, l]), applyBg),
    choice(O.bg, 'player', 'The knight', [['ether', 'ether (blue)'], ['fog', 'fog (gold)'], ['none', 'none']], applyBg),
    slider(O.bg, 'amt', 'Intensity', 0, 2, 0.05, 'how much light it adds', applyBg),
    slider(O.bg, 'speed', 'Speed', 0, 4, 0.1, 'how fast it moves', applyBg),
    note('Drawn at a third of the card\'s pixels, 30 fps, as added light over the frame\'s dark window (the frame art stays). In the game: one shared canvas for every card, not one each.')),
  group('Card motion', 'the cards in 3D', true,
    check(O.motion, 'on', '3D on', applyMotion),
    choice(O.motion, 'enter', 'Entrance', [['slide', 'slide (today)'], ['turn', 'slide with a turn'], ['deal', 'dealt: from above, turning']], applyMotion),
    choice(O.motion, 'hit', 'On a hit', [['none', 'nothing (today)'], ['kick', 'kick around its axis'], ['tilt', 'kick + tilt'], ['wobble', 'kick + wobble out']], applyMotion),
    slider(O.motion, 'deg', 'Kick degrees', 0, 30, 1, 'a crit kicks 1.7x, a kill 1.4x', applyMotion),
    slider(O.motion, 'ms', 'Kick ms', 150, 1200, 10, 'the spring back', applyMotion),
    check(O.motion, 'hover', 'Tilt under the mouse', applyMotion),
    note('Web Animations on the card (the game\'s knockback stays on the unit beneath); perspective on the battle line.')),
  group('Glint', 'light on the bitmap as it turns', true,
    choice(O.glint, 'style', 'Style', [['none', 'none'], ['streak', 'streak: a thin bright band'], ['sheen', 'sheen: a broad soft band'], ['foil', 'foil: a rainbow band (relics, bosses?)']], applyMotion),
    slider(O.glint, 'strength', 'Strength', 0, 1, 0.05, 'the band\'s peak opacity', applyMotion),
    slider(O.glint, 'band', 'Band width %', 2, 40, 1, 'half-width of the band', applyMotion),
    check(O.glint, 'withHit', 'Sweep on a hit', applyMotion), check(O.glint, 'withEnter', 'Sweep on the entrance', applyMotion),
    note('A second copy of the portrait, bright and masked to a band that crosses it (the portrait\'s own alpha clips it): no WebGL, costs one image layer per card.')),
  group('Copy', 'the picks, for the game', true, rowOf(button('Copy JSON', copy), button('Reset', () => { O = JSON.parse(JSON.stringify(DEFAULTS)); syncs.forEach((f) => f()); applyAll(); save(); })), code, st),
  group('Notes', 'what each does and what it would cost', true, ideas()),
);
async function copy() { const j = JSON.stringify(O, null, 2); code.value = j; try { await navigator.clipboard.writeText(j); status('Copied.'); } catch { status('Copy the values from the box.'); } }
function ideas() {
  const d = el('div', { class: 'ideas' });
  d.innerHTML = `<ol>
  <li><b>Background shader.</b> Fog and blood read as atmosphere; flames and embers as heat (the ghoul, the boss); ether as the wraith's unlife. In the game: one full-screen WebGL canvas behind the cards drawing each card's window at a third of its pixels — about the cost of the mist puffs. The frame art keeps its texture because the shader only adds light.</li>
  <li><b>3D motion.</b> The kick is cheap (a transform on the card). "Kick + tilt" reads best on a blow from the side; "wobble" suits crits and kills. "Dealt" entrances feel like a card game; "slide with a turn" keeps today's pace. The mouse tilt is a nice touch for the enemy you are about to hit, but it fights the click-to-attack if it moves the target — off by default in the game, or only on the hovered card's top half.</li>
  <li><b>Glint.</b> The streak shows the turn; the sheen is subtler and suits the knight; the foil is loud — relics and bosses only, if at all. All three cost one extra image layer per card and no shader.</li>
  <li><b>Further:</b> a specular rim that follows the card's angle (needs the rotation in a CSS variable), the background shader reacting to a hit (a pulse of brightness through the look), card edges catching light on the turn (a thin gradient on the frame), and the dead card's skull swap done as a flip.</li>
  </ol>`;
  return d;
}

// ---- fps ----
let frames = 0, t0 = performance.now();
(function fps(now) { requestAnimationFrame(fps); frames++; if (now - t0 >= 1000) { $('fps').textContent = `${Math.round((frames * 1000) / (now - t0))} fps`; frames = 0; t0 = now; } })(t0);

addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'e') enter(); else if (k === 'h') hitRandom(1); else if (k === 'c') hitRandom(1.7); else if (k === 'k') kill();
  else if (k === 'l') toggleLoop(); else if (k === 'p') panel.classList.toggle('hidden'); else if (k === 'r') revive();
});
applyAll();
enter();

// labs/world/lab.js — the World Lab (0.00210): the world map above the
// dungeon as a prototype. The owner's reference painting under a layer of
// clouds; places as pins; clearing a place (faked here) burns the clouds
// away around it and its roads; two looks — THE KNOWN WORLD (top-down,
// the camera framing what is known) and FROM THE SKY (low and tilted over
// one place) — and DESCEND, the dive through the clouds that would lead
// into a place's first room. The data below is shaped as the future
// assets/data/world.json (COPY JSON gives it back with the tuning); nothing
// here touches the game's save or data.

import { el } from '../../src/core/dom.js';

const KEY = 'castle-world-lab';
const $ = (id) => document.getElementById(id);

// ---- the world (the future world.json) ----
const WORLD = {
  image: 'assets/world/world_v1.webp', w: 1500, h: 841,
  // x, y: where on the picture (0..1). needs: the place whose clearing opens the road here.
  places: [
    { id: 'castle', name: 'Castle of the Crimson Moon', kind: 'The castle · 24 rooms · the Vampire Lord', x: 0.505, y: 0.395, icon: '♜',
      blurb: 'The keep you know. Its lord fallen, the clouds draw back from the lands around it and two roads lead on.' },
    { id: 'port', name: 'The Drowned Port', kind: 'A harbour · 16 rooms · the Tide Abbot', x: 0.455, y: 0.80, icon: '⚓', needs: 'castle',
      blurb: 'Fishermen speak of bells under the water. Clearing it lifts the clouds from the western sea.' },
    { id: 'peaks', name: 'The Ashen Peaks', kind: 'A mountain road · 24 rooms · the Ember Wyrm', x: 0.80, y: 0.56, icon: '▲', needs: 'castle',
      blurb: 'The pass is black with old fire. Beyond it, the fjords.' },
    { id: 'isles', name: 'The Pale Isles', kind: 'An archipelago · 16 rooms · the Salt Witch', x: 0.17, y: 0.30, icon: '☽', needs: 'port',
      blurb: 'Islands that are not on any chart twice in the same place.' },
    { id: 'fjords', name: 'The Northern Fjords', kind: 'A frozen coast · 24 rooms · the Drowned King', x: 0.72, y: 0.12, icon: '❄', needs: 'peaks',
      blurb: 'Where the sea turns to stone and the stone remembers.' },
  ],
};
const DEFAULTS = { density: 0.4, drift: 23, dark: 0.5, cleared: 220, open: 130, burn: 2.5, red: 0.55, tilt: 14, skyZoom: 2.5 }; // the owner's picks (0.00213: sparser, darker, faster clouds; tighter windows)
let T = { ...DEFAULTS };
try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved?.T) T = { ...DEFAULTS, ...saved.T }; } catch { /* fresh */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ T })); } catch { /* private mode */ } };

// ---- progress (the lab's: a save would carry cleared ids) ----
let cleared = []; // ids, in order
let picked = 'castle';
const stateOf = (p) => (cleared.includes(p.id) ? 'cleared' : !p.needs || cleared.includes(p.needs) ? 'open' : 'locked');
const place = (id) => WORLD.places.find((p) => p.id === id);
const reveal = {}; // id -> 0..1, how far its burn has gone (1 = done)

// ---- the picture and the cloud layer ----
const W = WORLD.w, H = WORLD.h;
const world = $('world'), map = $('map'), canvas = $('clouds'), pins = $('pins'), stage = $('stage');
world.style.width = `${W}px`; world.style.height = `${H}px`;
stage.style.background = '#3a3630'; // under the clouds past the painting: dim, unpainted land (the clouds reach there too)
map.src = WORLD.image;
// The cloud layer (0.00215): a canvas the size of the VIEWPORT, redrawn
// each frame in screen space under the map's current transform (read from
// the element, so glides and the dive carry it) — never a big canvas CSS-
// scaled with the map, which the compositor rasterises in tiles whose seams
// showed as flickering hairlines. It reaches a whole painting past every
// edge of the picture (the world goes on under the clouds past what is
// painted), drawn as a repeating pattern slid by the drift.
const REACH = 1; // paintings past each edge
const LW = W * (1 + 2 * REACH), LH = H * (1 + 2 * REACH);
let dpr = 1;
function sizeClouds() { dpr = Math.min(2, globalThis.devicePixelRatio || 1); canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr); }
sizeClouds();
const ctx = canvas.getContext('2d');
let puffs = null, pattern = null; // an offscreen canvas of the clouds, drawn once per density, and the repeating pattern of it (0.00215: tiled by the canvas itself — four drawImage tiles met in a hairline of thinner cloud, whatever the offsets)
function makePuffs() {
  let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const c = off.getContext('2d');
  const n = Math.round(900 * T.density);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 120, a = 0.35 + rnd() * 0.45;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(226,222,214,${a})`); g.addColorStop(0.6, `rgba(226,222,214,${a * 0.5})`); g.addColorStop(1, 'rgba(226,222,214,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    // the wrap: a puff near an edge also draws on the other side, so the drift never shows a seam
    for (const [dx, dy] of [[W, 0], [-W, 0], [0, H], [0, -H]]) {
      if (x + dx < -r || x + dx > W + r || y + dy < -r || y + dy > H + r) continue;
      const g2 = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      g2.addColorStop(0, `rgba(226,222,214,${a})`); g2.addColorStop(0.6, `rgba(226,222,214,${a * 0.5})`); g2.addColorStop(1, 'rgba(226,222,214,0)');
      c.fillStyle = g2; c.beginPath(); c.arc(x + dx, y + dy, r, 0, Math.PI * 2); c.fill();
    }
  }
  puffs = off;
  pattern = ctx.createPattern(off, 'repeat');
}
makePuffs();
const ease = (t) => 1 - Math.pow(1 - t, 3);
let last = performance.now(), ox = 0, oy = 0, time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; time += dt;
  ox = (ox + T.drift * dt) % W; oy = (oy + T.drift * 0.35 * dt) % H;
  // the burns advance
  for (const id of Object.keys(reveal)) if (reveal[id] < 1) reveal[id] = Math.min(1, reveal[id] + dt / T.burn);
  // the map's transform right now (CSS animates it: the clouds follow the glide and the dive); its affine part — the sky
  // view's perspective is approximated, the clouds there are in front of the picture anyway
  const M = new DOMMatrix(getComputedStyle(world).transform);
  const o = M.transformPoint(new DOMPoint(-W / 2, -H / 2)); // the picture's top-left, relative to the transform origin (the picture's centre, which sits at the screen's centre)
  const ax = innerWidth / 2 + W / 2 + o.x / (o.w || 1), ay = innerHeight / 2 + H / 2 + o.y / (o.w || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.setTransform(dpr * M.a, dpr * M.b, dpr * M.c, dpr * M.d, dpr * ax, dpr * ay); // picture px -> device px
  // the tile as a repeating pattern, slid by the drift: no tile edges, so no seams
  pattern.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
  ctx.fillStyle = pattern; ctx.fillRect(-REACH * W, -REACH * H, LW, LH);
  if (T.dark) { ctx.fillStyle = `rgba(20,14,12,${T.dark})`; ctx.fillRect(-REACH * W, -REACH * H, LW, LH); }
  ctx.globalCompositeOperation = 'destination-out';
  for (const p of WORLD.places) {
    const st = stateOf(p);
    const full = st === 'cleared' ? T.cleared : st === 'open' ? T.open : 0;
    if (!full) continue;
    const r = full * ease(reveal[p.id] ?? 1) + 6 * Math.sin(time * 0.6 + p.x * 10); // (a slow breath at the edge)
    if (r <= 0) continue;
    const cx = p.x * W, cy = p.y * H; // (picture px: the transform above places them)
    const g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  $('redmoon').style.opacity = String(T.red * Math.max(0, 1 - cleared.length / 3));
}
requestAnimationFrame(frame);

// ---- the pins and the card ----
function drawPins() {
  pins.innerHTML = '';
  for (const p of WORLD.places) {
    const st = stateOf(p);
    const pin = el('div', { class: `pin ${st}${st === 'locked' ? ' hidden' : ''}${picked === p.id ? ' picked' : ''}`, style: `left:${p.x * 100}%;top:${p.y * 100}%`, onclick: (e) => { e.stopPropagation(); pick(p.id); } },
      el('div', { class: 'dot' }, p.icon), el('div', { class: 'tail' }),
      el('div', { class: 'label' }, p.name, el('small', {}, st === 'cleared' ? 'cleared' : 'open — descend')));
    pins.append(pin);
  }
  scalePins();
}
function scalePins() { for (const pin of pins.children) pin.style.transform = `translate(-50%, -100%) scale(${1 / Math.max(0.6, view.zoom)})`; } // the pins keep their screen size
function card() {
  const p = place(picked); const st = stateOf(p); const c = $('card');
  c.classList.remove('hidden');
  c.innerHTML = '';
  c.append(el('h2', {}, p.name), el('div', { class: 'sub' }, p.kind), el('p', {}, p.blurb),
    el('div', { class: 'row' },
      st === 'open' ? el('button', { class: 'primary', onclick: () => dive(p) }, 'Descend') : el('button', { disabled: true }, st === 'cleared' ? 'Cleared' : 'Clouded'),
      el('button', { onclick: () => fitKnown() }, 'The known world'),
      st === 'open' ? el('button', { class: 'lab', onclick: () => clearPlace(p.id) }, 'lab: clear it') : null));
  $('subtitle').textContent = `${cleared.length ? `${cleared.length} place${cleared.length > 1 ? 's' : ''} cleared` : 'one road open'} · ${WORLD.places.filter((q) => stateOf(q) === 'open').length} open · the clouds hold the rest`;
}
function pick(id) { picked = id; drawPins(); card(); if (document.body.classList.contains('sky')) sky(place(id)); }

// ---- the camera: pan, zoom, the two looks, the dive ----
const view = { x: 0.5, y: 0.5, zoom: 1.5, tilt: 0 }; // the picture point at the screen's centre, the zoom, the tilt
function apply(cls = '') {
  world.className = cls;
  world.style.transform = `translate(-50%, -50%) ${view.tilt ? `perspective(1400px) rotateX(${view.tilt}deg)` : ''} scale(${view.zoom}) translate(${(0.5 - view.x) * W}px, ${(0.5 - view.y) * H}px)`;
  scalePins();
}
function fitKnown() { // THE KNOWN WORLD: frame every revealed circle
  document.body.classList.remove('sky'); $('title').firstChild.textContent = 'The Known World';
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of WORLD.places) {
    const st = stateOf(p); const r = st === 'cleared' ? T.cleared : st === 'open' ? T.open : 0; if (!r) continue;
    x0 = Math.min(x0, p.x * W - r); x1 = Math.max(x1, p.x * W + r); y0 = Math.min(y0, p.y * H - r); y1 = Math.max(y1, p.y * H + r);
  }
  view.x = (x0 + x1) / 2 / W; view.y = (y0 + y1) / 2 / H; view.tilt = 0;
  const panel = document.body.classList.contains('folded') ? 0 : 340; // the lab's controls (the game has none)
  view.zoom = Math.max(0.9, Math.min(2.2, 0.8 * Math.min((innerWidth - panel) / (x1 - x0), innerHeight / (y1 - y0))));
  view.x -= panel / 2 / (view.zoom * W); // centred in what is left of the screen
  apply('gliding');
}
function sky(p) { // FROM THE SKY: low and tilted over one place
  document.body.classList.add('sky'); $('title').firstChild.textContent = p.name;
  view.x = p.x; view.y = p.y + 0.04; view.zoom = T.skyZoom; view.tilt = T.tilt;
  apply('gliding');
}
let diving = false;
async function dive(p) { // DESCEND: through the clouds into the place
  if (diving) return; diving = true;
  $('card').classList.add('hidden');
  pins.style.transition = 'opacity 0.6s'; pins.style.opacity = '0';
  view.x = p.x; view.y = p.y; view.zoom = 7; view.tilt = 32;
  apply('diving');
  const veil = $('veil'), black = $('black');
  setTimeout(() => { veil.style.opacity = '0.9'; }, 900);
  await new Promise((r) => setTimeout(r, 2300));
  black.textContent = `${p.name} — room 1`; black.style.opacity = '1';
  await new Promise((r) => setTimeout(r, 1600));
  veil.style.opacity = '0';
  fitKnown();
  await new Promise((r) => setTimeout(r, 300));
  black.style.opacity = '0'; black.textContent = ''; pins.style.opacity = '1';
  diving = false; card();
}
// pan: pointer drag; zoom: the wheel around the cursor; a pinch on touch
let drag = null; const pts = new Map();
stage.addEventListener('pointerdown', (e) => { if (e.target.closest('.pin')) return; pts.set(e.pointerId, e); if (pts.size === 1) { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; stage.classList.add('dragging'); stage.setPointerCapture(e.pointerId); } });
stage.addEventListener('pointermove', (e) => {
  if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
  if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (drag?.pinch) { view.zoom = Math.max(0.45, Math.min(4, drag.z * d / drag.pinch)); apply(); } else drag = { pinch: d, z: view.zoom }; return; }
  if (!drag || drag.pinch) return;
  view.x = drag.vx - (e.clientX - drag.x) / (view.zoom * W); view.y = drag.vy - (e.clientY - drag.y) / (view.zoom * H); apply();
});
const up = (e) => { pts.delete(e.pointerId); if (!pts.size) { drag = null; stage.classList.remove('dragging'); } };
stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const z = Math.max(0.45, Math.min(4, view.zoom * Math.exp(-e.deltaY * 0.0015)));
  // zoom around the cursor: the picture point under it stays put
  const px = view.x + (e.clientX - innerWidth / 2) / (view.zoom * W), py = view.y + (e.clientY - innerHeight / 2) / (view.zoom * H);
  view.x = px - (e.clientX - innerWidth / 2) / (z * W); view.y = py - (e.clientY - innerHeight / 2) / (z * H); view.zoom = z; apply();
}, { passive: false });

// ---- the lab's progress and controls ----
function clearPlace(id) {
  if (cleared.includes(id)) return;
  cleared.push(id); reveal[id] = 0;
  for (const p of WORLD.places) if (p.needs === id && !(p.id in reveal)) reveal[p.id] = 0; // the roads it opens burn in too
  drawPins(); card(); $('status').textContent = `${place(id).name} cleared — the clouds lift.`;
  setTimeout(fitKnown, 400);
}
$('clear').onclick = () => { const next = WORLD.places.find((p) => stateOf(p) === 'open'); if (next) clearPlace(next.id); else $('status').textContent = 'Every place is cleared.'; };
$('reset').onclick = () => { cleared = []; for (const k of Object.keys(reveal)) delete reveal[k]; picked = 'castle'; drawPins(); card(); fitKnown(); $('status').textContent = ''; };
$('viewA').onclick = fitKnown; $('viewB').onclick = () => sky(place(picked)); $('fit').onclick = fitKnown;
$('hide').onclick = () => { $('side').classList.add('folded'); document.body.classList.add('folded'); };
$('fold').onclick = () => { $('side').classList.remove('folded'); document.body.classList.remove('folded'); };
for (const k of Object.keys(DEFAULTS)) {
  const input = $(k); input.value = T[k]; $(`v-${k}`).textContent = T[k];
  input.oninput = () => { T[k] = Number(input.value); $(`v-${k}`).textContent = T[k]; if (k === 'density') makePuffs(); if (k === 'tilt' || k === 'skyZoom') { if (document.body.classList.contains('sky')) sky(place(picked)); } save(); };
}
$('copy').onclick = async () => {
  const json = JSON.stringify({ world: WORLD, clouds: { density: T.density, drift: T.drift, dark: T.dark }, reveal: { cleared: T.cleared, open: T.open, burnS: T.burn, red: T.red }, sky: { tilt: T.tilt, zoom: T.skyZoom } }, null, 2);
  $('json').value = json;
  try { await navigator.clipboard.writeText(json); $('status').textContent = 'Copied.'; } catch { $('status').textContent = 'Copy the values from the box.'; }
};
addEventListener('resize', () => { sizeClouds(); if (!document.body.classList.contains('sky')) fitKnown(); });
addEventListener('keydown', (e) => { if (e.key === 'c') $('clear').click(); if (e.key === 'r') $('reset').click(); if (e.key === 'd') { const p = place(picked); if (stateOf(p) === 'open') dive(p); } });

drawPins(); card(); view.tilt = 0; fitKnown();

// labs/heroes/lab.js — the Hero Lab (0.00247; see index.html). The CHOOSE
// YOUR HERO screen over any painting, drawn from the game's own data and
// stylesheet (heroes.json, shared/heroes.js, styles.css section 6b) since
// 0.00248 — the screen shipped as ui/scenes/heroScene.js; this page keeps
// the SHOWCASE alternative (the chosen hero large beside the lines) and
// the painting picker for trying layouts. State (layout, painting, the
// chosen hero and its look) lives in this browser's localStorage under
// its own key; COPY JSON gives it back. Nothing here touches the game.

import { loadData, DATA } from '../../src/shared/data.js';
import { heroList, heroById, lookUrl, lookOf } from '../../src/shared/heroes.js';

const KEY = 'castle-hero-lab';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.filter((k) => k != null && k !== false)); return n; };
const LAYOUTS = [['lineup', 'Line-up'], ['showcase', 'Showcase']];

await loadData();
const HEROES = heroList();
const B = DATA.backgrounds;
const PAINTINGS = [...new Set([B.hub, B.title, B.shrine, ...B.entrance, ...B.bosses, ...B.rooms, ...B.treasure])];

// ---- state (this browser) ----
let S = { layout: 'lineup', painting: B.hub, chosen: DATA.heroes.default, look: {} };
try { S = { ...S, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* fresh */ }
if (!heroById(S.chosen)) S.chosen = DATA.heroes.default;
if (!PAINTINGS.includes(S.painting)) S.painting = B.hub;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ } };
const index = () => HEROES.findIndex((h) => h.id === S.chosen);
const hero = () => HEROES[index()];
const lookAt = (id) => S.look?.[id] ?? 0;
function setLook(id, n) { const m = heroById(id).looks.length; S.look = { ...S.look, [id]: ((n % m) + m) % m }; render(); }

// ---- the screen (the game's markup and classes) ----
function card(h, i) {
  return el('div', { class: 'hero', 'data-hero': h.id, onclick: () => choose(h.id) },
    el('div', { class: 'plate' }), el('div', { class: 'rim' }),
    el('img', { class: 'figure', src: lookUrl(h, lookAt(h.id)), style: `--fh:${lookOf(h, lookAt(h.id)).fh}`, alt: h.name, draggable: 'false' }),
    el('button', { class: 'num' }, String(i + 1)),
    el('div', { class: 'name' }, h.name.replace(/^The /, ''), el('small', {}, h.epithet)),
    el('div', { class: 'looks' },
      el('button', { title: 'Previous look', onclick: (e) => { e.stopPropagation(); setLook(h.id, lookAt(h.id) - 1); } }, '‹'),
      el('div', { class: 'dots' }, ...h.looks.map((_, n) => el('i', { class: n === lookAt(h.id) ? 'on' : '' }))),
      el('button', { title: 'Next look', onclick: (e) => { e.stopPropagation(); setLook(h.id, lookAt(h.id) + 1); } }, '›'),
      el('span', { class: 'which' }, `Look ${lookAt(h.id) + 1} of ${h.looks.length}`)));
}
function render() {
  document.body.classList.toggle('showcase', S.layout === 'showcase');
  $('room').style.backgroundImage = `url('assets/bg/${S.painting}')`;
  const row = $('row');
  row.style.setProperty('--n', HEROES.length);
  row.replaceChildren(...HEROES.map(card));
  const h = hero();
  for (const c of row.children) c.classList.toggle('chosen', c.dataset.hero === S.chosen);
  const stage = document.querySelector('.stage img');
  stage.src = lookUrl(h, lookAt(h.id)); stage.alt = h.name; stage.style.setProperty('--fh', lookOf(h, lookAt(h.id)).fh);
  $('detail').replaceChildren(
    el('h2', {}, h.name), el('div', { class: 'epithet' }, h.epithet), el('p', { class: 'lore' }, h.lore),
    el('div', { class: 'traits' }, ...h.traits.map((t) => el('span', {}, t))),
    el('div', { class: 'btn-row' }, el('button', { class: 'primary active', onclick: begin }, 'Proceed', el('span', { class: 'key-hint' }, '[space]'))));
  for (const [id] of LAYOUTS) $(`layout-${id}`).classList.toggle('on', S.layout === id);
  $('painting').value = S.painting;
  save();
}
function choose(id) { if (heroById(id)) { S.chosen = id; render(); } }
function begin() { say(`${hero().name}, look ${lookAt(hero().id) + 1}: in the game this fades the screen's pieces out and the Great Hall's in over the same painting.`); }
let sayTimer = 0;
function say(msg) { $('status').textContent = msg; clearTimeout(sayTimer); sayTimer = setTimeout(() => { $('status').textContent = ''; }, 3500); }

// ---- the bar ----
$('layouts').append(...LAYOUTS.map(([id, label]) => el('button', { id: `layout-${id}`, onclick: () => { S.layout = id; render(); } }, label)));
$('painting').append(...PAINTINGS.map((f) => el('option', { value: f }, B.roomNames?.[f] ?? f.replace(/\.jpg$/, '').replace(/_/g, ' '))));
$('painting').addEventListener('change', (e) => { S.painting = e.target.value; render(); });
$('copy').addEventListener('click', async () => {
  const json = JSON.stringify({ layout: S.layout, painting: S.painting, chosen: S.chosen, look: lookAt(S.chosen), heroes: HEROES.map((h) => h.id) }, null, 2);
  try { await navigator.clipboard.writeText(json); say('Copied.'); } catch { say(json); }
});
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  const n = Number(e.key);
  if (n >= 1 && n <= HEROES.length) choose(HEROES[n - 1].id);
  else if (e.key === 'ArrowLeft') setLook(S.chosen, lookAt(S.chosen) - 1);
  else if (e.key === 'ArrowRight') setLook(S.chosen, lookAt(S.chosen) + 1);
  else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); begin(); }
  else if (e.key === 'l' || e.key === 'L') { S.layout = S.layout === 'lineup' ? 'showcase' : 'lineup'; render(); }
  else if (e.key === 'p' || e.key === 'P') { S.painting = PAINTINGS[(PAINTINGS.indexOf(S.painting) + 1) % PAINTINGS.length]; render(); }
});
render();

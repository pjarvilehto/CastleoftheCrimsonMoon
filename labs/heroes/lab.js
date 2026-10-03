// labs/heroes/lab.js — the Hero Lab (0.00247, see index.html): the CHOOSE
// YOUR HERO screen as a draft over a room painting. HEROES is the shape a
// future heroes.json would take (id, name, epithet, lore, traits, art and
// the figure's share of its sheet's height, so the five read in scale with
// one another); the names and lines are placeholders. State (layout, fan,
// painting, the chosen hero) lives in this browser's localStorage under
// its own key; COPY JSON gives it back. Nothing here touches the game.

import { loadData, DATA } from '../../src/shared/data.js';

const KEY = 'castle-hero-lab';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.filter((k) => k != null && k !== false)); return n; };

/** The five: the knight the game has and the four new classes. fh = the figure's box height over the sheet's (1536 px, tools/cutout.mjs bbox). */
export const HEROES = [
  { id: 'knight', name: 'The Curious Knight', epithet: 'Steel and stubbornness', lore: 'A wanderer who came for the legend and stayed for the fight. A sword, a coat of mail and no sense of when to leave.', traits: ['Sword', 'Heavy blows', 'Armor'], art: 'labs/heroes/knight.webp', fh: 1135 / 1536 },
  { id: 'barbarian', name: 'The Barbarian', epithet: 'The axe decides', lore: 'From the frozen marches, where the moon is one more thing to kill. Hits harder, bleeds more, drinks last.', traits: ['Great axe', 'Rage', 'No armor'], art: 'labs/heroes/barbarian.webp', fh: 1357 / 1536 },
  { id: 'wizard', name: 'The Wizard', epithet: 'Old fire, older book', lore: 'He has read what the castle is and came anyway, with a staff, a chained grimoire and three good spells.', traits: ['Staff', 'Spells', 'Frail'], art: 'labs/heroes/wizard.webp', fh: 1307 / 1536 },
  { id: 'necromancer', name: 'The Necromancer', epithet: 'The dead owe him', lore: "The castle's own trade, turned against it. Every corpse on the floor is a servant waiting for its word.", traits: ['Ritual dagger', 'Thralls', 'Lifesteal'], art: 'labs/heroes/necromancer.webp', fh: 1434 / 1536 },
  { id: 'druid', name: 'The Druid', epithet: 'The forest remembers', lore: 'Antlers, feathers and a staff that still grows. The wild has its own quarrel with the Crimson Moon.', traits: ['Living staff', 'Mending', 'Wild shape'], art: 'labs/heroes/druid.webp', fh: 1441 / 1536 },
];
const LAYOUTS = [['lineup', 'Line-up'], ['showcase', 'Showcase']];

await loadData();
const B = DATA.backgrounds;
const PAINTINGS = [...new Set([B.hub, B.title, B.shrine, ...B.entrance, ...B.bosses, ...B.rooms, ...B.treasure])];

// ---- state (this browser) ----
let S = { layout: 'lineup', fan: false, painting: B.hub, chosen: 'knight' };
try { S = { ...S, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* fresh */ }
if (!HEROES.some((h) => h.id === S.chosen)) S.chosen = 'knight';
if (!PAINTINGS.includes(S.painting)) S.painting = B.hub;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ } };
const index = () => HEROES.findIndex((h) => h.id === S.chosen);
const hero = () => HEROES[index()];

// ---- the screen ----
function card(h, i) {
  const c = el('div', { class: 'hero', 'data-id': h.id, style: `--fh:${h.fh.toFixed(4)}`, onclick: () => choose(h.id) },
    el('div', { class: 'plate' }), el('div', { class: 'rim' }),
    el('img', { class: 'figure', src: h.art, alt: h.name, draggable: 'false' }),
    el('div', { class: 'num' }, String(i + 1)),
    el('div', { class: 'name' }, h.name.replace(/^The /, ''), el('small', {}, h.epithet)));
  return c;
}
function render() {
  document.body.classList.toggle('showcase', S.layout === 'showcase');
  $('room').style.backgroundImage = `url('assets/bg/${S.painting}')`;
  const row = $('row');
  row.classList.toggle('fan', S.fan);
  row.replaceChildren(...HEROES.map(card));
  const h = hero(), k = index();
  for (const c of row.children) {
    const i = HEROES.findIndex((x) => x.id === c.dataset.id);
    c.classList.toggle('chosen', i === k);
    c.style.setProperty('--ry', `${(k - i) * 9}deg`); // the fan: every card turned a little toward the chosen one
  }
  const stage = document.querySelector('.stage img');
  stage.src = h.art; stage.alt = h.name; stage.style.setProperty('--fh', h.fh.toFixed(4));
  $('detail').replaceChildren(
    el('h2', {}, h.name), el('div', { class: 'epithet' }, h.epithet), el('p', { class: 'lore' }, h.lore),
    el('div', { class: 'traits' }, ...h.traits.map((t) => el('span', {}, t))),
    el('div', { class: 'btn-row' },
      el('button', { class: 'primary proceed', onclick: begin }, 'Begin the Descent', el('span', { class: 'key-hint' }, '[space]')),
      el('button', { onclick: () => say('Back would return to the title.') }, 'Back')),
    el('div', { class: 'placeholder' }, 'Draft: the names, lines and traits are placeholders; the choice changes the look only.'));
  for (const [id] of LAYOUTS) $(`layout-${id}`).classList.toggle('on', S.layout === id);
  $('fan').classList.toggle('on', S.fan);
  $('painting').value = S.painting;
  save();
}
function choose(id) { S.chosen = id; render(); }
function step(d) { choose(HEROES[(index() + d + HEROES.length) % HEROES.length].id); }
function begin() { say(`${hero().name} enters the castle (the real screen would go to the Great Hall).`); }
let sayTimer = 0;
function say(msg) { $('status').textContent = msg; clearTimeout(sayTimer); sayTimer = setTimeout(() => { $('status').textContent = ''; }, 3500); }

// ---- the bar ----
$('layouts').append(...LAYOUTS.map(([id, label]) => el('button', { id: `layout-${id}`, onclick: () => { S.layout = id; render(); } }, label)));
$('fan').addEventListener('click', () => { S.fan = !S.fan; render(); });
$('painting').append(...PAINTINGS.map((f) => el('option', { value: f }, B.roomNames?.[f] ?? f.replace(/\.jpg$/, '').replace(/_/g, ' '))));
$('painting').addEventListener('change', (e) => { S.painting = e.target.value; render(); });
$('copy').addEventListener('click', async () => {
  const json = JSON.stringify({ layout: S.layout, fan: S.fan, painting: S.painting, chosen: S.chosen, heroes: HEROES.map((h) => h.id) }, null, 2);
  try { await navigator.clipboard.writeText(json); say('Copied.'); } catch { say(json); }
});
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  const n = Number(e.key);
  if (n >= 1 && n <= HEROES.length) choose(HEROES[n - 1].id);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); begin(); }
  else if (e.key === 'l' || e.key === 'L') { S.layout = S.layout === 'lineup' ? 'showcase' : 'lineup'; render(); }
  else if (e.key === 'f' || e.key === 'F') { S.fan = !S.fan; render(); }
  else if (e.key === 'p' || e.key === 'P') { S.painting = PAINTINGS[(PAINTINGS.indexOf(S.painting) + 1) % PAINTINGS.length]; render(); }
});
render();

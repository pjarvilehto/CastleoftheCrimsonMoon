// labs/backgrounds/lab.js — the Background Lab (0.00241, see index.html).
// The new room paintings tools/gen-bg.mjs made (assets/data/rooms-art.json)
// through their stages: drafts → approved → in the game. Verdicts live in
// localStorage: { [file]: { v: 'ok' | 'no', note, at } }, re-rolls under
// reroll[id] and "Regenerate with notes" under reroll['regen:' + file] (that
// candidate as the picture in, the note as the direction, the panel's model);
// COPY JSON = { approved: [{ id, file }], rejected: [{ id, file, note }],
// reroll: [{ id, n, hint, model } | { id, basedOn: n, hint, n, model }] }
// for node tools/gen-bg.mjs --rerender. Nothing here touches the game.

import { loadData, DATA, buildQuery } from '../../src/shared/data.js';
import { createEnemyUnit, createPlayerUnit } from '../../src/ui/battleLine.js';
import { createRun } from '../../src/run/runState.js';
import { scaleEnemy } from '../../src/shared/balance.js';

const KEY = 'castle-background-lab';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.filter((k) => k != null && k !== false)); return n; };

await loadData();
const art = await fetch(`assets/data/rooms-art.json${buildQuery()}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { rooms: {} })).catch(() => ({ rooms: {} }));
const ROOMS = Object.keys(art.rooms ?? {});
const nameOf = (id) => art.rooms[id]?.name ?? id;
const candidates = (id) => art.rooms?.[id]?.candidates ?? [];
const B = DATA.backgrounds;
const PAINTINGS = [...new Set([...B.entrance, ...B.rooms, ...B.bosses, ...B.treasure])];
// the editors tools/gen-bg.mjs knows (--model); the lab's pick goes into every re-roll it queues
const MODELS = [['seedream', 'Seedream 4'], ['bananapro', 'Nano Banana Pro (2K)'], ['banana', 'Nano Banana'], ['imagen', 'Imagen 4'], ['gpt', 'GPT Image 1.5'], ['flux2', 'FLUX 2 Pro'], ['flux11', 'FLUX 1.1 Pro'], ['lora', 'the rooms LoRA']];
const MODEL_NAME = { 'bytedance/seedream-4': 'Seedream 4', 'google/nano-banana': 'Nano Banana', 'google/nano-banana-pro': 'Nano Banana Pro', 'google/imagen-4': 'Imagen 4', 'openai/gpt-image-1.5': 'GPT Image 1.5', 'black-forest-labs/flux-2-pro': 'FLUX 2 Pro', 'black-forest-labs/flux-1.1-pro': 'FLUX 1.1 Pro', 'flux-kontext-apps/multi-image-kontext-max': 'Kontext Max' };
const modelName = (m = '') => MODEL_NAME[m] ?? (m.startsWith('pjarvilehto/') ? 'the rooms LoRA' : m.split('/').pop());

// ---- state (this browser) ----
let S = { verdicts: {}, reroll: {}, painting: 'dungeon_ossuary.jpg', view: 'room', room: ROOMS[0] ?? '', shown: {}, fight: ['rat', 'skeleton', 'cultist', 'vampire_lord'], model: 'seedream' };
try { S = { ...S, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* fresh */ }
if (!ROOMS.includes(S.room)) S.room = ROOMS[0] ?? '';
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ } };
// the registry's verdicts are the starting point; this browser's override
const verdictOf = (k) => (S.verdicts[k.file] ? { ...(k.verdict ? { v: k.verdict } : {}), ...S.verdicts[k.file] } : k.verdict ? { v: k.verdict, note: k.note ?? '' } : null);
// the room's picture on the stage: the one clicked, else the approved candidate (the latest), else the latest candidate
const shown = (id) => { const c = candidates(id); return c.find((k) => k.file === S.shown[id]) ?? [...c].reverse().find((k) => verdictOf(k)?.v === 'ok') ?? c[c.length - 1] ?? null; };
const stageOf = (id) => { const c = candidates(id); return c.some((k) => k.imported) ? 'in the game' : c.some((k) => verdictOf(k)?.v === 'ok') ? 'approved' : c.length ? 'drafts' : 'no candidates'; };

// ---- views ----
function room() {
  const id = S.room, cs = candidates(id), on = shown(id);
  $('tiles').replaceChildren(...cs.map((k) => {
    const v = verdictOf(k);
    const bOk = el('button', { onclick: () => verdict(k, 'ok') }, 'Approve'), bNo = el('button', { onclick: () => verdict(k, 'no') }, 'Reject');
    const regen = S.reroll[`regen:${k.file}`];
    const bRegen = el('button', { title: 'Queue a redraw FROM this candidate: it goes in as the picture to keep, your note below is the direction, the model the one picked in the panel (2 new candidates)', onclick: () => { if (regen) delete S.reroll[`regen:${k.file}`]; else S.reroll[`regen:${k.file}`] = { id, basedOn: k.n, n: 2 }; save(); room(); } }, regen ? '✓ Regenerate' : 'Regenerate');
    bRegen.classList.toggle('on', !!regen);
    const note = el('input', { type: 'text', placeholder: regen ? 'direction for the redraw' : 'note (what was wrong, or the direction for a redraw)', value: v?.note ?? '', oninput: (e) => { S.verdicts[k.file] = { ...(verdictOf(k) ?? {}), note: e.target.value, at: Date.now() }; if (!S.verdicts[k.file].v) S.verdicts[k.file].v = null; save(); } });
    bOk.classList.toggle('on-ok', v?.v === 'ok'); bNo.classList.toggle('on-no', v?.v === 'no');
    const tile = el('div', { class: `tile${k === on ? ' shown' : ''}${v?.v === 'ok' ? ' ok' : v?.v === 'no' ? ' no' : ''}${k.imported ? ' imported' : ''}` },
      el('img', { src: k.file, alt: `${nameOf(id)} candidate ${k.n}`, loading: 'lazy', title: 'Show it on the stage (and in the fight and compare views)', onclick: () => { S.shown[id] = k.file; save(); render(); } }),
      el('div', { class: 'cap' }, el('b', {}, `Candidate ${k.n}`), el('span', { class: 'meta' }, `${k.basedOn ? `from c${k.basedOn} · ` : ''}${modelName(k.model)}${k.refs?.length ? ' + references' : ''} · ${k.w}x${k.h}${k.hint ? ` · "${k.hint}"` : ''}`),
        el('div', { class: 'verdict' }, bOk, bNo, bRegen), note));
    return tile;
  }));
  if (!cs.length) $('tiles').append(el('p', { class: 'hint', style: 'color:#9a8b6a; font-family:var(--body); text-shadow:0 1px 4px #000;' }, `No candidates for ${nameOf(id)} yet: node tools/gen-bg.mjs --only ${id}`));
}
function compare() {
  const k = shown(S.room);
  $('compare').replaceChildren(
    el('figure', {}, el('img', { src: k ? k.file : '', alt: '' }), el('figcaption', {}, k ? `${nameOf(S.room)} · candidate ${k.n} · ${modelName(k.model)}` : 'no candidate')),
    el('figure', {}, el('img', { src: `assets/bg/${S.painting}`, alt: '' }), el('figcaption', {}, `${B.roomNames?.[S.painting] ?? S.painting} · the game's painting`)));
}
// the game's own units at the game's own size (the Art Lab's sizing: one knight card + --slots enemy widths)
const run = createRun();
function unitFor(id, i) {
  const u = id === 'player' ? createPlayerUnit(run, { onHeavy() {}, onPotion() {} }) : createEnemyUnit({ ...scaleEnemy(id, 9), id, name: `${DATA.enemies[id].name} LV9`, hp: 0 }, i, { onAttack() {}, onGone() {} });
  if (id === 'player') u.update({ hp: run.hp, printing: false, heavyReady: true, heavyCd: 0, dead: false });
  else u.update({ hp: scaleEnemy(id, 9).maxHp, dead: false, printing: false, combatOver: false });
  u.card.style.position = 'relative';
  if (id !== 'player' && DATA.enemies[id].boss) u.el.classList.add('boss-unit');
  return u;
}
const width = (u) => (u.el.classList.contains('player-unit') ? 0.605 / 0.3734 : u.el.classList.contains('boss-unit') ? 2 : 1);
const sizing = (rowUnits, allUnits = rowUnits) => `--n:${rowUnits.length};--slots:${Math.max(1, Math.ceil(allUnits.reduce((s, u) => s + width(u), 0) - 0.605 / 0.3734))}`;
function fight() {
  const units = ['player', ...S.fight].map((id, i) => unitFor(id, i));
  $('stage').replaceChildren(el('div', { class: 'battle-line', style: sizing(units.slice(1), units) }, units[0].el, el('div', { class: 'enemy-row' }, ...units.slice(1).map((u) => u.el))));
}
function verdict(k, v) { const cur = verdictOf(k) ?? {}; S.verdicts[k.file] = { ...cur, v: cur.v === v ? null : v, at: Date.now() }; save(); render(); }
function render() {
  document.body.classList.toggle('fight', S.view === 'fight');
  document.body.classList.toggle('compare', S.view === 'compare');
  const k = shown(S.room);
  $('room').style.backgroundImage = k ? `url("${k.file}")` : `url("assets/bg/${S.painting}")`;
  for (const b of $('views').children) b.classList.toggle('on', b.dataset.view === S.view);
  try { ({ room, compare, fight })[S.view](); panel(); } catch (e) { // never an empty page: say what broke
    $('tiles').replaceChildren(el('p', { class: 'hint', style: 'color:#e0a0a0; font-family:var(--body); text-shadow:0 1px 4px #000; max-width:60ch;' }, `The lab hit an error: ${e.message}. Reload in a minute (a fresh build's data may still be on its way), or open the console.`));
    console.error(e);
  }
}

// ---- the top bar ----
for (const [v, label] of [['room', 'Room'], ['compare', 'Compare'], ['fight', 'Fight']]) $('views').append(el('button', { 'data-view': v, onclick: () => { S.view = v; save(); render(); } }, label));
const sel = $('painting');
for (const f of PAINTINGS) sel.append(el('option', { value: f }, B.roomNames?.[f] ?? f));
sel.value = S.painting; sel.onchange = () => { S.painting = sel.value; save(); render(); };

// ---- the panel ----
const pan = $('panel');
const status = (t) => { const s = $('status'); if (s) s.textContent = t; };
const code = el('textarea', { rows: 8, readonly: '' });
function panel() {
  const id = S.room, rr = S.reroll[id] ?? { n: 2, hint: '' };
  const rooms = el('div', { id: 'rooms' }, ...ROOMS.map((rid) => { const st = stageOf(rid); return el('button', { class: `${rid === id ? 'on' : ''} ${st === 'approved' ? 'ok' : st === 'in the game' ? 'imported' : ''}`, onclick: () => { S.room = rid; S.view = 'room'; save(); render(); } }, el('span', {}, nameOf(rid)), el('span', { class: 'n' }, `${candidates(rid).length} · ${st}`)); }));
  const fightSel = S.fight.map((f, i) => el('select', { onchange: (e) => { S.fight[i] = e.target.value; save(); render(); } }, ...Object.keys(DATA.enemies).map((eid) => { const o = el('option', { value: eid }, DATA.enemies[eid].name); if (eid === f) o.selected = true; return o; })));
  const total = ROOMS.reduce((s, rid) => s + candidates(rid).length, 0), approved = ROOMS.filter((rid) => ['approved', 'in the game'].includes(stageOf(rid))).length;
  pan.replaceChildren(
    el('h2', {}, 'Rooms'), el('p', { class: 'note' }, `${total} candidates · ${approved} / ${ROOMS.length} rooms approved · stages: drafts → approved → in the game`), rooms,
    el('h2', {}, 'Model for re-rolls'),
    el('div', { class: 'row' }, el('select', { onchange: (e) => { S.model = e.target.value; save(); } }, ...MODELS.map(([k, n]) => { const o = el('option', { value: k }, n); if (k === S.model) o.selected = true; return o; })),
      el('span', { class: 'note' }, 'goes with every re-roll and Regenerate in the JSON')),
    el('h2', {}, 'Fight view'), el('div', { class: 'row' }, ...fightSel), el('p', { class: 'note' }, 'the game\'s own cards at the game\'s size over the shown candidate, with the vignette'),
    el('h2', {}, `Re-roll ${nameOf(id)}`),
    el('label', { class: 'c' }, el('span', {}, 'How many'), el('input', { type: 'number', min: 1, max: 8, value: rr.n, oninput: (e) => { S.reroll[id] = { ...(S.reroll[id] ?? rr), n: Number(e.target.value) }; save(); } })),
    el('label', { class: 'c' }, el('span', {}, 'Hint'), el('input', { type: 'text', placeholder: 'added to the room\'s line, e.g. "darker, more spot blacks"', value: rr.hint, oninput: (e) => { S.reroll[id] = { ...(S.reroll[id] ?? rr), hint: e.target.value }; save(); } })),
    el('div', { class: 'row' }, el('button', { onclick: () => { S.reroll[id] = { ...(S.reroll[id] ?? rr), on: !(S.reroll[id]?.on) }; save(); render(); } }, S.reroll[id]?.on ? '✓ Re-roll queued' : 'Queue a re-roll'), el('span', { class: 'note' }, 'fresh versions from the room\'s line; goes into the JSON below')),
    el('h2', {}, 'Copy'),
    el('div', { class: 'row' }, el('button', { onclick: copy }, 'Copy JSON'), el('button', { onclick: () => { if (confirm('Forget every verdict and re-roll in this browser?')) { S.verdicts = {}; S.reroll = {}; save(); render(); } } }, 'Clear')),
    el('p', { class: 'note' }, 'Copied to the clipboard and downloaded as rooms-rerender.json. In the repo, with REPLICATE_API_TOKEN set: node tools/gen-bg.mjs --rerender rooms-rerender.json (records the verdicts, paints the re-rolls), then --prune, --import <room> (+ the depth map), bump and ship. Or paste the JSON to the assistant.'),
    code, el('div', { id: 'status' }));
}
async function copy() {
  const out = { approved: [], rejected: [], reroll: [] };
  for (const id of ROOMS) {
    for (const k of candidates(id)) { const v = verdictOf(k); if (v?.v === 'ok') out.approved.push({ id, file: k.file }); if (v?.v === 'no') out.rejected.push({ id, file: k.file, note: v.note ?? '' }); }
    const rr = S.reroll[id]; if (rr?.on) out.reroll.push({ id, n: rr.n || 2, hint: rr.hint ?? '', model: S.model });
  }
  for (const [key, q] of Object.entries(S.reroll)) {
    if (key.startsWith('regen:')) { const file = key.slice(6); const k = candidates(q.id).find((x) => x.file === file); out.reroll.push({ id: q.id, basedOn: q.basedOn, n: q.n ?? 2, hint: (k && verdictOf(k)?.note) || '', model: S.model }); }
  }
  const json = JSON.stringify(out, null, 2);
  code.value = json;
  try { await navigator.clipboard.writeText(json); status('Copied.'); } catch { status('Copy the JSON from the box.'); }
  const a = el('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: 'rooms-rerender.json' });
  document.body.append(a); a.click(); a.remove();
}

addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === '1') S.view = 'room'; else if (k === '2') S.view = 'compare'; else if (k === '3') S.view = 'fight';
  else if (k === 'p') { pan.classList.toggle('hidden'); return; }
  else if (k === 'arrowright' || k === 'arrowleft') { S.room = ROOMS[(ROOMS.indexOf(S.room) + (k === 'arrowright' ? 1 : ROOMS.length - 1)) % ROOMS.length]; S.view = 'room'; }
  else return;
  save(); render();
});
render();

// labs/art/lab.js — the Art Lab (0.184, see index.html). The game's real
// card units with the current portraits and the candidates tools/gen-art.mjs
// made (assets/data/art.json), over a room painting. Verdicts live in
// localStorage: { [file]: { v: 'ok' | 'no', note, flip, at } }, re-rolls
// under reroll[id] and clean passes under reroll['clean:' + file]; COPY
// JSON = { approved: [{ id, file, flip }], rejected: [{ id, file, note }],
// reroll: [{ id, n, hint, style } | { id, clean: n }] } for
// node tools/gen-art.mjs --rerender. Nothing here touches the game.

import { loadData, DATA, buildQuery } from '../../src/shared/data.js';
import { createEnemyUnit, createPlayerUnit } from '../../src/ui/battleLine.js';
import { createRun } from '../../src/run/runState.js';
import { scaleEnemy } from '../../src/shared/balance.js';
import { portraitUrl } from '../../src/shared/portraits.js';

const KEY = 'castle-art-lab';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.filter((k) => k != null && k !== false)); return n; };

await loadData();
const art = await fetch(`assets/data/art.json${buildQuery()}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { chars: {} })).catch(() => ({ chars: {} }));
const NEW = Object.keys(art.chars ?? {}).filter((id) => id !== 'player' && !DATA.enemies[id]); // drawn by the LoRA for a character the game does not have yet (gen-art --new)
const IDS = ['player', ...Object.keys(DATA.enemies), ...NEW];
const nameOf = (id) => (id === 'player' ? 'The Curious Knight' : DATA.enemies[id]?.name ?? art.chars[id]?.name ?? id);
const candidates = (id) => art.chars?.[id]?.candidates ?? [];
const B = DATA.backgrounds;
const PAINTINGS = [...new Set([...B.entrance, ...B.rooms, ...B.bosses, ...B.treasure])];

// ---- state (this browser) ----
let S = { verdicts: {}, reroll: {}, painting: 'dungeon_ossuary.jpg', view: 'compare', char: 'player', fight: ['rat', 'skeleton', 'cultist', 'vampire_lord'], fresh: true };
try { S = { ...S, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* fresh */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ } };
// the registry's verdicts are the starting point; this browser's override
const verdictOf = (k) => S.verdicts[k.file] ?? (k.verdict ? { v: k.verdict, note: k.note ?? '', flip: !!k.flip } : null);
// the character's new picture: the approved candidate (the latest), else the latest candidate
const chosen = (id) => { const c = candidates(id); return [...c].reverse().find((k) => verdictOf(k)?.v === 'ok') ?? c[c.length - 1] ?? null; };

// ---- units ----
const run = createRun();
function unitFor(id, i, k = null) {
  const u = id === 'player'
    ? createPlayerUnit(run, { onHeavy() {}, onPotion() {} })
    : createEnemyUnit({ ...scaleEnemy(DATA.enemies[id] ? id : 'rat', 9), id, name: `${nameOf(id)} LV9`, hp: 0 }, i, { onAttack() {}, onGone() {} }); // (a new character: the rat's numbers, its own name)
  if (id === 'player') u.update({ hp: run.hp, printing: false, heavyReady: true, heavyCd: 0, dead: false });
  else u.update({ hp: scaleEnemy(DATA.enemies[id] ? id : 'rat', 9).maxHp, dead: false, printing: false, combatOver: false });
  u.card.style.position = 'relative';
  if (id !== 'player' && DATA.enemies[id].boss) u.el.classList.add('boss-unit'); // twice as wide (0.196)
  if (k) { u.portrait.src = k.file; u.glint.src = k.file; }
  const flip = k && verdictOf(k)?.flip;
  u.portrait.classList.toggle('flipped', !!flip); u.glint.classList.toggle('flipped', !!flip);
  return u;
}
const stage = $('stage');
// The game's --card-h budget is one knight card + --slots enemy-card widths (--n cards for the gaps; 0.196: the boss's
// card counts two slots, battleRoom.js). A row of any cards: their widths in enemy-card units, less the knight the budget already holds.
const width = (u) => (u.el.classList.contains('player-unit') ? 0.605 / 0.3734 : u.el.classList.contains('boss-unit') ? 2 : 1);
const sizing = (rowUnits, allUnits = rowUnits) => `--n:${rowUnits.length};--slots:${Math.max(1, Math.ceil(allUnits.reduce((s, u) => s + width(u), 0) - 0.605 / 0.3734))}`;
function line(units) {
  stage.replaceChildren(el('div', { class: 'battle-line', style: sizing(units) }, el('div', { class: 'enemy-row' }, ...units.map((u) => u.el))));
}

// ---- views ----
function compare() {
  const id = S.char, cs = candidates(id);
  const units = [unitFor(id, 0), ...cs.map((k, i) => unitFor(id, i + 1, k))];
  units[0].el.append(el('div', { class: 'lab-cap' }, el('b', {}, NEW.includes(id) ? 'New character' : 'Current'), el('span', { class: 'meta' }, NEW.includes(id) ? 'not in the game yet (a stand-in card)' : portraitUrl(id).split('/').pop())));
  if (NEW.includes(id)) { units[0].portrait.style.display = 'none'; units[0].glint.style.display = 'none'; }
  cs.forEach((k, i) => {
    const u = units[i + 1], v = verdictOf(k);
    const bOk = el('button', { onclick: () => verdict(k, 'ok') }, 'Approve'), bNo = el('button', { onclick: () => verdict(k, 'no') }, 'Reject');
    const bFlip = el('button', { title: 'Mirror the figure on import (a candidate that came out facing the wrong way)', onclick: () => { const cur = verdictOf(k) ?? { v: null }; S.verdicts[k.file] = { ...cur, flip: !cur.flip, at: Date.now() }; save(); compare(); } }, 'Flip');
    const queued = S.reroll[`clean:${k.file}`];
    const bClean = el('button', { title: 'Queue a clean pass: the same picture with the ground shadow, panel and signature painted out by Kontext (a new candidate, ~$0.04)', onclick: () => { if (queued) delete S.reroll[`clean:${k.file}`]; else S.reroll[`clean:${k.file}`] = { id, n: k.n }; save(); compare(); } }, queued ? '✓ Clean' : 'Clean');
    bClean.classList.toggle('on', !!queued);
    const note = el('input', { type: 'text', placeholder: 'note (what was wrong)', value: v?.note ?? '', oninput: (e) => { S.verdicts[k.file] = { ...(verdictOf(k) ?? { v: 'no' }), note: e.target.value, at: Date.now() }; save(); } });
    bOk.classList.toggle('on-ok', v?.v === 'ok'); bNo.classList.toggle('on-no', v?.v === 'no'); bFlip.classList.toggle('on', !!v?.flip);
    u.el.classList.toggle('ok', v?.v === 'ok'); u.el.classList.toggle('no', v?.v === 'no');
    u.el.append(el('div', { class: 'lab-cap' }, el('b', {}, `Candidate ${k.n}`), el('span', { class: 'meta' }, `${k.from ? `clean of c${k.from} · ` : ''}${(k.model ?? '').split('/').pop()} · seed ${k.seed ?? '?'} · ${(k.style ?? '').replace('.jpg', '')}${k.hint ? ` · "${k.hint}"` : ''}`),
      el('div', { class: 'verdict' }, bOk, bNo, bFlip, k.from ? null : bClean), note));
  });
  line(units);
  if (!cs.length) stage.firstChild.append(el('p', { class: 'hint', style: 'position:absolute; left:50%; top:30%; transform:translateX(-50%); color:#9a8b6a; font-family:var(--body); text-shadow:0 1px 4px #000;' }, `No candidates for ${nameOf(id)} yet: node tools/gen-art.mjs --only ${id}`));
}
function lineup() {
  const units = IDS.map((id, i) => { const k = S.fresh ? chosen(id) : null; const u = unitFor(id, i, k); u.el.classList.toggle('chosen', !!k && verdictOf(k)?.v === 'ok');
    u.el.append(el('div', { class: 'lab-cap' }, el('b', {}, nameOf(id)), el('span', { class: 'meta' }, k ? `candidate ${k.n}${verdictOf(k)?.v === 'ok' ? ' · approved' : ''}` : S.fresh ? 'current (no candidate)' : 'current'))); return u; });
  line(units);
}
function fight() {
  const units = ['player', ...S.fight].map((id, i) => unitFor(id, i, S.fresh ? chosen(id) : null));
  stage.replaceChildren(el('div', { class: 'battle-line', style: sizing(units.slice(1), units) }, units[0].el, el('div', { class: 'enemy-row' }, ...units.slice(1).map((u) => u.el))));
}
function verdict(k, v) { const cur = verdictOf(k) ?? {}; S.verdicts[k.file] = { ...cur, v: cur.v === v ? null : v, at: Date.now() }; if (!S.verdicts[k.file].v) delete S.verdicts[k.file]; save(); render(); }
function render() {
  document.body.classList.toggle('fight', S.view === 'fight');
  $('room').style.backgroundImage = `url("assets/bg/${S.painting}")`;
  for (const b of $('views').children) b.classList.toggle('on', b.dataset.view === S.view);
  try { ({ compare, lineup, fight })[S.view](); panel(); } catch (e) { // never an empty page: say what broke
    stage.replaceChildren(el('p', { class: 'hint', style: 'position:absolute; left:16px; top:80px; color:#e0a0a0; font-family:var(--body); text-shadow:0 1px 4px #000; max-width:60ch;' }, `The lab hit an error: ${e.message}. Reload in a minute (a fresh build's data may still be on its way), or open the console.`));
    console.error(e);
  }
}

// ---- the top bar ----
for (const [v, label] of [['compare', 'Compare'], ['lineup', 'Line-up'], ['fight', 'Fight']]) $('views').append(el('button', { 'data-view': v, onclick: () => { S.view = v; save(); render(); } }, label));
const sel = $('painting');
for (const f of PAINTINGS) sel.append(el('option', { value: f }, B.roomNames?.[f] ?? f));
sel.value = S.painting; sel.onchange = () => { S.painting = sel.value; save(); render(); };

// ---- the panel ----
const pan = $('panel');
const status = (t) => { const s = $('status'); if (s) s.textContent = t; };
const code = el('textarea', { rows: 8, readonly: '' });
function panel() {
  const id = S.char, rr = S.reroll[id] ?? { n: 3, hint: '', style: '' };
  const counts = (cid) => { const cs = candidates(cid), ok = cs.filter((k) => verdictOf(k)?.v === 'ok').length; return { cs, ok }; };
  const chars = el('div', { id: 'chars' }, ...IDS.map((cid) => { const { cs, ok } = counts(cid); return el('button', { class: `${cid === id ? 'on' : ''} ${ok ? 'ok' : ''}`, onclick: () => { S.char = cid; S.view = 'compare'; save(); render(); } }, el('span', {}, nameOf(cid)), el('span', { class: 'n' }, `${cs.length} cand.${ok ? ` · ${ok} ok` : ''}`)); }));
  const fightSel = S.fight.map((f, i) => el('select', { onchange: (e) => { S.fight[i] = e.target.value; save(); render(); } }, ...Object.keys(DATA.enemies).map((eid) => { const o = el('option', { value: eid }, nameOf(eid)); if (eid === f) o.selected = true; return o; })));
  const total = IDS.reduce((s, cid) => s + candidates(cid).length, 0), approved = IDS.filter((cid) => counts(cid).ok).length;
  pan.replaceChildren(
    el('h2', {}, 'Characters'), el('p', { class: 'note' }, `${total} candidates · ${approved} / ${IDS.length} characters with an approved one`), chars,
    el('h2', {}, 'Showing'),
    el('div', { class: 'row' }, el('button', { class: S.fresh ? 'on' : '', onclick: () => { S.fresh = true; save(); render(); } }, 'New'), el('button', { class: S.fresh ? '' : 'on', onclick: () => { S.fresh = false; save(); render(); } }, 'Current'),
      el('span', { class: 'note' }, 'in the line-up and the fight: the approved candidate (else the latest), or the game\'s current art')),
    el('h2', {}, 'Fight view'), el('div', { class: 'row' }, ...fightSel),
    el('h2', {}, `Re-roll ${nameOf(id)}`),
    el('label', { class: 'c' }, el('span', {}, 'How many'), el('input', { type: 'number', min: 1, max: 8, value: rr.n, oninput: (e) => { S.reroll[id] = { ...rr, n: Number(e.target.value) }; save(); } })),
    el('label', { class: 'c' }, el('span', {}, 'Hint'), el('input', { type: 'text', placeholder: 'added to the prompt, e.g. "flat inked comic look, like a Hellboy panel"', value: rr.hint, oninput: (e) => { S.reroll[id] = { ...(S.reroll[id] ?? rr), hint: e.target.value }; save(); } })),
    el('label', { class: 'c' }, el('span', {}, 'Style'), el('select', { onchange: (e) => { S.reroll[id] = { ...(S.reroll[id] ?? rr), style: e.target.value }; save(); } }, el('option', { value: '' }, 'the tool\'s default'), ...PAINTINGS.map((f) => { const o = el('option', { value: f }, B.roomNames?.[f] ?? f); if (f === rr.style) o.selected = true; return o; }))),
    el('div', { class: 'row' }, el('button', { onclick: () => { S.reroll[id] = { ...(S.reroll[id] ?? rr), on: !(S.reroll[id]?.on) }; save(); render(); } }, S.reroll[id]?.on ? '✓ Re-roll queued' : 'Queue a re-roll'), el('span', { class: 'note' }, 'goes into the JSON below')),
    el('h2', {}, 'Copy'),
    el('div', { class: 'row' }, el('button', { onclick: copy }, 'Copy JSON'), el('button', { onclick: () => { if (confirm('Forget every verdict and re-roll in this browser?')) { S.verdicts = {}; S.reroll = {}; save(); render(); } } }, 'Clear')),
    el('p', { class: 'note' }, 'Copied to the clipboard and downloaded as art-rerender.json. In the repo, with REPLICATE_API_TOKEN set: node tools/gen-art.mjs --rerender art-rerender.json (records the verdicts, generates the re-rolls), then --import, bump and ship. Or paste the JSON to the assistant.'),
    code, el('div', { id: 'status' }));
}
async function copy() {
  const out = { approved: [], rejected: [], reroll: [] };
  for (const id of IDS) {
    for (const k of candidates(id)) { const v = verdictOf(k); if (v?.v === 'ok') out.approved.push({ id, file: k.file, flip: !!v.flip }); if (v?.v === 'no') out.rejected.push({ id, file: k.file, note: v.note ?? '' }); }
    const rr = S.reroll[id]; if (rr?.on) out.reroll.push({ id, n: rr.n || 3, hint: rr.hint ?? '', style: rr.style || undefined });
  }
  for (const [key, q] of Object.entries(S.reroll)) if (key.startsWith('clean:')) out.reroll.push({ id: q.id, clean: q.n });
  const json = JSON.stringify(out, null, 2);
  code.value = json;
  try { await navigator.clipboard.writeText(json); status('Copied.'); } catch { status('Copy the JSON from the box.'); }
  const a = el('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: 'art-rerender.json' });
  document.body.append(a); a.click(); a.remove();
}

addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === '1') S.view = 'compare'; else if (k === '2') S.view = 'lineup'; else if (k === '3') S.view = 'fight';
  else if (k === 'n') S.fresh = true; else if (k === 'c') S.fresh = false;
  else if (k === 'p') { pan.classList.toggle('hidden'); return; }
  else if (k === 'arrowright' || k === 'arrowleft') { S.char = IDS[(IDS.indexOf(S.char) + (k === 'arrowright' ? 1 : IDS.length - 1)) % IDS.length]; S.view = 'compare'; }
  else return;
  save(); render();
});
render();

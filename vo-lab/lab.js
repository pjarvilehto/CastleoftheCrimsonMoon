// vo-lab/lab.js — the VO Lab (see index.html). Loads the registry
// (../assets/data/narration.json) and the rules (../assets/data/audio.json),
// lists every take, plays it as the game would (levelled to
// narration.targetDb through one AudioContext) and keeps the owner's
// verdicts in localStorage: { [file]: { v: 'ok' | 'no', volatility: -1|0|1, shouty: -1|0|1, at: ms } }.
// A verdict older than the take's `rendered` stamp is about the old audio and is ignored;
// such a take shows as RE-RENDERED, awaiting review.
// RE-RENDER = { approved: [files], rerender: [{ file, id, take, volatility, shouty }] }.

const KEY = 'castle-vo-lab';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids.filter((k) => k !== null && k !== false && k !== undefined));
  return n;
};

const [reg, audio] = await Promise.all(['narration', 'audio'].map((f) => fetch(`../assets/data/${f}.json`, { cache: 'no-cache' }).then((r) => r.json())));
const N = audio.narration;
const takes = []; // flat, in script order: { id, take, file, text, measuredDb, settings, approved, row }
for (const [id, list] of Object.entries(reg.lines)) for (const t of list) takes.push({ id, ...t });

let verdicts = {};
try { verdicts = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { verdicts = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(verdicts)); } catch { /* private mode */ } };
// the registry's approvals are the starting point; this browser's verdicts override,
// unless the take was re-rendered since (the verdict was about the old audio)
const stale = (t, v) => !!(t.rendered && (!v?.at || v.at < Date.parse(t.rendered)));
const verdictOf = (t) => { const v = verdicts[t.file]; return v && !stale(t, v) ? v : t.approved ? { v: 'ok' } : null; };
const redone = (t) => t.approved === false && stale(t, verdicts[t.file]);

// ---- audio: one context, decoded on demand, levelled like the game ----
let ctx = null, playing = null, playAll = false;
const buffers = {};
async function play(i) {
  setCurrent(i);
  const t = takes[i];
  ctx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
  await ctx.resume?.();
  stopSound();
  buffers[t.file] ??= fetch(`../${t.file}${t.rendered ? `?r=${encodeURIComponent(t.rendered)}` : ''}`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b));
  let buffer;
  try { buffer = await buffers[t.file]; } catch { delete buffers[t.file]; return; }
  const gain = ctx.createGain();
  gain.gain.value = 10 ** ((N.targetDb - t.measuredDb) / 20);
  gain.connect(ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(gain);
  src.start();
  playing = { src, i };
  src.onended = () => {
    if (playing?.src !== src) return;
    playing = null;
    if (playAll && i + 1 < takes.length) setTimeout(() => { if (playAll) play(i + 1); }, 650);
    else playAll = false;
  };
}
function stopSound() { try { playing?.src.stop(); } catch { /* done */ } playing = null; }
function stopAll() { playAll = false; stopSound(); }

// ---- the list ----
let current = 0;
function setCurrent(i) {
  takes[current]?.row.classList.remove('current');
  current = Math.max(0, Math.min(takes.length - 1, i));
  takes[current].row.classList.add('current');
  takes[current].row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function setVerdict(i, v) {
  const t = takes[i];
  const cur = verdicts[t.file] ?? {};
  verdicts[t.file] = v === 'no' ? { v: 'no', volatility: cur.volatility ?? 0, shouty: cur.shouty ?? 0, at: Date.now() } : { v: 'ok', at: Date.now() };
  save(); paint(i);
}
function nudge(i, key, dir) {
  const t = takes[i];
  if (verdictOf(t)?.v !== 'no') setVerdict(i, 'no');
  const cur = verdicts[t.file];
  cur[key] = cur[key] === dir ? 0 : dir; // click again to clear
  save(); paint(i);
}
function paint(i) {
  const t = takes[i], v = verdictOf(t), row = t.row;
  row.classList.toggle('ok', v?.v === 'ok');
  row.classList.toggle('no', v?.v === 'no');
  row.classList.toggle('redone', redone(t));
  row.querySelector('.badge').textContent = redone(t) ? `RE-RENDERED ${t.rendered.slice(0, 10)} · awaiting review` : t.rendered ? `re-rendered ${t.rendered.slice(0, 10)}` : '';
  row.querySelector('.b-ok').classList.toggle('on-ok', v?.v === 'ok');
  row.querySelector('.b-no').classList.toggle('on-no', v?.v === 'no');
  const nudges = row.querySelector('.nudges');
  nudges.classList.toggle('hidden', v?.v !== 'no');
  for (const b of nudges.querySelectorAll('button')) b.classList.toggle('on', v?.v === 'no' && v[b.dataset.key] === Number(b.dataset.dir));
  count();
}
function count() {
  const vs = takes.map(verdictOf);
  const ok = vs.filter((v) => v?.v === 'ok').length, no = vs.filter((v) => v?.v === 'no').length, re = takes.filter(redone).length;
  $('count').innerHTML = `<b>${ok + no}</b> / ${takes.length} reviewed · <b>${ok}</b> approved · <b>${no}</b> to re-render · <b>${re}</b> re-rendered awaiting review · <b>${takes.length - ok - no}</b> left`;
  $('rerender').disabled = no === 0 && ok === 0;
}
const fmt = (s) => s ? `stab ${s.stability} · style ${s.style} · speed ${s.speed}` : '';
const root = $('lines');
let i = 0;
for (const [id, list] of Object.entries(reg.lines)) {
  const meta = reg.meta?.[id] ?? {};
  const rule = N.lines?.[id];
  const sec = el('section', { class: 'line' },
    el('div', { class: 'line-head' }, el('span', { class: 'id' }, id), el('span', { class: 'when' }, meta.when ?? ''), el('span', { class: 'often' }, `${meta.often ?? ''}${rule ? ` (chance ${rule.chance})` : ''}`)));
  for (const t of list) {
    const k = i++;
    const T = takes[k];
    const nb = (label, key, dir) => el('button', { class: 'small', 'data-key': key, 'data-dir': String(dir), onclick: () => nudge(k, key, dir) }, label);
    T.row = el('div', { class: 'take', onclick: () => setCurrent(k) },
      el('span', { class: 'n' }, String(t.take)),
      el('span', { class: 'text' }, `“${t.text}”`),
      el('button', { class: 'play', onclick: (e) => { e.stopPropagation(); playAll = false; play(k); } }, '▶ Play'),
      el('div', { class: 'verdict' },
        el('button', { class: 'b-ok small', onclick: (e) => { e.stopPropagation(); setVerdict(k, 'ok'); } }, 'Approve'),
        el('button', { class: 'b-no small', onclick: (e) => { e.stopPropagation(); setVerdict(k, 'no'); } }, 'Disapprove')),
      el('span', { class: 'meta' }, el('b', { class: 'badge' }), ` ${fmt(t.settings)} · level ${t.measuredDb} dB · ${t.file.split('/').pop()}`),
      el('div', { class: 'nudges hidden' },
        el('span', { class: 'pair' }, el('span', {}, 'Volatility'), nb('Less', 'volatility', -1), nb('More', 'volatility', 1)),
        el('span', { class: 'pair' }, el('span', {}, 'Shouty'), nb('Less', 'shouty', -1), nb('More', 'shouty', 1)),
        el('span', { class: 'hint' }, 'none = a fresh take at the same settings')));
    sec.append(T.row);
  }
  root.append(sec);
}
takes.forEach((_, k) => paint(k));
setCurrent(0);

// ---- controls ----
$('playAll').onclick = () => { playAll = true; play(current); };
$('stop').onclick = stopAll;
$('nextUnreviewed').onclick = () => { const k = takes.findIndex((t, j) => j > current && !verdictOf(t)) ; setCurrent(k >= 0 ? k : takes.findIndex((t) => !verdictOf(t))); };
$('nextRedone').onclick = () => { const k = takes.findIndex((t, j) => j > current && redone(t)); setCurrent(k >= 0 ? k : takes.findIndex(redone)); };
$('clear').onclick = () => { if (confirm('Forget every verdict in this browser?')) { verdicts = {}; save(); takes.forEach((_, k) => paint(k)); } };
$('rerender').onclick = async () => {
  const out = { approved: [], rerender: [] };
  for (const t of takes) {
    const v = verdictOf(t);
    if (v?.v === 'ok' && !t.approved) out.approved.push(t.file);
    if (v?.v === 'no') out.rerender.push({ file: t.file, id: t.id, take: t.take, volatility: v.volatility ?? 0, shouty: v.shouty ?? 0 });
  }
  const json = JSON.stringify(out, null, 2);
  $('out').textContent = json;
  $('exportBox').classList.remove('hidden');
  try { await navigator.clipboard.writeText(json); } catch { /* no clipboard: the box has it */ }
  const a = el('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: 'vo-rerender.json' });
  document.body.append(a); a.click(); a.remove();
};
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); playAll = false; play(current); }
  else if (k === 'a') { setVerdict(current, 'ok'); if (!playAll) setCurrent(current + 1); }
  else if (k === 'd') setVerdict(current, 'no');
  else if (k === '1') nudge(current, 'volatility', -1);
  else if (k === '2') nudge(current, 'volatility', 1);
  else if (k === '3') nudge(current, 'shouty', -1);
  else if (k === '4') nudge(current, 'shouty', 1);
  else if (k === 'j' || k === 'arrowdown') { e.preventDefault(); setCurrent(current + 1); }
  else if (k === 'k' || k === 'arrowup') { e.preventDefault(); setCurrent(current - 1); }
  else if (k === 'escape') stopAll();
});

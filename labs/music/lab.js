// labs/music/lab.js — the Music Lab (0.00273, see index.html). The takes
// tools/gen-score.mjs made (assets/data/music-art.json) beside the bed the
// game plays (audio.json music.tracks, its loop as the game loops it), over
// the bed's painting. One AudioContext: each take is an <audio> through a
// gain (LEVEL: its measured LUFS to TARGET_LUFS) and the master volume.
// Verdicts live in localStorage: { [file]: { v: 'ok' | 'no' | null, note } };
// COPY JSON = { approved: [{ id, file, note, current? }], rejected: [{ id, file, note }],
// reroll: [{ id, model, n, hint, image }] } for
// node tools/gen-score.mjs --rerender. Nothing here touches the game.

const KEY = 'castle-music-lab';
const TARGET_LUFS = -20; // every take is played at this integrated loudness when LEVEL is on (gain capped at +12 dB)
const MODELS = [['eleven', 'ElevenLabs Music'], ['lyria', 'Lyria 3 Pro'], ['stable', 'Stable Audio 2.5']];
const ORDER = ['title', 'combat', 'boss', 'shrine', 'end'];
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v); } n.append(...kids.filter((k) => k != null && k !== false)); return n; };
const fresh = (f) => fetch(`${f}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

const [reg, audio, bgs] = await Promise.all([fresh('assets/data/music-art.json'), fresh('assets/data/audio.json'), fresh('assets/data/backgrounds.json')]);
const BEDS = (reg?.beds) ?? {};
const TRACKS = audio?.music?.tracks ?? {};
const IDS = [...new Set([...ORDER.filter((id) => TRACKS[id] || BEDS[id]), ...Object.keys(BEDS)])];
const PAINT = { title: bgs?.title, combat: 'dungeon_torch_corridor.jpg', boss: bgs?.bosses?.[0], shrine: bgs?.shrine, end: bgs?.death };

// ---- state (this browser) ----
let S = { bed: IDS[0], verdicts: {}, reroll: [], sync: true, blind: false, level: true, panel: true, volume: 0.8, revealed: {}, seeds: {} };
try { S = { ...S, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* fresh */ }
if (!IDS.includes(S.bed)) S.bed = IDS[0];
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ } };
const verdictOf = (t) => (S.verdicts[t.file] ?? (t.verdict ? { v: t.verdict, note: t.note ?? '' } : null));

/** A bed's takes: the game's own first, then the candidates; blind = a fixed shuffle per bed, lettered. */
function takesOf(id) {
  const b = BEDS[id] ?? {}, tr = TRACKS[id];
  const cur = tr ? [{ file: tr.file, current: true, label: 'The procedural bed', lufs: b.current?.file === tr.file ? b.current.lufs : null, seconds: b.current?.seconds, loopS: tr.loopS }] : [];
  const list = [...cur, ...(b.candidates ?? []).map((k) => ({ ...k }))];
  if (!S.blind) return list;
  const seed = (S.seeds[id] ??= Math.floor(Math.random() * 1e9));
  let x = seed;
  const rnd = () => ((x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
const titleOf = (t, i) => (S.blind && !S.revealed[S.bed] ? `Take ${String.fromCharCode(65 + i)}` : t.current ? 'Now in the game' : `Take ${t.n}`);
const metaOf = (t) => {
  if (S.blind && !S.revealed[S.bed]) return `${fmt(t.seconds)}${t.lufs != null ? ` · ${t.lufs} LUFS` : ''}`;
  if (t.current) return `procedural (tools/gen-music.py) · loops at ${fmt(t.loopS)}${t.lufs != null ? ` · ${t.lufs} LUFS` : ''}`;
  return `${t.label}${t.image ? ' + the painting' : ''} · ${fmt(t.seconds)} of ${fmt(t.asked)} asked · ${t.lufs} LUFS${t.hint ? ` · "${t.hint}"` : ''}`;
};
function fmt(s) { if (!Number.isFinite(s)) return '–'; s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

// ---- audio ----
let ctx = null, master = null;
const players = new Map(); // file -> { a, gain }
let playing = null; // the take playing (or paused last)
function ensureCtx() {
  if (ctx) return ctx;
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = S.volume; master.connect(ctx.destination);
  return ctx;
}
function playerOf(t) {
  ensureCtx();
  let p = players.get(t.file);
  if (!p) {
    const a = new Audio(t.file);
    a.preload = 'auto';
    a.loop = !t.current; // a candidate wraps whole (how its end meets its start); the game's bed loops at loopS like the game
    if (t.current) a.addEventListener('timeupdate', () => { if (a.currentTime >= t.loopS) a.currentTime -= t.loopS; });
    const gain = ctx.createGain();
    ctx.createMediaElementSource(a).connect(gain).connect(master);
    p = { a, gain };
    players.set(t.file, p);
  }
  p.gain.gain.value = S.level && Number.isFinite(t.lufs) ? Math.min(4, 10 ** ((TARGET_LUFS - t.lufs) / 20)) : 1;
  return p;
}
function play(t, at = null) {
  ensureCtx().resume();
  const prev = playing && players.get(playing.file);
  const pos = at ?? (S.sync && prev && playing.file !== t.file ? prev.a.currentTime : null);
  for (const [f, q] of players) if (f !== t.file) q.a.pause();
  const p = playerOf(t);
  if (pos != null) { const go = () => { p.a.currentTime = Math.min(pos, (p.a.duration || pos + 1) - 0.1); }; if (p.a.readyState >= 1) go(); else p.a.addEventListener('loadedmetadata', go, { once: true }); }
  p.a.play();
  playing = t;
  marks();
}
function toggle(t) { const p = players.get(t.file); if (playing?.file === t.file && p && !p.a.paused) { p.a.pause(); marks(); } else play(t); }
function marks() { for (const n of document.querySelectorAll('.take')) { const p = players.get(n.dataset.file); n.classList.toggle('playing', !!p && !p.a.paused); n.querySelector('.play').textContent = p && !p.a.paused ? '❚❚' : '▶'; } }

// ---- waveforms ----
const peaks = new Map();
async function peaksOf(file) {
  if (peaks.has(file)) return peaks.get(file);
  const job = (async () => {
    const buf = await fetch(file).then((r) => r.arrayBuffer());
    const data = await ensureCtx().decodeAudioData(buf);
    const N = 400, ch = [...Array(data.numberOfChannels).keys()].map((c) => data.getChannelData(c)), step = Math.floor(data.length / N);
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 0; for (const d of ch) for (let j = i * step; j < (i + 1) * step; j += 16) m = Math.max(m, Math.abs(d[j])); out[i] = m; }
    return { peaks: out, duration: data.duration };
  })();
  peaks.set(file, job);
  return job;
}
async function drawWave(canvas, t) {
  const { peaks: p } = await peaksOf(t.file);
  const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height, gain = S.level && Number.isFinite(t.lufs) ? Math.min(4, 10 ** ((TARGET_LUFS - t.lufs) / 20)) : 1;
  g.fillStyle = t.current && !(S.blind && !S.revealed[S.bed]) ? 'rgba(79,154,92,0.75)' : 'rgba(201,162,39,0.65)';
  for (let i = 0; i < p.length; i++) { const v = Math.min(1, p[i] * gain) * h * 0.48; g.fillRect((i / p.length) * w, h / 2 - v, Math.max(1, w / p.length - 0.5), v * 2); }
}

// ---- views ----
function render() {
  const id = S.bed, b = BEDS[id] ?? {};
  const paint = b.painting ?? PAINT[id];
  $('room').style.backgroundImage = paint ? `url("assets/bg/${paint}")` : 'none';
  $('beds').replaceChildren(...IDS.map((bid) => el('button', { class: bid === id ? 'on' : '', onclick: () => { S.bed = bid; save(); render(); } }, BEDS[bid]?.name ?? bid)));
  $('toggles').replaceChildren(...[
    el('button', { class: S.sync ? 'on' : '', title: 'Switching takes keeps the playing position (an A/B at the same bar)', onclick: () => { S.sync = !S.sync; save(); render(); } }, 'Sync'),
    el('button', { class: S.level ? 'on' : '', title: `Every take at ${TARGET_LUFS} LUFS (its measured loudness), so the louder take does not win`, onclick: () => { S.level = !S.level; save(); for (const t of takesOf(S.bed)) if (players.has(t.file)) playerOf(t); render(); } }, 'Level'),
    el('button', { class: S.blind ? 'on' : '', title: 'Shuffle the takes (the game\'s own among them) and hide the models', onclick: () => { S.blind = !S.blind; save(); render(); } }, 'Blind'),
    S.blind ? el('button', { class: S.revealed[id] ? 'on' : '', onclick: () => { S.revealed[id] = !S.revealed[id]; save(); render(); } }, S.revealed[id] ? 'Hide' : 'Reveal') : null].filter(Boolean));
  $('brief').replaceChildren(el('b', {}, b.name ?? id), el('span', {}, b.line ?? ''));
  const takes = takesOf(id);
  $('takes').replaceChildren(...takes.map((t, i) => tile(t, i)));
  if (!b.candidates?.length) $('takes').append(el('p', { class: 'note', style: 'text-shadow:0 1px 4px #000' }, `No generated takes for this bed yet: node tools/gen-score.mjs --only ${id}`));
  requestAnimationFrame(() => { for (const c of document.querySelectorAll('.wave canvas')) drawWave(c, takes[Number(c.dataset.i)]).catch(() => {}); });
  marks();
  panel();
}
function tile(t, i) {
  const v = verdictOf(t), hidden = S.blind && !S.revealed[S.bed];
  const canvas = el('canvas', { 'data-i': i }), head = el('div', { class: 'head-line' }), time = el('span', { class: 'time' });
  const wave = el('div', { class: 'wave', title: 'Click to play from here', onclick: (e) => { const r = wave.getBoundingClientRect(), d = players.get(t.file)?.a.duration || t.seconds; play(t, ((e.clientX - r.left) / r.width) * d); } }, canvas, head, time);
  if (t.current && !hidden && Number.isFinite(t.seconds)) wave.append(el('span', { class: 'loopmark', style: `left:${(t.loopS / t.seconds) * 100}%`, title: 'The game loops back here' }));
  wave.dataset.file = t.file;
  const kids = [el('div', { class: 'head' }, el('button', { class: 'play', onclick: () => toggle(t) }, '▶'), el('span', { class: 'name' }, el('b', {}, titleOf(t, i)), el('span', { class: 'meta' }, metaOf(t))), el('span', { class: 'key' }, i < 9 ? String(i + 1) : '')), wave];
  { // (the game's own bed gets a verdict too: in BLIND it must not stand out, and "the old one won" is an answer)
    const bOk = el('button', { class: v?.v === 'ok' ? 'on-ok' : '', onclick: () => verdict(t, 'ok') }, 'Approve'), bNo = el('button', { class: v?.v === 'no' ? 'on-no' : '', onclick: () => verdict(t, 'no') }, 'Reject');
    kids.push(el('div', { class: 'verdict' }, bOk, bNo),
      el('input', { type: 'text', placeholder: 'note: what works, what is wrong, a direction', value: v?.note ?? '', oninput: (e) => { S.verdicts[t.file] = { ...(verdictOf(t) ?? { v: null }), note: e.target.value }; save(); } }));
    if (!hidden && !t.current) kids.push(el('details', {}, el('summary', {}, t.plan ? 'The composition plan sent' : 'The prompt sent'), el('pre', {}, t.plan ? JSON.stringify(t.plan, null, 1) : t.prompt ?? '')));
  }
  const n = el('div', { class: `take${t.current && !hidden ? ' current' : ''}${v?.v === 'ok' ? ' ok' : v?.v === 'no' ? ' no' : ''}`, 'data-file': t.file }, ...kids);
  return n;
}
function verdict(t, v) { const cur = verdictOf(t) ?? {}; S.verdicts[t.file] = { ...cur, v: cur.v === v ? null : v }; save(); render(); }
function tick() {
  for (const w of document.querySelectorAll('.wave')) {
    const p = players.get(w.dataset.file);
    if (!p) continue;
    const d = p.a.duration || 1;
    w.querySelector('.head-line').style.left = `${(p.a.currentTime / d) * 100}%`;
    w.querySelector('.time').textContent = `${fmt(p.a.currentTime)} / ${fmt(d)}`;
  }
  requestAnimationFrame(tick);
}

// ---- the panel ----
const code = el('textarea', { rows: 8, readonly: '' });
const status = (t) => { const s = $('status'); if (s) s.textContent = t; };
let draft = { model: 'eleven', n: 2, hint: '', image: false };
function panel() {
  const id = S.bed;
  const all = Object.entries(BEDS).flatMap(([bid, b]) => (b.candidates ?? []).map((k) => ({ bid, ...k })));
  const score = MODELS.map(([m, name]) => { const mine = all.filter((k) => k.label === name); const ok = mine.filter((k) => verdictOf(k)?.v === 'ok').length, no = mine.filter((k) => verdictOf(k)?.v === 'no').length; return el('div', {}, `${name}: `, el('b', {}, `${ok} approved`), ` · ${no} rejected · ${mine.length} takes`); });
  const queued = S.reroll.map((r, i) => el('div', { class: 'row' }, el('span', {}, `${BEDS[r.id]?.name ?? r.id} · ${MODELS.find(([m]) => m === r.model)?.[1]} ×${r.n}${r.image ? ' + painting' : ''}${r.hint ? ` · "${r.hint}"` : ''}`), el('button', { onclick: () => { S.reroll.splice(i, 1); save(); panel(); } }, '×')));
  $('panel').replaceChildren(...[
    el('h2', {}, 'Listening'),
    el('label', { class: 'c' }, el('span', {}, 'Volume'), el('input', { id: 'volume', type: 'range', min: 0, max: 1, step: 0.01, value: S.volume, oninput: (e) => { S.volume = Number(e.target.value); if (master) master.gain.value = S.volume; save(); } })),
    el('p', { class: 'note' }, `LEVEL plays every take at ${TARGET_LUFS} LUFS. A generated take loops whole, so you hear its end run into its start (the import will cut a cleaner seam); the game's own bed loops at its loop point, marked on its waveform.`),
    el('h2', {}, 'The bake-off'), ...score,
    el('h2', {}, `Re-roll ${BEDS[id]?.name ?? id}`),
    el('label', { class: 'c' }, el('span', {}, 'Model'), el('select', { onchange: (e) => { draft.model = e.target.value; panel(); } }, ...MODELS.map(([m, name]) => { const o = el('option', { value: m }, name); if (m === draft.model) o.selected = true; return o; }))),
    el('label', { class: 'c' }, el('span', {}, 'How many'), el('input', { type: 'number', min: 1, max: 6, value: draft.n, oninput: (e) => { draft.n = Number(e.target.value); } })),
    el('label', { class: 'c' }, el('span', {}, 'Hint'), el('input', { type: 'text', placeholder: 'e.g. "more organ, slower"', value: draft.hint, oninput: (e) => { draft.hint = e.target.value; } })),
    draft.model === 'lyria' ? el('label', { class: 'c' }, el('span', {}, 'Painting'), el('span', {}, el('input', { type: 'checkbox', checked: draft.image ? '' : false, onchange: (e) => { draft.image = e.target.checked; } }), ' score the bed\'s painting')) : null,
    el('div', { class: 'row' }, el('button', { onclick: () => { S.reroll.push({ id, model: draft.model, n: draft.n || 1, hint: draft.hint, image: draft.model === 'lyria' && draft.image }); save(); panel(); } }, 'Queue'), el('span', { class: 'note' }, 'goes into the JSON below')),
    ...queued,
    el('h2', {}, 'Copy'),
    el('div', { class: 'row' }, el('button', { onclick: copy }, 'Copy JSON'), el('button', { onclick: () => { if (confirm('Forget every verdict and queued re-roll in this browser?')) { S.verdicts = {}; S.reroll = []; save(); render(); } } }, 'Clear')),
    el('p', { class: 'note' }, 'Copied to the clipboard and downloaded as music-rerender.json. Paste it to the assistant, or in the repo: node tools/gen-score.mjs --rerender music-rerender.json'),
    code, el('div', { id: 'status' })].filter(Boolean));
}
async function copy() {
  const out = { approved: [], rejected: [], reroll: S.reroll };
  for (const [id, b] of Object.entries(BEDS)) for (const k of [...(TRACKS[id] ? [{ file: TRACKS[id].file, current: true }] : []), ...(b.candidates ?? [])]) { const v = verdictOf(k); const c = k.current ? { current: true } : {}; if (v?.v === 'ok') out.approved.push({ id, file: k.file, ...c, note: v.note ?? '' }); if (v?.v === 'no') out.rejected.push({ id, file: k.file, ...c, note: v.note ?? '' }); }
  const json = JSON.stringify(out, null, 2);
  code.value = json;
  try { await navigator.clipboard.writeText(json); status('Copied.'); } catch { status('Copy the JSON from the box.'); }
  const a = el('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: 'music-rerender.json' });
  document.body.append(a); a.click(); a.remove();
}

addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase(), takes = takesOf(S.bed);
  if (k === 'arrowright' || k === 'arrowleft') { S.bed = IDS[(IDS.indexOf(S.bed) + (k === 'arrowright' ? 1 : IDS.length - 1)) % IDS.length]; }
  else if (/^[1-9]$/.test(k)) { const t = takes[Number(k) - 1]; if (t) play(t); return; }
  else if (k === ' ') { e.preventDefault(); if (playing) toggle(playing); else if (takes[0]) play(takes[0]); return; }
  else if (k === 's') S.sync = !S.sync;
  else if (k === 'b') S.blind = !S.blind;
  else if (k === 'l') { S.level = !S.level; for (const t of takes) if (players.has(t.file)) playerOf(t); }
  else if (k === 'p') { S.panel = !S.panel; document.body.classList.toggle('nopanel', !S.panel); save(); return; }
  else return;
  save(); render();
});
document.body.classList.toggle('nopanel', !S.panel);
addEventListener('resize', () => { const takes = takesOf(S.bed); for (const c of document.querySelectorAll('.wave canvas')) drawWave(c, takes[Number(c.dataset.i)]).catch(() => {}); });
render();
tick();

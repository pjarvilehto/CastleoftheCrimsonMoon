// analytics/dashboard.js — the play-stats page at /analytics/ (0.095).
// Players: every tester, collected automatically (0.102: the game sends
// its run history to the collector Worker, collector/worker.js, named in
// assets/data/telemetry.json), this browser's own save (read live from
// localStorage) and any save codes pasted here. One player shows once:
// matched by the save's anonymous playerId (this browser > collected >
// pasted code). Names given here stay in this browser.

import { LOCAL_SAVE_KEY, decodeSave, sanitizeProfile, allRuns, filterRuns, summarize, countBy, endRooms, bossClears,
  boonStats, byBuild, depthSeries, fmtDuration, toCsv } from './stats.js';
import { esc, bars, lines, columns } from './charts.js';
import { levelFromStats } from '../src/shared/level.js';

const STORE = 'castle-analytics-players-v1';
const NAMES = 'castle-analytics-names-v1';   // playerId -> name (collected players)
const KEY = 'castle-analytics-key-v1';       // the collector's READ_KEY
const data = { enemies: {}, items: {}, offers: {}, build: '?', endpoint: '' };
const server = { status: 'off', records: [], at: 0, version: null, busy: false, delta: null }; // off | loading | ok | key | error
const view = { player: 'all', build: 'all' };
let players = [];
let message = '';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

const names = () => read(NAMES) ?? {};
const country = (c) => (/^[A-Z]{2}$/.test(c ?? '') ? c : '');

function loadPlayers() {
  const local = read(LOCAL_SAVE_KEY);
  const mineP = local?.records ? sanitizeProfile(local) : null;
  const mine = mineP ? [{ key: 'local', label: mineP.name ? `${mineP.name} (this browser)` : 'This browser', source: 'local', profile: mineP }] : [];
  const nm = names();
  const collected = server.records.map((r) => {
    const profile = sanitizeProfile(r.profile), id = profile.playerId ?? '?';
    return { key: `s:${id}`, source: 'server', profile, country: country(r.country), firstSeen: Number(r.firstSeen) || 0,
      // The name the player typed wins over a rename made here (0.122);
      // renames only label players who never entered one.
      label: String((profile.name ? null : nm[id]) ?? `${profile.name || `Player ${id.slice(0, 4).toUpperCase()}`}${country(r.country) ? ` · ${country(r.country)}` : ''}`).slice(0, 40) };
  });
  // stored players are re-sanitised too: codes imported before 0.097 were kept as-is
  const stored = Array.isArray(read(STORE)) ? read(STORE) : [];
  const imported = stored.map((s) => ({
    key: String(s.key), importedAt: Number(s.importedAt) || 0, source: 'code', profile: sanitizeProfile(s.profile) }))
    .map((pl, i) => ({ ...pl, label: (pl.profile.name || String(stored[i].label ?? 'Player')).slice(0, 40) }));
  const seen = new Set();
  players = [...mine, ...collected, ...imported].filter((pl) => {
    const id = pl.profile.playerId;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// Every collected player from the Worker (0.102).
async function loadServer() {
  if (!data.endpoint) { server.status = 'off'; return; }
  server.status = 'loading';
  try {
    const key = read(KEY) ?? '';
    const base = data.endpoint.replace(/\/$/, '');
    // 0.119: the key goes in a header (kept out of URLs and logs). A
    // collector deployed before 0.119 rejects that header's CORS preflight
    // (or ignores the header: 401) — then fall back to the old ?key= once.
    const viaQuery = () => fetch(`${base}/players?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    let r;
    try {
      r = await fetch(`${base}/players`, { cache: 'no-store', headers: { authorization: `Bearer ${key}` } });
      if (r.status === 401 && key) r = await viaQuery();
    } catch {
      r = await viaQuery();
    }
    server.version = await fetch(`${base}/version`, { cache: 'no-store' }).then((v) => (v.ok ? v.json() : null)).then((v) => v?.version ?? null).catch(() => null);
    if (r.status === 401) { server.status = 'key'; server.records = []; return; }
    const body = await r.json();
    server.records = Array.isArray(body?.players) ? body.players : [];
    server.status = 'ok';
    server.at = Date.now();
  } catch {
    server.status = 'error';
  }
}

// Refresh shows that it happened (0.120): the button reads "Refreshing…"
// while it loads, then the card names the exact time and what changed —
// before, an unchanged result looked like a dead button.
async function refresh() {
  const before = server.records.reduce((n, r) => n + (r.profile?.history?.length ?? 0), 0);
  server.busy = true;
  render();
  await loadServer();
  server.busy = false;
  const after = server.records.reduce((n, r) => n + (r.profile?.history?.length ?? 0), 0);
  server.delta = server.status === 'ok' && before ? after - before : null;
  loadPlayers();
  render();
}

function serverCard() {
  const text = {
    off: 'Automatic collection is not set up yet (collector/README.md) — until then, add testers by save code below.',
    loading: 'Loading collected players…',
    ok: `Collected automatically: ${server.records.length} player${server.records.length === 1 ? '' : 's'} · updated ${server.at ? new Date(server.at).toLocaleTimeString() : '—'}${server.delta === null || server.delta === undefined ? '' : server.delta > 0 ? ` (+${server.delta} new run${server.delta === 1 ? '' : 's'})` : ' (no new runs)'}.`,
    key: 'Enter the stats key (the collector’s READ_KEY) to see collected players.',
    error: 'Could not reach the stats collector — showing this browser and pasted codes only.',
  }[server.status];
  // the deployed collector is pasted in by hand: say when it's behind the repo
  const stale = server.status === 'ok' && data.collectorVersion && server.version !== data.collectorVersion
    ? `<p class="help warn">The stats collector is out of date (deployed: ${esc(server.version ?? 'before 0.119')}, current: ${esc(data.collectorVersion)}) — paste collector/worker.js into the Worker's Edit code and deploy.</p>` : '';
  return `<section class="card add">
    <h2>Testers</h2>${stale}
    <p class="help">${esc(text)} Every tester playing the live site is included automatically — no save export needed. Players show the name they typed in the game — that always wins. Players who haven't entered one (saves from before 0.109 until their next visit) show an id; you can rename those in the Players table (your names stay in this browser).</p>
    <div class="add-row">
      ${server.status === 'key' ? '<input id="read-key" type="password" placeholder="Stats key"><button data-act="key">Unlock</button>' : ''}
      ${data.endpoint ? `<button data-act="refresh"${server.busy ? ' disabled' : ''}>${server.busy ? 'Refreshing…' : 'Refresh'}</button>` : ''}
    </div>
  </section>`;
}

function saveImported() {
  const ok = write(STORE, players.filter((p) => p.source === 'code')
    .map(({ key, label, profile, importedAt }) => ({ key, label, profile, importedAt })));
  if (!ok) message = 'Could not save the imported players in this browser (storage full or blocked).';
}

// A pasted code: a new player, or a newer save of one already here
// (same playerId) — then it replaces the old one.
function addCode(code, label) {
  const profile = decodeSave(code);
  if (!profile) return 'That is not a save code. Testers copy it from the title screen: Export Save.';
  const id = profile.playerId;
  if (id && players.some((p) => p.source === 'local' && p.profile.playerId === id)) return 'That is this browser’s own save — it is already shown.';
  const same = id && players.find((p) => p.source === 'code' && p.profile.playerId === id);
  if (same) Object.assign(same, { profile, importedAt: Date.now(), label: profile.name || label || same.label });
  else players.push({ key: `p${Date.now().toString(36)}`, source: 'code', profile, importedAt: Date.now(), label: profile.name || label || `Player ${id ? id.slice(0, 4).toUpperCase() : players.length + 1}` });
  saveImported();
  return `${same ? 'Updated' : 'Added'} ${profile.name || label || same?.label || 'player'}: ${(profile.history ?? []).length} recorded runs.`;
}

const enemyName = (id) => data.enemies[id]?.name ?? id;
const itemName = (id) => (id ? data.items[id]?.name ?? id : '—');
const boonName = (id) => (data.offers[id] ? `${data.offers[id].icon} ${data.offers[id].buff}` : id);
const labelOf = (key) => players.find((p) => p.key === key)?.label ?? key;
const pct = (x) => `${Math.round(x * 100)}%`;
const level = levelFromStats;
function ago(t) {
  if (!t) return '—';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : new Date(t).toLocaleDateString();
}

function render() {
  const runsAll = allRuns(players);
  const builds = [...new Set(runsAll.map((r) => r.build))].sort().reverse();
  const runs = filterRuns(runsAll, view);
  const shown = view.player === 'all' ? players : players.filter((p) => p.key === view.player);
  const s = summarize(runs);
  const card = (title, body, wide = false) => `<section class="card${wide ? ' wide' : ''}"><h2>${title}</h2>${body}</section>`;
  const kpi = (label, value, sub = '') => `<div class="kpi"><span>${label}</span><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const opt = (v, cur, text) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(text)}</option>`;

  document.getElementById('dash').innerHTML = `
  <header>
    <h1>Play Stats</h1>
    <p class="sub">Castle of the Crimson Moon · live build ${esc(data.build)} · ${players.length} player${players.length === 1 ? '' : 's'}</p>
  </header>
  ${serverCard()}
  <section class="card add">
    <h2>Add a save code</h2>
    <p class="help">Only needed for players the collector can’t see (e.g. the staging site): title screen → <b>Export Save</b> → paste the code here. A newer code from the same player replaces the old one. Runs are recorded from build 0.095 on.</p>
    <div class="add-row">
      <input id="add-label" placeholder="Name (optional)" maxlength="40">
      <textarea id="add-code" rows="2" placeholder="Paste a save code"></textarea>
      <button data-act="add">Add</button>
    </div>
    ${message ? `<p class="msg">${esc(message)}</p>` : ''}
  </section>
  <section class="filters">
    <label>Player <select data-view="player">${opt('all', view.player, 'All players')}${players.map((p) => opt(p.key, view.player, p.label)).join('')}</select></label>
    <label>Build <select data-view="build">${opt('all', view.build, 'All builds')}${builds.map((b) => opt(b, view.build, b)).join('')}</select></label>
    <button data-act="csv"${runs.length ? '' : ' disabled'}>Download runs (CSV)</button>
  </section>
  <section class="kpis">
    ${kpi('Runs', s.runs, `${s.deaths} died · ${s.retreats} retreated`)}
    ${kpi('Play time', fmtDuration(s.playMs), 'in the dungeon')}
    ${kpi('Avg depth', s.avgRoom.toFixed(1), `best room ${s.bestRoom}`)}
    ${kpi('Death rate', pct(s.deathRate))}
    ${kpi('Bosses slain', s.bosses)}
    ${kpi('Kills', s.kills)}
    ${kpi('Coins banked', s.banked)}
    ${kpi('Relic runs', s.relics)}
  </section>
  <div class="grid">
    ${card('Depth per run', lines(depthSeries(shown, runs), { xLabel: 'run #', yLabel: 'room' }))}
    ${card('Where runs end', columns(endRooms(runs).map((r) => ({ x: r.room, parts: [r.death, r.retreat] })), { names: ['died', 'retreated'], xLabel: 'room', yLabel: 'runs' }))}
    ${card('What kills players', bars(countBy(runs, 'killedBy').map(([id, n]) => ({ label: enemyName(id), value: n })), { color: '#c14b4b' }))}
    ${card('Boss rooms', bars(bossClears(runs).map((b) => ({ label: `Room ${b.room}`, value: b.reached ? b.cleared / b.reached : 0, note: `${b.cleared}/${b.reached} runs` })), { fmt: pct }))}
    ${card('Shrine boons', bars(boonStats(runs).map((b) => ({ label: b.boon === '(none)' ? 'no boon' : boonName(b.boon), value: b.taken, note: `avg room ${b.avgRoom.toFixed(1)}` })), { color: '#b99ae8' }))}
    ${card('By build', buildTable(byBuild(runs)))}
  </div>
  ${card('Players', playersTable(shown), true)}
  ${card(`Recent runs <em>(latest ${Math.min(60, runs.length)} of ${runs.length})</em>`, runsTable(runs), true)}`;
}

function buildTable(rows) {
  if (!rows.length) return '<p class="empty">No runs recorded yet.</p>';
  return `<table><tr><th>Build</th><th>Runs</th><th>Avg room</th><th>Best</th><th>Died</th></tr>${rows.map((r) =>
    `<tr><td>${esc(r.build)}</td><td>${r.runs}</td><td>${r.avgRoom.toFixed(1)}</td><td>${r.bestRoom}</td><td>${pct(r.deathRate)}</td></tr>`).join('')}</table>`;
}

function playersTable(list) {
  if (!list.length) return '<p class="empty">No players yet — play a run in this browser, or add a tester’s save code above.</p>';
  const rows = list.map((pl) => {
    const p = pl.profile, h = p.history ?? [], st = p.stats ?? {}, eq = p.equipment ?? {}, rec = p.records ?? {};
    const last = h[h.length - 1];
    const recent = h.slice(-10);
    return `<tr>
      <td>${pl.source === 'local' || p.name ? `<b>${esc(pl.label)}</b>` : `<input data-label="${esc(pl.key)}" value="${esc(pl.label)}" maxlength="40">`}<small>${esc(p.playerId ?? 'pre-0.095 save')}${pl.source === 'server' ? ' · collected' : pl.source === 'code' ? ' · save code' : ''}</small></td>
      <td>${level(st)}</td>
      <td>${h.length}<small>of ${rec.runs ?? 0}</small></td>
      <td>${rec.bestRoom ?? 0}</td>
      <td>${recent.length ? (recent.reduce((a, r) => a + r.room, 0) / recent.length).toFixed(1) : '—'}</td>
      <td>${rec.deaths ?? 0}</td>
      <td>P${st.power ?? 0} V${st.vitality ?? 0} F${st.fortune ?? 0} Pr${st.precision ?? 0} E${st.endurance ?? 0}</td>
      <td>${esc(itemName(eq.weapon))}<small>${esc(itemName(eq.armor))}</small></td>
      <td>${p.coins ?? 0}c<small>${p.xp ?? 0} xp · ${p.potions ?? 0}/${p.potionCap ?? 0} potions</small></td>
      <td>${ago(last?.at)}<small>${esc(last?.build ?? '')}</small></td>
      <td>${pl.source === 'code' ? `<button class="small" data-act="remove" data-key="${esc(pl.key)}">Remove</button>` : ''}</td>
    </tr>`;
  }).join('');
  return `<div class="scroll"><table><tr><th>Player</th><th>Lvl</th><th>Runs</th><th>Best room</th><th>Avg (last 10)</th><th>Deaths</th><th>Disciplines</th><th>Gear</th><th>Purse</th><th>Last played</th><th></th></tr>${rows}</table></div>`;
}

function runsTable(runs) {
  if (!runs.length) return '<p class="empty">No runs recorded yet.</p>';
  const latest = [...runs].sort((a, b) => b.at - a.at).slice(0, 60);
  return `<div class="scroll"><table><tr><th>When</th><th>Player</th><th>Build</th><th>Result</th><th>Room</th><th>Kills</th><th>Banked</th><th>Killed by</th><th>Boons</th><th>Bosses</th><th>Potions</th><th>Time</th><th>Lvl / HP / Dmg / Armor</th></tr>${latest.map((r) => `
    <tr class="${r.outcome}">
      <td>${ago(r.at)}</td><td>${esc(labelOf(r.player))}</td><td>${esc(r.build)}</td>
      <td>${r.outcome === 'death' ? 'died' : 'retreated'}</td><td>${r.room}</td><td>${r.kills}</td><td>${r.banked}</td>
      <td>${esc(r.killedBy ? enemyName(r.killedBy) : '')}</td>
      <td>${(r.boons ?? []).map((b) => `<span title="${esc(boonName(b))}">${esc(data.offers[b]?.icon ?? b)}</span>`).join(' ')}</td>
      <td>${r.bosses}</td><td>${r.potions}</td><td>${fmtDuration(r.ms)}</td>
      <td>${r.level} / ${r.maxHp} / ${r.dmg} / ${r.armor}</td>
    </tr>`).join('')}</table></div>`;
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function wire() {
  const root = document.getElementById('dash');
  root.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-act]');
    const act = btn?.dataset.act;
    if (act === 'add') {
      message = addCode(document.getElementById('add-code').value, document.getElementById('add-label').value.trim());
      render();
    } else if (act === 'remove') {
      const key = btn.dataset.key;
      players = players.filter((p) => p.key !== key);
      if (view.player === key) view.player = 'all';
      saveImported();
      render();
    } else if (act === 'refresh') {
      refresh();
    } else if (act === 'key') {
      write(KEY, document.getElementById('read-key').value.trim());
      refresh();
    } else if (act === 'csv') {
      download(`castle-runs-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(filterRuns(allRuns(players), view), labelOf));
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.view) { view[t.dataset.view] = t.value; render(); }
    if (t.dataset.label) {
      const pl = players.find((p) => p.key === t.dataset.label);
      if (pl) {
        pl.label = t.value.trim() || pl.label;
        if (pl.source === 'server') write(NAMES, { ...names(), [pl.profile.playerId]: pl.label });
        else saveImported();
        render();
      }
    }
  });
  // The game saving in another tab of this site updates "This browser".
  addEventListener('storage', (e) => { if (e.key === LOCAL_SAVE_KEY || e.key === STORE) { loadPlayers(); render(); } });
}

async function boot() {
  const get = (f) => fetch(`../assets/data/${f}.json`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  const [enemies, items, shrines, build, telemetry] = await Promise.all(['enemies', 'items', 'shrines', 'build', 'telemetry'].map(get));
  Object.assign(data, {
    enemies: enemies ?? {}, items: items ?? {}, build: build?.version ?? '?', endpoint: String(telemetry?.endpoint ?? ''), collectorVersion: String(telemetry?.collectorVersion ?? ''),
    offers: Object.fromEntries((shrines?.offers ?? []).map((o) => [o.id, o])),
  });
  server.status = data.endpoint ? 'loading' : 'off';
  loadPlayers();
  wire();
  render();
  await refresh();
  // new runs land while the page is open (not while someone is typing here)
  setInterval(() => { if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) refresh(); }, 2 * 60 * 1000);
}

boot();

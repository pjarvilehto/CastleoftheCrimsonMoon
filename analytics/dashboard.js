// analytics/dashboard.js — the play-stats page at /analytics/ (0.095).
// Players: every tester, collected automatically (0.102: the game sends
// its run history to the collector Worker, collector/worker.js, named in
// assets/data/telemetry.json) and this browser's own save (read live from
// localStorage). One player shows once: matched by the save's anonymous
// playerId (this browser > collected). Names given here stay in this
// browser. (0.00224: pasting save codes went — every tester is collected.)

import { LOCAL_SAVE_KEY, sanitizeProfile, allRuns, filterRuns, summarize, countBy, endRooms, bossClears,
  boonStats, shrinePicks, byBuild, condenseBuilds, depthSeries, fmtDuration, toCsv } from './stats.js';
import { esc, bars, lines, columns } from './charts.js';
import { perfTable, benchTable, sanitizeDevice, sanitizeReports, reportsTable, reportText, reportsText, PERF_DEFAULTS } from './perf.js';
import { compareVersions } from '../src/shared/version.js';
import { buildTable, playersTable, runsTable, pct } from './tables.js';

const TESTERS = 'castle-analytics-testers-v1'; // playerId -> tester name (0.136)
const NAMES = 'castle-analytics-names-v1';   // pre-0.136 renames: folded into TESTERS once
const KEY = 'castle-analytics-key-v1';       // the collector's READ_KEY
const data = { enemies: {}, items: {}, offers: {}, build: '?', endpoint: '', finalRoom: 24, bossEvery: 8, levelEvery: 5 }; // the numbers: until difficulty.json loads
const server = { status: 'off', records: [], at: 0, version: null, busy: false, delta: null }; // off | loading | ok | key | error
const view = { player: 'all', build: 'all' };
let players = [];
let message = '';
let copyOut = ''; // a report's JSON shown for hand copying where the clipboard refused (0.00225)

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// Tester names (0.136): who is behind a player, set here by the developer and
// kept in this browser, shown before the player's own name everywhere on
// the page ("tester · player name"). The renames of
// 0.102-0.135 (for players without a typed name) become tester names.
function testers() {
  const t = read(TESTERS) ?? {};
  const legacy = read(NAMES);
  if (legacy) {
    for (const [id, n] of Object.entries(legacy)) t[id] ??= String(n).slice(0, 30);
    write(TESTERS, t);
    try { localStorage.removeItem(NAMES); } catch { /* blocked storage: fold again next time */ }
  }
  return t;
}
const testerKey = (pl) => pl.profile.playerId ?? pl.key;
const country = (c) => (/^[A-Z]{2}$/.test(c ?? '') ? c : '');

function loadPlayers() {
  const local = read(LOCAL_SAVE_KEY);
  const mineP = local?.records ? sanitizeProfile(local) : null;
  // this browser's own save has no device; its collected copy does (0.135)
  const ownDevice = mineP && sanitizeDevice(server.records.find((r) => r.playerId === mineP.playerId)?.device);
  const mine = mineP ? [{ key: 'local', base: mineP.name ? `${mineP.name} (this browser)` : 'This browser', source: 'local', profile: mineP, device: ownDevice }] : [];
  const collected = server.records.map((r) => {
    const profile = sanitizeProfile(r.profile), id = profile.playerId ?? '?';
    return { key: `s:${id}`, source: 'server', profile, country: country(r.country), firstSeen: Number(r.firstSeen) || 0, device: sanitizeDevice(r.device), reports: sanitizeReports(r.reports),
      // the name the player typed (0.109), else their id
      base: `${profile.name || `Player ${id.slice(0, 4).toUpperCase()}`}${country(r.country) ? ` · ${country(r.country)}` : ''}`.slice(0, 40) };
  });
  const seen = new Set();
  const t = testers();
  players = [...mine, ...collected].filter((pl) => {
    const id = pl.profile.playerId;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((pl) => {
    const key = testerKey(pl), tester = t[key] ?? '';
    return { ...pl, testerKey: key, tester, label: tester ? `${tester} · ${pl.base}` : pl.base };
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
    off: 'Automatic collection is not set up yet (collector/README.md).',
    loading: 'Loading collected players…',
    ok: `Collected automatically: ${server.records.length} player${server.records.length === 1 ? '' : 's'} · updated ${server.at ? new Date(server.at).toLocaleTimeString() : '—'}${server.delta === null || server.delta === undefined ? '' : server.delta > 0 ? ` (+${server.delta} new run${server.delta === 1 ? '' : 's'})` : ' (no new runs)'}.`,
    key: 'Enter the stats key (the collector’s READ_KEY) to see collected players.',
    error: 'Could not reach the stats collector — showing this browser’s save only.',
  }[server.status];
  // the deployed collector is pasted in by hand: say when it's behind the repo — and when it is AHEAD of this page
  // (0.00223: a newer Worker used to be called out of date, with the paste instruction; the `?? '0'` is load-bearing: compareVersions(null, x) is 0)
  const cmp = server.status === 'ok' && data.collectorVersion ? compareVersions(server.version ?? '0', data.collectorVersion) : 0;
  const stale = cmp < 0
    ? `<p class="help warn">The stats collector is out of date (deployed: ${esc(server.version ?? 'before 0.119')}, current: ${esc(data.collectorVersion)}) — paste collector/worker.js into the Worker's Edit code and deploy.</p>`
    : cmp > 0 ? `<p class="help">The deployed collector (${esc(server.version)}) is newer than this page expects (${esc(data.collectorVersion)}) — this page is behind main; reload in a few minutes or pull main.</p>` : '';
  return `<section class="card add">
    <h2>Testers</h2>${stale}
    <p class="help">${esc(text)} Every tester playing the live site is included automatically — no save export needed. Players show the name they typed in the game. To see who is who, give them a tester name in the Players table; it shows before the name they play under, and stays in this browser.</p>
    <div class="add-row">
      ${server.status === 'key' ? '<input id="read-key" type="password" placeholder="Stats key"><button data-act="key">Unlock</button>' : ''}
      ${data.endpoint ? `<button data-act="refresh"${server.busy ? ' disabled' : ''}>${server.busy ? 'Refreshing…' : 'Refresh'}</button>` : ''}
    </div>
    ${message ? `<p class="msg">${esc(message)}</p>` : ''}
  </section>`;
}

const enemyName = (id) => data.enemies[id]?.name ?? id;
const itemName = (id) => (id ? data.items[id]?.name ?? id : '—');
const boonName = (id) => (data.offers[id] ? `${data.offers[id].icon} ${data.offers[id].buff}` : id);
// The Shrine picks card (0.00251): a bar per boon at its pick rate, the walk-aways last.
const shrinePickBars = ({ met, walked, boons }) => (met
  ? bars([...boons.map((b) => ({ label: boonName(b.boon), value: b.rate, note: `${b.taken}/${b.offered} picked` })),
    { label: 'walked away', value: walked / met, note: `${walked}/${met} shrines` }], { fmt: pct, color: '#b99ae8' })
  : '<p class="help">No shrine deals recorded yet: runs from build 0.00251 on carry them.</p>');
const labelOf = (key) => players.find((p) => p.key === key)?.label ?? key;
// what the tables need to name things (analytics/tables.js)
const names = { enemyName, itemName, boonName, labelOf, offers: () => data.offers, get levelEvery() { return data.levelEvery; } };

// a bad field in one record must not leave the page at "Loading play stats…" (0.00223)
function render() {
  try { renderInner(); } catch (e) { document.getElementById('dash').innerHTML = `<p class="help warn">Could not draw the stats: ${esc(String(e?.message ?? e))}</p>`; console.error(e); }
}
function renderInner() {
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
    ${card('Depth per run', lines(depthSeries(shown, runs, data.finalRoom), { xLabel: 'run #', yLabel: 'room', mark: `won the game (beat the room ${data.finalRoom} boss)` }))}
    ${card('Where runs end', columns(endRooms(runs).map((r) => ({ x: r.room, parts: [r.death, r.retreat] })), { names: ['died', 'retreated'], xLabel: 'room', yLabel: 'runs' }))}
    ${card('What kills players', bars(countBy(runs, 'killedBy').map(([id, n]) => ({ label: enemyName(id), value: n })), { color: '#c14b4b' }))}
    ${card('Boss rooms', bars(bossClears(runs, data.bossEvery, data.finalRoom).map((b) => ({ label: `Room ${b.room}`, value: b.reached ? b.cleared / b.reached : 0, note: `${b.cleared}/${b.reached} runs` })), { fmt: pct }))}
    ${card('Shrine boons', bars(boonStats(runs).map((b) => ({ label: b.boon === '(none)' ? 'no boon' : boonName(b.boon), value: b.taken, note: `avg room ${b.avgRoom.toFixed(1)}` })), { color: '#b99ae8' }))}
    ${card('Shrine picks <em>(how often a boon was taken when dealt; from 0.00251)</em>', shrinePickBars(shrinePicks(runs)))}
    ${card('By build', buildTable(condenseBuilds(byBuild(runs))))}
  </div>
  ${card('Performance', perfTable(shown, runs, data.perf), true)}
  ${card('Benchmarks', benchTable(shown, data.benchmarkSince, data.perf), true)}
  ${card('Device reports <em>(0.00225: what a speed optimization needs — copy and paste to the chat)</em>', `<div class="add-row"><button data-act="copy-all"${shown.some((pl) => pl.reports?.length) ? '' : ' disabled'}>Copy all (JSON)</button></div>${reportsTable(shown)}${copyOut ? `<p class="help">The clipboard refused: select the text and copy it.</p><textarea class="report-out" readonly>${esc(copyOut)}</textarea>` : ''}`, true)}
  ${card('Players', playersTable(shown, names), true)}
  ${card(`Recent runs <em>(latest ${Math.min(60, runs.length)} of ${runs.length})</em>`, runsTable(runs, names), true)}`;
}

// To the clipboard, else into a box on the page to copy by hand (0.00225)
function copyText(text) {
  const shown = () => { copyOut = text; message = ''; render(); };
  const ok = () => { copyOut = ''; message = `Copied ${Math.round(text.length / 1024)} KB of JSON — paste it into the chat.`; render(); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, shown);
  else shown();
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
    if (act === 'copy-report' || act === 'copy-all') {
      const pl = players.find((p) => p.key === btn.dataset.key);
      const one = pl?.reports?.find((r) => String(r.at) === btn.dataset.at);
      const text = act === 'copy-all' ? reportsText(view.player === 'all' ? players : players.filter((p) => p.key === view.player)) : one ? reportText(one) : '';
      if (text) copyText(text);
    } else if (act === 'refresh') {
      copyOut = '';
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
    if (t.dataset.tester) {
      const all = testers(), v = t.value.trim().slice(0, 30);
      if (v) all[t.dataset.tester] = v; else delete all[t.dataset.tester];
      if (!write(TESTERS, all)) message = 'Could not save tester names in this browser (storage full or blocked).';
      loadPlayers();
      render();
    }
  });
  // The game saving in another tab of this site updates "This browser".
  addEventListener('storage', (e) => { if ([LOCAL_SAVE_KEY, STORE, TESTERS].includes(e.key)) { loadPlayers(); render(); } });
}

async function boot() {
  // the build first (index.html fetched it uncached and left it here), then every data file under ?v=<build>: a bare
  // URL's copy at the CDN is up to 10 minutes old after a deploy (0.00223: this page read the old telemetry.json then)
  const build = globalThis.__castleBuild ?? await fetch(`../assets/data/build.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  const q = build?.version ? `?v=${encodeURIComponent(build.version)}` : `?t=${Date.now()}`;
  const get = (f) => fetch(`../assets/data/${f}.json${q}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  const [enemies, items, shrines, telemetry, difficulty] = await Promise.all(['enemies', 'items', 'shrines', 'telemetry', 'difficulty'].map(get));
  Object.assign(data, {
    enemies: enemies ?? {}, items: items ?? {}, finalRoom: difficulty?.finalBossRoom ?? data.finalRoom, bossEvery: difficulty?.bossEvery ?? data.bossEvery, levelEvery: difficulty?.levelEvery ?? data.levelEvery, build: build?.version ?? '?', endpoint: String(telemetry?.endpoint ?? ''), collectorVersion: String(telemetry?.collectorVersion ?? ''), benchmarkSince: String(telemetry?.benchmarkSince ?? ''), perf: { ...PERF_DEFAULTS, ...(telemetry?.perf ?? {}) }, // (the page's own fallbacks, as finalRoom above)
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

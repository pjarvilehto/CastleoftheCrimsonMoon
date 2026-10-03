// tools/reports.mjs — pull the play stats straight from the collector
// (0.00229): every player's device, runs, benchmarks and device reports,
// as the /analytics/ dashboard sees them, into the session — no more Copy
// all and paste. Reads telemetry.json `endpoint` and the collector's read
// key from the environment variable CASTLE_READ_KEY (the developer's secret,
// set in the cloud environment's settings; never printed, never in the
// chat). The environment's network policy must allow the collector's host.
//
//   node tools/reports.mjs                   a summary per player: device, runs, newest benchmark, newest report's spans
//   node tools/reports.mjs --reports         the device reports as JSON (what the dashboard's Copy all gives)
//   node tools/reports.mjs --json            everything the collector holds, raw
//   node tools/reports.mjs --out players.json   write the raw answer to a file (keep it out of the repo)
//   node tools/reports.mjs --player iphone   only players whose name, id or device matches
//
// Exit 2 when the key or the host is missing, with what to set. In a
// proxied container (HTTPS_PROXY set, the cloud sessions) Node's fetch
// ignores the proxy unless NODE_USE_ENV_PROXY is set at startup — a
// direct connection gets the sandbox's 403 — so the tool re-runs itself
// with it set.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gpuShort } from '../analytics/perf.js';

export const KEY_VAR = 'CASTLE_READ_KEY';

const ms = (x) => (x == null ? '—' : `${Number(x).toFixed(2)} ms`);
const pct = (x) => (x == null ? '—' : `${Number(x).toFixed(1)}%`);
const when = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '—');

// One player's line: who, on what, how much, and the newest of each kind.
export function summarize(pl) {
  const p = pl.profile ?? {}, d = pl.device ?? {};
  const bench = [...(p.bench ?? [])].sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0] ?? null;
  const report = [...(pl.reports ?? [])].sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0] ?? null;
  const phase = (ph) => (ph ? `${Number(ph.fps).toFixed(1)}/${ph.hz} Hz, p95 ${ph.p95} ms, drop ${pct(ph.drop)}` : '—');
  const spans = (ph) => (ph?.split ? Object.entries(ph.split).map(([k, s]) => `${k} ${ms(s.avg)}`).join(', ') : '—');
  return {
    name: p.name || '(unnamed)', id: String(pl.playerId ?? '').slice(0, 8), lastSeen: when(pl.lastSeen), build: pl.build ?? '—',
    device: [gpuShort(d.gpu ?? ''), d.browser, d.os, d.cores ? `${d.cores} cores` : ''].filter(Boolean).join(' · ') || '—',
    runs: (p.history ?? []).length, bestRoom: p.records?.bestRoom ?? 0,
    benchmarks: (p.bench ?? []).length, reports: (pl.reports ?? []).length,
    bench: bench ? { at: when(bench.at), build: bench.build, bg: bench.bg, q: bench.q, size: `${bench.vw}x${bench.vh}@${bench.dpr}x`, idle: phase(bench.phases?.idle), combat: phase(bench.phases?.combat), overkill: phase(bench.phases?.overkill) } : null,
    report: report ? { at: when(report.at), kind: report.kind, build: report.build, power: report.renderer?.power ?? report.power, spans: Object.fromEntries(Object.entries(report.phases ?? {}).map(([k, ph]) => [k, spans(ph)])), cards: report.cards ?? null, stalls: Object.values(report.phases ?? {}).reduce((n, ph) => n + (ph?.stalls?.length ?? 0), 0) } : null,
  };
}

export const matches = (pl, q) => { const s = summarize(pl); return !q || [s.name, s.id, s.device].join(' ').toLowerCase().includes(q.toLowerCase()); };

export function render(s) {
  const lines = [`${s.name}  (${s.id})  ${s.device}`, `  last seen ${s.lastSeen} on ${s.build} · ${s.runs} runs, best room ${s.bestRoom} · ${s.benchmarks} benchmarks · ${s.reports} reports`];
  if (s.bench) lines.push(`  benchmark ${s.bench.at} build ${s.bench.build} (${s.bench.bg}${s.bench.q ? ` q${s.bench.q}` : ''}, ${s.bench.size})`, `    idle ${s.bench.idle}`, `    combat ${s.bench.combat}`, `    overkill ${s.bench.overkill}`);
  if (s.report) {
    lines.push(`  report ${s.report.at} ${s.report.kind} build ${s.report.build}${s.report.power ? ` ${s.report.power}` : ''} · ${s.report.stalls} stalls`);
    for (const [k, v] of Object.entries(s.report.spans)) lines.push(`    ${k}: ${v}`);
    if (s.report.cards) lines.push(`    cards: ${JSON.stringify(s.report.cards)}`);
  }
  return lines.join('\n');
}

export async function fetchPlayers({ endpoint, key, fetchFn = fetch }) {
  if (!endpoint) throw new Error('telemetry.json has no endpoint');
  if (!key) throw new Error(`${KEY_VAR} is not set: add the collector's read key as that environment secret (the cloud environment's settings, then start a new session)`);
  let r;
  try { r = await fetchFn(`${endpoint.replace(/\/$/, '')}/players`, { headers: { authorization: `Bearer ${key}` } }); }
  catch (e) { throw new Error(`cannot reach ${endpoint}: ${e.message} — allow its host in the environment's network policy`); }
  if (r.status === 401) throw new Error(`the collector refused the key in ${KEY_VAR} (401): it must equal the Worker's READ_KEY`);
  if (!r.ok) throw new Error(`the collector answered ${r.status}`);
  const body = await r.json();
  return Array.isArray(body?.players) ? body.players : [];
}

async function main() {
  const args = process.argv.slice(2), flag = (f) => args.includes(f), val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const endpoint = JSON.parse(readFileSync(new URL('../assets/data/telemetry.json', import.meta.url), 'utf8')).endpoint;
  let players;
  try { players = await fetchPlayers({ endpoint, key: process.env[KEY_VAR] }); }
  catch (e) { console.error(`reports: ${e.message}`); process.exit(2); }
  const q = val('--player');
  const picked = players.filter((pl) => matches(pl, q));
  if (val('--out')) { writeFileSync(val('--out'), JSON.stringify({ players: picked }, null, 1)); console.error(`reports: ${picked.length} players written to ${val('--out')}`); }
  if (flag('--json')) { console.log(JSON.stringify({ players: picked }, null, 1)); return; }
  if (flag('--reports')) { console.log(JSON.stringify(picked.filter((pl) => pl.reports?.length).map((pl) => ({ player: summarize(pl).name, id: summarize(pl).id, device: pl.device ?? null, reports: pl.reports })), null, 1)); return; }
  if (!val('--out')) {
    console.log(`${picked.length} of ${players.length} players from ${endpoint}\n`);
    for (const pl of picked.sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))) console.log(render(summarize(pl)), '\n');
  }
}

// Through the proxy when there is one (see the header): the same command
// again with NODE_USE_ENV_PROXY=1, its experimental-agent warning off.
function viaProxy() {
  const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) viaProxy();
  else await main();
}

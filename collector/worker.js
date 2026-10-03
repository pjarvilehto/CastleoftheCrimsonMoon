// collector/worker.js — the play-stats collector (0.102): a Cloudflare
// Worker + one KV namespace. The game (src/meta/telemetry.js) POSTs a
// snapshot of a player's save after every run; the /analytics/ dashboard
// GETs every player back. Deploy + wire-up: collector/README.md.
//
//   POST /collect   body { playerId, build, device, profile } (text/plain JSON)
//   GET  /players   -> { players: [{ playerId, country, firstSeen, lastSeen, build, device, profile }] }
//                   needs the READ_KEY secret when set: header
//                   `authorization: Bearer <key>` (0.119; ?key= still works)
//   GET  /version   -> { version } — which collector is deployed (0.119)
//
// Players are the save's anonymous random id — no IP address is stored;
// Cloudflare's country code for the request is kept as a hint. History
// is merged by run timestamp, so a progress wipe or the save's 250-run cap
// never deletes runs already collected.
//
// 0.119 hardening (anyone can POST here): only the fields the dashboard
// shows are stored, each type-checked and size-capped; a client IP may
// POST at most RATE_PER_MIN times a minute (per Worker instance, in
// memory — never stored) and one player at most once a second.
//
// 0.130: performance — each run may carry `perf` (frame rate: fps, p95
// frame ms, % dropped frames, worst frame, refresh rate, background mode,
// window size), and the POST a `device` (GPU, browser, OS, cores, memory,
// screen); the latest device is kept on the player. 0.131: the profile's
// `bench` — ?debug BENCHMARK results (idle / combat / overkill phases).

export const VERSION = '0.00253'; // (telemetry.json collectorVersion must match; the developer pastes this file into the Worker)
const ID = /^[a-z0-9]{4,16}$/;
const MAX_BODY = 250_000;    // bytes; a full 250-run save is ~70KB
const MAX_RUNS = 2000;       // per player, newest kept
const RATE_PER_MIN = 30;     // POSTs per client IP per minute
const MIN_GAP_MS = 1000;     // between two POSTs of one player
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// ---- what may be stored: the dashboard's fields, typed and capped ----
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const int = (v, max = 1e6) => Math.min(max, Math.max(0, Math.floor(num(v)))); // a count: whole, never negative, capped (0.00223)
const str = (v, max) => (v === null || v === undefined ? null : String(v).slice(0, max));
const pick = (o, keys, f) => Object.fromEntries(keys.map((k) => [k, f(o?.[k])]));
const MAX_ROOM = 999;
const RUN_NUMS = ['at', 'room', 'kills', 'xp', 'coins', 'banked', 'items', 'bosses', 'potions', 'turns', 'ms', 'level', 'maxHp', 'dmg', 'armor']; // (analytics/stats.js RUN_FIELDS lists the same)
const RUN_COUNTS = { room: MAX_ROOM, kills: 1e6, bosses: 1e6, potions: 1e6, items: 1e6, level: 1e6, turns: 1e6 };
const SLOTS = ['weapon', 'armor', 'boots', 'trinket', 'amulet'];
const POWER = new Set(['saver', 'phone', 'full']); // the picture's power mode (0.00222: the battery saver, the phone profile, or neither)
const PERF_NUMS = ['fps', 'p95', 'drop', 'worst', 'worstOut', 'stalls', 'hz', 'secs', 'q', 'dpr', 'vw', 'vh']; // (worstOut, stalls: 0.00222)

export function cleanPerf(p) {
  if (!p || typeof p !== 'object') return null;
  return { ...pick(p, PERF_NUMS, num), bg: p.bg === 'flat' ? 'flat' : '3d', power: POWER.has(p.power) ? p.power : 'full' }; // (power: 0.00222)
}

// 0.131: ?debug BENCHMARK results — per phase the same frame numbers as a run's perf.
const BENCH_PHASES = ['idle', 'combat', 'overkill'];
export function cleanBench(b) {
  if (!b || typeof b !== 'object' || !Number.isFinite(b.at)) return null;
  const ph = b.phases ?? {};
  return {
    ...pick(b, ['at', 'q', 'dpr', 'vw', 'vh'], num), build: str(b.build, 12), bg: b.bg === 'flat' ? 'flat' : '3d', power: POWER.has(b.power) ? b.power : 'full',
    phases: Object.fromEntries(BENCH_PHASES.map((k) => [k, ph[k] && typeof ph[k] === 'object' ? pick(ph[k], ['fps', 'p95', 'drop', 'worst', 'hz', 'secs'], num) : null])),
  };
}

// The device report (0.00225, meta/perfReport.js): JSON for the developer to
// read, so it is bounded rather than typed field by field — numbers finite,
// strings short, lists and objects capped, a depth limit, MAX_REPORT bytes
// in all; the top level typed. The newest MAX_REPORTS per player are kept.
const MAX_REPORT = 24000, MAX_REPORTS = 3;
export function bounded(v, depth) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.slice(0, 120);
  if (depth <= 0) return null;
  if (Array.isArray(v)) return v.slice(0, 64).map((x) => bounded(x, depth - 1));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 64).map(([k, x]) => [String(k).slice(0, 32), bounded(x, depth - 1)]));
  return null;
}
export function cleanReport(r) {
  if (!r || typeof r !== 'object' || !Number.isFinite(r.at)) return null;
  const out = { v: int(r.v, 99), at: num(r.at), build: str(r.build, 12), kind: r.kind === 'bench' ? 'bench' : 'run',
    device: bounded(r.device, 2), renderer: bounded(r.renderer, 3), cards: bounded(r.cards, 2), particles: bounded(r.particles, 2), phases: bounded(r.phases, 5), runs: bounded(r.runs, 3) };
  return JSON.stringify(out).length <= MAX_REPORT ? out : null;
}
export function mergeReports(old = [], add = []) {
  const byAt = new Map();
  for (const r of [...old, ...add]) if (r && Number.isFinite(r.at)) byAt.set(r.at, r);
  return [...byAt.values()].sort((a, b) => a.at - b.at).slice(-MAX_REPORTS);
}

export function cleanDevice(d) {
  if (!d || typeof d !== 'object') return null;
  return { gpu: str(d.gpu, 120), browser: str(d.browser, 30), os: str(d.os, 20), screen: str(d.screen, 20), ...pick(d, ['cores', 'mem'], num) };
}

// a run's shrines (0.00253): at most 6, each its offered ids (at most 4) and the one taken (analytics/stats.js keeps the same)
export const cleanShrines = (a) => (Array.isArray(a) ? a.slice(0, 6).filter((s) => s && typeof s === 'object').map((s) => ({ o: Array.isArray(s.o) ? s.o.slice(0, 4).map((x) => str(x, 24)) : [], t: str(s.t, 24) })) : []);

export function cleanRun(r) {
  if (!r || typeof r !== 'object' || !Number.isFinite(r.at)) return null;
  const room = r.room === undefined ? 0 : Number(r.room); // (absent reads as 0, like every other number)
  if (!Number.isInteger(room) || room < 0 || room > MAX_ROOM) return null; // (0.00223: one such record, anyone's POST, broke the dashboard for everyone)
  return {
    ...pick(r, RUN_NUMS, num),
    ...Object.fromEntries(Object.entries(RUN_COUNTS).map(([k, max]) => [k, int(r[k], max)])),
    build: str(r.build, 12), outcome: r.outcome === 'retreat' ? 'retreat' : 'death', // (a run that is not a retreat ended in death — as the dashboard reads it)
    relic: !!r.relic, killedBy: str(r.killedBy, 40),
    hero: str(r.hero, 24), look: int(r.look, 99), // (0.00253: who played)
    boons: Array.isArray(r.boons) ? r.boons.slice(0, 12).map((b) => str(b, 24)) : [], // (the dashboard keeps 12)
    shrines: cleanShrines(r.shrines), // 0.00253: each shrine's deal and the pick
    perf: cleanPerf(r.perf),
  };
}

export function cleanProfile(p, id) {
  const eq = p?.equipment ?? {};
  return {
    playerId: id,
    name: str(p?.name, 20) ?? '',
    ...pick(p, ['coins', 'xp', 'potions', 'potionCap'], num),
    stats: pick(p?.stats, ['power', 'vitality', 'fortune', 'precision', 'endurance'], num),
    records: pick(p?.records, ['runs', 'kills', 'bestRoom', 'deaths'], num),
    equipment: { ...pick(eq, SLOTS, (v) => str(v, 40)), rings: Array.isArray(eq.rings) ? eq.rings.slice(0, 2).map((v) => str(v, 40)) : [] },
    hero: p?.hero && typeof p.hero === 'object' ? { id: str(p.hero.id, 24), look: int(p.hero.look, 99) } : null, // (0.00253: the chosen class and its look)
    history: (Array.isArray(p?.history) ? p.history : []).map(cleanRun).filter(Boolean),
    bench: (Array.isArray(p?.bench) ? p.bench : []).slice(-20).map(cleanBench).filter(Boolean),
  };
}

// Union of two run lists by timestamp (the newer copy of a run wins).
export function mergeHistory(old = [], add = []) {
  const byAt = new Map();
  for (const r of [...old, ...add]) if (r && Number.isFinite(r.at)) byAt.set(r.at, r);
  return [...byAt.values()].sort((a, b) => a.at - b.at).slice(-MAX_RUNS);
}

// Per-instance, in-memory sliding window: { ip -> [timestamps] }.
const hits = new Map();
export function rateLimited(ip, now = Date.now(), limit = RATE_PER_MIN) {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // never grows without bound
  return recent.length > limit;
}

export async function collect(req, env, now = Date.now()) {
  if (rateLimited(req.headers.get('cf-connecting-ip') ?? 'local', now)) return json({ error: 'slow down' }, 429);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
  const id = String(body?.playerId ?? '');
  const profile = body?.profile;
  if (!ID.test(id) || !profile || typeof profile !== 'object' || !Array.isArray(profile.history)) return json({ error: 'bad payload' }, 400);
  const key = `player:${id}`;
  const prev = await env.STATS.get(key, 'json');
  if (prev && now - prev.lastSeen < MIN_GAP_MS) return json({ error: 'slow down' }, 429);
  const clean = cleanProfile(profile, id);
  const record = {
    playerId: id,
    build: String(body.build ?? '?').slice(0, 12),
    country: req.cf?.country ?? prev?.country ?? null,
    firstSeen: prev?.firstSeen ?? now,
    lastSeen: now,
    device: cleanDevice(body.device) ?? prev?.device ?? null,
    reports: mergeReports(prev?.reports, [cleanReport(body.report)].filter(Boolean)), // (0.00225: the device reports, newest few)
    profile: { ...clean, history: mergeHistory(prev?.profile?.history, clean.history) },
  };
  await env.STATS.put(key, JSON.stringify(record));
  return json({ ok: true, runs: record.profile.history.length });
}

// The read key: `authorization: Bearer <key>` (kept out of URLs and logs),
// or the older ?key= query.
const readKey = (req, url) => (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '') || url.searchParams.get('key');

export async function players(req, url, env) {
  if (env.READ_KEY && readKey(req, url) !== env.READ_KEY) return json({ error: 'key required' }, 401);
  const names = [];
  let cursor;
  do {
    const page = await env.STATS.list({ prefix: 'player:', cursor });
    names.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const all = await Promise.all(names.map((n) => env.STATS.get(n, 'json')));
  return json({ players: all.filter(Boolean) });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    try {
      if (req.method === 'POST' && url.pathname === '/collect') return await collect(req, env);
      if (req.method === 'GET' && url.pathname === '/players') return await players(req, url, env);
      if (req.method === 'GET' && url.pathname === '/version') return json({ version: VERSION });
      return json({ error: 'not found' }, 404);
    } catch {
      return json({ error: 'server error' }, 500);
    }
  },
};

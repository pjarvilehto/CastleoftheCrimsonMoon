// collector/worker.js — the play-stats collector (0.102): a Cloudflare
// Worker + one KV namespace. The game (src/meta/telemetry.js) POSTs a
// snapshot of a player's save after every run; the /analytics/ dashboard
// GETs every player back. Deploy + wire-up: collector/README.md.
//
//   POST /collect   body { playerId, build, profile } (text/plain JSON)
//   GET  /players   -> { players: [{ playerId, country, firstSeen, lastSeen, build, profile }] }
//                   (needs ?key=READ_KEY when that secret is set)
//
// Players are the save's anonymous random id — no IP address is stored;
// Cloudflare's country code for the request is kept as a hint. History
// is merged by run timestamp, so a progress wipe or the save's 250-run cap
// never deletes runs already collected.

const ID = /^[a-z0-9]{4,16}$/;
const MAX_BODY = 250_000;    // bytes; a full 250-run save is ~70KB
const MAX_RUNS = 2000;       // per player, newest kept
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// Union of two run lists by timestamp (the newer copy of a run wins).
export function mergeHistory(old = [], add = []) {
  const byAt = new Map();
  for (const r of [...old, ...add]) if (r && Number.isFinite(r.at)) byAt.set(r.at, r);
  return [...byAt.values()].sort((a, b) => a.at - b.at).slice(-MAX_RUNS);
}

export async function collect(req, env, now = Date.now()) {
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
  const id = String(body?.playerId ?? '');
  const profile = body?.profile;
  if (!ID.test(id) || !profile || typeof profile !== 'object' || !Array.isArray(profile.history)) return json({ error: 'bad payload' }, 400);
  const key = `player:${id}`;
  const prev = await env.STATS.get(key, 'json');
  const record = {
    playerId: id,
    build: String(body.build ?? '?').slice(0, 12),
    country: req.cf?.country ?? prev?.country ?? null,
    firstSeen: prev?.firstSeen ?? now,
    lastSeen: now,
    profile: { ...profile, playerId: id, history: mergeHistory(prev?.profile?.history, profile.history) },
  };
  await env.STATS.put(key, JSON.stringify(record));
  return json({ ok: true, runs: record.profile.history.length });
}

export async function players(url, env) {
  if (env.READ_KEY && url.searchParams.get('key') !== env.READ_KEY) return json({ error: 'key required' }, 401);
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
      if (req.method === 'GET' && url.pathname === '/players') return await players(url, env);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'server error' }, 500);
    }
  },
};

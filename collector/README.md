# Play-stats collector (0.102)

A tiny Cloudflare Worker that receives every tester's run history
automatically, so the `/analytics/` dashboard shows all players without
anyone exporting a save. Free tier is plenty (KV: 1,000 writes/day =
~1,000 finished runs a day).

## One-time setup (~5 minutes)

From this folder, logged in to the Cloudflare account that has the domain:

```bash
npx wrangler login
npx wrangler kv namespace create STATS        # prints an id
#  -> its id goes in wrangler.toml (already set for the live namespace)
npx wrangler secret put READ_KEY              # any passphrase; the dashboard asks for it once
npx wrangler deploy                           # prints https://castle-stats.<you>.workers.dev
```

Then put that URL into `assets/data/telemetry.json` → `"endpoint"` and
push (or ask Claude to). From the next page load on, every browser playing
the live site sends its runs — including the history it already has.

Optional: a nicer URL via a Workers route such as
`stats.castleofthecrimsonmoon.com/*` (Worker → Settings → Domains & Routes).

## What is stored

One KV entry per player, keyed by the save's anonymous random id: run
records, disciplines, gear, purse, first/last seen, the build, and the
country Cloudflare derives from the request. **No IP addresses, names or
other personal data.** Runs are merged by timestamp, so a progress wipe
doesn't erase collected history. Delete a player with
`npx wrangler kv key delete --binding STATS player:<id>`.

## Updating the deployed collector

The live Worker is edited in the Cloudflare dashboard: **Workers & Pages →
castle-stats → Edit code**, replace everything with `collector/worker.js`
from this repo, **Deploy**. The `/analytics/` page says when the deployed
collector is older than the repo's (`/version` vs
`assets/data/telemetry.json` `collectorVersion`). The READ_KEY secret and
the KV binding stay as they are.

## API

- `POST /collect` — `{ playerId, build, device, profile }` as text/plain JSON (≤250KB).
  Only the dashboard's fields are stored, type-checked and size-capped
  (0.119). 0.130: each run may carry `perf` (fps, p95 frame ms, % dropped
  frames, worst frame, refresh rate, background mode, window size), and
  `device` (GPU, browser, OS, cores, memory, screen) is kept per player.
  0.131: the profile's `bench` — BENCHMARK results (the ?debug button;
  since 0.00219 also the Great Hall's one-time ask per round for every
  player with best room >= telemetry.json `benchmarkPromptRoom`). The game
  keeps its newest 10, the Worker up to 20; per result `at`, `build`, `bg`
  (3d / flat), `q` (the quality step), `dpr`, `vw` / `vh`, and per phase
  (idle / combat / overkill) `fps`, `p95`, `drop`, `worst`, `hz`, `secs`.
  The dashboard compares `build` with telemetry.json `benchmarkSince` and
  mutes results from an older round. 0.00223: `cleanRun` drops a record
  whose `room` is not a whole number from 0 to 999 and clamps the other
  counts (a bad field used to break the dashboard for everyone); `outcome`
  defaults to death on both sides. Limits: 30 POSTs a minute per client IP (in memory, never
  stored), one per second per player → `429`.
- `GET /players` with `authorization: Bearer <READ_KEY>` (0.119; the older
  `?key=READ_KEY` still works) — every player
- `GET /version` — the deployed collector's version

## Optional extra protection

For a hard, edge-level limit (the in-memory one is per Worker instance):
Cloudflare dashboard → the domain → **Security → WAF → Rate limiting
rules** — e.g. path `/collect`, 60 requests / 10 s per IP → Block.

## When to move to D1

KV's free tier allows 1,000 writes a day — one per finished run plus one
per session per player, so roughly 10 testers playing hard. Nothing is
lost when it runs out (every POST resends the whole history and merges),
but stats arrive late. Past that, move to D1 (SQLite, 100,000 row writes a
day): a `players` table and a `runs` table keyed by (player, timestamp),
inserts that ignore runs already stored, and the dashboard's numbers as
SQL queries instead of downloading every save.

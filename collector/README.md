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

## API

- `POST /collect` — `{ playerId, build, profile }` as text/plain JSON (≤250KB)
- `GET /players?key=READ_KEY` — every player

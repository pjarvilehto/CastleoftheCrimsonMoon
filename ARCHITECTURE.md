# Castle of the Crimson Moon — Architecture

Roguelite browser game. Vanilla JS ES modules, no build step, DOM-based UI
over full-screen painted backgrounds. DIN Condensed Bold via @font-face (user-supplied);
all-caps UI chrome, mixed-case combat log.

## Run it

```bash
./"Play Castle.command"   # kills any old server on :8000, serves, opens browser
```

(Double-click the .command in Finder works too. Server keeps running after
the Terminal window closes. Requires macOS Command Line Tools — `python3`.)

## Test it

```bash
node tools/smoke-test.mjs
```

Headless DOM-shim suite covering transitions, combat, shrine, death path.
The shim models read-only DOM APIs (`children` is getter-only — an
assignment that the old shim allowed shipped as a real bug in 0.031).
**Always run it before packaging a build.**

## The one rule that matters

**Run state never writes to meta state directly.** Everything earned in a
dungeon (coins, XP, items) accumulates in the `run` object. When the run ends,
`src/run/runState.js :: settleRun()` transfers it all into the profile in a
single transaction and persists. Death also applies the 50% coin toll here.
If you add a new earning, route it through the run object.

## Map of the code

```
src/
├── main.js               entry: boot loader panel (progress bar) ->
│                         loadData() -> preloadAssets() -> initHotkeys()
│                         -> build tag + INVULNERABLE debug toggle ->
│                         title scene
├── core/bg3d.js          3D backgrounds (0.083): WebGL depth-displaced mesh,
│                         slow orbit camera, 2s crossfade, CSS fallback;
│                         live tuning + localStorage save (0.084)
├── core/bg3dMath.js      pure math: cover mapping, sway, grid, matrices,
│                         shader mirror + auto overscan (tested in Node)
├── core/scene.js         scene manager, transitionTo() (try/finally!),
│                         bg crossfader (bg0/bg1 layers), el() helper,
│                         handleKey()/initHotkeys()
├── meta/                 PERSISTS across runs (localStorage)
│   ├── storage.js        the only file that touches localStorage;
│   │                     exportProfile()/importProfile() — base64 save
│   │                     codes for cross-origin transfer (new URL = new
│   │                     localStorage, so saves must be carried by hand)
│   ├── profile.js        coins, xp, stat levels, equipment, records,
│   │                     resetProfile(); SAVE_VERSION + ordered MIGRATIONS
│   ├── equipment.js      slot rules + auto-equip/salvage logic
│   └── leveling.js       training costs, buyStat(), restockPotion()
├── run/                  EXISTS only during a dungeon run
│   ├── runState.js       run object, room progression, settleRun()
│   ├── roomGen.js        threat-budget combat rooms, boss every 8,
│   │                     ONE shrine in every 8-room stretch (2-7,
│   │                     10-15, ...: run.shrineRooms), room kinds
│   ├── combat.js         combat core: attacks, crits, lifesteal,
│   │                     MULTI-KILL damage spill — HEAVY attacks only
│   │                     (>= 2x target HP; basic attacks never spill);
│   │                     boss SUMMONS (0.092): the meter fills a step a
│   │                     turn, full = a skeleton joins (difficulty.json
│   │                     boss.summon; no rewards, capped alive);
│   │                     heavyTarget() = the front summon, else first
│   ├── shrine.js         boon costs/effects (ids map to apply logic)
│   └── loot.js           coin/xp/item rolls, fortune modifier
├── shared/
│   ├── data.js           single async load of all assets/data/*.json
│   ├── preload.js        fetch+decode ALL art up front (img.decode(),
│   │                     list derived from data JSONs) so first paints
│   │                     are instant — without it art half-draws (0.045)
│   ├── debug.js          DEBUG flags (invulnerable), session-only,
│   │                     default OFF; combat.js reads it, main.js toggle
│   └── balance.js        enemy scaling (HP/dmg growth, LV naming)
└── ui/
    ├── hud.js            hpBar, statBox, logLine (glyphs)
    ├── fx.js             flashRed (death vignette), tickUp (counters)
    ├── combatPlayback.js log drip queue + replay VIEW (0.086: each event's
    │                     snapshot plays with its line; owns printing lock)
    ├── combatFx.js       combat effects: event -> fx descriptor, playFx();
    │                     bg jolts (heavy blows) and directional bg SWAYS
    │                     (0.092/0.093: a rocking rotation about the depth
    │                     centre — crits/SMASH/multi-kills swing the near
    │                     art right, crushing hits on the knight left)
    ├── particles.js      particle bursts by material (0.089), one canvas
    ├── battleLine.js     persistent units (0.086: built once per room,
    │                     update() patches HP/dead/buttons in place;
    │                     card + button row beneath; HP as text+bar line);
    │                     adds boss-card + per-id enemy-<id> classes (0.075);
    │                     boss summon bar; summons join mid-fight in front
    │                     of the boss and leave the row when they fall (0.092)
    ├── shrineUI.js       shrine room rendering
    ├── buffs.js          blessing bar (horizontal, beside resources)
    ├── bgTuner.js        ?debug BG TUNING slider panel (0.084)
    └── scenes/           titleScene, hubScene (two-panel grid),
                          dungeonScene (combat = chromeless card layout,
                          shrine = panel layout), runEndScene
├── audio/
│   ├── music.js          five ~61s scene-routed loop beds, 1.6s crossfade,
│   │                     gesture-gated AudioContext, MUSIC toggle
│   ├── audioCore.js      shared AudioContext + cached compressed bytes (0.078)
│   └── sfx.js            13 one-shots, ±12% pitch jitter, SOUND toggle,
│                         combat sfx attach to playback queue items

assets/
├── bg/                   painted backgrounds (JPEG) + shrine art
│   └── depth/            per-background depth maps (PNG, white = near;
│                         Depth Anything V2 Small via tools/gen-depth.py)
├── chars/                character portraits (PNG, keep alpha) +
│                         card_enemy/card_player frame art
├── audio/                music-*.mp3 beds + sfx-*.mp3 one-shots
├── fonts/                DINCondensedBold.ttf (user-supplied)
└── data/                 ALL balance numbers live here as JSON:
                        enemies, items, difficulty, backgrounds
                        (incl. roomNames), shrines, build
styles.css              all styling (split out of index.html in 0.034)
tools/
├── smoke-test.mjs        DOM-shim suite (~308 checks) - run pre-deploy
├── simCore.mjs           simulator engine: bot, policies, profile snapshots (0.091)
├── simulate.mjs          balance report / multi-seed mean ± sd (analyze() flags smells)
├── shrine-study.mjs      per-boon shrine experiment (forced boons, paired seeds)
├── bump.mjs              sets build.json version + module manifest (0.082)
└── gen-depth.py          depth maps for backgrounds (Depth Anything V2 Small, ONNX)
```

## Keyboard map

| Key | Where | Action |
|---|---|---|
| `A` | dungeon | Attack first living enemy |
| `H` | dungeon | Heavy Attack (2x dmg, 3-turn cd) |
| `P` | dungeon | Drink Potion (also after a room is cleared, 0.080) |
| `D` | dungeon/hub | Push Deeper / Descend |
| `R` | dungeon | Retreat with Loot (after clear) |
| `F` | dungeon | Accept Your Fate (death) |
| `1` `2` `3` | shrine | Accept boon |
| `E` / `N` | title | Enter Castle / New Game |
| `P` `V` `F` `R` `E` | hub | Train Power / Vitality / Fortune / Precision / Endurance |
| `U` | hub | Buy potion (up to the satchel cap) |
| `X` | hub | Expand potion satchel (+1 cap) |
| `A` `Y` `N` | hub | Alchemy tracks: Potency / Efficiency / Infusion (coins) |
| `D` / `B` | hub | Descend into the Dungeon / Back |
| `G` | run-end | Return to Great Hall |
| `D` / `Space` | dungeon | Push Deeper (key2) |
| `Enter` | anywhere | Primary button |

MUSIC/SOUND toggles are click-only buttons (persist to localStorage).

## Data flow

1. `main.js` loads JSON once into `shared/data.js :: DATA`.
2. Hub reads/writes profile via `meta/*` and persists immediately.
3. Starting a run snapshots `derivedStats()` into `run.stats` — mid-run
   profile changes don't affect the current run. Shrine boons mutate
   `run.stats` directly (run-scoped).
4. Dungeon scene drives `run/combat.js`; kills route loot through
   `runState.applyLoot()` into the run object.
5. Run end (death OR retreat) → `settleRun()` → profile → persist → hub.
   Potions are a persistent stock (0.080): the run draws `profile.potions`,
   and whatever is left comes back at settle (both outcomes), capped by
   `profile.potionCap` (the satchel). Pickups past the cap sell for coins
   (`runState.addPotion`).

## Editing conventions (for humans and AI assistants)

- Balance changes: edit `assets/data/*.json` only. Never hardcode numbers
  in `src/`.
- New enemy: add to `enemies.json` (tier 1–3) + drop `<id>.webp` in
  `assets/chars/` (WebP with alpha, quality 85 — 0.078). RoomGen, LV naming, scaling, and the card portrait
  pick it up automatically.
- New item: add to `items.json` with a `slot` and `tier`; `loot.js` and
  `equipment.js` handle the rest. Salvage value per tier: `salvagePerTier`.
- New shrine boon: add to `shrines.json` (text + its numbers) AND the
  matching case in `run/shrine.js` (ids are code-mapped). The shrine deals
  3 random offers from the pool (Fisher-Yates in `run/shrine.js ::
  dealOffers`, shared with the simulator; stored on `room.dealtOffers` so
  re-renders are stable).
- New room background: drop the file in `assets/bg/`, add to `rooms` and
  `roomNames` in `backgrounds.json`.
- New scene: create `ui/scenes/xScene.js` exporting `enter(root)`,
  navigate via `show(xScene())`.
- Item rarity colors (0.047): tier-driven via `hud.js :: rarityClass /
  itemName` + `.rarity-1/2/3` in styles.css — T1 ash, T2 azure (soft
  pulse), T3 amethyst (strong pulse). Use `itemName()` anywhere an item
  name renders; salvaged loot stays muted `.rarity-1 .salvaged` on
  purpose. `equipItems()` summaries carry `{name, tier}` so run-end can
  color them.
- Player card gear lines (0.048): weapon line shows ACTUAL total damage
  (`run.stats.dmg` — includes Power training + shrine boons), armor line
  shows the equipped armor + its stat. Both are flex rows needing
  `width: 100%` because `.char-card` is `align-items: center` (same
  reason `.card-head` sets it — forgetting this collapse the row).
- Keep files under ~300 lines; one responsibility per file. If a scene
  grows past that, extract a module (see combatPlayback/shrineUI/buffs).
- Every button that should be keyboard-reachable gets `key: 'x'` in el().
- `el()` boolean attrs: false/null/undefined = not set. `children` of a
  real DOM node is READ-ONLY — clear with innerHTML, never assignment.
- The combat layout is fluid on purpose (0.042): the card-combat block in
  styles.css sizes in vh/vw (cards 50vh, chrome pinned to viewport edges)
  so the fight fills any screen identically. Do NOT author fixed px in
  that block — px there is exactly what broke the layout on the TV.
  Panel scenes (hub/title/shrine/run-end) stay in tuned px, same as ever.
- Combat card art (0.074): the card frame PNG sits on `.char-card::before`
  at opacity 0.85 (room art shows faintly through) so card content stays
  fully opaque. z-index:-1 is safe because `.battle-line` (the stacking
  context) has no background of its own.
- Portraits break the card frame (0.075): `.portrait` is absolutely
  positioned, bottom-anchored (feet under the hp line), height 108% /
  max-width 142% — object-fit:contain can never exceed the img box, so the
  box itself is oversized and max-width is the real constraint on wide arts.
  Text rows (.card-head/.card-sub/.hp-line) are z-index 2 above the art.
  Bosses loom via `.boss-card` (116%/165%); per-id `enemy-<id>` classes
  allow individual boosts (vampire_lord: 126%/190%). player.png is WIDE
  (aspect 1.11), so `.player-card .portrait` bleeds sideways (width 135%,
  max-height 67% keeps the head clear of the 4 gear-text rows) and
  `.player-card .hud-chip` needs margin-top:auto to re-pin the HP row
  (the in-flow portrait's flex used to push it down).
- Text centering (0.092): button labels center their CAPITALS (the hotkey
  underline hangs below, ignored) with `text-box: trim-both cap
  alphabetic` + padding back to 1lh, so it holds on every OS — Mac,
  Windows and Linux read different vertical metrics from the font. The
  `top: 0.15em` nudge remains as the fallback. Fallback-font glyphs in
  text rows (the elite ★) get `line-height: 0`, or their taller line box
  shifts the row.
- Asset cache rule: NEVER replace an asset file in place (edge caches hold
  ~4h) — new content gets a new filename.

## Build & release conventions

- Build number lives in `assets/data/build.json`; bump every build; shown
  top-left on every screen (check it when reporting bugs).
- Run `node tools/smoke-test.mjs` before any release — all checks green
  (~308; the count legitimately varies by one on RNG).
- Historical: up to 0.042 the game shipped as `Game_Build_X.XXX.zip`;
  distribution is web-only since 0.043 (see below).

## Web deployment (current, 0.073+)

**Production:** https://www.castleofthecrimsonmoon.com — GitHub Pages
serving the `main` branch root of
https://github.com/pjarvilehto/CastleoftheCrimsonMoon behind Cloudflare
DNS. The repo IS the site: pushing to `main` redeploys in ~1 minute.
A `CNAME` file at the repo root pins the custom domain. DNS: CNAME
`www` → `pjarvilehto.github.io` (DNS-only so GitHub can issue the TLS
cert), apex handled by an AAAA `100::` placeholder (proxied) + a
Cloudflare Redirect Rule (301 → www).

**Staging:** https://ublgmuyncizrq.kimi.page — published manually by the
user from Kimi version cards (one card per build).

**Release loop (game changes):**
1. Edit, bump `build.json`, `node tools/smoke-test.mjs` — all green.
2. Screenshot any visual change (headless chromium harness).
3. Commit and push to GitHub (production updates itself).
4. Save a Kimi version card for staging; the user publishes it.

**Save-game caveat:** profiles live in localStorage, which is per-origin.
Saves on the kimi.page origin do NOT carry to the custom domain (and vice
versa) — use the title screen's export/import save codes to migrate.

Gotchas learned the hard way (the Kimi staging deploy tool — the first
four bullets concern it; GitHub Pages has none of these issues):
- The deploy tool ONLY accepts `/mnt/agents/output/app` as the project
  dir; other paths are rejected. Keep `app` in sync with any working
  copy (e.g. castle-roguelike/) before deploying.
- Publish URLs are bound to the site identity at publish time — NOT a
  mutable "latest" pointer. Deploying from a different project dir
  creates a NEW site with a NEW URL; the old URL keeps serving its last
  bytes forever. (0.045 lesson: the project moved from
  `castle-roguelike/` to `app/`, so `m6bnjvev4lryq.kimi.page` was
  orphaned on 0.044 and `ublgmuyncizrq.kimi.page` was minted for 0.045.
  Hours were lost polling the old URL for an update that could never
  come.)
- The deploy tool's response may come back with the URL blank on the
  agent side; verify by curling the known URL, don't wait on the
  response. If the tool returns a new URL, THAT is the live one.
- NEVER touch the host's visibility settings ("Make Private" kills the
  link and a new deploy is needed).
- The build number top-left is the source of truth for "did the player
  get the new build" — browser cache sometimes needs a hard refresh.
- Right after deploying, the first page load can race propagation; if it
  looks stale, wait ~30s and reload.
- Backgrounds are JPEG (re-encoded 0.044: 33.5MB → 4.6MB). New room art
  goes in `assets/bg/` as `.jpg` with the entry in `backgrounds.json`
  matching. Original PNGs survive in the old `Game_Build_0.040.zip`.
- Character portraits keep alpha as WebP in `assets/chars/` (0.078:
  9.6MB of PNGs → 1.5MB). Card frames stay PNG.

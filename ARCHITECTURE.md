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
├── core/scene.js         scene manager, transitionTo() (try/finally!),
│                         bg crossfader (bg0/bg1 layers), el() helper,
│                         handleKey()/initHotkeys()
├── meta/                 PERSISTS across runs (localStorage)
│   ├── storage.js        the only file that touches localStorage;
│   │                     exportProfile()/importProfile() — base64 save
│   │                     codes for cross-origin transfer (new URL = new
│   │                     localStorage, so saves must be carried by hand)
│   ├── profile.js        coins, xp, stat levels, equipment, records,
│   │                     resetProfile(); save schema v1 + migration
│   ├── equipment.js      slot rules + auto-equip/salvage logic
│   └── leveling.js       training costs, buyStat(), restockPotion()
├── run/                  EXISTS only during a dungeon run
│   ├── runState.js       run object, room progression, settleRun()
│   ├── roomGen.js        threat-budget combat rooms, boss every 8,
│   │                     ONE shrine guaranteed in rooms 2-7, room kinds
│   ├── combat.js         combat core: attacks, crits, lifesteal,
│   │                     MULTI-KILL damage spill — HEAVY attacks only
│   │                     (>= 2x target HP; basic attacks never spill)
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
    ├── combatPlayback.js log drip queue + replay-HP (owns printing lock)
    ├── battleLine.js     card components: playerCard + enemyCard (units =
    │                     card + button row beneath; HP as text+bar line)
    ├── shrineUI.js       shrine room rendering
    ├── buffs.js          blessing bar (horizontal, beside resources)
    └── scenes/           titleScene, hubScene (two-panel grid),
                          dungeonScene (combat = chromeless card layout,
                          shrine = panel layout), runEndScene

assets/
├── bg/                   painted backgrounds + shrine art (gold/crystal)
├── fonts/                DINCondensedBold.ttf (user-supplied)
└── data/                 ALL balance numbers live here as JSON:
                        enemies, items, difficulty, backgrounds
                        (incl. roomNames), shrines, build
styles.css              all styling (split out of index.html in 0.034)
```

## Keyboard map

| Key | Where | Action |
|---|---|---|
| `A` | dungeon | Attack first living enemy |
| `H` | dungeon | Heavy Attack (2x dmg, 3-turn cd) |
| `P` | dungeon | Drink Potion |
| `D` | dungeon/hub | Push Deeper / Descend |
| `R` | dungeon | Retreat with Loot (after clear) |
| `F` | dungeon | Accept Your Fate (death) |
| `1` `2` `3` | shrine | Accept boon |
| `E` / `N` | title | Enter Castle / New Game |
| `P` `V` `F` | hub | Train Power / Vitality / Fortune |
| `U` / `B` | hub | Buy potion / Back |
| `A` | hub | Train Alchemy (+5 potion heal/lvl, coins-only, 3x potion track) |
| `G` | run-end | Return to Great Hall |
| `Enter` | anywhere | Primary button |

## Data flow

1. `main.js` loads JSON once into `shared/data.js :: DATA`.
2. Hub reads/writes profile via `meta/*` and persists immediately.
3. Starting a run snapshots `derivedStats()` into `run.stats` — mid-run
   profile changes don't affect the current run. Shrine boons mutate
   `run.stats` directly (run-scoped).
4. Dungeon scene drives `run/combat.js`; kills route loot through
   `runState.applyLoot()` into the run object.
5. Run end (death OR retreat) → `settleRun()` → profile → persist → hub.

## Editing conventions (for humans and AI assistants)

- Balance changes: edit `assets/data/*.json` only. Never hardcode numbers
  in `src/`.
- New enemy: add to `enemies.json` (tier 1–3) + drop `<id>.png` in
  `assets/chars/`. RoomGen, LV naming, scaling, and the card portrait
  pick it up automatically.
- New item: add to `items.json` with a `slot` and `tier`; `loot.js` and
  `equipment.js` handle the rest. Salvage value per tier: `salvagePerTier`.
- New shrine boon: add to `shrines.json` AND the matching case in
  `run/shrine.js` (ids are code-mapped). The shrine deals 3 random
  offers from the pool (Fisher-Yates in `shrineUI.js :: dealOffers`,
  stored on `room.dealtOffers` so re-renders are stable).
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

## Build & release conventions

- Build number lives in `assets/data/build.json`; bump every build; shown
  top-left on every screen (check it when reporting bugs).
- Ship as `Game_Build_X.XXX.zip` with the launcher + icon instructions
  inside. Run `node tools/smoke-test.mjs` before zipping; spot-check the
  zip (`unzip -p ... | grep`) for the files you just changed.

## Web deploy loop (primary distribution)

Live dev URL: **https://ublgmuyncizrq.kimi.page** (the player's
profile/save lives in that origin's localStorage).

Loop: edit → bump `build.json` → `node tools/smoke-test.mjs` → sync any
working copy to `/mnt/agents/output/app` → deploy from `app` → curl
`assets/data/build.json` on the URL (expect the new version) → open the
URL, screenshot, confirm the new build number → tell the player to
hard-refresh.

Gotchas learned the hard way:
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
- Character portraits keep alpha (PNG) in `assets/chars/`.

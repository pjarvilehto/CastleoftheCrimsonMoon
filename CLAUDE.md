# CLAUDE.md — Context notes for AI assistants

**Castle of the Crimson Moon** — a gothic roguelite browser game. Vanilla JS
ES modules, **no framework, no build step**. DOM-based UI over full-screen
painted backgrounds (3D when WebGL allows); DIN Condensed Bold via
@font-face. You play as The Curious Knight pushing deeper into a castle:
card-based combat rooms, a shrine in every 8-room stretch, a summoning boss
every 8 rooms, the game "won" at the room-24 boss, and meta progression
(training, alchemy, forge) in the Great Hall between runs.

`ARCHITECTURE.md` is the code map, data flow and keyboard map — read it
before structural changes. This file is the rules and the per-system notes.

## Where things live

- **Production:** https://www.castleofthecrimsonmoon.com — GitHub Pages
  serving `main` (repo root = site root) behind Cloudflare DNS; **pushing to
  `main` redeploys in about a minute.** The build number is in
  `assets/data/build.json` and shown top-left on every screen.
- **Play stats:** https://www.castleofthecrimsonmoon.com/analytics/
  (`analytics/`), fed by the collector Worker in `collector/`
  (https://castle-stats.petri-jarvilehto.workers.dev; see "Play stats").
- **Particle Lab:** `particle-lab/`, opened from the `?debug` corner column —
  a standalone page for trying particle looks (see "Effects").
- **Dungeon Lab:** `dungeon-lab/` (0.139), also a `?debug` button — the 3D
  dungeon-exploration prototype (see "3D dungeon prototype").
- **Staging (legacy):** ublgmuyncizrq.kimi.page, published by the owner from
  Kimi version cards — not maintained here.

## Quick start

```bash
python3 -m http.server 8000                  # repo root -> http://localhost:8000
node tools/smoke-test.mjs                    # the suite: ~625 checks, under a second
node tools/smoke-test.mjs combat             # test files whose name contains "combat"
node tools/simulate.mjs --runs 40 --seed 1   # headless balance bot (one campaign)
node tools/simulate.mjs --seeds 1-12 [--retreat]   # 12 campaigns, mean ± sd
node tools/shrine-study.mjs --n 500          # per-boon shrine balance (paired runs)
node tools/stat-study.mjs [--set path=json]  # what each upgrade is worth
```

## The rules that matter

1. **Run state never writes to meta state directly.** Everything earned in a
   dungeon accumulates in the `run` object; `run/runState.js :: settleRun()`
   moves it into the profile in one transaction (death banks half the
   coins, retreat all). New earning? Route it through the run object.
   (`victorySeen` and `bench` are UI records, saved at once by design.)
2. **All tuning lives in `assets/data/*.json`** — enemies, items,
   difficulty (incl. `player` base stats, `combat` multipliers), shrines
   (every boon's numbers; a smoke check keeps the card text in sync),
   backgrounds, audio, telemetry. Never a number in `src/`, and no `?? N`
   fallback copies (they drifted, 0.116): every number the code reads is
   listed in `shared/dataCheck.js` and checked at load — new knob, new line.
3. **Save format changes go through `SAVE_VERSION`** (`meta/migrations.js`,
   now 4): bump it and append a step to `MIGRATIONS` — never edit a shipped
   step. New defaults: `DEFAULTS` / `freshProfile()` in `meta/profile.js`.
4. **Loot (0.091):** a drop that can't beat the gear (as it will be after
   this run's finds, `run.gearPreview`) is salvaged on the spot; only
   upgrades land in `run.itemsFound`. One shrine per stretch of `bossEvery`
   rooms (`run.shrineRooms`: 2-7, 10-15, ...); coin boons can have a flat
   price (`flatCost`).
5. **Potions persist** (0.080): a run draws the profile's stock and
   `settleRun()` writes back what's left, capped by `potionCap`; pickups go
   through `runState.addPotion()` (sold when the satchel is full).
   **`run.stats` is a snapshot** taken at run start; mid-run loot does
   nothing until `settleRun()` auto-equips it.
6. **Every game or stats-page change ships as a numbered build:** `node tools/bump.mjs 0.NNN
   --note "..."` (version + module list + the changelist in
   `build.json` / `changelog.json`), the smoke suite green, then push to
   `main` and the working branch. Notes are player-facing (the "Build
   0.NNN available" prompt and the CHANGELIST button): short, one `--note`
   per change. **Bump for every `src/` or `analytics/` change, debug-only
   ones too:** both pages load their modules under `?v=<build>`, so an
   unbumped change stays cached in players' browsers (0.127).
7. **Never replace an asset file in place** (edge caches hold ~4 hours) —
   new content, new filename.

## Working with the owner

- `main` is the live site: merge what lands there, never force-push it.
  Don't touch `CNAME` or the Pages / DNS settings — the owner handles them.
- **The collector is deployed by hand:** after changing
  `collector/worker.js`, bump its `VERSION` and `telemetry.json
  collectorVersion` together and ask the owner to paste the file into the
  Cloudflare dashboard (Edit code → Deploy; copy the raw file — GitHub's
  normal view can truncate a selection). Until then the dashboard warns
  that the collector is older, and the old Worker drops new fields (saves
  keep them; they arrive with the next upload).
- The collector's `READ_KEY` is the owner's secret: never ask for it. Cloud
  sessions can't reach the collector anyway; **play-stats data arrives as
  screenshots of the dashboard.**
- CI's deploy job stays off until the owner opts in (see Testing).

## Architecture in one paragraph

`src/main.js` boots: mobile check → load all data JSONs into `DATA` →
preload the title + Great Hall art → title scene (the rest of the art loads
behind it). `core/scene.js` is the scene manager (`show()`, fades,
background crossfader) and router (`go('hub')`; scenes register in
`ui/scenes/index.js` and never import each other); `core/dom.js` has `el()`,
`core/hotkeys.js` the hotkeys and the dialog key-trap stack. `meta/` is
persistent profile state (localStorage, versioned save + migrations, run
history, save codes, telemetry); `run/` is per-dungeon state (rooms,
combat, shrine, loot). `ui/` renders it: combat is a fluid card layout whose
turn resolves instantly and is replayed line by line (`combatPlayback.js`,
effects in `combatFx.js`, the battle line in `battleRoom.js` +
`battleLine.js`); panel scenes use tuned px. `audio/` has the music beds and
sound effects; `analytics/` is the separate static stats page.

## Systems

**Combat and pacing.** A turn (`run/combat.js playerAttack`) runs in phases:
rollHit → SMASH/OVERKILL (a heavy blow covering every living enemy's HP) or
strike (+ spill: heavies of `spillThreshold` x the target's HP sweep on) →
lifesteal → enemy phase (dodge, armor, thorns, revive) → boss summons →
cleared. Its events become playback items (`ui/combatQueue.js`) printed
with their state snapshot, effect and sound; pacing in `difficulty.json
combatPacing`. Boss summons (0.092): `boss.summon` (every N turns,
maxAlive, scaling); summons give no rewards and join the line in front of
the boss. The win (0.121): beating the boss of `finalBossRoom` (24) shows
`ui/victoryModal.js` once per save; move the knob when deeper content lands.
`node tools/simulate.mjs --tactic suggested|boss|summons` compares targeting.

**Progression.** HP scale (0.093): player HP, enemy damage, armor, potion
heals and lifesteal are 10x their old values; enemy HP and player damage
were not scaled — keep new numbers on that scale. Upgrades never charge for
nothing (0.112): capped effects use `meta/stats.js taper` (linear `perLevel`
for `linear` levels, then each level closes a share of the gap to `max`,
or `tail: k` = level n adds perLevel·(linear/n)^k) — Precision
(`player.precisionTaper`, every level also +`critDamagePerPrecision` crit
damage; chance past `critCap` becomes crit damage) and Efficiency (tail
1.5, MAX once a level adds < `minStep`). Hub lines show the next level's
real gain. Low health (0.126): at or under `lowHpShare` (35%) the knight's HP
bar glows and, with potions left, Drink Potion pulses red (`ui/hud.js
isLowHp`).

**Effects.** One-shots (lunge, hit, numbers, entrance, shake) live in
`ui/combatFx.js` + `fxParts.js`, driven by `fx` descriptors on playback
items, and use `element.animate` so they never restart the CSS idle loops
(per enemy FAMILY: `battleLine.js IDLE_FAMILY` + `.idle-<family>`; loops
animate only translate/rotate/scale, never filter). **Particles** (looks
0.128, picked in the Particle Lab): `ui/particleLooks.js` says what a burst
is — `MATERIAL` per enemy id (default blood), `STYLE_OF` per material:
blood = Ink & Gore (ink slash, stretched blobs, floor splats); bone,
embers (a yellow fire ramp + cinders) and the wraith = Spark & Streak
(impact ring, two on a crit; streaks cooling from white-hot); bursts come
as hit / crit / kill; pure and tested. `ui/particles.js` draws them on one
canvas per session: batched (one Path2D per pass/colour/alpha-step/width;
a per-particle save/restore or gradient doubled the frame cost in 0.128),
slow overlapping fades (splats) drawn one by one (batched, they flickered),
only last frame's painted box cleared, 1.25x DPR (1x once the background
stepped down), new bursts thin out past `BUDGET` live particles; off when
the background fell back to flat. OVERKILL bursts every victim. The lab is
a copy for experiments: keep it in step when a look changes.

**3D backgrounds** (`core/bg3d.js` + `bg3d*.js`; tuning in
`backgrounds.json parallax`, per-file `overrides`, `enabled: false` = kill
switch): the art on a depth-displaced mesh with a slowly swaying camera;
flat CSS fallback with no WebGL, software GL, context loss or reduced
motion. Frame rate: at most `maxPixels` (2.1M), redrawn at `maxFps` (30)
when nothing moves, and all session a device under `minFps` (22) steps
down — resolution x0.8, x0.64, no fog, flat (`core/bg3dQuality.js`). Keep
per-pixel shader work minimal; slowly varying terms go per vertex. Fog:
distance haze + ~40 soft mist puffs (`bg3dPuffs.js`, half resolution) per
`parallax.overrides.<file>.fog` and `fogWind`. Flash lights (crit, potion,
revive): `bgLight(kind, rect)`, settings in `parallax.lights`. Big-hit sway:
`swayDeg` / `swayHitShare`. New room art: JPEG in `assets/bg/`, entries in
`backgrounds.json` (`rooms`, `roomNames`) and a depth map (`python3
tools/gen-depth.py <model.onnx> new.jpg`; the suite fails without one).

**Audio.** One AudioContext (`audio/audioCore.js`, gesture-gated); every
sound goes music/effects bus → master → limiter (`audio/mixer.js`), levels
and ducking in `audio.json`. **Sound registry:** `audio.json clips` — per
name a `file` or `synth: true` (`audio/synth.js`), `gainDb` trim
(`measuredDb` = its loudest 50 ms), `stinger`, `rate`, `jitterDb`; a new
sound is one entry. Combat lines go through `ui/combatSfx.js` (panned to the
card, timed to the blow, crit/mega/overkill sweeteners). Music: five
generated beds (`audio.json music.tracks`; `python3 tools/gen-music.py
--suffix vN`, new suffix = new files), each an exact loop with its first
`tailS` seconds appended, restarted every `loopS` by `musicLoop.js`. Measure
for real with `node tools/audio-check.mjs`; tests use a fake AudioContext
(`tools/test/fakeAudio.mjs`, which rejects NaN like browsers).

**UI conventions.**
- Every dialog: `ui/dialog.js openDialog({ label, children, onKey, proceed })`
  — it owns the keyboard (key-trap stack) and is tracked (`anyDialogOpen`,
  `closeAllDialogs`). Dialogs live above the scenes, so a scene switch does
  not close them. Yes/no: `ui/confirmPrompt.js`.
- Keyboard-reachable buttons get `key: 'x'` in `el()`; a screen's way
  forward also gets `proceed: true` (Space clicks it, a tiny `[space]` sits
  under its label; in a dialog pass it as `openDialog({ proceed })`).
  Yes/no prompts and text fields don't get one. A held Space steps once.
- The obvious next button gets `class: 'active'` (pulsing yellow) or
  `'active active-red'`.
- Upper-right column (`ui/cornerToggles.js`): add buttons in main.js's
  `cornerBar([...])` with `onOffToggle` / `panelToggle`; the `?debug` tools
  (INVULNERABLE, background views and tuning, FORCE CRITS, PARTICLE LAB,
  BENCHMARK, DUNGEON LAB) are in `ui/debugToggles.js`. No pixel offsets.
- A scene that is mid-run sets `inRun: true` (the update prompt waits).
- Combat layout (styles.css) is fluid (vh/vw) on purpose — no fixed px
  there; panel scenes stay in px. Card size is `--card-h` (min of 50vh and
  what fits `--n` enemies); card internals are `em`. Card frame art on
  `.char-card::before` (opacity 0.85); portraits overflow the frame;
  per-enemy tweaks via `enemy-<id>` classes.
- Phones and tablets (0.125, `shared/platform.js isMobile`) get a "Mobile
  platforms not supported yet" card and the boot stops; `?desktop` skips
  the check. Remove it when a portrait layout lands.
- Asset loading (`shared/preload.js`): boot waits for the title + Great
  Hall art only; the hub's Descend waits for the rest if needed.
- Shared helpers: `shared/version.js` (never compare build numbers as
  strings), `shared/level.js`, `shared/prefs.js` (per-browser settings).

**Play stats and performance.** Every finished run appends a record to
`profile.history` (`meta/history.js`, newest 250), including its frame-rate
summary (`core/perfMonitor.js`: fps, slowest 5% frame ms, refresh rate,
dropped frames, worst frame, background mode — recorded from dungeon entry
to the run's end). `meta/telemetry.js` POSTs the save's stats (anonymous
`playerId`, the typed `profile.name`, plus the device: GPU, browser, OS,
cores — never stored in the save) after every run and once per session to
the collector (endpoint in `telemetry.json`; off when empty, never from
localhost). The collector (`collector/worker.js`, Cloudflare KV) keeps only
the dashboard's fields, typed and capped, merges history by timestamp and
rate-limits; reads need the Bearer `READ_KEY`. The dashboard shows the
collected players, this browser's save and pasted save codes (untrusted:
`sanitizeProfile()`), deduped by playerId; the owner can give each player a
**tester name** (kept in that browser, shown as "tester · player name"). **BENCHMARK**
(`ui/benchmark.js` + `ui/scenes/benchmarkScene.js`): a seeded, fixed ~36 s
fight (idle / combat / overkill) on the real combat pieces, the background's
quality ladder held; result → `profile.bench` (newest 10, never the run
history) → the dashboard's Benchmarks card. Every player is asked once,
entering the Great Hall with best room ≥ `benchmarkPromptRoom` (10) and no
result yet (Continue only; it waits while another dialog is up and never
interrupts a descent). Changing the script (`PHASES`) changes what the
numbers mean — say so in the changelist. Reading results: a 30 Hz rate
means the browser capped the page (macOS Low Power Mode, Chrome / Brave
Energy Saver), not a slow machine.

### 3D dungeon prototype (0.139)

Grimrock-style exploration between combat rooms, prototyped apart from the
game: `dungeon-lab/index.html` + `src/explore/`, tuning in
`assets/data/explore.json` (not part of `DATA`; the lab fetches it itself).
The page's `<base>` is the site root and it maps every module in
`build.json` under `?v=` (it imports the game's combat, data, hotkeys and
sound); a test keeps `src/explore/` away from the save and the play stats.
three.js 0.186.1 is vendored, minified, in `vendor/three-0.186.1/` (MIT,
licence alongside) and reached through the page's import map as `three`; a
new three.js version = a new folder. The game never imports `src/explore/`.
- `grid.js` (pure, tested in Node): the text map ('#' wall, '.' floor, 'S'
  start), circle-vs-cell collision that slides along walls, seeded random.
- `mapgen.js` (0.140, pure; linear and half the size since 0.143, at the
  owner's request): a floor from a seed (`explore.json gen`) — a chain of
  rooms laid one after another along a winding path (`straightness`,
  `linkMin..linkMax` cells of corridor between them), each joined only to
  the next by an L corridor that touches no other room, up to `deadEnds`
  short spurs; a floor where walking order differs from the chain (a fork
  or shortcut) is redrawn. First room = start, then the `encounters` in
  order with the shrine halfway, the boss (bossSize), and past it one
  cell of stairs (0.144, `floor.stairs` with its `down` direction); marked
  'E' / 'H' / 'B' / 'X' in the rows. Rooms are small (`roomMax` 3) so the
  enemy plainly stands across the way. The lab: `?seed=N`,
  the N key = next floor; `minimap.js` shows only what the knight has seen.
- Encounters (0.141): floor n = the game's rooms (n-1)*8+1..n*8
  (`encounters.js`: encounters nearest first, the boss chamber the boss
  room; each room from `run/roomGen.js`). `encounterLayer.js` stands the
  group's strongest enemy in the room (`billboard.js`: the portrait on an
  upright card facing the knight, alpha-cut so it gets inked, its cropped
  bottom torn ragged, a little `glow`, a red `light.lair` before the
  nearest) — stepping in turns the knight to it, dims the view
  (`paint.fightDim`) and plays the game's fight over it (`fight.js`, the
  dungeon scene's parts: battle line, playback, effects, sounds); Onward
  clears the room, a death Rise Again (depth 1, a fresh run). 0.144: the
  shrine room opens the game's shrine (`renderShrineRoom`, priced as the
  room after the encounter before it); past the boss the stairs (a pit
  with steps in build.js; `stairs.js` = one pulsing light from below in
  the NEXT tier's `glow`, and the walk down with the paint pass's `fade`
  to black) lead to the next floor once the boss is down; Return (R, or
  the button, whenever no fight or dialog is up) ends the visit with its
  tally (To the Great Hall / Descend Again). One `run` object carries HP,
  potions and loot through the visit and is never settled. Particles stay
  off in the lab (they follow the game's 3D background).
- Look pass (0.142): rooms are `roomHeight` tall (a header wall over each
  opening); `decor.js` adds arches at room entrances, pillars in rooms 4+
  a side (`posts`, collided in `grid.js`), chains, rubble, glossy puddles
  and the shrine's candle altar (one light in the torch pool), merged per
  material; torches get a glow halo; `mist.js` is one drifting point cloud.
  `explore.json tiers` = one look per depth (the last repeats): texture
  palette, fog / hemisphere / mist colours and the paint pass's shadow
  tint (`paint.setShadow`). Prop UVs come from world size (`geom.js
  worldUV`). Keep the draw calls down (~80 a frame): merge, don't add meshes.
- Light and rooms (0.145, the DD2-style polish): `lights.js` runs the
  knight's torch and a pool of `light.pool` point lights over every light
  source (wall torches, candles, braziers, hearths, windows, cauldrons:
  entries with their own colour / power / reach), the nearest
  `shadows.count` casting shadows (cube maps redrawn only when the pool
  moves or every `everyFrames`; `shadowAll` marks the casters); post.js
  adds `haze` — each pool light's in-scatter along the view ray, in
  closed form. Rooms are themed (`themes.js`, pure: antechamber start,
  sanctum shrine, throne boss, the rest by the tier's `themes` weights;
  `path` = centre row/column + `floor.trail`, the corridor cells — keep
  furniture off it, the suite checks; a bend can fall inside a room) and
  furnished (`furnish.js` kit: pieces merged per material from
  `propMaterials.js` / `propTextures.js`, light sources, collision
  `boxes`; `rooms.js` = one function per theme, after the assets/bg
  paintings; `vault.js` = the chapel / throne pointed vaults, light shafts
  are cone beams with a view-facing fade). `corridors.js` dresses the
  corridors (`explore.json corridor` chances). `quality.js`: under
  `quality.minFps` for a while, shadows go, then resolution; `?hold`
  keeps full quality (screenshots on software GL).
- Light from afar (0.146): `lightField.js` bakes every source of a floor
  into a light map over the plan (`field`: texels per cell, walls block
  by line of sight, ~10 ms) that every lit material reads in its shader
  (`patchMaterial`: indirect light from the texel just off the surface;
  the billboards too). The pool's point lights only add the near detail:
  each fades in by distance (`field.dynamic` near..far, `share`), ramps
  up when it takes a light, and keeps its source until a newcomer pulls
  clearly harder (`swap`) — before, a torch beyond the six nearest lit
  nothing and switched on as you approached. Each theme has a `fill`:
  a bounce source baked only (`bakedOnly`, no flame, no haze). Window
  beams fade with distance (60% of the fog).
- `build.js`: one merged mesh per surface kind, vertex-colour AO, wooden
  frames on straight corridors, wall torches `decor.torchSpacing` apart.
- `textures.js`: every surface painted on canvas in the style of
  `assets/bg/castle_dungeon.jpg` (flat olive stone, broken ink outlines,
  ink chips and drips) plus a normal map from a blurred height canvas.
- `post.js`: the ink-and-paint pass (look reference: Darkest Dungeon 2):
  depth-Laplacian ink outlines, ACES, then graded in display space: soft
  light bands, desaturation, olive shadows / warm light, hatched ink in
  the deepest dark, grain, vignette. All knobs in `explore.json paint`.
- `player.js`: WASD / arrows, Q / E turn, Shift runs, mouselook under
  pointer lock; eased velocity, head bob. `lab.js` wires it up: the
  knight's torch rides with the camera (lights.js, lightField.js: see
  above for the light pool and the baked field).
Next steps discussed with the owner: integration into runs (shrine
rooms, retreat rules, settling the run).

## Testing notes

- `tools/smoke-test.mjs` runs `tools/test/*.test.mjs` (by area: scenes,
  combat, shrines, progression, content, backgrounds, audio, sim, history,
  explore), each starting from `fresh()`. `tools/test/harness.mjs` holds the DOM shim
  and a **virtual clock** (timers, rAF, Date.now, performance.now; `sleep(ms)`
  advances it) — write tests with `sleep()` as if time were real; even a
  whole benchmark runs in milliseconds.
- The shim has deliberate limits: no `appendChild` / `querySelector` on
  elements, `match()` supports hardcoded selectors only, `children` is
  read-only, and `classList` doesn't update `className` (check
  `classList.contains`). Click = `el.listeners.click[0]()` or `handleKey()`.
- The check count can vary by one (an assertion that runs only when a
  fixture run dies). A flake gets one rerun; a repeat is real — and a
  random-dependent check should be seeded (0.136).
- Balance-sensitive tests use constructed fixtures; per-level stat changes
  need them retuned. Refactors of combat: compare `simulate.mjs` output
  before and after (byte-identical).
- Browser checks: Playwright with Chromium at `/opt/pw-browsers/chromium`
  (`--use-gl=angle --use-angle=swiftshader` for WebGL; it's slow, so judge
  relative numbers only). Use a fresh context; disable CSS transitions for
  stills if a fade gets in the way.
- CI (`.github/workflows/test-and-deploy.yml`) runs the suite on every push
  and PR. Its deploy job is off until the repo opts in (Pages source "GitHub
  Actions" + repo variable `DEPLOY_VIA_ACTIONS=true`); until then Pages
  deploys `main` directly, tests or not.

## Deployment details

- GitHub Pages: **Settings → Pages → Deploy from a branch → `main` /
  `(root)`**. All paths are relative, so the site also works under
  `…github.io/CastleoftheCrimsonMoon/`.
- Cloudflare DNS: `CNAME www → pjarvilehto.github.io` (**DNS only**, grey
  cloud — needed for GitHub's certificate), apex redirect via placeholder
  `AAAA @ → 100::` (proxied) + Redirect Rule `http.host eq
  "castleofthecrimsonmoon.com"` → 301 `https://www.castleofthecrimsonmoon.com`.
  Once the certificate is issued, **Enforce HTTPS** in the Pages settings.
- Saves are localStorage, i.e. **per origin**; the title screen's
  export/import save codes carry a save between origins.
- `wrangler.jsonc` + `.assetsignore` (Cloudflare Workers static assets) are
  an alternative hosting path, unused.

## Backlog (as of 0.137)

- Game: merchant room (endgame coin sink) · more bosses (only the Vampire
  Lord) · the room-24 boss is a wall (~5% clear in the simulator) and meta
  saturates past ~60 runs — deeper tiers or NG+ (then move `finalBossRoom`)
  · thorns relic is a flat 4 damage, weak against scaled enemy HP · more
  room kinds · portrait / phone layout (then drop the mobile notice).
- Engineering: deploy through the test workflow once the HTTPS setup is
  settled · font as WOFF2 (212KB TTF) · the Particle Lab can go once nobody
  is experimenting with looks.
- 3D exploration (Dungeon Lab, 0.139; generator 0.140; encounters 0.141):
  shrines in 3D · into the run loop (open: a floor per 8-room stretch?
  retreat rules? static or wandering enemies?).
- Other: check the DIN Condensed web-embedding licence (macOS system font)
  · orphaned legacy staging site cleanup.

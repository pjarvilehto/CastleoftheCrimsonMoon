# CLAUDE.md — Context notes for AI assistants

**Castle of the Crimson Moon** — a gothic roguelite browser game. Vanilla JS
ES modules, **no framework, no build step**. DOM-based UI over full-screen
painted backgrounds; DIN Condensed Bold via @font-face. You play as The
Curious Knight pushing deeper into a castle: card-based combat rooms, a
shrine in every 8-room stretch, a summoning boss every 8 rooms, and meta
progression (training, alchemy, forge) in the hub between runs.

## Where things live

- **Production site:** https://www.castleofthecrimsonmoon.com (GitHub Pages
  serving this repo's `main` branch root, behind Cloudflare DNS; the `CNAME`
  file at repo root pins the domain). **Pushing to `main` redeploys the site
  in about a minute.**
- **Staging:** https://ublgmuyncizrq.kimi.page (published by the project
  owner from Kimi version cards — not your concern unless working in that
  environment).
- Current build number: `assets/data/build.json` (also shown top-left on
  every screen in-game).
- **Play-stats dashboard:** https://www.castleofthecrimsonmoon.com/analytics/
  (0.095, `analytics/`, static). Every finished run appends a record to
  `profile.history` (`src/meta/history.js`, from `settleRun`; newest 250
  kept; save v3). Automatic collection (0.102): `src/meta/telemetry.js`
  POSTs the save's history (anonymous random `playerId`, no IPs/personal
  data) after every run and once per session to the Cloudflare Worker in
  `collector/` (KV, merges history by timestamp; setup in
  `collector/README.md`; live since 0.103 at
  https://castle-stats.petri-jarvilehto.workers.dev, deployed from the
  Cloudflare dashboard — paste `collector/worker.js` into Edit code to
  update it; bump its `VERSION` and telemetry.json `collectorVersion`
  together and the dashboard flags a stale deploy; 0.119: stores only the
  dashboard's fields (typed, capped), rate-limits, read key as a Bearer
  header, `/version`; 0.130: per-run frame rate + the player's device —
  `core/perfMonitor.js` records from dungeon entry to the run's end,
  dashboard card in `analytics/perf.js`), whose URL is `assets/data/telemetry.json` `endpoint`
  (empty = off; never sends from localhost or Node). The
  dashboard reads it back (`GET /players`, Bearer READ_KEY) plus this
  browser's save and pasted save codes, deduped by playerId. Players are
  labelled by `profile.name` (0.109, save v4): asked once on the title
  screen (`ui/namePrompt.js`), changeable there, kept through a progress
  wipe; the dashboard owner's own renames override it locally.
- **Particle Lab** (experimental, kept for a while): the PARTICLE LAB
  button in the `?debug` corner column opens `particle-lab/` in a new tab
  (a standalone page using `../assets`). Today's look
  (a copy of `ui/particles.js`) beside three reference styles: Ink & Gore
  (Darkest Dungeon), Spark & Streak (Hades), Visceral Mist (Diablo IV).
  Shipped in 0.128 (`ui/particles.js STYLE_OF`): blood = Ink & Gore;
  bone, embers (yellow fire ramp + cinders) and the wraith = Spark &
  Streak. The lab's wraith options W1-W4 stay there as alternatives.
- `ARCHITECTURE.md` = full code map, data flow, keyboard map, conventions.
  Read it before making structural changes.

## Quick start

```bash
python3 -m http.server 8000     # from the repo root, open http://localhost:8000
node tools/smoke-test.mjs       # DOM-shim test suite: ~520 checks, under a second
node tools/smoke-test.mjs combat   # just the test files whose name contains "combat"
node tools/simulate.mjs --runs 40 --seed 1   # headless balance bot (one campaign)
node tools/simulate.mjs --seeds 1-12 [--retreat]   # 12 campaigns, mean ± sd
node tools/shrine-study.mjs --n 500         # per-boon shrine balance (paired runs)
```

## The rules that matter

1. **Run state never writes to meta state directly.** Everything earned in a
   dungeon accumulates in the `run` object; `src/run/runState.js ::
   settleRun()` transfers it to the profile in one transaction at run end
   (death banks half the coins, retreat banks all). New earning? Route it
   through the run object.
2. **All balance numbers live in `assets/data/*.json`** (enemies, items,
   difficulty, shrines). Never hardcode tuning in `src/` — add a knob to
   `difficulty.json` instead. Since 0.079 that includes player base stats
   (`player`), combat multipliers (`combat`), and every shrine boon's
   numbers (per-offer fields in `shrines.json`; a smoke check keeps the
   card text in sync with them). 0.116: no `?? N` fallback copies of data
   numbers in `src/` (they drifted); every number the code reads is listed
   in `shared/dataCheck.js` and checked at load — new knob, new line there.
3. **Save format changes go through `SAVE_VERSION`** (`meta/migrations.js`,
   0.079; now 4): bump it and append a step to `MIGRATIONS` — never edit a
   shipped step. New-profile defaults: `freshProfile()` in `meta/profile.js`.
4. **Loot (0.091):** a drop that can't beat the gear (as it will be after
   this run's finds, `run.gearPreview`) is salvaged on the spot for its
   salvage value; only upgrades land in `run.itemsFound`. One shrine per
   stretch of `bossEvery` rooms (`run.shrineRooms`: 2-7, 10-15, ...).
   Coin boons can have a flat price (`flatCost` in shrines.json).
5. **Potions persist** (0.080): a run draws the profile's stock and
   `settleRun()` writes back what's left, capped by `potionCap`; pickups
   go through `runState.addPotion()` (sold when the satchel is full).
   **`run.stats` is a snapshot** taken at run start. Mid-run loot does
   nothing until `settleRun()` auto-equips it into the profile.
6. **Bump the build with `node tools/bump.mjs 0.0NN --note "..."`** for
   every player-facing change (writes version + module list + changelog
   into `assets/data/build.json`), and run the smoke suite before pushing.
   The notes are what players see in the in-game "Build 0.0NN available"
   prompt (0.094) and the CHANGELIST corner button (0.113, the whole
   history in `assets/data/changelog.json`, also written by bump):
   short, player-facing, one `--note` per change.
   index.html loads CSS/JS under `?v=<version>` from that list (0.082), so
   a deploy can't leave players on a mix of old and new files.
   That includes debug-only `src/` changes: without a bump the browser
   keeps serving its cached copy under the old `?v=` (the 0.127 lesson).
7. **Never replace an asset file in place** (edge caches hold ~4 hours) —
   new content = new filename.

## Architecture in one paragraph

`src/main.js` boots: load all data JSONs into a `DATA` singleton →
preload/decode all art → title scene. `src/core/scene.js` is the scene
manager (`show()`, transitions, background crossfader) and router (0.117:
scenes switch with `go('hub')`, registered in `ui/scenes/index.js` — they
never import each other); `core/dom.js` has the `el()` DOM helper and
`core/hotkeys.js` hotkey dispatch + the dialog key-trap stack. `src/meta/` is persistent profile state
(localStorage, versioned save schema + migrations, run history,
export/import base64 save codes on the title screen). `src/run/` is
per-dungeon state (room generation with threat budgets, combat core with
heavy-attack multi-kill spill and boss summons, shrine boons, loot).
`src/ui/` renders it — combat is a chromeless fluid card layout (`vh/vw`,
cards 50vh tall) whose fight is resolved instantly and replayed line by
line (`combatPlayback.js`, effects in `combatFx.js`); panel scenes use
tuned px; `updatePrompt.js` offers new builds. `src/audio/` has the music
beds and SFX (gesture-gated AudioContext). `analytics/` is the separate
static play-stats page.

## Testing notes

- The smoke suite uses a custom DOM shim (`El` class) with deliberate
  limits: no `appendChild`/`querySelector` on elements, `match()` supports
  only hardcoded selectors, `children` is read-only. Click =
  `el.listeners.click[0]()` or `handleKey()`.
- Check count can vary by one run-to-run (one assertion only runs when the
  T4 fixture run dies — RNG). A flake gets one rerun; a repeat is real.
- Layout (0.098): `tools/smoke-test.mjs` is the runner; the tests live in
  `tools/test/*.test.mjs` by area (scenes, combat, shrines, progression,
  content, backgrounds, audio, sim, history), each starting from `fresh()`;
  `tools/test/harness.mjs` holds the DOM shim, the shared imports and a
  **virtual clock**: setTimeout/setInterval/Date.now/performance.now run on
  virtual time and `sleep(ms)` advances it, firing due timers in order —
  so the game's real pacing (log drip, 1s fades) costs no wall time. Write
  tests with `sleep()` as if time were real.
- CI (0.098): `.github/workflows/test-and-deploy.yml` runs the suite on
  every push and PR. Its deploy job is off until the repo opts in (Pages
  source "GitHub Actions" + repo variable `DEPLOY_VIA_ACTIONS=true`); until
  then Pages still deploys `main` directly, tests or not.
- Balance-sensitive tests use constructed fixtures; per-level stat changes
  require retuning them.
- Headless screenshots: use a fresh `--user-data-dir` and disable CSS
  transitions in harness pages (`* { transition: none !important }`) —
  virtual time races compositor-driven transitions and can capture the UI
  mid-fade as invisible.

## Deployment details

- GitHub Pages: repo **Settings → Pages → Deploy from a branch → `main` /
  `(root)`**. Repo root = site root; all asset paths are relative, so the
  site also works under the `…github.io/CastleoftheCrimsonMoon/` subpath.
- Cloudflare DNS: `CNAME www → pjarvilehto.github.io` (**DNS only**, grey
  cloud — required for GitHub's Let's Encrypt issuance; do not proxy it
  before the cert exists), apex redirect via placeholder `AAAA @ → 100::`
  (proxied) + Redirect Rule `http.host eq "castleofthecrimsonmoon.com"` →
  301 `https://www.castleofthecrimsonmoon.com`.
- Once the cert is issued, enable **Enforce HTTPS** in Pages settings.
- Player saves are localStorage, i.e. **per-origin**: saves don't carry
  between the kimi.page staging origin and the custom domain. The title
  screen's export/import save codes exist for that.
- The repo also contains `wrangler.jsonc` + `.assetsignore` (Cloudflare
  Workers static-assets config) — an alternative hosting path, currently
  unused.

## Conventions cheat-sheet

- HP scale (0.093): player HP, enemy damage, armor, potion heals and
  lifesteal % are 10x their pre-0.093 values (so hits read like the
  player's damage); enemy HP and player damage were not scaled. Keep new
  numbers on the same scale (e.g. a +3 armor idea is +30 now).
- New enemy → `enemies.json` (tier 1–3) + `assets/chars/<id>.webp` (alpha, q85 — 0.078); room
  generation, scaling, LV naming, and the card portrait pick it up.
- New item → `items.json` with slot + tier; loot/equipment/salvage follow.
- New shrine boon → `shrines.json` + matching case in `run/shrine.js`.
- New room background → JPEG into `assets/bg/` + entries in
  `backgrounds.json` (`rooms` and `roomNames`) + its depth map:
  `python3 tools/gen-depth.py <model.onnx> new.jpg` (setup in the script's
  header; the smoke suite fails if a background has no depth map).
- Asset loading (0.098, `shared/preload.js`): the boot loader waits only
  for the title + Great Hall art; everything else loads in the background
  after the title shows, and the hub's Descend waits for it if needed.
  New backgrounds/enemies are picked up from the data automatically.
- 3D backgrounds (0.083, `src/core/bg3d.js`; WebGL plumbing in
  `bg3dGL.js`): the art sits on a depth-
  displaced mesh with a slowly swaying camera. Tune in `backgrounds.json`
  `parallax` (per-file `overrides`); `enabled: false` is the kill switch.
  Falls back to the flat CSS backgrounds with no WebGL, software-only GL,
  context loss, or prefers-reduced-motion. Frame rate (0.101,
  `core/bg3dQuality.js`): the canvas renders at most `maxPixels` (2.1M; the
  art is 2048 wide), and all session long a device that stays under
  `minFps` (22) steps down: resolution x0.8, x0.64, then no fog, then
  flat. Keep per-pixel shader work minimal — slowly varying terms (haze,
  lights) go per vertex. Settings/defaults: `core/bg3dTuning.js`. If you
  raise the sway/depth, the smoke suite's coverage check says when
  `overscan` must grow too.
- `?debug` also adds HIDE FOREGROUND, BG VIEW (3D / FLAT / DEPTH),
  NEXT BG and BG TUNING (0.084: live sliders for depth/speed/sway/focus;
  "Save Depth Settings" stores them in that browser's localStorage and
  copies JSON — when the owner sends that JSON, put the values into
  `backgrounds.json` `parallax` to make them the default for everyone).
  The skirt (overscan) now grows automatically for larger sway.
- Background fog (0.099; puffs 0.101): depth-embedded mist — exponential
  distance haze (per vertex, `bg3dGL.js`) plus ~40 large soft mist puffs
  placed in the scene volume (`core/bg3dPuffs.js`, drawn at half
  resolution by `core/bg3dPuffGL.js`): each fades into whatever painted
  surface is in front of it (depth map), is lit from above (baked into
  the sprite), and drifts with the scene's `fogWind` [x, y, z] (+z =
  toward the camera; set per background in overrides), wrapping in a box
  with faded edges. Shape/count/opacity: `parallax.puffs`. Amount per background in
  `backgrounds.json` `parallax.overrides.<file>.fog` (long exterior views
  ~0.8-1.1, rooms ~0.3-0.4; the title is held at 0.6 to keep its
  silhouette); colour = the scene's own far hue at a fixed brightness
  (`fogColor: [r,g,b]` overrides). `?debug` BG TUNING has Fog and Fog
  drift sliders.
- Flash lights (0.100, `core/bg3dLights.js` + the shader): a crit (on the
  struck card), a potion or a revive (on the knight) puts a short light
  into the 3D scene; surfaces and mist near it glow by true depth
  distance. Colour/strength/fade/life per kind and the reach (`radius`)
  in `backgrounds.json` `parallax.lights`; `enabled: false` switches them
  off. Trigger from UI code with `bgLight(kind, cardRect)` (bg3d.js).
- Big-hit sway (0.092; a rotation about the depth centre since 0.093):
  `parallax.swayDeg` / `swayHitShare` in backgrounds.json; crits, SMASH
  and multi-kills rock the near art right, hits on the knight worth
  >= swayHitShare of max HP rock it left.
- Upgrades never charge for nothing (0.112): capped effects use
  `stats.taper` (linear `perLevel` for `linear` levels, then each level
  closes a share of the gap to `max`; smooth by default: the first tapered
  step equals perLevel; or `tail: k` = level n adds perLevel·(linear/n)^k,
  a long tail) — Precision (`player.precisionTaper`) and Efficiency
  (`alchemyTracks.efficiency`, tail 1.5; MAX once a level adds < `minStep`).
  Every Precision level also adds `critDamagePerPrecision` crit damage
  (0.113), and crit chance past `critCap` becomes crit damage
  (`critOverflowDamage`). Hub lines show the next level's real gain. `node tools/stat-study.mjs [--set path=json]` measures
  what each upgrade is worth (paired seeds, like the shrine study).
- Low health (0.126): at or under `difficulty.json lowHpShare` (35%) of
  max HP the knight's HP bar glows red (`.lowhp`) and, with potions left,
  Drink Potion gets the red 'active' pulse (`ui/hud.js isLowHp`).
- The win (0.121): beating the boss of `difficulty.json finalBossRoom`
  (24) shows `ui/victoryModal.js` once per save (`profile.victorySeen`,
  saved at once); the run goes on as usual after it. Move the knob when
  deeper content lands.
- Boss summons (0.092): `difficulty.json boss.summon` (every N turns,
  enemy, maxAlive, hp/dmg scale, depthBonus). Summons give no rewards.
  `node tools/simulate.mjs --tactic suggested|boss|summons` compares
  targeting strategies.
- Character animation (0.087): idle loops per enemy FAMILY (by id,
  `battleLine.js IDLE_FAMILY` + `.idle-<family>` in styles.css — a new
  enemy needs a family); one-shots (lunge, hit, numbers, entrance) in
  `ui/combatFx.js`, driven by `fx` descriptors on playback queue items.
  Particle looks (0.128) per material in `ui/particles.js` (`STYLE_OF`;
  bursts come as hit / crit / kill, `spawnParticles` is pure and tested);
  OVERKILL bursts every victim (`smash` event `victims`). Drawing (0.129)
  is batched: one Path2D fill/stroke per (pass, colour, alpha step,
  width) bucket, ink pass then glow pass, flash = cached sprite, only last
  frame's painted box is cleared, one canvas per session, 1.25x DPR (1x
  once bg3d stepped down), past BUDGET live particles new bursts thin out.
  Keep new fast particle kinds in buckets — a per-particle save/restore or
  gradient doubled the frame cost in 0.128. Slow, overlapping fades (the
  floor splats) are drawn one by one: batched, overlaps flickered (0.132).
  Loops animate only translate/rotate/scale (never filter); one-shots use
  element.animate so they don't restart the CSS loops. Attack pacing:
  `difficulty.json combatPacing`. Particles (0.089, `ui/particles.js`):
  material per enemy id (`MATERIAL`: embers/wisps/dust, default blood);
  the canvas loop only runs while particles live and is off when the 3D
  background fell back to flat.
- Keep files under ~300 lines; one responsibility per file.
- Dialogs (0.115): build every overlay with `ui/dialog.js openDialog({ label,
  children, onKey(k, close) })` — it owns the keyboard while open (a key-trap
  stack in core/hotkeys.js, so a dialog over a dialog hands the keys back on close)
  and the scene's hotkeys can't fire underneath. Yes/no: `ui/confirmPrompt.js`.
- Upper-right column (0.115, `ui/cornerToggles.js`): one flex column;
  add a button with `onOffToggle(label, { get, flip })` or
  `panelToggle(label, cls, buildPanel)` in main.js's `cornerBar([...])`
  (?debug tools: `ui/debugToggles.js`). No pixel offsets.
- Mobile (0.125, `shared/platform.js isMobile`): phones, tablets and
  iPadOS get a "Mobile platforms not supported yet" card over the title
  art and the boot stops there (no game, no stats sent); `?desktop` in the
  URL skips the check. Remove it when the portrait-phone layout lands.
- Shared helpers (0.115): `shared/version.js` (compareVersions — never
  compare build numbers as strings), `shared/level.js` (character level),
  `shared/prefs.js` (per-browser settings, never throws). A scene that is mid-run
  sets `inRun: true` on its scene object (a reload there would lose the
  run, so the update prompt waits for the next scene).
- Save data from other browsers (the dashboard's pasted codes) is
  untrusted: `analytics/stats.js sanitizeProfile()` before rendering.
- Every keyboard-reachable button gets `key: 'x'` in `el()`. A screen's
  way forward also gets `proceed: true` (0.124): Space clicks it and a
  tiny `[space]` prints under its label; in a dialog, pass that button as
  `openDialog({ proceed })`. Yes/no prompts and text fields don't get one.
- The obvious next button gets the **'active'** state: `class: 'active'`
  (pulsing yellow) or `'active active-red'` (pulsing red) — 0.079.
- `?debug` in the URL shows the INVULNERABLE toggle (hidden otherwise).
- BENCHMARK (0.131, `?debug` column; `ui/benchmark.js` +
  `ui/scenes/benchmarkScene.js`): a seeded, fixed ~36 s fight (idle /
  combat / overkill phases) on the real combat pieces; holds the bg3d
  quality ladder while measuring; result -> `profile.bench` (newest 10,
  never the run history) -> collector -> the dashboard's Benchmarks card.
  Changing the script (`PHASES` in `ui/benchmark.js`) changes what the
  numbers mean — note it in the changelist when you do. 0.133: every
  player is asked once — entering the Great Hall with best room >=
  `telemetry.json benchmarkPromptRoom` (10) and no result yet, a
  Continue-only dialog runs it and comes back to the hall. Reading results
  (0.135): 30 Hz = the browser was capped (macOS Low Power Mode, Chrome /
  Brave Energy Saver) — the first MacBook result was exactly that; data
  reaches us as dashboard screenshots (the collector is blocked here).
- Combat cards: frame art on `.char-card::before` (opacity 0.85);
  portraits overflow the frame (absolute, bottom-anchored, taller/wider
  than the card, text z-index above art); per-enemy tweaks via
  `enemy-<id>` classes.
- Combat layout block in `styles.css` is fluid (vh/vw) on purpose — no
  fixed px there. Panel scenes stay in px. Card size is `--card-h`
  (min of 50vh and what fits the width for `--n` enemies, 0.078); card
  internals are authored in `em` so they scale with it.
- Audio: one shared AudioContext (`src/audio/audioCore.js`); music keeps
  only compressed bytes warm and decodes the playing bed on demand.
  Mix (0.107): every sound goes music/effects bus -> master -> limiter
  (`audio/mixer.js`); levels, voice caps, stereo width, ducking live in
  `assets/data/audio.json`. **Sound registry (0.118): `audio.json clips`**
  — per name a `file` (or `synth: true`, generated in `audio/synth.js`),
  `gainDb` trim (`measuredDb` = its loudest 50 ms), `stinger`, `rate` +
  `jitterDb`. A new sound = one entry there. `sfx(name, { pan, delayMs,
  rate, gainDb })`; combat lines go through `ui/combatSfx.js` (stereo from
  the card, timed to the strike, crit/mega/overkill sweeteners). Music
  (0.114; one score since 0.118): `audio.json music.tracks` — each bed is
  generated (`python3 tools/gen-music.py --suffix v3`, numpy/scipy/lameenc;
  new suffix = new files) as an exact loop (`loopS`) with its first
  `tailS` seconds appended; `musicLoop.js` restarts it every loopS with an
  equal-gain crossfade over identical audio (which also hides the MP3
  decoder's faded first frame); `gainDb` is its level trim.
  Measure for real: `node tools/audio-check.mjs` (Playwright + Chromium:
  clip loudness vs measuredDb, loop restarts, bed levels as played).
  Tests drive the engine through a fake AudioContext
  (`tools/test/fakeAudio.mjs`; its params reject NaN like browsers).
  Per-browser settings (mute, volumes): `shared/prefs.js`. VOLUME sliders:
  `ui/volumePanel.js`; audio suspends in a hidden tab.

## Backlog (as of 0.107)

- Engineering: switch Pages to deploy through the test workflow once the
  HTTPS setup is settled (see CI above) · font as WOFF2 (212KB TTF).
- Game: merchant room (endgame coin sink) · more bosses (only the Vampire
  Lord; summons since 0.092) · the room-24 boss is a wall (~5% clear in the
  simulator) and meta saturates past ~60 runs — deeper tiers or NG+ ·
  thorns relic is a flat 4 damage, weak against scaled enemy HP · more
  room kinds · music loop variations · portrait-phone layout.
- Other:
  check the DIN Condensed web-embedding licence (macOS system font) ·
  orphaned legacy staging site cleanup.

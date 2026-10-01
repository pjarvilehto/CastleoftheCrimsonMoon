# Castle of the Crimson Moon — Architecture

Gothic roguelite browser game. Vanilla JS ES modules, **no framework, no
build step**, DOM-based UI over full-screen painted backgrounds (rendered in
3D when WebGL allows). DIN Condensed Bold via @font-face; all-caps UI
chrome, mixed-case combat log. `CLAUDE.md` holds the working rules and the
per-system notes; this file is the map.

## Run it, test it

```bash
python3 -m http.server 8000          # repo root -> http://localhost:8000
./"Play Castle.command"              # macOS: the same, and opens the browser
node tools/smoke-test.mjs            # the suite: ~630 checks, under a second
node tools/smoke-test.mjs combat     # one area (test files whose name matches)
node tools/simulate.mjs --runs 40 --seed 1   # headless balance bot
```

The suite is a DOM shim plus a **virtual clock** (`tools/test/harness.mjs`:
timers, rAF and `performance.now` run on virtual time, `sleep(ms)` advances
it), with the tests in `tools/test/<area>.test.mjs`. The shim models
read-only DOM APIs on purpose (`children` is getter-only — an assignment the
old shim allowed shipped as a real bug in 0.031). CI runs it on every push
(`.github/workflows/test-and-deploy.yml`). Browser checks (screenshots,
benchmarks) use Playwright + the preinstalled Chromium.

## The one rule that matters

**Run state never writes to meta state directly.** Everything earned in a
dungeon accumulates in the `run` object; `run/runState.js :: settleRun()`
moves it into the profile in one transaction (death banks half the coins,
retreat all), appends the run's history record and persists. New earning?
Route it through the run object. (Two UI records are saved at once by
design, not earnings: `victorySeen`, `bench`.)

## Map of the code

```
index.html              versioned boot: reads build.json, loads styles.css +
                        every module under ?v=<version> (import map)
styles.css              all styling, grouped by screen (index at the top)
src/
  main.js               boot: mobile check -> loader panel -> loadData ->
                        preloadAssets -> hotkeys, corner column (+ ?debug
                        tools), 3D backgrounds, audio, update check ->
                        title; the rest of the art loads in the background
  core/                 engine-level, no game rules
    scene.js            show()/transitionTo() (fade, try/finally; strictly in
                        order: windows out, swap, the new painting fully in,
                        windows back), bg crossfader (setBackground returns a
                        promise), router: registerScene() / go(name, ...)
    dom.js              el(tag, attrs, ...children): key / proceed hotkeys
    hotkeys.js          handleKey(), Space = proceed, dialog key-trap stack
    bg3d.js             3D backgrounds: depth-displaced mesh, orbit camera,
                        crossfade, jolts/sways/flash lights, quality ladder,
                        CSS fallback; gpuName(), holdQuality()
    bg3dGL.js  bg3dMath.js  bg3dTuning.js  bg3dQuality.js  bg3dFog.js
    bg3dPuffs.js  bg3dPuffGL.js  bg3dLights.js
                        its plumbing: shaders, pure math (tested in Node),
                        settings, frame-rate ladder, fog, mist puffs, lights
    perfMonitor.js      frame-rate recorder (runs + benchmark), device info
  meta/                 PERSISTS across runs (localStorage)
    storage.js          the only file touching the save; base64 save codes
    profile.js          the profile: defaults, lifecycle, small setters
    migrations.js       SAVE_VERSION + append-only MIGRATIONS
    stats.js            derived combat stats, taper, level
    leveling.js         training/alchemy/forge costs and purchases
    equipment.js        slots, auto-equip, salvage
    history.js          one record per finished run (+ its perf)
    telemetry.js        sends the save's stats (+ device) to the collector
    names.js            player-name cleaning
  run/                  EXISTS only during a dungeon run
    runState.js         run object, rooms, potions, loot routing, tryRevive(),
                        settleRun()
    roomGen.js          threat-budget rooms, boss every 8 (a throne room of 4),
                        one shrine per stretch, the treasure room; paintings
                        never repeat in a run (pickFresh, run.seenBackgrounds)
    combat.js           one action in phases: rollHit -> smash | strike(+spill)
                        -> lifesteal -> enemyPhase -> summons -> cleared
    shrine.js           boon deal + costs + effects (ids map to code)
    loot.js             coin / XP / item rolls; takeItem() = keep (an upgrade)
                        or salvage on the spot, for kills and chests alike
    treasure.js         treasure rooms: placement, the three chests (0.155)
  shared/               no DOM, used everywhere (and by the analytics page)
    data.js             loads assets/data/*.json into DATA
    dataCheck.js        every number the code reads, checked at load
    balance.js          enemy scaling, LV naming, elites
    preload.js          fetch + decode art (boot set, the essentials, then the rooms)
    platform.js         isMobile() (the boot's "not supported yet" notice)
    debug.js  prefs.js  version.js  level.js (levelFromStats(stats, every):
                        the cadence is difficulty.json levelEvery, passed in —
                        the analytics page has no DATA)
  audio/
    audioCore.js        one AudioContext, compressed bytes cache
    mixer.js            buses -> master -> limiter, sliders, ducking
    music.js  musicLoop.js   five beds, seamless exact loops
    sfx.js  synth.js  audioMath.js   clip registry (audio.json clips), voices,
                        generated sweeteners, pure helpers
    narrator.js         the Old Wizard voice-over (0.161): rules (audio.json
                        narration), takes (data/narration.json), one line at a time
  ui/
    scenes/             title, hub (Great Hall), dungeon, runEnd, benchmark;
                        registered in scenes/index.js, never import each other
    battleRoom.js       a room's battle line: mount, summon sync, tick update,
                        the effects' context and the pre-action snapshot
                        (dungeon + benchmark)
    battleLine.js       the units: knight card + enemy cards, built once,
                        update() patches in place
    combatPlayback.js   log drip + replay view (each event's snapshot)
    combatQueue.js      combat events -> playback items (fx, hold, sfx, loot)
    combatFx.js  fxParts.js   effects per event; shake, spray, numbers...
    combatSfx.js        a line's sound, panned to its card, timed to the blow
    particleLooks.js    what a burst is made of (materials, looks; pure)
    particles.js        the particle canvas: budget, batched drawing
    shrineUI.js  treasureUI.js   the panel rooms (renderPanelRoom shared)
    buffs.js  hud.js  fx.js  hubText.js
    dialog.js           openDialog(): overlay + keyboard; open-dialog registry
    confirmPrompt.js  namePrompt.js  updatePrompt.js  changelog.js
    deathModal.js  victoryModal.js  benchmark.js (BENCHMARK button, prompt,
                        result; the script's PHASES)
    cornerToggles.js  debugToggles.js  volumePanel.js  bgTuner.js
assets/
  bg/ (+ depth/)        room art (JPEG) and depth maps (PNG, white = near)
  chars/                portraits (WebP with alpha) + card frames (PNG)
  audio/  fonts/        (audio/vo/: the narrator's 122 takes, tools/gen-vo.mjs)
  data/                 ALL tuning as JSON: enemies, items, difficulty,
                        shrines, backgrounds, audio, telemetry, build,
                        changelog; narration (generated: the takes)
analytics/              /analytics/ play-stats page (static, versioned boot):
  stats.js              pure aggregation (sanitizes other people's saves)
  charts.js  perf.js  tables.js  dashboard.js  dashboard.css
collector/              the stats Worker (Cloudflare + KV; deployed by
                        pasting worker.js — see collector/README.md)
particle-lab/           standalone particle-look experiments (?debug button)
tools/
  smoke-test.mjs  test/ the suite
  simulate.mjs  simCore.mjs  shrine-study.mjs  stat-study.mjs   balance bots
  bump.mjs              build number + module list + changelist notes
  audio-check.mjs       clip loudness + loops measured in Chromium
  gen-depth.py  gen-music.py (+ music/)   depth maps, the generated score
  gen-vo.mjs            the voice-over: docs/narration-script.md -> ElevenLabs -> assets/audio/vo
```

## Data flow

1. `main.js` loads every JSON once into `DATA` (`shared/data.js`), checked
   by `dataCheck.js`.
2. The hub reads and writes the profile through `meta/*`, persisting at once.
3. A run snapshots `derivedStats()` into `run.stats`; mid-run profile changes
   don't touch it. Shrine boons change `run.stats` (run-scoped).
4. The dungeon scene drives `run/combat.js`. A turn resolves instantly; its
   events become playback items (`combatQueue.js`) that print line by line,
   each with its state snapshot, effect and sound. Kills route loot through
   the run; so do treasure chests (`run/treasure.js`).
5. Run end (death or retreat) -> `settleRun()` -> profile + history record
   (with the run's frame-rate summary) -> persist -> run-end scene;
   `shareStats()` posts the save's stats to the collector, and the
   /analytics/ dashboard reads them back.

## Keyboard map

Buttons opt in with `key: 'x'` in `el()` (the letter is underlined).
**Space** clicks the screen's way forward (`proceed: true`, a small
`[space]` under its label); a held Space steps once. **Enter** clicks the
primary button. While a dialog is open it owns the keyboard.

| Key | Where | Action |
|---|---|---|
| `1` `2` `3` | shrine / treasure | Accept a boon / open a chest |
| `Space` | everywhere | Enter the Castle · Descend · Push Deeper (combat, shrine, treasure) · Accept Your Fate · Return to the Great Hall · the dialogs' Onward / Continue / Close |
| `E` / `N` | title | Enter the Castle / Start a New Game (then `W` wipes, `K` keeps the save) |
| `P` `V` `F` `R` `E` | hub | Train Power / Vitality / Fortune / Precision / Endurance |
| `U` `X` | hub | Buy potion / expand the satchel |
| `A` `Y` `N` | hub | Alchemy: Potency / Efficiency / Infusion |
| `D` / `B` | hub | Descend / Back |
| `A` `H` `P` | dungeon | Attack (front enemy) / Heavy Attack / Drink Potion |
| `D` / `R` | dungeon | Push Deeper / Retreat with Loot (after a won room) |
| `F` | dungeon | Accept Your Fate (death) |
| `G` | run end | Return to the Great Hall |
| `Y` `N` (Enter / Esc) | yes/no dialogs | the two answers (each prompt names its own letters) |
| `O` | victory | Onward |
| `C` | changelist, benchmark | Close / Continue |
| `Enter` / `Esc` | name prompt | Save / cancel (Esc only when changing a name) |

Corner toggles (MUSIC, SOUND, NARRATOR, VOLUME, CHANGELIST, ?debug tools) are mouse-only.

## Editing conventions

- **Tuning lives in `assets/data/*.json`.** No numbers in `src/`, no `?? N`
  fallback copies; a new knob gets a line in `shared/dataCheck.js`.
- **Saves:** shape changes go through `SAVE_VERSION` + a new `MIGRATIONS`
  step (never edit a shipped step); new defaults in `profile.js DEFAULTS`.
- **New enemy:** `enemies.json` + `assets/chars/<id>.webp` (+ an idle family
  in `battleLine.js`, + a `MATERIAL` in `particleLooks.js` if not flesh).
- **New item / boon / background:** see CLAUDE.md's cheat-sheet.
- **New scene:** `ui/scenes/xScene.js` returning `{ enter(root) }`,
  registered in `scenes/index.js`, reached with `go('x', ...args)`. A scene
  that is mid-run sets `inRun: true`.
- **Dialogs:** always `ui/dialog.js openDialog()` (YOU DIED included, 0.157);
  dialogs live above the scenes, so a scene switch does not close them (the
  benchmark clears them; `anyDialogOpen()` to wait your turn). Never the
  browser's `confirm()`.
- **Combat layout is fluid** (vh/vw, cards 50vh): never fixed px in that
  block of styles.css; panel scenes stay in px. Card internals are `em`.
- **Card art:** frame on `.char-card::before` (opacity 0.85); portraits are
  absolute, bottom-anchored and larger than the card; text rows sit above.
- **Button labels** centre their capitals (`text-box: trim-both cap
  alphabetic`); the `[space]` hint sits in the bottom padding, out of flow.
- **Keep files under ~300 lines**, one responsibility each.
- **Assets are never replaced in place** (edge caches ~4 h): new content,
  new filename.
- **Every `src/` change ships with a build bump** — the boot loads modules
  under `?v=<build>`, so an unbumped change stays cached (0.127). The
  analytics page loads its modules the same way.

## Deployment

**Production:** https://www.castleofthecrimsonmoon.com — GitHub Pages
serving `main` (repo root = site root, all paths relative) behind
Cloudflare DNS; pushing to `main` redeploys in about a minute. `CNAME` pins
the domain; DNS and HTTPS details are in CLAUDE.md. Players get a "Build
0.NNN available" prompt (`updatePrompt.js`) shortly after.

**Release loop:** edit -> `node tools/bump.mjs 0.NNN --note "..."` ->
`node tools/smoke-test.mjs` (all green) -> check visual changes in Chromium
-> commit -> push to `main` and the working branch.

**Saves are per origin** (localStorage): the title screen's export/import
save codes carry a save between origins.

**Legacy:** up to 0.042 builds shipped as zips; a Kimi staging site
(ublgmuyncizrq.kimi.page) was published by the owner from version cards
and is not maintained here.

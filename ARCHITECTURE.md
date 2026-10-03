# Castle of the Crimson Moon — Architecture

Gothic roguelite browser game. Vanilla JS ES modules, **no framework, no
build step**, DOM-based UI over full-screen painted backgrounds (rendered in
3D when WebGL allows). D-DIN Condensed Bold (OFL) via @font-face; all-caps UI
chrome, mixed-case combat log. `CLAUDE.md` holds the working rules and the
per-system notes; this file is the map.

## Run it, test it

```bash
python3 -m http.server 8000          # repo root -> http://localhost:8000
./"Play Castle.command"              # macOS: the same, and opens the browser
node tools/smoke-test.mjs            # the suite: ~870 checks, a second or two on the virtual clock
node tools/layout-check.mjs          # the layouts, desktop and phone, in a browser (rule 8)
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
  main.js               boot: html.phone from platform.js PHONE_MQ (and a
                        re-layout when it flips) -> rotate notice -> loader
                        panel -> loadData -> preloadAssets -> hotkeys, corner
                        column (+ ?debug tools), 3D backgrounds, audio, update
                        check -> (a phone: the play / install gate) -> title;
                        the rest of the art loads in the background; a failed
                        boot says so and a tap reloads
  core/                 engine-level, no game rules
    scene.js            show()/transitionTo() (fade, try/finally; strictly in
                        order: windows out, swap, the new painting fully in,
                        windows back; onTransition() tells the renderer to
                        push through the picture, 0.171), bg crossfader
                        (setBackground returns a promise), router:
                        registerScene() / go(name, ...)
    dom.js              el(tag, attrs, ...children): key / proceed hotkeys
    hotkeys.js          handleKey(), Space = proceed, dialog key-trap stack
    bg3d.js             3D backgrounds: depth-displaced mesh, orbit camera,
                        crossfade, jolts/sways/flash lights, quality ladder,
                        CSS fallback; gpuName(), holdQuality(); setPowerSaver() /
                        powerMode() (BATTERY SAVER, 0.00222), whenPushSettled()
    bg3dGL.js  bg3dMath.js  bg3dTuning.js  bg3dQuality.js  bg3dFog.js
    bg3dPuffs.js  bg3dPuffGL.js  bg3dLights.js
                        its plumbing: shaders, pure math (tested in Node),
                        settings, frame-rate ladder, fog, mist puffs, lights
    perfMonitor.js      frame-rate recorder (runs + benchmark), device info; the
                        refresh-rate estimate (the busiest interval, 0.00222), stalls;
                        the histogram kept and the stalls labelled for the device report (0.00225)
    perfSpans.js        span(name): the subsystems' main-thread time per frame, markActivity(): a
                        stall's label (no imports, so the renderer can time itself; 0.00225)
  meta/                 PERSISTS across runs (localStorage)
    storage.js          the only file touching the save; base64 save codes
    profile.js          the profile: defaults, lifecycle, small setters
    migrations.js       SAVE_VERSION + append-only MIGRATIONS
    stats.js            derived combat stats, taper, level
    leveling.js         training/alchemy/forge costs and purchases
    equipment.js        slots, auto-equip, salvage
    history.js          one record per finished run (+ its perf)
    telemetry.js        sends the save's stats (+ device, + the device report waiting) to the collector
    perfReport.js       the device report (0.00225): per phase the histogram, the subsystems' split,
                        the stalls, the long tasks; the device, the renderer, the card light, the
                        particles, the last runs; built at a run's end and after a benchmark
    names.js            player-name cleaning
  run/                  EXISTS only during a dungeon run
    runState.js         run object, rooms, potions, loot routing, settleRun(),
                        deathRoom() (a reliquary death counts the room it led to)
    roomGen.js          threat-budget rooms, boss every 8 (a throne room of 4),
                        room 1 an entrance corridor; generateInterlude = the
                        shrine / treasure room between fights (unnumbered); paintings
                        never repeat in a run (pickFresh, run.seenBackgrounds)
    combat.js           one action in phases: rollHit -> overkill | strike(+spill)
                        -> lifesteal -> enemyPhase -> summons -> cleared
    shrine.js           boon deal + costs + effects (ids map to code)
    loot.js             coin / XP / item rolls; takeItem() = keep (an upgrade)
                        or salvage on the spot, for kills and chests alike;
                        tryRevive() (the Heart's revive, 0.00223: here so runState
                        and treasure share no import cycle)
    treasure.js         treasure rooms: placement, the three chests (0.155)
  shared/               no DOM, used everywhere (and by the analytics page)
    data.js             loads assets/data/*.json into DATA
    dataCheck.js        every number the code reads, checked at load
    balance.js          enemy scaling, LV naming, elites
    preload.js          fetch + decode art (boot set, the essentials); the rooms into the HTTP cache only (0.00222)
    portraits.js        where a character's portrait is (enemies.json art, cards.json player.art)
    platform.js         isMobile() / deviceClass() / isPhone(); PHONE_MQ + phoneLayout() (the phone layer's query); standaloneApp();
                        deviceName() / deviceBlock() (a data block's `phone` sub-block merged on a phone — the phone power profile, 0.00222)
    refreshRates.js     the standard display rates (RATES, snapRate): perfMonitor's hz and the stats page's grades, one copy
    motion.js           the one reduced-motion check (0.00197)
    debug.js  prefs.js  version.js  level.js (levelFromStats(stats, every):
                        the cadence is difficulty.json levelEvery, passed in —
                        the analytics page has no DATA); prefs.js mutePref() is the
                        one on/off setting the three audio toggles share (0.00223)
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
                        (dungeon + benchmark); onGone -> fit() recounts --n when a
                        fallen card leaves, whenGone(i) = that card's leaving
    battleLine.js       the units: knight card + enemy cards, built once,
                        update() patches in place (only what changed, 0.00223);
                        a fallen card collapses and vanish()es from the row (0.00216)
    combatPlayback.js   log drip + replay view (each event's snapshot); a death
                        is a step of its own — waits onDeath(i), then
                        combatPacing.restackMs, deathMaxMs caps it (0.00220);
                        per printed line: tick, line, sound, effect
    combatQueue.js      combat events -> playback items (fx, hold, sfx, loot)
    combatFx.js  fxParts.js   effects per event; shake, spray, numbers...
    combatSfx.js        a line's sound, panned to its card, timed to the blow
    particleLooks.js    what a burst is made of (materials, looks; pure)
    particles.js        the particle canvas: budget, batched drawing
    cardFx.js           the shader light behind every card: a pooled WebGL
                        canvas per lit card, reused across rooms (0.00227; the
                        cards past the pool take an ImageBitmap copy out of one
                        overflow context, 2D drawImage as the last fallback);
                        looks per enemy / boon / chest
    shrineUI.js  treasureUI.js   the panel rooms (renderPanelRoom shared)
    buffs.js  hud.js  fx.js
    hubText.js          the Great Hall's lines from the data: statDesc / precisionDesc / efficiencyDesc / alchemyDesc / potionDesc / satchelDesc (each long, or `short` for the phone's 45%-wide sheets), recordsLine
    hubSections.js      the hall's three sections (Train / Alchemy / Equipment) as rows, each handler
                        naming its row for the purchase flash (0.00223; hubScene.js keeps the table, the
                        two assemblies, Descend and the flash)
    dialog.js           openDialog(): overlay + keyboard; open-dialog registry
    confirmPrompt.js  namePrompt.js  updatePrompt.js  changelog.js
    deathModal.js  victoryModal.js  benchmark.js (BENCHMARK button, prompt,
                        result; the script's PHASES)
    cornerToggles.js  debugToggles.js  volumePanel.js  bgTuner.js
    phoneGate.js      the phone's PLAY / INSTALL card before the title (0.00208)
assets/
  bg/ (+ depth/)        room art (JPEG) and depth maps (PNG, white = near); candidates/ = the new
                        rooms tools/gen-bg.mjs painted (the model's own size, rooms-art.json)
  chars/                portraits (WebP with alpha; the file named in the data) + card
                        frames (PNG); candidates/ = the redraws tools/gen-art.mjs made
  audio/  fonts/        (audio/vo/: the narrator's 127 takes, tools/gen-vo.mjs; fonts/: the display
                        font as WOFF2 + the TTF fallback, 0.00223)
  data/                 ALL tuning as JSON: enemies, items, difficulty,
                        shrines, backgrounds, audio, telemetry, build,
                        changelog; narration, art, rooms-art, lora (generated: the takes,
                        the redrawn portraits, the painted rooms, the LoRA trainings)
analytics/              /analytics/ play-stats page (static, versioned boot):
  stats.js              pure aggregation (sanitizes other people's saves)
  charts.js  perf.js  tables.js  dashboard.js  dashboard.css
collector/              the stats Worker (Cloudflare + KV; deployed by
                        pasting worker.js — see collector/README.md)
labs/                   the testing pages (?debug LABS button): index.html is the menu,
  boot.js               the labs' shared boot (0.188): reads build.json (?t=, no-store), installs an
                        import map so the game's modules, the lab's lab.js (+ data-extra) and the
                        `data-versioned` stylesheets load under ?v=<build> (0.00223), and writes a
                        load / runtime error onto the page
  fog/                  the mist on every painting, every fog knob live, on the
                        game's own renderer (base href = the site root)
  vo/                   review the narrator's takes: play, approve, disapprove ->
                        vo-rerender.json for tools/gen-vo.mjs --rerender
  cards/                the combat cards' proposals on the real units: shader
                        backgrounds (cardFx.js), 3D hit / entrance motion, glint
  art/                  the redrawn portraits on the real units over any room:
                        compare, line-up, fight; verdicts -> art-rerender.json
  particles/            standalone particle-look experiments
  backgrounds/          the new room paintings (gen-bg.mjs, rooms-art.json) through their
                        stages: tiles to approve / reject / regenerate with notes, a fight
                        at the game's size over one, a compare beside a game painting;
                        COPY JSON -> rooms-rerender.json for gen-bg.mjs --rerender (0.00242)
  world/                the world map above the dungeon (0.00210, a prototype): the
                        developer's painting under clouds, places as pins, the reveal,
                        two looks and the dive; WORLD in lab.js = the future world.json
particle-lab/ fog-lab/ vo-lab/   forwarding stubs to labs/ (old bookmarks)
tools/
  smoke-test.mjs  test/ the suite
  layout-check.mjs  desktop AND phone: the real game headless at five screens, the layouts' promises asserted (rule 8)
  simulate.mjs  simCore.mjs  shrine-study.mjs  stat-study.mjs   balance bots
  ship.mjs              the release loop: commit, merge main, next number, bump, suite, push (0.00197; a
                        crashed suite prints its stderr tail, 0.00223)
  check-bump.mjs        CI: a push to main that changes what players load needs a higher build
  bump.mjs              build number + module list + changelist notes
  audio-check.mjs       clip loudness + loops measured in Chromium
  gen-depth.py  gen-music.py (+ music/)   depth maps, the generated score
  gen-vo.mjs            the voice-over: docs/narration-script.md -> ElevenLabs -> assets/audio/vo
  gen-art.mjs  cutout.mjs   the portraits: docs/portrait-prompts.md -> an editor on Replicate (Nano
                        Banana and five others; MODELS) -> assets/chars/candidates + art.json;
                        --import puts one in the game; --model lora draws from the line alone
  gen-bg.mjs            new room paintings: docs/room-prompts.md (the developer's prompting guide's
                        recipe) -> Seedream 4 -> assets/bg/candidates + rooms-art.json; --rerender
                        takes the Background Lab's verdicts, --prune, --import makes the game's JPEG
  train-lora.mjs        the two style LoRAs (characters on the approved candidates, rooms on the
                        paintings) -> private models on Replicate; lora.json records the trainings
  replicate.mjs         the Replicate client the three share (token, files, predict, versions)
package.json            tool dependencies only (sharp, for the art tools); the game has none
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
| `Space` | everywhere | Play (the phone gate) · Enter the Castle · Descend · Push Deeper (combat, shrine, treasure) · Accept Your Fate · Return to the Great Hall · the dialogs' Onward / Continue / Close · the save dialogs' Done / Load Save |
| `E` / `N` | title | Enter the Castle / Start a New Game (then `W` wipes, `K` keeps the save) |
| `P` `V` `F` `R` `E` | hub | Train Power / Vitality / Fortune / Precision / Endurance |
| `U` `X` | hub | Buy potion / expand the satchel |
| `A` `Y` `N` | hub | Alchemy: Potency / Efficiency / Infusion |
| `D` / `B` | hub | Descend / Back |
| `A` `H` `P` | dungeon | Attack (front enemy) / Heavy Attack / Drink Potion |
| `D` / `R` | dungeon, shrine, treasure | Push Deeper / Retreat with Loot (after a won room; in a shrine or treasure room once a boon or chest is taken) |
| `F` | dungeon | Accept Your Fate (death) |
| `G` | run end | Return to the Great Hall |
| `Y` `N` (Enter / Esc) | yes/no dialogs | the two answers (each prompt names its own letters) |
| `O` | victory | Onward |
| `C` | changelist, benchmark | Close / Continue |
| `Enter` / `Esc` | name prompt | Save / cancel (Esc only when changing a name) |

Corner toggles (MUSIC, FULLSCREEN, SOUND, NARRATOR, VOLUME, CHANGELIST, ?debug
tools) are mouse-only; on a phone they fold behind ☰ (FULLSCREEN is not
offered there: the gate is the way in). The phone hall's tabs have no keys;
the hotkeys of the rows on the sheets behind still fire (p, v, f, r, e, u,
x, a, y, n), as on the desktop where every panel shows.

## Editing conventions

- **Tuning lives in `assets/data/*.json`.** No numbers in `src/`, no `?? N`
  fallback copies; a new knob gets a line in `shared/dataCheck.js`.
- **Saves:** shape changes go through `SAVE_VERSION` + a new `MIGRATIONS`
  step (never edit a shipped step); new defaults in `profile.js DEFAULTS`.
- **New enemy:** `enemies.json` (with its `art` file in `assets/chars/`) (+ an idle family
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
  The phone layer (section 16) is the exception by design: its strips and
  buttons are tap-sized in px (40 / 52px) against a 72svh card.
- **Two layouts, one code path** (CLAUDE.md rule 8): a phone rule is
  `html.phone` + the desktop rule's own selector, in section 16; the hub's
  two assemblies come from one table; `node tools/layout-check.mjs` holds
  both layouts in a browser.
- **Card art:** frame on the card's `.card-frame` layer (opacity 0.85, the shader light inside it); portraits are
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
0.00NNN available" prompt (`updatePrompt.js`) shortly after.

**Release loop:** edit -> check visual changes in Chromium ->
`node tools/ship.mjs --note "..."` (commits, merges `origin/main`, picks
the number above main's, bumps, runs the suite by exit code, pushes to
`main` and the working branch; retries when main moves). Push to live:
GitHub Pages deploys in 45-70 s; `build.json` is always fetched with a
fresh `?t=` so the CDN's 10-minute copy never hides a build; the update
prompt polls every minute while the tab is visible, and once on its return.

**Saves are per origin** (localStorage): the title screen's export/import
save codes carry a save between origins.

**Legacy:** up to 0.042 builds shipped as zips; a Kimi staging site
(ublgmuyncizrq.kimi.page) was published by the developer from version cards
and is not maintained here.

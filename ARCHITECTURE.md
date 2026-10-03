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
node tools/smoke-test.mjs            # the suite: ~1280 checks, a second or two on the virtual clock
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
                        panel -> loadData -> preloadAssets -> hotkeys, the corner's
                        SETTINGS menu (+ DEBUG MODE's tools), 3D backgrounds, audio,
                        update check -> (a phone: the play / install gate) -> title;
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
    stats.js            derived combat stats (x the class's multipliers, the
                        class block snapshotted as `klass`, 0.00267), taper, level
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
                        -> classPhase (the class's heavy and passives, 0.00267)
                        -> lifesteal -> enemyPhase -> summons -> cleared;
                        damageFoe() is the one place a foe loses HP (0.00283)
    classes.js          the class registry (0.00283): HEAVIES by kind (blow,
                        cleave, fireball, drain, mark, censer, entangle —
                        spills / onHeavy), AFTER_BLOW hooks (a charge back,
                        the blight's tick, the mending, the thrall rising),
                        FOE_TURN hooks (the roots' hold, the thrall taking
                        the blow, the roots loosening), HEAVY_KINDS and
                        CLASS_KEYS for dataCheck; combat.js calls, never switches;
                        ELEMENTS / rollImmune (0.00293): a heavy's element
                        (fire, blight) against the foe's enemies.json immune
                        chance — "Immune!" in place of the blow or the stack
    shrine.js           boon deal + BOONS, the registry (needs / afford / apply per id, like
                        classes.js HEAVIES; dataCheck reads each boon's needs from it, 0.00299)
    loot.js             coin / XP / item rolls; takeItem() = keep (an upgrade)
                        or salvage on the spot, for kills and chests alike;
                        tryRevive() (the Heart's revive, 0.00223: here so runState
                        and treasure share no import cycle)
    treasure.js         treasure rooms: placement, the three chests (0.155)
  shared/               no DOM, used everywhere (and by the analytics page)
    data.js             loads assets/data/*.json into DATA
    dataCheck.js        every number the code reads, checked at load (the class keys from
                        classes.js, the boon keys from shrine.js BOONS)
    balance.js          enemy scaling, LV naming, elites
    preload.js          fetch + decode art (boot set, the essentials); the rooms into the HTTP cache only (0.00222)
    portraits.js        where a character's portrait is (enemies.json art: the list of variants,
                        dealt per fight by dealPortrait, 0.00303; ref = the original); portraitUrl('player') is
                        the chosen hero's look (assets/heroes/) for every look since 0.00291 — the
                        knight's crouch (`sprite`) too; cards.json player.art is the Art Lab's alone
    heroes.js           the classes (heroes.json): heroList / heroById / cleanHero / heroOf / lookOf /
                        lookUrl / heavyName / heroKit, the preload lists heroFirstUrls / heroArtUrls (0.00248);
                        heroSnapshot = run.hero (id, name, heavyName, heavyKey, theme, look; 0.00283),
                        lookIsSprite (the wide placement, 0.00291)
    classGear.js        the item matrix (0.00274): canUse / usersOf / usersText (who wields a kind, wears a
                        weight, owns a class item), masteryText / withMastery (the signature items'
                        bonus on the class block), kitFor, fitGearToClass (a save's gear made legal)
    itemArt.js          an item's picture (items.json art, assets/items/) and gainLine — what a find raises over what it replaced (0.00260)
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
    music.js  musicLoop.js   five generated beds (ElevenLabs scores since 0.00280-0.00282): a loop of
                        loopS + tailS of the music's own continuation, crossfaded by power
                        (audioMath.fadeCurve); startEarly plays the title bed from the title (0.00285)
    sfx.js  synth.js  audioMath.js   clip registry (audio.json clips), voices,
                        generated sweeteners (synth.js: the classes' instruments
                        too — swing, crackle, zap, wail, rake, chime, hiss,
                        grunt, 0.00270), pure helpers
    narrator.js         the Old Wizard voice-over (0.161): rules (audio.json
                        narration), takes (data/narration.json), one line at a time
  ui/
    scenes/             title, hero (heroScene.js: CHOOSE YOUR HERO, 0.00248 —
                        once per save between the title and the hall, the pick
                        lands on the profile on PROCEED, wearKit() puts the
                        class's kit on), hub (Great Hall), dungeon, runEnd,
                        benchmark; registered in scenes/index.js, never import
                        each other
    battleRoom.js       a room's battle line: mount, summon sync, tick update,
                        the effects' context and the pre-action snapshot
                        (dungeon + benchmark); onGone -> fit() recounts --n when a
                        fallen card leaves, whenGone(i) = that card's leaving
    battleLine.js       the enemy units and the card parts every unit is made of (the portrait
                        and its glint, the frame, the HP line, the flip, the idempotent writes),
                        built once, update() patches in place (only what changed, 0.00223);
                        a fallen card collapses and vanish()es from the row (0.00216)
    heroCard.js         the hero's card (0.00325, out of battleLine.js): createPlayerUnit, its
                        STATS / INVENTORY back (cardBack, the FINDS line), the potion count's
                        hold and land, heroArt
    combatPlayback.js   log drip + replay view (each event's snapshot); a death
                        is a step of its own — waits onDeath(i), then
                        combatPacing.restackMs, deathMaxMs caps it (0.00220);
                        per printed line: tick, line, sound, effect
    combatQueue.js      combat events -> playback items (fx, hold, sfx, loot);
                        sfxFor(ev, run.hero) picks the class's own blow / heavy /
                        hurt clip (0.00270; the run's class since 0.00283)
    combatFx.js  fxParts.js   effects per event; shake, spray, numbers...;
                        fxParts.lunge() is the one lunge (attack, dodge, the
                        thrall's blow, 0.00283)
    classFx.js          the class effects (0.00283, out of combatFx.js): the
                        traces over a foe's burst (traceFor / classTrace) and
                        CLASS_FX, the class events by kind (mark, blight,
                        entangle, entangled, charge, thrall, thrallhit,
                        thrallfall); the class is read from the fx context's run
    findFx.js           a kept find in combat: its card rises over the foes and flies into the LOOT
                        row (0.00262); a potion's card into the hero card's count (0.00263)
    combatSfx.js        a line's sound, panned to its card, timed to the blow;
                        the foe's own voice under it (eatk_ / ehurt_<id>, 0.00271)
    particleLooks.js    what a burst is made of (materials, looks; pure);
                        spawnClassBurst() = the class's own trace: LOOKS, a
                        table of generators on shared primitives (CLASS_LOOKS
                        its keys; 0.00268, a table since 0.00283)
    particles.js        the particle canvas: budget, batched drawing
    cardFx.js           the shader light behind every card: a pooled WebGL
                        canvas per lit card, reused across rooms (0.00227; the
                        cards past the pool take an ImageBitmap copy out of one
                        overflow context, 2D drawImage as the last fallback);
                        looks per enemy / boon / chest
    shrineUI.js  treasureUI.js   the panel rooms (renderPanelRoom shared)
    buffs.js  hud.js  fx.js   (hud.js: describeItem, statText, itemPic, itemStrip and the shared card
                        builders tierOf / itemTitle / findBody / wornId / gearLabel, 0.00299)
    hubText.js          the Great Hall's lines from the data: statDesc / precisionDesc / efficiencyDesc / alchemyDesc / potionDesc / satchelDesc (each long, or `short` for the phone's 45%-wide sheets), recordsLine
    hubSections.js      the hall's three sections (Train / Alchemy / Equipment) as rows, each handler
                        naming its row for the purchase flash (0.00223; hubScene.js keeps the table, the
                        two assemblies, Descend and the flash)
    dialog.js           openDialog(): overlay + keyboard; open-dialog registry; closeKeys (0.00299)
    confirmPrompt.js  namePrompt.js  updatePrompt.js  changelog.js
    deathModal.js  victoryModal.js  benchmark.js (BENCHMARK button, prompt,
                        result; the script's PHASES)
    cornerToggles.js  debugToggles.js  volumePanel.js  bgTuner.js   (the SETTINGS menu, 0.00243;
                        debugToggles.js = DEBUG MODE's tools, SWITCH CLASS among them, 0.00269)
    lookPicker.js       the hero's look, large between ‹ › (the hall's portrait, the phone's Look row; 0.00253);
                        showLook / lookDots, the look switcher's two moves, shared with heroScene.js (0.00323)
    lootDialog.js       the LOOT pop-up (0.00292): every find of the run as inventory strips, four in view,
                        ↑ ↓ scroll, C / Esc / Enter close; opened from the LOOT row (I) or the hero card's
                        INVENTORY page (0.00299)
    lootRow.js          the LOOT row under XP / COINS (0.00262; its own module since 0.00323): the newest
                        six finds as chips, shown as the first find takes off, a chip landing with a flash;
                        createLootRow(() => run) -> mount / show / reveal / land / settle, el / flying
    saveTransfer.js     EXPORT SAVE / IMPORT SAVE, the SETTINGS menu's GAME items (0.00302): a copy-out
                        code, a paste-in that returns to the title; the dialogs since 0.00209
    phoneGate.js      the phone's PLAY / INSTALL card before the title (0.00208)
    titleIntro.js     the title's fly-in (0.00307 / 0.00315): the film over everything as the title enters, the
                        fade by its own clock onto the renderer put back at rest (bg3d.js bgArrive); preloaded at
                        boot, a phone's own 720p file, skipped by a key
assets/
  bg/ (+ depth/)        room art (JPEG) and depth maps (PNG, white = near); candidates/ = the new
                        rooms tools/gen-bg.mjs painted (the model's own size, rooms-art.json; lab-only)
  chars/                portraits (WebP with alpha; the file named in the data) + card
                        frames (PNG); candidates/ = the redraws tools/gen-art.mjs made (lab-only)
  heroes/               the classes' figures (39 WebP cut-outs, the file named in heroes.json
                        looks; tools/cut-heroes.mjs, 0.00248)
  style/                the developer's sheets (the inked style sheets, heroes/ = the hero sheets
                        the figures were cut from); the labs and tools read them, no player does
  icons/                the shrine boons' and the chests' painted icons (192 px WebP, 0.177)
  world/                the World Lab's painting (the prototype's, 0.00210)
  items/                the gear's pictures (256 px WebP, the file named in items.json art); candidates/ =
                        what tools/gen-items.mjs painted from docs/item-prompts.md (items-art.json; 0.00260)
  video/                the title's fly-in (H.264 MP4: intro.file 1080p, intro.phone.file 720p; docs/video-prompts.md;
                        0.00307 / 0.00315; tools/intro-check.mjs drives it headless)
  audio/  fonts/        (audio/: the five beds, music-<bed>-v<k>.mp3; audio/vo/: the narrator's 136
                        takes, tools/gen-vo.mjs; audio/sfx/: the 45 class and foe recordings,
                        tools/gen-sfx.mjs, 0.00271; audio/candidates/: the generated scores' takes,
                        lab-only, 0.00273; fonts/: the display font as WOFF2 alone since 0.00226)
  data/                 ALL tuning as JSON: enemies, items, difficulty,
                        shrines, backgrounds, audio, telemetry, heroes (the classes:
                        looks, kit, theme, class block), cards (the card light,
                        the particles, player.art), build, changelog; narration,
                        art, rooms-art, items-art, music-art, lora (generated: the takes,
                        the redrawn portraits, the painted rooms, the item pictures, the
                        scores, the LoRA trainings)
analytics/              /analytics/ play-stats page (static, versioned boot):
  stats.js              pure aggregation (sanitizes other people's saves)
  charts.js  perf.js  tables.js  dashboard.js  dashboard.css
collector/              the stats Worker (Cloudflare + KV; deployed by
                        pasting worker.js — see collector/README.md)
labs/                   the testing pages (DEBUG MODE's LABS entry in the SETTINGS menu): index.html is the menu,
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
  heroes/               the CHOOSE YOUR HERO screen over any painting, from the game's own
                        data and stylesheet: the LINE-UP or a SHOWCASE alternative (0.00247)
  music/                the generated scores beside the game's bed, level-matched, SYNC and
                        BLIND; verdicts -> music-rerender.json for gen-score.mjs --rerender (0.00273)
  sfx/                  every clip of the sound registry where the game plays it, through the game's own
                        sfx / mixer / music, the bed under it; Volume / Pitch / Speed, Approve, a note ->
                        sfx-review.json for tools/render-sfx.mjs --apply (0.00301)
particle-lab/ fog-lab/ vo-lab/   forwarding stubs to labs/ (old bookmarks)
tools/
  smoke-test.mjs  test/ the suite
  layout-check.mjs  desktop AND phone: the real game headless at seven screens (two large desktops since
                        0.00299), the layouts' promises asserted (rule 8)
  simulate.mjs  simCore.mjs  shrine-study.mjs  stat-study.mjs   balance bots (simCore.fresh(hero) is the
                        campaign start all three share, --hero on each; 0.00299; the two studies'
                        baseline-and-paired-runs loops are simCore's baselineSnapshots / pairedRuns, 0.00322)
  ship.mjs              the release loop: commit, merge main, next number, bump, suite, push (0.00197; a
                        crashed suite prints its stderr tail, 0.00223)
  check-bump.mjs        CI: a push to main that changes what players load needs a higher build
  bump.mjs              build number + module list + changelist notes
  audio-check.mjs       clip loudness + loops measured in Chromium
  render-sfx.mjs        the SFX Lab's verdicts and edits into audio.json (a trim in place; a pitch or speed
                        edit re-rendered by ffmpeg into a new file, measured again; `reviewed` stamped; 0.00301)
  intro-check.mjs       the title's fly-in headless, on a desktop window and a phone (the films transcoded
                        to VP9 for headless Chromium): the layer, the fade before the end, the hand-over (0.00315)
  gen-depth.py  gen-music.py (+ music/)   depth maps; the procedural beds (history since 0.00282)
  gen-score.mjs  music-seam.mjs   the music beds as generated scores (docs/music-prompts.md -> ElevenLabs
                        Music / Lyria 3 Pro / Stable Audio 2.5 -> assets/audio/candidates + music-art.json;
                        0.00273); --import finds the loop seam (music-seam.mjs), cuts, levels and points
                        audio.json at the new file (0.00280)
  elevenlabs.mjs  util.mjs   the ElevenLabs client the three sound tools share (the key, one POST with the
                        429 retry, measureDb; 0.00283) and the tools' small helpers (seedFor, cli; 0.00299)
  gen-vo.mjs            the voice-over: docs/narration-script.md -> ElevenLabs -> assets/audio/vo
  gen-sfx.mjs           the classes' and the foes' sounds: docs/sfx-prompts.md -> ElevenLabs sound
                        generation -> assets/audio/sfx + audio.json clips (0.00270)
  cut-heroes.mjs        the hero figures out of the developer's sheets (assets/style/heroes ->
                        assets/heroes, keyed by cutout.mjs); prints heroes.json's looks (0.00248)
  gen-items.mjs         paints the gear's pictures (docs/item-prompts.md -> assets/items, 0.00260)
  reports.mjs           the play stats pulled from the collector (CASTLE_READ_KEY; 0.00229)
  gen-art.mjs  cutout.mjs   the portraits: docs/portrait-prompts.md -> an editor on Replicate (Nano
                        Banana and five others; MODELS) -> assets/chars/candidates + art.json;
                        --import puts the approved ones in the game (an enemy's variants);
                        --model lora draws from the line alone
  gen-bg.mjs            new room paintings: docs/room-prompts.md (the developer's prompting guide's
                        recipe) -> Seedream 4 -> assets/bg/candidates + rooms-art.json; --rerender
                        takes the Background Lab's verdicts, --prune, --import makes the game's JPEG
  train-lora.mjs        the two style LoRAs (characters on the approved candidates, rooms on the
                        paintings) -> private models on Replicate; lora.json records the trainings
  replicate.mjs         the Replicate client the four art tools share (token, files, predict, versions)
  registry.mjs          the generating tools' candidate registries (0.00322): registry(path, { key, doc,
                        stamp }).load() / .save(), nextN, applyVerdicts — gen-art, gen-bg, gen-score,
                        gen-items and train-lora read and write their JSON through it
package.json            tool dependencies only (sharp, for the art tools); the game has none
```

## Data flow

1. `main.js` loads every JSON once into `DATA` (`shared/data.js`), checked
   by `dataCheck.js`.
2. The title's Enter the Castle leads a save that has no `hero` yet to
   CHOOSE YOUR HERO (once; the pick and the class's kit land on the profile
   on PROCEED), else to the hub. The hub reads and writes the profile
   through `meta/*`, persisting at once.
3. A run snapshots `derivedStats()` into `run.stats` (the class's
   multipliers applied, its block as `run.stats.klass`); mid-run profile
   changes don't touch it. Shrine boons change `run.stats` (run-scoped);
   each shrine's deal and the pick go in `run.shrines`.
4. The dungeon scene drives `run/combat.js`. A turn resolves instantly; its
   events become playback items (`combatQueue.js`) that print line by line,
   each with its state snapshot, effect and sound. Kills route loot through
   the run; so do treasure chests (`run/treasure.js`).
5. Run end (death or retreat) -> `settleRun()` -> profile + history record
   (with the run's frame-rate summary, the hero and look played, the shrine
   deals) -> persist -> run-end scene; `shareStats()` posts the save's
   stats (+ `profile.hero`, the device and the device report waiting) to
   the collector, which keeps them all (Worker 0.00253), and the /analytics/
   dashboard reads them back (a By hero table, the shrine picks).

## Keyboard map

Buttons opt in with `key: 'x'` in `el()` (the letter is underlined).
**Space** clicks the screen's way forward (`proceed: true`, a small
`[space]` under its label); a held Space steps once. **Enter** clicks the
primary button. While a dialog is open it owns the keyboard.

| Key | Where | Action |
|---|---|---|
| `1` `2` `3` | shrine / treasure | Accept a boon / open a chest |
| `Space` | everywhere | Play (the phone gate) · Enter the Castle · Proceed (the hero) · Descend · Push Deeper (combat, shrine, treasure) · Accept Your Fate · Return to the Great Hall · the dialogs' Onward / Continue / Close · the save dialogs' Done / Load Save |
| `E` / `N` | title | Enter the Castle / Start a New Game (then `W` wipes, `K` keeps the save) |
| `1`-`7` / `←` `→` / `P` | hero | Choose a class (once per save) / turn the chosen hero's look / Proceed to the Great Hall |
| click the portrait · `L` (phone) | hub | The look picker: `←` `→` / `A` `D` turn the look, Space / Enter / Esc close |
| `P` `V` `F` `R` `E` | hub | Train Power / Vitality / Fortune / Precision / Endurance |
| `U` `X` | hub | Buy potion / expand the satchel |
| `A` `Y` `N` | hub | Alchemy: Potency / Efficiency / Infusion |
| `D` / `B` | hub | Descend / Back |
| `A` `H` `P` | dungeon | Attack (front enemy) / the heavy attack (the button carries the class's name, `heroes.json heavyName`, 0.00267) / Drink Potion |
| `I` · click | dungeon | the LOOT pop-up (0.00292; the LOOT row bottom left, or the hero card's INVENTORY page): `↑` `↓` scroll a strip, `C` / Esc / Enter close |
| click the hero card | dungeon | turn it over: front → STATS → INVENTORY → front (0.00256 / 0.00258) |
| `H` `C` `F` `S` `E` `L` | dungeon | the special also answers to a letter of its own name, underlined on the button (`heroes.json heavyKey`, 0.00286): Heavy Attack H, Cleave C, Fireball F, Soul Drain S, Entangle E, Hex H, Last Rites L — and H on every class (`data-key-alt`, served after every button's own key); `dataCheck` keeps it a letter of the name and off A / P / D / R |
| `D` / `R` | dungeon, shrine, treasure | Push Deeper / Retreat with Loot (after a won room; in a shrine or treasure room once a boon or chest is taken) |
| `F` | dungeon | Accept Your Fate (death) |
| `G` | run end | Return to the Great Hall |
| `Y` `N` (Enter / Esc) | yes/no dialogs | the two answers (each prompt names its own letters) |
| `O` | victory | Onward |
| `C` | changelist, benchmark | Close / Continue |
| `Enter` / `Esc` | name prompt | Save / cancel (Esc only when changing a name) |

The upper-right corner is mouse-only: FULLSCREEN (an icon) beside ☰
SETTINGS, a menu in groups (0.00243) — AUDIO (MUSIC, SOUND, NARRATOR,
VOLUME), DISPLAY (BATTERY SAVER), GAME (CHANGELIST) and DEBUG MODE last
(remembered per browser, `?debug` turns it on for the visit; ON shows the
testing tools: INVULNERABLE, HIDE FOREGROUND, BG VIEW, NEXT BG, BG TUNING,
FORCE CRITS, FORCE MEGA CRITS, SWITCH CLASS, LABS, BENCHMARK; OFF clears
every switch). On a phone the same menu sits behind ☰ alone (FULLSCREEN is
not offered there: the gate is the way in). The phone hall's tabs have no keys;
the hotkeys of the rows on the sheets behind still fire (p, v, f, r, e, u,
x, a, y, n, l), as on the desktop where every panel shows.

## Editing conventions

- **Tuning lives in `assets/data/*.json`.** No numbers in `src/`, no `?? N`
  fallback copies; a new knob gets a line in `shared/dataCheck.js`.
- **Saves:** shape changes go through `SAVE_VERSION` + a new `MIGRATIONS`
  step (never edit a shipped step); new defaults in `profile.js DEFAULTS`.
- **New enemy:** `enemies.json` (its `art` list and `ref` original in `assets/chars/`) (+ an idle family
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
- **Keep files under ~300 lines**, one responsibility each (the six over it —
  core/bg3d.js, ui/battleLine.js, ui/cardFx.js, ui/scenes/dungeonScene.js,
  ui/combatFx.js, run/combat.js — are each one subsystem's core; split
  when a part grows a name of its own, as classes.js and classFx.js did).
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

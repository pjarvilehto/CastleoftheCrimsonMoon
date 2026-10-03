# CLAUDE.md — Context notes for AI assistants

**Castle of the Crimson Moon** — a gothic roguelite browser game. Vanilla JS
ES modules, **no framework, no build step**. DOM-based UI over full-screen
painted backgrounds (3D when WebGL allows); D-DIN Condensed Bold via
@font-face (Datto, SIL Open Font License, `assets/fonts/D-DIN-OFL.txt`;
0.00226 — it replaced Apple's DIN Condensed, which had no web licence).
D-DIN carries 231 glyphs: the symbols the UI uses (★ ⚔ ☰ → …) fall back
to the next font in the stack, and a text minus is a plain hyphen. You play
one of seven classes (CHOOSE YOUR HERO, 0.00248; the Curious Knight is the
default and the first) pushing deeper into a castle:
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
- **Labs (0.168):** https://www.castleofthecrimsonmoon.com/labs/ — the
  menu of the testing pages, opened from the LABS entry under DEBUG MODE in
  the ☰ SETTINGS menu (0.00243; `?debug` turns the mode on for the visit).
  Each lab is a folder `labs/<name>/` with a card on `labs/index.html` and a
  "‹ Labs" link back (a smoke check keeps cards, folders and links in step);
  the old `particle-lab/`, `fog-lab/`, `vo-lab/` are forwarding stubs.
  - **Fog Lab (0.164):** `labs/fog/` — the game's real 3D renderer on every
    painting with every fog knob as a live slider, presets, the flash lights
    on demand, and COPY JSON for a `parallax` patch (see "3D backgrounds").
    0.00312: FLASH LIGHTS — a button per flash (crit, mega, OVERKILL,
    potion, revive) fired where the game puts it (`lab.js STANDINS`: the
    struck foe's card, the hero's, the row), dark card stand-ins over the
    painting (the cards hide the light's middle in the game; a checkbox),
    the shared Reach / Distance / Rise and each kind's strength, fade and
    life as sliders, `lights` in COPY JSON; and the mist's four tint
    sliders now start from the shipped tints (`untint`; they started at
    neutral, so the lab drew untinted mist and COPY JSON undid them —
    Reset to shipped clears a browser's old saved neutral ones).
  - **VO Lab:** `labs/vo/` — (booted through `labs/boot.js` like the
    others since 0.00197) every narrator take with its text, when it
    plays and how often; Play / Approve / Disapprove (+ volatility and shouty
    nudges); RE-RENDER gives a JSON for `node tools/gen-vo.mjs --rerender`
    (see "Audio").
  - **Particle Lab:** `labs/particles/` — trying particle looks: a
    standalone copy of the ~0.128–0.135 looks (no heal material, none of
    the class looks, no status tints; see "Effects" and the Backlog).
  - **Card Lab (0.174):** `labs/cards/` — the game's real card units
    (`battleLine.js` + `styles.css`) with three proposals on top, each with
    options: a shader behind each portrait (`cardFx.js`: fog, blood,
    flames, embers, ether, by the enemy's particle material), the cards in
    3D (hit kicks, turning or dealt entrances, a mouse tilt) and a glint
    sweeping the bitmap as it turns (a bright masked copy of the portrait).
    0.181: a Plate opacity slider fades the card's dark inside and its
    light under an untouched border (the frame art cut in two for the lab,
    `card_*_border.png` / `card_*_plate.png`; the game's one PNG is 0.85).
    COPY JSON gives the picks back; the developer's picks shipped in 0.183
    (see "Card effects" below). The lab draws the game's shader
    (`src/ui/cardFx.js`) and the units' own glint, so a look changed there
    changes here too; Reset is cards.json's shipped picks and the boss
    sits on the 0.196 double-wide card (0.00223). The Card and Art labs
    load styles.css versioned through `labs/boot.js` (`data-versioned`
    links, 0.00223); the Fog Lab's saved state merges knob by knob over
    the shipped values; the Particle Lab's room list has the throne and
    treasure paintings (its 'shipped mix' stage is the same ~0.128–0.135
    copy — see the Backlog).
  - **Art Lab (0.184):** `labs/art/` — the portraits redrawn in their own
    photoreal rendering (the direction that stuck in 0.00201; see
    "Portraits" below) on the real card units over
    any room painting: COMPARE (one character, current beside every
    candidate, Approve / Reject with a note, Flip), LINE-UP (all 13, new
    or current), FIGHT (the knight and four enemies at the game's size).
    COPY JSON packs the verdicts and queued re-rolls as `art-rerender.json`
    for `node tools/gen-art.mjs --rerender`.
  - **Background Lab (0.00242):** `labs/backgrounds/` — the new room
    paintings `tools/gen-bg.mjs` made (`assets/data/rooms-art.json`)
    through their stages, drafts → approved → in the game: ROOM (one
    room's candidates as tiles: Approve / Reject with a note / Regenerate
    with notes; a click shows one on the stage), FIGHT (the shown
    candidate at full screen under the game's real card units with the
    vignette — does it read as a battle stage), COMPARE (beside one of
    the game's own paintings). The panel lists every room with its
    stage, picks the model for re-rolls (Seedream 4) and queues fresh
    re-rolls per room; COPY JSON packs the verdicts and re-rolls as
    `rooms-rerender.json` for `node tools/gen-bg.mjs --rerender`.
  - **World Lab (0.00210):** `labs/world/` — the world map above the
    dungeon, a prototype: the developer's painting (`assets/world/world_v1.webp`,
    1500 px; the real one wants three times that or tiles) under a canvas of
    cloud puffs, the places as pins (the castle you play today is the first;
    the data in `lab.js WORLD` is shaped as the future `world.json`: position,
    name, boss and room count, `needs` = the place whose clearing opens the
    road), a cleared place burning the clouds away (`destination-out`
    circles, a radius per state, a timed burn) around it and its roads; two
    looks (THE KNOWN WORLD frames every revealed circle from above; FROM THE
    SKY hangs low and tilted over one place — the developer's picks; a
    cartographer's-table look was dropped as unimmersive) and DESCEND, the
    dive through the clouds to the place's first room. Drag, wheel and
    pinch; CLEAR fakes progress; COPY JSON gives the data and tuning back.
    Nothing touches the save; the design it prototypes is in the Backlog.
  - **Hero Lab (0.00247):** `labs/heroes/` — the CHOOSE YOUR HERO screen
    over any painting, drawn from the game's own data and stylesheet since
    it shipped (0.00248, see "Heroes" below): the game's LINE-UP, or the
    SHOWCASE alternative (the chosen hero large beside the lines, the
    heroes as a strip); 1-7 / arrows / Space, COPY JSON gives the picks
    back.
  - **Music Lab (0.00273):** `labs/music/` — the generated scores
    (`tools/gen-score.mjs`, `assets/data/music-art.json`) beside the bed
    the game plays, bed by bed over its painting: every take LEVEL-matched
    by its measured LUFS (a gain node, -20 LUFS), SYNC keeps the position
    across takes (an A/B at the same bar), BLIND shuffles the takes — the
    game's own among them — and hides the models; Approve / Reject with a
    note, re-rolls queued per bed; COPY JSON packs them as
    `music-rerender.json` for `node tools/gen-score.mjs --rerender`.
  - **SFX Lab (0.00301):** `labs/sfx/` — every clip of the sound registry
    (`audio.json clips`) by where the game plays it (the Great Hall,
    combat, the classes' and the foes' sounds, the shrine and treasure
    rooms, the room change, the run's end; a table in `lab.js SECTIONS`,
    the class, foe and whoosh rows from the data), played through the
    game's own `sfx.js` / `mixer.js` / `music.js` — the trims, the random
    variation layers (VARIATION off = the dry clip, `sfx()`'s `plain`),
    the stingers' ducking are the game's — with MUSIC ON playing each
    section's bed under them (the music bus muted until then; the bed
    selector overrides the section's). Per clip Volume (dB), Pitch
    (semitones) and Speed (%, the pitch kept: an overlap-add stretch in
    the page, played through `sfx.sfxFrom`; one knob for a synth clip),
    Approve, a note; COPY JSON = `sfx-review.json` for `node
    tools/render-sfx.mjs --apply` (an approval = `approved: true` on the
    clip, nothing in the game reads it; a volume edit = the trim; a pitch
    or speed edit re-rendered by ffmpeg into a new file, rule 7, measured
    again — `elevenlabs.mjs measurePeak`, the level kept plus the offset,
    the old file removed; `--dry-run` says what it would do; run
    `audio-check.mjs` after for the browser's reading).
- **Staging (legacy):** ublgmuyncizrq.kimi.page, published by the developer from
  Kimi version cards — not maintained here.

## Quick start

```bash
python3 -m http.server 8000                  # repo root -> http://localhost:8000
node tools/ship.mjs --note "..."             # ship: commit, merge main, next number, bump, suite, push (rule 6)
node tools/smoke-test.mjs                    # the suite: ~1200 checks, a second or two on the virtual clock
node tools/layout-check.mjs [--only phone]   # desktop AND phone: the real game headless at seven screens (rule 8; needs Playwright)
node tools/smoke-test.mjs combat             # test files whose name contains "combat"
node tools/simulate.mjs --runs 40 --seed 1   # headless balance bot (one campaign)
node tools/simulate.mjs --seeds 1-12 [--retreat]   # 12 campaigns, mean ± sd
node tools/simulate.mjs --hero wizard        # a class's campaign (the knight without it; see "Heroes")
node tools/shrine-study.mjs --n 500          # per-boon shrine balance (paired runs)
node tools/stat-study.mjs [--set path=json]  # what each upgrade is worth
node tools/gen-vo.mjs [--dry-run|--only id]  # render missing voice-over takes (ElevenLabs; needs ELEVENLABS_API_KEY)
node tools/gen-art.mjs [--only rat] [--model banana]   # redraw portraits on Replicate (needs REPLICATE_API_TOKEN; NODE_USE_ENV_PROXY=1 behind a proxy)
node tools/gen-bg.mjs [--only clock_tower]   # paint new rooms from docs/room-prompts.md (Seedream 4); --rerender / --prune / --import are the stages
node tools/train-lora.mjs [--set rooms]      # train a style LoRA on the approved portraits / the paintings
node tools/reports.mjs [--reports|--json|--player x]   # the play stats from the collector (needs CASTLE_READ_KEY + the host allowed)
node tools/cut-heroes.mjs [--import .] [--only wizard]  # the hero figures out of the developer's sheets (assets/style/heroes -> assets/heroes; prints heroes.json's looks)
node tools/gen-sfx.mjs [--dry-run|--only atk_wizard]   # the classes' and the foes' sounds from docs/sfx-prompts.md (ElevenLabs sound generation; the key needs the sound_generation permission)
node tools/audio-check.mjs                   # every clip and bed measured as the game plays them (Playwright; the measuredDb the registry trusts)
node tools/intro-check.mjs [--only phone]    # the title's fly-in headless on a desktop and a phone: the hold, the fade, the skip, the hand-over's SSIM (Playwright + ffmpeg)
node tools/render-sfx.mjs --apply sfx-review.json [--dry-run]   # the SFX Lab's verdicts and edits into the registry (a pitch / speed edit re-rendered into a new file)
node tools/gen-items.mjs [--only moonbrand] [--import]   # paint the gear's pictures from docs/item-prompts.md (Nano Banana Pro; needs REPLICATE_API_TOKEN), --import puts them in the game
node tools/gen-score.mjs [--bakeoff|--only combat --model eleven]   # the music beds as generated scores from docs/music-prompts.md (ElevenLabs Music / Lyria 3 Pro / Stable Audio 2.5; needs ffmpeg)
node tools/gen-score.mjs --import combat_c2 [--start 21-25 --end 70-86]   # a take into the game: the loop seam found, cut, levelled, audio.json pointed at it
# libraries and helpers: tools/bump.mjs (ship.mjs's step: version + module list + changelist), check-bump.mjs (CI's bump guard),
# cutout.mjs (the colour key the art tools share), replicate.mjs (every Replicate call), elevenlabs.mjs (every ElevenLabs call:
# the key, one POST with the 192->128 kbps fallback and the 429 retry, measureDb), music-seam.mjs (the loop seam gen-score --import
# cuts at), util.mjs (fnv1a / seedFor / cli, the generating tools' shared helpers, 0.00299), simCore.mjs (the bot simulate.mjs and
# the two studies share; fresh(hero) puts the class on since 0.00299); python3 tools/gen-depth.py <model.onnx> <painting.jpg> makes
# a depth map, tools/gen-music.py the old procedural beds (history since 0.00282)
```

## The rules that matter

1. **Run state never writes to meta state directly.** Everything earned in a
   dungeon accumulates in the `run` object; `run/runState.js :: settleRun()`
   moves it into the profile in one transaction (death banks half the
   coins, retreat all). New earning? Route it through the run object.
   (`victorySeen` and `bench` are UI records, saved at once by design.)
2. **All tuning lives in `assets/data/*.json`** — enemies, items,
   difficulty (incl. `player` base stats, `combat` multipliers), shrines
   (every boon's numbers; a smoke check keeps the card text in sync; the
   boons' code is `run/shrine.js BOONS` — needs / afford / apply per id,
   like `classes.js HEAVIES`, and dataCheck reads each boon's `needs` from
   it, 0.00299),
   backgrounds, audio, telemetry. Never a number in `src/`, and no `?? N`
   fallback copies (they drifted, 0.116; the renderer's and the audio's
   whole-block copies went in 0.157): every number the code reads is
   listed in `shared/dataCheck.js` and checked at load — new knob, new
   line (a smoke check also greps `src/` for `.knob ?? N`; a default
   parameter `{ fade = 0.35 }` is the same copy in another coat — the
   flash lights had three, 0.00197). What stays in `src/`: the look —
   animation durations, shader constants, synth instrument definitions —
   and a measurement's DEFINITION (0.00222: `perfMonitor.js` BIN_MS,
   MODE_BINS, STALL_MS, `shared/refreshRates.js` RATES): a stored record
   compares with another only under one definition, so those change with
   a build, never with a knob. The judgments on top (how near a rate the
   average must sit) are data: `telemetry.json perf`.
   **A phone's own numbers (0.00222):** a data block may carry a `phone`
   sub-block with the knobs that differ on a phone (`parallax.phone`,
   `cards.json fx.phone` / `particles.phone`); `shared/platform.js
   deviceBlock()` merges it on a phone (the device, `isPhone()` — a tablet
   keeps the desktop values, `?desktop` too) and every phone key is listed
   in `dataCheck.js` like any other.
3. **Save format changes go through `SAVE_VERSION`** (`meta/migrations.js`,
   now 6 — 0.00248 added `hero`, 0.00253 made it null until chosen): bump it and append a step to `MIGRATIONS` — never edit a shipped
   step. New defaults: `DEFAULTS` / `freshProfile()` in `meta/profile.js`.
   After the steps `migrateProfile` makes an imported code whole (0.00197;
   0.00223 says exactly what): the gear slots checked against items.json
   (an unknown worn id — a retired item, a foreign code — becomes empty),
   every number in the top level and in the stats / alchemy / records
   tables, the two lists, `forged` pruned to known items. A malformed
   paste used to break the Great Hall on every entry, and an unknown id
   made `settleRun` and kill loot throw.
4. **Loot (0.091):** a drop that can't beat the gear (as it will be after
   this run's finds, `run.gearPreview`) is salvaged on the spot; only
   upgrades land in `run.itemsFound` — one path, `run/loot.js takeItem`,
   for kill loot and treasure chests (the Heart's revive is one too:
   `loot.tryRevive`, there since 0.00223 so runState and treasure share no
   import cycle). One shrine per stretch of `bossEvery`
   rooms (`run.shrineRooms`: on the way to rooms 2-7, 10-15, ...); coin
   boons can have a flat price (`flatCost`, else priced by the room the
   shrine leads to).
5. **Potions persist** (0.080): a run draws the profile's stock and
   `settleRun()` writes back what's left, capped by `potionCap`; pickups go
   through `runState.addPotion()` (sold when the satchel is full). Their
   price climbs with each one bought between runs (`potions.priceSteps`
   10, 20, 25, then `priceStep` 5 more each; `profile.potionsBought`,
   reset by `settleRun()`; 0.00204 — a ladder that never reset starved the
   simulator's meta: 27,000 coins on potions in a campaign).
   **`run.stats` is a snapshot** taken at run start; mid-run loot does
   nothing until `settleRun()` auto-equips it.
6. **Every game or stats-page change ships as a numbered build:**
   `node tools/ship.mjs --note "..." [--trailer "Co-Authored-By: ..."]`
   (0.00197) does the whole loop — commits the tree, merges `origin/main`
   (taking main's `build.json` / `changelog.json` on a conflict), picks
   the next build number above main's (a number it claimed in an earlier
   round that collided is rewritten in the files this branch changed; a
   number already on main never is), runs `tools/bump.mjs`
   (version + module list + the changelist) and the smoke suite by exit
   code, commits, fetches once more and pushes to `main` and the working
   branch; main moved meanwhile = another round. Notes are player-facing
   (the "Build 0.00NNN available" prompt and the CHANGELIST button): short,
   one `--note` per change. **Bump for every `src/` or `analytics/`
   change, debug-only ones too:** both pages load their modules under
   `?v=<build>`, so an unbumped change stays cached in players' browsers
   (0.127). **From push to player (0.00197):** GitHub Pages deploys `main`
   in 45-70 s; every `build.json` fetch carries `?t=<now>` (the boot, the
   data loader, the labs, the stats page), so the CDN's 10-minute copy is
   never served; the update prompt polls every minute while the tab is
   visible, and once when it comes back (0.00223: a hidden tab used to
   poll on), so a player sees "Build available" within about two minutes
   of the push (mid-run it waits for the run's end).
7. **Never replace an asset file in place** (edge caches hold ~4 hours) —
   new content, new filename.
8. **Two layouts, one code path (0.00208 / 0.00209).** The desktop (tablets
   too) and the phone share every scene, module and string. The phone
   differs in three places, and only there: `styles.css` section 16 — a set
   of `html.phone` rules, each `html.phone` + the DESKTOP rule's own
   selector (so it always outranks it; `platform.js watchPhoneLayout`,
   called from main.js with the relayout closure, puts the class on
   `<html>` from the one query, `platform.js PHONE_MQ`, and re-lays the
   scene out when it flips); `hubScene.js phoneHall`, a second assembly of
   the SAME table of sections the desktop's columns come from (the rows
   themselves are built in `ui/hubSections.js`, 0.00223); and
   `hubText.js`'s `short` wording beside each long line. A change to
   combat's chrome, the Great Hall, a panel room, a dialog or the corner
   column is a change to BOTH: find the rule's twin in section 16 (the
   suite fails a rule without the prefix, a class nothing produces, and a
   desktop rule removed without its twin), a new hub row gets its long and
   short line, a new section is a row in the hall's table — then
   `node tools/layout-check.mjs`: the real game headless at seven screens
   (desktop, a 960x720 narrow desktop window, tablet, phone, the smallest
   phone; 0.00299: a 1920x1080 and a 2560x1440 desktop too, the title, the
   hero, the hall and the run's end only — the 0.00281 up-steps asserted,
   1.15 and 1.5; every profile turns the hero card to INVENTORY and
   checks the LOOT button), what each layout promises asserted (0.00223: the save dialogs
   up top, the room title clear of the counters, the boons clear of a
   panel room's log, Descend reachable in the narrow window's one-column
   hall), screenshots to look at. The labs never set `html.phone`, so the
   layer never reaches them.

## Working with the developer

- `main` is the live site: merge what lands there, never force-push it.
  Don't touch `CNAME` or the Pages / DNS settings — the developer handles them.
- **The collector is deployed by hand:** after changing
  `collector/worker.js`, bump its `VERSION` and `telemetry.json
  collectorVersion` together and ask the developer to paste the file into the
  Cloudflare dashboard (Edit code → Deploy; copy the raw file — GitHub's
  normal view can truncate a selection). Until then the dashboard warns
  that the collector is older, and the old Worker drops new fields (saves
  keep them; they arrive with the next upload). A Worker NEWER than the
  page's telemetry.json gets a neutral note instead (0.00223: it used to
  be told to roll back). The Worker to paste is 0.00253 (`VERSION` =
  `telemetry.json collectorVersion`): it carries each run's shrine deals
  (`shrines`, 0.00252) and the hero fields (`hero`, `look` on every run
  and `hero` on the profile, 0.00253); before them, as of 0.00223, it
  gained the phone power / stall fields (0.00222) and the run-record
  clamp (a run whose `room` is not a whole number up to 999 is dropped,
  the counts clamped; one such record used to break the whole dashboard).
- The collector's `READ_KEY` is the developer's secret: never ask for it.
  **Reading the stats from a session (0.00229):** `node tools/reports.mjs`
  pulls every player (device, runs, benchmarks, device reports) from the
  collector when the cloud environment allows the host
  `castle-stats.petri-jarvilehto.workers.dev` in its network policy and
  carries the key as the environment secret `CASTLE_READ_KEY` (a
  session started before either was set has neither: start a new one);
  `--reports` is the dashboard's Copy all, `--json` / `--out` the raw
  answer, `--player x` one player. The tool never prints the key. Where
  the environment lacks them, the data arrives as screenshots of the
  dashboard or its Copy all pasted into the chat.
- CI's deploy job stays off until the developer opts in (see Testing).

## Architecture in one paragraph

`src/main.js` boots: `html.phone` from the query, the rotate notice → load all data JSONs into `DATA` →
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

### Combat and pacing

A turn (`run/combat.js playerAttack`) runs in phases:
rollHit → OVERKILL (a heavy blow covering every living enemy's HP; the
event, the fx kind, the sound key and the benchmark act are all
`overkill` since 0.00223 — the narration id `smash` is the multi-kill,
the script's own name) or strike (a heavy blow = `combat.heavyMult` x damage, 2.3 since 0.00198,
and its cooldown `player.baseHeavyCd` counts ORDINARY turns — the
heavy's own turn used to count too, so a cooldown of 3 was back after
two blows and two Quicken boons made it every turn; the fix cost the
room-24 boss most of its clears in the simulator (30% → 3%), 2.3 bought
back the run depth and coins and leaves that boss at ~9%) (+ spill: heavies of `spillThreshold` x the target's HP sweep on) →
lifesteal → enemy phase (dodge, armor, thorns, revive) → boss summons →
cleared. Its events become playback items (`ui/combatQueue.js`) printed
with their state snapshot, effect and sound — per printed line: tick,
line, sound, effect — pacing in `difficulty.json combatPacing`; `hit()`
measures the struck card once per line and OVERKILL's banner and light
come from the victims' live cards (0.00222 / 0.00223). Boss summons (0.092): `boss.summon` (every N turns,
maxAlive, scaling); summons give no rewards and join the line in front of
the boss. The win (0.121): beating the boss of `finalBossRoom` (24) shows
`ui/victoryModal.js` once per save; move the knob when deeper content lands.
`node tools/simulate.mjs --tactic suggested|boss|summons` compares targeting.

### Progression

The opening and the ramp (0.00230, the developer's call:
an easier first run that reaches about room 3, the overpowered phase in
the early rooms a little later, the march to room 24 unchanged): the
tier-1 enemies hit ~25% softer (rat 30, Cave Shrieker 22, skeleton 45,
Crypt Spider 38), a new save starts with 3 potions, and a trained level
gives +2 damage / +72 HP / +8 armor (was 3 / 90 / 10) for a base cost of
13 XP (was 15). The simulator, 12 campaigns: the first run reaches room
3-4 (was 2), rooms 1-5 cost under 10% of max HP from about run 12-13
(was about run 11), room 24 first reached at run ~33 (was ~31), its boss
beaten at ~41 (was ~39).

#### Lifesteal by tier (0.00245, the developer's call — the game felt very hard until lifesteal, then easy until the end wall)

It heals a share of
the whole rolled blow and stacks across slots, and two TIER-2 items carried
most of it (Vampiric Ring 100%, Amulet of the Leech 80% — 200% by run 10,
each stretch of rooms flipping from ~55% of max HP a fight to free in ~8
runs). Now tier 2 is ~30% of that (0.3 / 0.25), tier 3 ~60% (0.35-0.7),
tier 4 unchanged, Life Drain +50% (was +100%): the same run ~35 to room
24, free rooms a run or two later. Measured and set aside: lifesteal
halved everywhere (gentler, room 24 four runs later), healing only off
damage dealt (no change), a per-fight heal cap (the deep game stalls),
slower enemy damage growth (undoes the smoothing).

#### The weapon and the armor carry the stats (0.00259, the developer's call — the card shows only those two)

Damage comes from the weapon,
armor and HP from the body armor; boots, rings, trinkets and amulets are
accessories — about a fifth of a weapon's damage (+1-3), a tenth of an
armor's armor (+6-15) and a small HP top-up (+20/30/40/50 by tier),
their identity in crit, lifesteal, dodge and the specials. The power
moved into the two: weapons x1.5 damage, body armor x1.4 armor and HP
on every piece (80-420). The simulator, 12 campaigns: run depth, the
first room-8 kill, the late runs and coins all within noise of before
(40 and 70 runs); the shrine study moves within its spread (Bulwark a
little stronger late, Glass Cannon a little weaker).

#### Shrines from the players' own picks (0.00252, the developer's call)

The play stats (210 runs, 9 players; picks of what was dealt, 3 of 9 at
random) had Crit 23%, Armor 19%, Quicken 16% and Bulwark / Glass Cannon
3% each (the bot rates Glass Cannon the best — real players fear its
armor cost); so Bulwark became the big-armor boon (+40%, at least +80,
for -5% damage) and Glass Cannon +50% damage for -30% armor, and every
cost came down about a third (-10% max HP, -5% damage, Crit 20 coins,
Second Wind 30). Shrine study after: every boon gains but Greed (a coin
trade); Bulwark +2.1 rooms late and Glass Cannon +2.0 sit just over the
study's OP line — left so while the new pick data comes in. **The deals
are recorded** (`run.shrines`, `shrine.js noteDeal`: each shrine's three
offers and the pick, null = walked away; the run record's `shrines`, the
collector's `cleanShrines`, the dashboard's Shrine picks card — a boon's
pick rate against the times it was dealt). Tried and turned down by the developer: early rooms
that grow with the best room ("the castle remembers"), and starting a run
at a beaten boss's next stretch (waypoints — it also slowed room 24 to
run ~44). HP scale (0.093): player HP, enemy damage, armor, potion
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
isLowHp`); low with NO potion left, Retreat with Loot pulses red after a
cleared room (and in a panel room once a boon is taken) and Push Deeper
is plain (`hud.js markWayOn`, re-run on every update so a potion drunk
after the win flips it back; 0.00206). A live Attack button breathes
faintly in red (`styles.css attack-glow`, a glow layer's opacity, off
while a turn prints), so the recharged heavy's strong pulse no longer
sits beside buttons with no glow.

### Effects

One-shots (lunge, hit, numbers, entrance, shake) live in
`ui/combatFx.js` + `fxParts.js`, driven by `fx` descriptors on playback
items, and use `element.animate` so they never restart the CSS idle loops
(per enemy FAMILY: `battleLine.js IDLE_FAMILY` + `.idle-<family>`; loops
animate only translate/rotate/scale, never filter).

#### Card effects (0.183, the developer's picks from the Card Lab; tuning `cards.json`)

`ui/cardFx.js` lights every card from behind — a slow fog, blood, flames,
embers or ether by the enemy's particle material (`cardStyle`: bone fog,
embers flames, the wraith ether, flesh blood; the boss flames, the knight
ether), the shrine's boons and the treasure chests each their own
(`SHRINE_STYLE` / `CHEST_STYLE`, through `shrineUI.js litCard`). Every
lit card draws on a WebGL canvas of its own from a POOL (0.00227:
`cardFx.js POOL_MAX` 8 — every fight fits — handed from one room's cards
to the next room's as they come and go, `acquire` / `release`, so the
browser's ceiling on live contexts is never reached; `WARM` of them are
made and compiled behind the title; a new room's card that finds the
pool held by the last room's — the scenes mount the new line, then
clear the root — gets its canvas on the next tick, `place`, after the
tick's filter has returned the last room's). Before 0.00227 ONE hidden context
drew every card in turn and each card's 2D canvas took its picture as
an ImageBitmap (a `bitmaprenderer` context, 0.00197): the first device
report (0.00225, the developer's iPhone) put that at 13.5 ms of main thread
per tick at rest and 6-8 ms in the fights — Safari serves
`createImageBitmap()` of a WebGL canvas as a GPU readback, one per lit
card per tick. That copy path stays for the cards past the pool and
where no pool canvas can be made; a pooled canvas whose context is lost
leaves the pool for good and its card goes unlit for the room
(`.card-fx`,
screen-blended over the frame's dark plate INSIDE the card's plate layer —
`.card-frame` / the panel's `.card-plate`, which carries the card's
see-through opacity, so the plate stays as transparent as the lab's
(0.195) — masked to the frame's window or a panel's rounded edge). Drawn at `fx.scale` of the card's
pixels at `fx.fps` (60 since 0.00257: the 30 of the copy-out days read
as a jerk beside 120 Hz motion on the developer's Mac — the pool draws
each card straight, a few hundredths of a ms a tick; a phone keeps 20,
the saver 15), a fallen card lit until its unit leaves the row
(0.00216); off with the particles (flat
background, reduced motion). The cards in 3D: `perspective` on
`.battle-line`, `.enemy-row` and `.unit` (each level hands its children
the camera), `combatFx.js kick` turns a struck card `kickDeg` away from
the blow — at its full angle within the first 6% and recovering slowly,
`composite: 'add'` over the idle loop; a crit `critKick` times, OVERKILL
victims too — and the cards are dealt in turned and tilted (`enter` at
the room's build hides the units; `deal` plays once `scene.js
whenWindowsBack` says the windows are back — a room is rendered while
they are fully faded out, so anything played at render time is never
seen; 0.184). The light's window edge sits on the middle of the frame's
border, and the canvas is transparent outside it (0.185: an opaque black
there showed as a rim outside the border, where the frame art is
transparent and the unit's isolated 3D group has nothing behind to
screen with). The
glint: a second, bright copy of each portrait inside a band three cards
wide, masked to a soft stripe (`--band` on the unit; `.glint-band`)
that `fxParts.js glintSweep` slides across the figure on a hit and the
entrance — the band and the copy inside move opposite ways by
transforms, so the figure stays put under a travelling stripe (0.00222:
the mask's position used to animate, a repaint of a full portrait copy
every frame per sweep); mounted for the sweep only (`battleLine.js
mountGlint` / `unmountGlint`, the unit's `glint` getter — six invisible
copies used to run their idle loops and blend-plus-filter surfaces all
fight long). The card light's hidden canvas is sized to the largest lit
card (`cardFx.js fitShared`; it was 512x512 and every card's picture a
snapshot of all of it), an unmeasured card waits for the observer's
first report, the shader compiles behind the title (`warmCardFx`), and a
phone draws the light at `fx.phone.fps` (20). The particle bursts'
budget, cap, floor and DPR cap are `cards.json particles` (a phone: 150
and 1x), and the particle canvas is opacity 0 between bursts (a
full-screen layer composited every frame otherwise). OVERKILL's sprays
take the rects `overkill()` read once (six forced layouts per blow
before), a dying card's collapse reads the unit's cached filter. The
combat log is a REVERSED flex column with the newest line first
(`hud.js logLine`, `#combat-log`): the browser keeps it scrolled with no
script — a scroll-position write per line forced a layout of the whole
room mid-hit. Glow loops never animate `box-shadow` (the `.active`
pattern: a layer whose opacity breathes — the low-HP bar, the summon
bar, the record tag); a phone shows the figures without the
drop-shadow filter (an iOS re-render per frame on a looping layer) and
the rarity / low-HP text without its breathing (`styles.css` section 16). The benchmark draws all of it from 0.183 on (its numbers moved
with it).

#### The classes' particles (0.00268, the developer's ask: each class's attacks unique)

A blow by the hero lays the class's own trace over the
foe's material burst — `particleLooks.js spawnClassBurst(look, x, y, {
size, dir, kind, to })`, pure like `spawnParticles`, palettes `CLASS_PAL`
(steel, rust, fire, arcane, grave, moss, violet, ochre), the looks
`CLASS_LOOKS`; `combatFx.js traceFor(fx, heavy)` picks the look from the
class and the blow (the Knight's heavy a steel clash, his blows none;
Cleave a crescent arc swung through the foe with embers, its reach a
smaller one, the Barbarian's blows embers; Fireball an amber bloom with
cinders and smoke on every foe it takes, the Wizard's blows an arcane
flash; Soul Drain wisps torn out of the foe that seek the Necromancer's
card — `to`, a dot with `tx` / `ty` / `pull`, gone on arrival — his blows
grave motes; the Druid's heavy three rakes of the living staff and
leaves, his blows one; a blow on the hexed foe flares the sigil, the Hexhunter's
others violet sparks; the Plague Sister's blows a swing of the censer,
the blight's gnawing a wisp of it) and the class events burst on their
own (`playFx`: the Hex a turning pentagram in a ring, Last Rites the
censer's smoke on every foe, Entangle roots shooting up from the ground at
every foe's feet — `classSpray(..., { at: 'feet' })`, the `roots` look's
`tendrils`: thick earth-coloured streaks rising and pulled back down, a
green tip — with a green light, a bound foe's strain a tug (`rooted`), a
shiver and ENTANGLED floating up; a charge back, the thrall's rise, a
blow it took — the attacker lunges, a green THRALL number — and its
crumbling). The events say what the blow was (`combat.js`: `marked` on
the blow, `via` on a
heavy's reach and the blight tick, `drain` + `target` on the heal). Three
kinds joined the renderer: `puff` (soft smoke, source-over under the
glow pass, growing; thinned with the rest), `sigil`, `arc`. The tests
are in `classes.test.mjs`.

#### Particles

Particles (looks
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
the background fell back to flat. OVERKILL bursts every victim. The lab
(`labs/particles/`) is a standalone copy of the ~0.128–0.135 looks for
experiments — no heal material, none of the class looks, no status tints;
a look changed in the game does not change there (rewire it to
`particleLooks` or retire it, see the Backlog).

### 3D backgrounds

3D backgrounds (`core/bg3d.js` + `bg3d*.js`; tuning in
`backgrounds.json parallax`, per-file `overrides`, `enabled: false` = kill
switch): the art on a depth-displaced mesh with a slowly swaying camera;
flat CSS fallback with no WebGL, software GL, context loss or reduced
motion.

#### The phone power profile (0.00222, the developer's iPhone ran hot)

`parallax.phone` = the knobs that differ on a phone — `maxDpr` 1.5 (1278
px wide on an 852-px phone, 44% fewer fragments than DPR 2), `maxFps` 24
at rest, `motionMaxFps` 30, `puffDiv` 3 (the mist buffer at a third of
the canvas; `puffDiv` 2 on the desktop — a constant in the renderer
before) — merged by `bg3dTuning.js tuning()` under the per-file
overrides on a phone (`platform.js deviceBlock`, the device, once per
session; `?desktop` keeps the desktop values, so the developer can A/B on one
phone). The same build: the painting and its depth map arrive decoded
off the main thread (`bg3dGL.js loadPicture`: fetch + createImageBitmap,
closed after the upload; an `<img>` handed to texImage2D re-decoded the
2048x1152 JPEG on the main thread, in one task with the 9 MB upload, the
depth read and the 37k-vertex fill — the quarter-second worst frame every
fast machine showed once per run), and the fill and the puffs wait for
the next frame (`loadLayer`); a flash light alone no longer lifts the
cap to `motionMaxFps` (its slow fade reads the same at the rest rate; it
held 60 fps for up to 2.8 s after every crit and potion); the VIGNETTE is
the shaders' under the live canvas (`bg3dGL.js VIGNETTE_GLSL`, both the
mesh and the mist composite multiply the CSS ellipse's falloff; the CSS
`#vignette` hides under `#bg-stack.gl` and keeps the flat fallback —
pixel-identical on the hub, measured; it was a full-screen layer composited
over the canvas every frame, 3 MP a frame on a phone).

#### BATTERY SAVER

BATTERY SAVER (the corner column, 0.00222, remembered per browser): the ladder's last
3D rung as the player's own choice — the smallest canvas, no mist, the
card light at `fx.saverFps`; OFF returns to where the ladder had got;
never automatic. Records and benchmarks carry `power`: 'saver' / 'phone'
/ 'full' (the dashboard's Background column). Frame rate: at most `maxPixels` (2.1M) and `maxDpr` (2 — a DPR-3
phone drew 1080p's pixels at 60 fps and never stepped down, 0.00209),
redrawn at `maxFps` (30)
when nothing moves, and all session a device under `minFps` (22) steps
down — resolution x0.8, x0.64, no fog, flat (`core/bg3dQuality.js`;
`parallax.quality` = the window, the pause gap and how many slow
windows step down; a window is slow only against the rate the `maxFps`
throttle can reach on this screen, so a 40 Hz display is not punished —
0.00197; **0.00222: `quality.reachShare` (0.9) applies only ABOVE
`maxFps`, where the throttle acts — it used to apply to a struggling
device's own rate too, 15 rAF/s judged against 13.5, so nobody ever
stepped down; `bg3dQuality.js slowAt`, tested). While a jolt, sway, flash or push plays the cap is
`motionMaxFps` (60), not the display's rate (0.00197; it was uncapped
then, 144 fps through most of a fight). The flat CSS layers are hidden
while the canvas draws (`#bg-stack.gl`, set from the first frame to
`shutdown()`) and get no push then; they keep every painting as the
fallback. `shutdown()` resets the ladder, the clocks and the view, so a
later `initBg3d` starts clean. Keep per-pixel shader work minimal;
slowly varying terms go per vertex. Fog:
distance haze + ~40 soft mist puffs (`bg3dPuffs.js`, half resolution) per
`parallax.overrides.<file>.fog` and `fogWind`. Flash lights (crit, potion,
revive): `bgLight(kind, rect)`, settings in `parallax.lights`. 0.00312 (the developer found them faint in combat — the cards, grown since 0.100, cover the light's middle): every kind's strength x1.5 and the reach 0.45 → 0.6; tuned in the Fog Lab. Big-hit sway:
`swayDeg` / `swayHitShare`.

#### The mist's own motion and light (0.164, tuned in the Fog Lab)

`parallax.puffs` carries what used to be
constants — `drift` (per-puff wind speed spread), `rock`, `period`,
`bob`, `breathe`, `shadeVar`, `alphaVar` — and the new `turbulence` /
`turbulencePeriod` (each puff wanders on its own loop), `pulse` /
`pulsePeriod` (fades in and out), `flow` / `flowScale` / `flowAmount`
(tileable noise churning inside each puff, one extra half-res texture
read); `parallax.mist` = the puffs' lighting (`shade` self-shadow
strength, `litTint` / `shadeTint`, `sceneLight` = the painting's own
bright pixels glow through the mist, read with a mip bias, `nearBright`);
`parallax.haze` = the distance haze's shape. 0.166–0.169: the shipped base
is the lab's Rolling Mist toned down to the developer's reference (drift
spread 0.7–1.0, turbulence 0.015 / 12 s, breathe 0.04, bob 0.006, pulse
0.3; drift 3.5, haze 0.38 / curve 1.55), and every painting has its own
`fog` + `fogWind` override
(outdoors and the large halls a notch windier; the wander goes in before
the box wrap, so a wrap never pops); `setLiveTuning` re-rolls a layer's
puffs when its block changes (same seed: no jump). The lab never writes
the game's saved tuning (`castle-bg-tuning`): it keeps its own key.

#### The room push (0.171, `parallax.push`)

A room change moves the
camera through the picture — `scene.js transitionTo` tells the renderer
(`onTransition` → `bg3d.bgPush`) as the windows start to fade, the old
painting dollies in (`dist` world units over `inMs`, accelerating; `mvp`
takes a dolly), the new one appears pushed in and pulls back to rest
over `outMs` (decelerating) through the crossfade and the windows'
return; each layer gets its own camera. A push with no new painting
eases back. The flat fallback scales the CSS layers the same way
(`.bg-layer.push` / `.pushed`, off under reduced motion). The Fog Lab's
arrows play the game's sequence (push, a second, the painting) with the
three knobs as sliders. The timings themselves (1 s out, 2 s crossfade,
1 s in) are the developer's and unchanged.
**A painting's own camera (0.00311):** `parallax.overrides.<file>` may
carry any of the BG TUNING sliders' knobs (`bgTuner.js`: depthScale,
pivot, yawDeg, pitchDeg, speed, fogScale, fogSpeed) — each layer keeps its
own sway and fog clocks (`L.tau` / `L.fogT`, a new layer carrying the
last one's on), its own orbit, and the skirt fits the most demanding
painting shown (`refit`); the title's (`medieval_castle.jpg`) are the
developer's slider picks (depth 1.2, focus 0.45, sway 3.6° / 1°, speed
2.15, fog x1.15). BG TUNING's live sliders still win over every painting.
New room art: JPEG in `assets/bg/`, entries in
`backgrounds.json` (`rooms`, `roomNames`) and a depth map (`python3
tools/gen-depth.py <model.onnx> new.jpg`; the suite fails without one).

#### The title's fly-in (0.00307 the prototype, 0.00311 shipping — the developer's idea, the video thread)

The title painting is the END of a short flight: as the title scene
enters, `ui/titleIntro.js playIntro()` lays a muted `<video>` over
everything (`#intro`, z-index above the corner column), the camera
arrives at the castle, the film's last frame — the painting itself,
baked in as a 0.4 s crossfade at the file's end — fades `intro.fadeMs`
onto the 3D renderer's rest pose, the fade beginning `intro.leadMs`
before the film's end with the film playing on under it (0.00308, the
developer's ask after seeing it; `holdMs` = a hold after the end instead,
with leadMs 0; 0.00309, the developer's ask: a room change's whoosh
peaks `intro.whooshAtMs` into the flight (`sfx.js transitionSfx(atMs)`)
and the Descend strike, `deeper`, sounds as the title's panel comes up —
before any gesture `sfx.js adoptRunning` takes the context only where
the browser let the title bed start on its own (RUNNING; a suspended
one would hold the sounds for a stale burst on the first click), so a
desktop that blocks autoplay sees the flight silent and a phone, whose
PLAY tap precedes the title, hears both; `intro.whooshDb` -1.9, the
whoosh 20% under the game's, and the boot's own transition leaves its
whoosh out while `introPending()`, 0.00310) (the same
painting cover-fit: as the fade begins, under the still-opaque film,
`bg3d.js bgArrive()` puts the camera back at the rest pose — orbit's
t = 0, pixel-identical to the flat painting; by then the sway had
reached its full 2.5°, a parallax jump the fade used to carry — drops
any kick, sway or push, and restarts `fogFadeMs`, so the mist and the
haze rise again as the film goes, the sway ramping in with them
(`arrived`, a smoothstep over the same `fogFadeMs`: a sine leaves rest
at its fastest, 1.4° in the first second); headless, the frozen rest
pose against the film's last frame is SSIM 0.92 — the painting itself
against the encode 0.93 — so what the fade reveals IS the frame the
film ends on; 0.00310, after the developer saw the first hand-over),
and the title's panel, held under it (`.intro-hold`), fades
in after. Tuning `backgrounds.json intro` (`enabled` the kill switch,
`file` in `assets/video/` — 1080p, 2.4 MB — and `phone.file`, the 720p
file a phone fetches, 0.8 MB, through `platform.js deviceBlock`;
`waitMs`); the data check and the orphan check know the folder. **The
vignette over the film is the layer's own** (`#intro::after`, the one
gradient `#vignette` draws, 0.00311): baked into the 16:9 file it was
the frame's ellipse, not the screen's, and a phone or an ultrawide
cropped it — the film and the painting are both cover-fit from the
centre, so the hand-over holds on every aspect ratio, a 19.5:9 phone
cropping 18% off the top and bottom of both alike. Boot fetches the film
beside the art (`preloadIntro`, after the data) and waits up to `waitMs`
for it right before the title (`introReady`; on a phone after the PLAY
tap — the wait used to run before the gate) — not ready, no H.264 (the
codec is asked for by name: headless Chromium plays no MP4, so the
layout check never meets it), reduced motion, or already played this
session: the title shows as it always has (`playIntro` answers null,
nothing is mounted). The fade begins `leadMs` before the end BY THE
FILM'S OWN CLOCK (a rAF poll of `currentTime`; a wall-clock timer faded
mid-flight when the download stalled), `ended` + `holdMs` the backstop;
the film is released after (its `src` dropped, `load()`). A click, a tap
or any key but the browser's own skips it (the key is stopped before the
title's hotkeys; the fade starts from where the film is). **`node
tools/intro-check.mjs`** drives it headless on a desktop window and a
phone (the films transcoded to VP9 once, cached under `/tmp/intro-check`,
the page served with the data pointing at them): the layer up and the
panel held, the fade before the end by the film's clock, the layer gone
and the panel back, a key skipping and going no further, and the
hand-over — the held last frame under the layer's vignette against the
renderer frozen at rest (that page alone served a 60 s fade), SSIM 0.95
on the desktop, 0.92 on the phone's 720p film, a sway left running ~0.6. Made by plan B of two: a far, wide view of the castle
outpainted by Nano Banana Pro from the painting, then Kling 2.5 flying
from it INTO the painting with the painting as the take's last frame —
the motion forwards, the landing exact (plan A, pull back and reverse,
would fly the crows backwards); Hailuo 02, Seedance 1 Pro and Veo 3.1
rolled beside it; the take eased to 3.2 s by ffmpeg. The prompts, the
models' results and the cut are `docs/video-prompts.md`; the video
models run on Replicate through `tools/replicate.mjs`; no
`gen-video.mjs` yet (the Backlog).

### Portraits (0.184)

The file is data: `enemies.json art` per enemy and
`cards.json player.art` (0.00291: drawn nowhere in the game any more —
every look of every class, the knight's crouch marked `sprite: true`
included, is its `heroes.json` figure; the file stays for the Art Lab),
read through
`shared/portraits.js portraitUrl(id)` (battleLine, preload; `dataCheck`
fails on a missing one) — a redraw lands under a NEW filename (rule 7,
`rat_v2.webp`) and the data points at it, so the old art is one edit
away.

#### The approved redraws in the game (0.00303, the developer's call)

All 30 approved enemy redraws are live: `enemies.json art` is a LIST,
one file per approved candidate (`rat_v2.webp`, `rat_v3.webp` …, in the
candidates' order), and `ref` is the original every redraw was made from
(the prompts doc's File column, gen-art's image 1 and `idsByFile`; on
disk, drawn by no fight; the Particle Lab uses four of them). A fight
DEALS the pictures (`portraits.js dealPortrait(fight, foe, rand)`, called
by `battleRoom.js mountBattle` with the combat as the fight): each foe of
a kind gets its own picture while the kind's variants last (three Giant
Rats: both rat pictures, then a fresh shuffle), the boss one of his three
at random each fight, a summon from the fight's deck; a foe keeps its
picture for the fight (a WeakMap per foe object: a relayout or SWITCH
CLASS re-mounting the line shows the same faces). The deal draws from
`crypto.getRandomValues`, never `Math.random` (the simulator and the
seeded scene fights are byte-identical); the benchmark passes `rand: ()
=> 0`, the same faces every run. Preload: every picture of the tier-1
foes (the first rooms) and the first of every other foe are Descend
essentials; the other variants (`preload.js portraitLaterUrls`) come right
after, decoded, before the gear's pictures and the rooms (the 30 are
~4 MB; the 12 originals were 1.5 MB). The boss's redraws are on the wide
canvas (`gen-art.mjs WIDE`, 1100 px): the figure sits right of the card's
centre, the head over the name bar and the sword sweeping across the row,
as the boss composition asks — the Art Lab's FIGHT view showed them the
same way. Variants per foe: spider, hound and Fellblade 4; Shrieker,
skeleton and the Vampire Lord 3; rat, acolyte and gargoyle 2; Cinderborn,
Wraith and Blood Knight 1.

#### Redrawing them (0.00201, after three directions)

`docs/portrait-prompts.md` holds the style block and a line per
character (`[FACING]` = left for enemies, right for the knight; an
ACCENT per character; a boss gets its own wide, waist-up COMPOSITION,
`gen-art.mjs BOSS_COMPOSITION`). The direction that stuck is the
originals' own rendering — photoreal dark-fantasy, the character's glow
lighting it, one hue family each — NOT the inked room style: the inked
sheets in `assets/style/` (the developer's, 0.191) and a Mignola / Darkest
Dungeon block cost the glows and the presence, and were dropped. Image 1
is the current portrait, image 2 the character's OWN portrait (`--refs
own`; `family` = the colour family's best original, `sheets` = the inked
sheets); a character whose art is no reference (the gargoyle) is drawn
onto another's original with `--from-sheet skeleton` (the picture's
figure replaced).

#### Models

The models (`--model`, one adapter each in `MODELS`):
Kontext Pro / Max (two input pictures), Nano Banana (`banana`, the
developer's pick: faithful, cheap, ~$0.04) and Nano Banana Pro (`bananapro`,
2K, ~$0.15), Seedream 4 (`seedream`, the most dramatic — the only boss
that read as one), GPT Image 1.5 (`gpt`, slow, shades its backgrounds),
FLUX 2 Pro (`flux2`); prices from memory, the API has none. Inputs go
inline as data URIs (`--inputs files` uploads; the models' own fetch of
an uploaded file timed out a third of the time).

#### The cut-out

A
matting model, `851-labs/background-remover` (~1 s, a fraction of a
cent) — the colour key in `tools/cutout.mjs` (`--matte key`, offline:
flood fill from the border, paper tones, gradients, a shadow pass, hole
filling, stray marks) ate stone legs and blade edges once the figures
turned photoreal; the figure is then trimmed and scaled onto the current
portrait's canvas at the current figure's height (the boss onto a wide
canvas, `WIDE`), feet on its baseline. Per candidate: the model's picture
(`assets/chars/candidates/<id>_c<n>_raw.jpg`), the cut-out
(`<id>_c<n>.webp`), and in `assets/data/art.json` the model, seed,
prompt, style, cut and verdict (numbering goes on, nothing overwritten).

#### The loop

Generate → the Art Lab (`labs/art/`: Approve / Reject with
a note, Flip, Clean = a Kontext pass painting out a shadow or panel,
Regenerate with notes = this candidate as the design, the note as the
direction, the panel's model) → COPY JSON → `--rerender
art-rerender.json` (verdicts recorded, re-rolls generated: `{ id, n,
hint, style, model }`, `{ id, clean: n }`, `{ id, basedOn: n, hint, n,
model }`) → `--prune` (an approved character keeps only its approval;
`--keep-models a,b [--clear-verdicts]` for a change of direction) →
`--import` (every approved candidate not imported yet, or `--pick rat=3`,
to `assets/chars/<id>_v<k>.webp`, ADDED to the enemy's `art` list — the
original `ref` leaves it with the first import (0.00303); the knight's
latest approval replaces `cards.json player.art`; a Clean first if a
shadow is in it) → ship. `--model lora --new mimic --line "CHARACTER: ..."`
draws a character the game does not have (a default canvas; the lab
shows it on a stand-in card) once the LoRA exists. `sharp` is the one
npm dependency (`package.json`; the suite runs without it).

#### The character LoRA

The character LoRA (`tools/train-lora.mjs`, `ostris/flux-dev-lora-trainer`
into the private model `pjarvilehto/crimson-moon-style`, trigger
`CRMSNMOON`, captions written from the data — the same preamble
`gen-art.mjs CHAR_CAPTION` the LoRA prompt uses; `assets/data/lora.json`
records every training) was trained in 0.00236 on the 31 approved
pictures (12 min on an H100): the trained VERSION is run (`replicate.mjs
predictVersion`, `gen-art.mjs loraVersion`) — the generic flux-dev-lora
runner fetches a model's weights from replicate.com, which a private
model refuses. It draws a character from its line alone at 1 MP (the
mimic chest came out usable; a known character comes out stiffer than
Nano Banana's redraw of its portrait — the LoRA is for characters the
game has no art for). Retrain only on approved candidates, never on the
room paintings for characters (a different style); `--cancel` stops a
run. **Every Replicate call goes through `tools/replicate.mjs`** (the
token, the Files API, `predict` by model name, `predictVersion` by
version, `latestVersion`).

### Room paintings (0.00236–0.00244)

The interiors in `assets/bg/`
(48 of the developer's, all approved as they are; 50 with the two the
generator made, 0.00244) are the style. **They were made with a
prompt, not references:** `docs/image-prompting-guide.md` (the developer's,
from Kimi: every background, icon and portrait prompt used) — a short
subject sentence with the palette cue last, a mood ("gloomy and moody,
deep shadows, oppressive atmosphere"; a boss arena gets "video game boss
arena background art, wide symmetrical battle stage composition with
open floor space in the center"), then the style block word for word:
"in the combined style of Darkest Dungeon 2 and Mike Mignola, heavy
black ink silhouettes, bold flat angular shapes, rough hand-drawn ink
texture and hatching, dramatic chiaroscuro lighting, video game
background art, wide shot, no characters". New rooms
(**the loop, 0.00242, like the portraits'):** `docs/room-prompts.md`
(the recipe, the style block, a table of rooms: id, name, hue family,
kind room / arena, line — the guide's own unused rooms are there with
its lines) → `node tools/gen-bg.mjs [--only id]` sends the line + the
mood + the block as text alone to **Seedream 4** (the developer's pick from
the verbatim round, `DEFAULTS.model`; two versions a room; `--refs`
attaches two of the game's paintings of the hue family, `REFS` — it
adds little; `--prompt "..." --id x` sends a prompt exactly as written)
into `assets/bg/candidates/<id>_c<n>.jpg` at the model's own size
(Seedream 2560x1440), recorded in `assets/data/rooms-art.json` → the
Background Lab → COPY JSON → `--rerender rooms-rerender.json` (verdicts
recorded, re-rolls painted: fresh `{ id, n, hint, model }` or from a
candidate `{ id, basedOn: n, hint, n, model }` — the candidate goes in as
the picture, `basedOnPrompt`) → `--prune` (a room with an approval keeps
only its approved candidates) → `--import <id>` (its latest approved
candidate, or `<id_cN>`; `--list rooms|treasure|bosses|entrance|antechambers`)
= the 2048x1152 q86 JPEG (a new filename, rule 7), its name in
`backgrounds.json`, the candidate marked `imported`, and the reminder
for the depth map (`python3 tools/gen-depth.py <model.onnx>
assets/bg/<id>.jpg`; the suite fails without one) → ship. `--sheet` a
contact sheet.

#### The bake-off

The bake-off (three rooms the game lacks — The Clock Tower,
The Blood Baths, The Rookery — `--bakeoff`, nine models in all): with my
first, descriptive prompt and references every model drifted
(0.00236); with the guide's recipe as text alone, **Nano Banana Pro**
(`bananapro`; 2752x1536 native, ~$0.15) and **Nano Banana** (`banana`,
1344x768, ~$0.04, upscaled 1.5x at import) land closest to the
paintings' ink and palette; Imagen 4 (`imagen`, 1376x768) is a close
third — yet the default stayed **Seedream 4** (`DEFAULTS.model`,
`seedream`): the developer's pick from the verbatim round (0.00242)
stands over the bake-off's ink ranking, `--model bananapro` for the
closest ink; the room LoRA (below) has the set's colour mood with less
of its ink; Seedream 4 a brighter modern comic (with references it went
to white paper); GPT Image 1.5 an etching, 3:2 and slow; FLUX 2 Pro
and FLUX 1.1 Pro grittier, and both refused "The Blood Baths" as
sensitive.

#### The room LoRA

The room LoRA (`train-lora.mjs --set rooms`: the 48 named
interiors — the title's and the death's exteriors stay out — into
`pjarvilehto/crimson-moon-rooms`, trigger `CRMSNROOM`, caption
`ROOM_CAPTION` + the room's name; trained in 0.00237, 16 min; the
destination model is made on first use) draws a room from its line
alone (`gen-bg.mjs --model lora`, 1344x768, upscaled at import).

### Item art (0.00260, the developer's direction and picks from the mockups)

Every item has a picture: `items.json art` per item, a 256 px
WebP in `assets/items/` (~8 KB; about 420 KB for the 48 items and the
potion), read through
`shared/itemArt.js` (`itemArtUrl`, `itemArtUrls`, and `gainLine(from,
to)` — what a find raises over what it replaced) and drawn by `hud.js
itemPic(id)` (an `<img class="item-pic tier-N">`; the tier sets `--rim` /
`--rim-glow` for the small ones' rarity rim); `dataCheck` fails an item
without one, the orphan check covers the folder.

#### The look

Dramatic
low-key light, an Unreal Engine 5 render, a touch of Mike Mignola
(`docs/item-prompts.md`: the style block and a line per item ending in its
rarity's glow — common none, uncommon cold blue, epic violet, legendary
red / orange).

#### Painting them

`tools/gen-items.mjs` sends the block +
the line as text alone (a reference picture made Nano Banana copy instead
of restyle) to **Nano Banana Pro** (picked over Seedream 4 — dramatic but
it added things and cropped — and Nano Banana — small objects); every
candidate is kept (`assets/items/candidates/<id>_c<n>.webp`, 512 px,
lab-only) and recorded in `assets/data/items-art.json`; `--hint` adds a
direction (the axe's first roll had a hand on it); `--import [id|id_cN]`
writes `assets/items/<id>_v<k>.webp` (a new name each time, rule 7) and
edits the item's `art` line in place (`setArt`: items.json keeps its own
layout); `--sheet` a contact sheet. A new item = its line in the doc, a
roll, an import.

### Items in play

Where they show (the developer's pick "B": the
picture fading into the dark, the text over it): the hall's worn slots
(`hubSections.js` — the desktop's `.gear-slot .slot-art` on the slot's
outer side fading toward the card, the phone's twin at the Equipment
row's left end; the art layer clips itself, not the slot — the purchase
flash grows the name past the slot's edge — and is lifted
(`brightness(1.45)`) so the low-key art does not sink under the fade);
the hall's finds reveal (the picture flashes in under the gold flare,
`hubScene.js reveal`, its filter list matching the CSS one); **a find in
combat:** `run/loot.js takeItem` hands the log `extra.find = { id, slot,
index, from }` (what the preview's `equipItems` changed),
`combatQueue.js` turns it into the line's `fx: { kind: 'find' }`, and
`ui/findFx.js findPop` raises the item as a card over the foes still
standing (FOUND · the slot, the name in its rarity, its stats, "replaces
X · +gain"), holds 1.5 s and flies it into the LOOT row bottom left,
shrinking to a chip (0.00262, the developer's call: a find is the run's
loot, worn only after the run — it used to fly into the hero's card;
`findFx.js lootSpot`: the tray's next free place, past the cards still
flying, the scene handing `fxCtx.loot` / `lootAhead`; on a phone, with
no row, the XP / COINS counters; reduced motion and the shim: nothing,
the log says it); the Found line and the room's loot summary lead with
the picture; the **LOOT** row under XP / COINS (`dungeonScene.js
showLoot`: the newest six; shown as the run's first find takes off;
none on a phone, whose top strip is the room title's — since 0.00290
nothing lists them there mid-run — the LOOT pop-up does (0.00292, below); a find's chip joins as its card lands, with
a flash, an OVERKILL's silent finds when the room's lines are out); **a click on the
row, or `I`, opens the LOOT pop-up** (0.00292, `ui/lootDialog.js`; 0.00299:
the row is a keyed button — it was the one action on the combat screen
with no key — and the hero card's INVENTORY page ends in a "Finds · n ›"
line that opens it too, a phone's one way to it (a div with the button's
role and no key of its own: the unit's first `<button>` stays the
heavy's): every find of the run, newest first, as the hero card's
inventory strips — `hud.js itemStrip`, the strip styles under
`.inv-strips` — four in view (two on a phone, section 16) and the rest a
scroll / arrow key away, each with what becomes of it when the run ends,
judged against `run.gearPreview`, what `settleRun`'s `equipItems` will
wear: `Weapon ↑` / `Ring I ↑` for a worn find, `Beaten · salvaged` for
one a later find beat — it stays in `run.itemsFound`, so the pop-up used
to promise it a slot — `Salvage` for another class's gear; C / Esc /
Enter close); the hero card's INVENTORY page (`battleLine.js invPage`:
the worn gear, and the Finds line); **the run's end**
(`runEndScene.js findCard`; 0.00294, the developer's layout: the panel
940 px wide (`.panel.run-end`), the five numbers on one line, the cards
200 px — from five finds two rows, 175 px on a window 900 px tall or
more, 150 px from 801 px (a MacBook's 813) — and one shrinking row as
before on a window 800 px tall or less, every phone among them: a card per slot `equipSummary.changes`
changed — the picture fading down into the slot, the name, its stats,
"over X · +gain", RELIC on a tier 4 — and the salvage as grey chips;
`equipItems`' `equipped` / `salvaged` entries carry the `id` since).
Preload: after the Descend essentials and before the rooms, decoded, the
save's worn gear first, the potion's last (`preload.js itemUrls`;
Descend waits for none of it).

#### The healing potion (0.00263, the developer's ask)

The healing potion has a picture too (`difficulty.json potions.art`,
`itemArt.js potionArtUrl`, `hud.js potionPic`; painted by the same tool,
`gen-items.mjs EXTRAS` writes it into difficulty.json on `--import`): the
hero card's count is the picture + `3/4` (`battleLine.js`), the log's
"Found a healing potion!" carries it (a `{ potion: true }` part), and a
potion found in combat rises as the same card (`findFx.js potionPop`:
FOUND · Potion, what it heals, the satchel) and flies into that count —
`queueEvents`' `potionQueued` hook has the card hold the potion back
(`holdPotion`: the run's count is already up when the loot is rolled, a
line before it prints), and the landing counts it with a glow
(`landPotion`; under reduced motion at once). A full satchel's sale has no card.

### The classes' starting kits (0.00265, the developer's approval)

A
weapon and an armor per class in its look (`heroes.json kit`, `heroes.js
heroKit`; dataCheck names a kit item of the wrong slot) — Barbarian:
Notched Hand Axe + Wolfhide Jerkin; Wizard: Apprentice's Staff +
Threadbare Robe; Necromancer: Grave Knife + Gravedigger's Shroud; Druid:
Budding Branch + Bark Vest; Hexhunter: Worn Hand Crossbow + Witchfinder's
Coat; Plague Sister: Tin Censer + Sister's Habit; the knight's is the
Rusty Sword and the Oak Shield (`difficulty.json player.startingGear`,
still every new save's gear until the pick). The twelve are tier 1 with
exactly the Rusty Sword's or the Oak Shield's numbers (only the kit items'
numbers are identical — the classes' own gameplay is 0.00267's; a kit's
own numbers are still the developer's call) and
`starter: true`: never in a kill's loot or the gilded chest (`loot.js
droppable`), so the drop pool and the simulator are unchanged
(byte-identical). A NEW save wears its class's kit on PROCEED
(`heroScene.js wearKit`: slot by slot, only over the default starting
gear, never over a find); a save that had chosen before keeps its gear.

### The item matrix (0.00274, the developer's calls; `docs/item-matrix.md`)

Who can use what, readable from an item's name: a weapon has a `kind`
(sword, axe, mace, staff, dagger, scythe, crossbow, censer) and a class
wields two (`heroes.json wields`: Knight sword + mace, Barbarian axe +
mace, Wizard staff + dagger, Necromancer dagger + scythe, Druid staff +
scythe, Hexhunter crossbow + sword, Plague Sister censer + mace); a body
armor has a weight (`heavy` plate and mail, `hide`, `cloth`) and a class
wears ONE (`wears`: the Knight heavy; Barbarian, Druid, Hexhunter hide;
Wizard, Necromancer, Plague Sister cloth) — heavy clearly strongest,
cloth the least armor and the most HP (a smoke check compares the tiers);
an item with `class` is that class's alone whatever its kind (the kits,
Knight's Blade / Greaves, the Relic of the First Knight, the signature
items); everything else is everyone's. `shared/classGear.js` (`canUse`,
`usersOf` / `usersText`, `masteryText`, `withMastery`, `kitFor`,
`fitGearToClass`); dataCheck checks the kinds, the hero blocks and the
mastery. 94 items (46 new in 0.00274, painted by `gen-items.mjs` from
their lines in `docs/item-prompts.md`; every class has two weapons and a
body armor to find at tiers 2, 3 and 4 — a smoke check).

#### Mastery

A
class's two signature accessories (`class` + `mastery`: 1 on its tier-3,
2 on its tier-4) add `heroes.json mastery.per` per point to a key of its
class block (`stats.js derivedStats` → `run.stats.klass`, through
`withMastery`): the Knight +15% Heavy Attack damage (`heavyMult`), the
Barbarian +15% Cleave reach, the Wizard +1 Fireball charge, the
Necromancer +20% thrall strength, the Druid +1 Entangle turn, the
Hexhunter +15% Hex crit damage, the Plague Sister +10% blight; the item's
line says it (`hud.js describeItem`).

#### Drops

`classDropShare` (0.8)
of the item rolls come from what the class can use (`loot.js rollLoot`,
the run's `run.heroId`), the rest from everything — another class's gear
still drops: `takeItem` carries it into `run.itemsFound` with its line
("Found: X — Barbarian armor, salvaged at the end."; the find card greyed
with the same words, `fx.offClass`; its LOOT chip greyed), and at the
run's end `equipItems` salvages it (`salvaged[].offClass`; the run-end's
"Can't use · salvaged" row, its coins with the rest — the death toll
applies). The gilded chest and the reliquary make their item for the
class.

#### A save's gear

`migrateProfile` fits it on every load
(`fitGearToClass`: a weapon or armor the class can't use becomes its kit,
an accessory comes off — the developer's call: no payout), so do the
debug SWITCH CLASS and the dungeon's `switchClass` (the run's preview
too); the simulator puts on the class's kit and plays the knight with his
class set.

#### Balance (4 campaigns x 40 runs per class, mean depth / the last 10 runs' depth, before → after)

Knight 15.5 / 23.7 → 15.8 / 23.6,
Barbarian 16.6 / 23.8 → 16.3 / 23.3, Wizard 17.3 / 23.8 → 16.4 / 23.4,
Druid 15.9 / 24.1 → 15.9 / 23.8, Hexhunter 16.0 / 24.1 → 15.2 / 23.5;
the two cloth classes that leaned on armor lost the most, so (the class
numbers re-tuned for the matrix) the Necromancer's armor x0.8 → x1.1 and
damage x1.0 → x1.1 (15.8 / 23.3 → 14.8 / 22.4, the weakest now — his
daggers and scythes trade damage for crit and lifesteal) and the Plague
Sister's armor x1.2 → x1.35 (16.3 / 23.6 → 15.5 / 23.0); the room-24
boss column swings ±15-25 between seeds at this size — read it with
more campaigns.

### Stat colours (0.00266, the developer's call; the "moody" set after a brighter first try)

One colour per stat, the same on the Train row that
raises it and everywhere the stat shows, so training reads as the stat it
moves: damage rust (Power), HP sage (Vitality), armor slate (Endurance),
crit verdigris (Precision), loot ochre (Fortune), lifesteal dusty rose,
dodge dusk violet — `styles.css :root --st-*` (the look, not tuning). The
code: `hud.js statText(str)` wraps each stat word with its number ("+6
dmg", "+40 armor", "+3% crit chance", "better loot", "300 HP") in a `.st
st-<kind>` span (`statKind`), used on every item line (`describeItem`'s
sites: the hall's slots and Equipment rows, the hero card's inventory, the
find card, the run's end) and the Train / Alchemy rows' small line;
`ST_TRAIN` maps a discipline to its stat (the row gets `.st-row st-<k>`:
its name in the colour, a bar on its left); `statBox(label, value, cls,
st)` colours a stat box (the hall's under the knight and the phone's
strip: Attack / HP / Armor / Crit / Lifesteal); the hero card's DMG /
ARMOR, the HP word on every HP line, and the STATS page's rows (the
potion's heal as HP). Item names keep their rarity colours; the find
cards' "+gain" stays green (an improvement, not a stat).
**The rarity tiers' colours (0.00299):** `styles.css :root --t1..--t4` and
`--tN-rgb` beside `--st-*` — the rarity lines, the pictures' rims, the
hall's slot borders and the two find cards (one `.find-pop.tier-N,
.find-card.tier-N` block) read them; the five hand copies were one
colour each. `hud.js` holds the shared builders: `tierOf`, `itemTitle`
(name + forge, the four sites), `findBody` (combat's find card and the
run end's, `fp-` / `fc-`; `.fc-slot` became `.fc-kind`), `wornId` and
`gearLabel` (the hall's two builders and the inventory page loop
`GEAR_SLOTS`; a slot's name was written in five places).

### Heroes (0.00248, the developer's call and layout)

Character classes:
`assets/data/heroes.json` lists them (`default` the knight; per hero id,
name, epithet, lore, traits — placeholders of mine for the lines — and
`looks`, one per sheet: `art` the figure in `assets/heroes/`, `fh` its
share of the sheet's height so the heroes read in scale with one another),
read through `shared/heroes.js` (`heroList`, `heroById`, `cleanHero`,
`heroOf`, `lookUrl`, `lookOf`, the preload lists). Seven so far: the
Curious Knight (5 since 0.00264: the developer's four standing sheets
first, then the chat's crouching sheet — the one look marked `sprite`)
and the developer's Barbarian (5), Wizard (8), Necromancer (8), Druid
(5), Hexhunter (4) and Plague Sister (4), 39 figures.

#### The art

The developer uploads 1024x1536 sheets
on flat grey, `hero_<id>_<look>.png` (`v1`..`vN`, `alt_v1`..); `node
tools/cut-heroes.mjs --import .` converts them to
`assets/style/heroes/<id>_<look>.webp` (the raw sheets, lab-only, q92),
keys every sheet out of its grey by `tools/cutout.mjs` (no shadow pass:
the sheets carry none; 0.00253: then every enclosed pocket of the
sheet's own grey goes whatever its size — the gaps in fur, a ragged hem,
between a crossbow's limbs, at a tight tolerance so an axe blade's greys
stay — and the edge's pale fringe is taken out, `cutout.mjs unfringe`:
the paper's share of each edge pixel's colour removed by its alpha) into
`assets/heroes/<id>_<look>[_<suffix>].webp` trimmed to the figure, never
overwriting (rule 7: a redo of a deployed figure takes `--suffix`, the
0.00253 recut is `_k2`), and prints the `looks` lines (`--json` the map)
for heroes.json; then `git rm` the PNGs (they stay in history).

#### The screen

The screen (`ui/scenes/heroScene.js`, `styles.css` section 6b, the
phone's twins in 16; 0.00299: `render` clears the root first — a
`relayout` or SWITCH CLASS used to stack a stale screen under the live
one, and the hotkeys drove the stale one): the title's Enter the Castle leads here ONCE per
save (0.00253, the developer's call: `profile.hero` is null until PROCEED;
a save that has chosen enters the hall straight away; the class changes
only with a new game — a wipe starts at null; the v6 step took back the
knight the v5 step gave unasked, so every save chose once on 0.00253), a
new player asked their name first, over the Great Hall's
own painting, so PROCEED fades this screen's pieces out and the hall's
in with the painting never changing. The heroes' cards in a row on the
enemy frame (`--hero-h` 48vh or what `--n` cards fit in 90vw; a figure's
height is its `fh` of the card), the chosen one lifted with a breathing
gold rim (opacity), the look switcher under it (‹ › = the arrow keys,
which reach keyed buttons since 0.00248, `hotkeys.js`; a hero with one
look hides it, `.single`; each hero remembers its look while the player
compares), a bar with the hero's lines and PROCEED (Space, `P`); 1-7 and
a click choose (the number badge is the card's keyed button).

#### The pick

The pick lands on the profile on PROCEED only — `hero: { id, look }`, save
version 6 (`cleanHero` makes an imported code whole: an unknown class or
look is the knight's first; null stays null).

#### The look

The look can change
later: a click on the hall's portrait (`.knight-card.pickable`, its
`.look-tag` says which look; the phone's Equipment sheet has a Look row,
`L`) opens `ui/lookPicker.js` — the hero large between ‹ › (the arrow
keys, A / D), saved as it turns, shared with the stats on close; a hero
with one look is not pickable (none since the knight's sheets, 0.00264).

#### The stats (0.00253)

Every run record carries `hero` and `look` (`history.js runRecord`), the
upload carries `profile.hero`, the collector keeps both (Worker 0.00253
— paste it; the old one drops them), the dashboard shows a Hero column
and a By hero table (`stats.js byHero`: runs, depth, deaths, looks worn;
a run before the classes counts as the knight's).

#### The colour themes (0.00254, the developer's ask)

`heroes.json theme` per class — `plate`
(the card plate's colour: a `.tone` layer with `mix-blend-mode: color`
over the plate art, so the art keeps its light and shade and the hue is
the class's — on every card of CHOOSE YOUR HERO (`--theme` on the card,
the chosen one's pulse in it too), on the knight's card in combat
(`battleLine.js frame(theme)`) and on the hall's portrait), `light` and
`tint` (the card light behind the player: `cardFx.js cardStyle('player')`
reads them, the knight's ether as before; `heavyName`, the heavy
attack's name on the button and the STATS row — 0.00267, the
developer's picks: Heavy Attack, Cleave, Fireball, Soul Drain, Entangle
(Go Feral until 0.00271), Hex, Last Rites — `shared/heroes.js heavyName`;
what each heavy does is `class.heavy`, below). The knight crimson, the
Barbarian rust with embers, the Wizard blue, the Necromancer sick green,
the Druid moss with fog, the Hexhunter violet, the Plague Sister ochre
with fog — my picks, tuned in the data.

#### The classes' gameplay (drafted 0.00258 under the simulator, LIVE since 0.00267 — the developer's call: play it, then tune; the knight's path is the game as it was)

`heroes.json class` per hero (every key on every hero, `_class` says
what each does) — multipliers on the derived HP / damage / armor, a
potion's heal, dodge, the heavy's cooldown and factor, and `heavy`: the
knight's `blow` (spill, OVERKILL), the Barbarian's `cleave` (+ rage), the
Wizard's `fireball` (charges a fight), the Necromancer's `drain` (+ a
thrall raised from a fallen foe that takes the foes' blows — never in a
cleared room, 0.00299), the Druid's
`entangle` (0.00271, the developer's call, in place of Go Feral's wild
shape: roots bind every living foe for `entangleTurns` (2) of their turns —
`e.entangled`, loosened one a turn at the end of the enemy phase — and a
bound foe's attack fails with `entangleChance` (0.4): "Entangled!", no
blow, `enemyStrike`; the simulator at 0.4 puts him beside the knight,
16.5 / room-24 boss 18%; 0.5 was 17.8 / 18%, 0.6 and three turns ran to
20 / 33%; + mending a turn), the Hexhunter's `mark` (every hit on it
crits; + dodge), the Plague Sister's `censer` (blight stacks ticking a
turn; + armor per potion) — `stats.js derivedStats` applies the
multipliers and snapshots the block as `run.stats.klass`, `combat.js
classPhase` / `sweep` / the thrall in `enemyStrike` / the charges in
`canHeavy` do the rest, each heavy's code in `run/classes.js` (0.00283:
`HEAVIES` by kind, the `AFTER_BLOW` / `FOE_TURN` hooks; combat.js calls
them, never switches on the kind).

#### Immunities (0.00293, the developer's ask)

`enemies.json immune` per enemy, a chance 0-1 per element
(`blight`, the censer's; `fire`, the fireball's — `classes.js ELEMENTS`,
each HEAVY's `element`; dataCheck wants every element on every enemy):
the undead and the vermin shrug the blight off (skeleton and wraith 0.9,
gargoyle, hollow hound, rat and shrieker 0.5, the Vampire Lord 0.4, the
Cinderborn and the Blood Knight 0.25), the fire-born the fire (Cinderborn
0.9, gargoyle 0.5, wraith 0.4, Blood Knight 0.25) — my values from the
roster's lore, to tune in the data. Last Rites rolls every living foe
(`rollImmune`; the stacks land first so the smoke's line shows them, then
"The smoke passes X by — Immune!" per foe that shrugged); Fireball rolls
its target before the blow (`combat.js playerAttack`: no damage, no
lifesteal, the charge spent all the same) and every foe the fire reaches
(`sweep`). The event is `immune` (`target`, `element`): IMMUNE floats
over the card, which pales, a swoosh, a grey italic line (`classFx.js
immune`). A chance of 0 spends no roll, so the other five classes
simulate byte-identically. **The two classes re-tuned for it** (4
campaigns x 40 runs, median / late / room-16 boss): the Wizard fell 17.5
/ 23.4 / 83% → 16.3 / 22.9 / 83% and the fireball's factor went 0.9 →
1.0 (16.8 / 22.4 / 81%); the Plague Sister fell 17.0 / 23.0 / 89% → 15.5
/ 20.7 / 78% and her damage went 0.85 → 1.0, the censer's swing 0.45 →
0.55, the blight 0.3 → 0.4 a stack (16.0 / 22.9 / 77%: beside the Druid
and the Hexhunter, the room-16 boss her hard fight now — a first table
with seven of twelve foes resisting put her at 14.5). `node
tools/simulate.mjs --hero <id>` plays a class; the second tuning round
(4 campaigns x 40 runs, the knight at median 15.8 / room-24 boss 6%):
Barbarian 18.3 / 9%, Plague Sister 18.3 / 20%, Druid 16.5 / 5%, Wizard
16.0 / 0% (the developer's call: less glass, less cannon — HP 0.9, armor
0.7, damage 1.05, the fireball 0.9; rooms in under 3 turns, bosses
still hurt), Necromancer 16.0 / 5%, Hexhunter 15.3 / 0% — then (the developer's call) the Hexhunter made
to reach room 24 (the hex adds `markCrit` 0.3 crit damage on the hexed
foe, the heavy at 0.8: 16.5 / 6%) and the Wizard made to fare better
against bosses (`chargeOnKill`: a kill gives a charge back, up to
`charges`, now 3; damage 1.1; Quicken at a shrine gives a charge class a
charge instead of a shorter cooldown, `shrine.js`: 16.5, the room-16 boss
78% from 68%). No difficulty label on the cards (the developer's call:
the variance stays quiet).

#### The combat UI's minimum (0.00267, shipped with it so the classes can be played; the mock-ups in the chat are the design to grow into)

The heavy button carries the class's name (above)
and, for a charge class, its charges as pips (◆◆◇) in place of the
cooldown (`battleRoom.js update` hands `charges` to the unit); a foe's
card tags HEXED / BLIGHT ×n / ROOTED n above its HP line (`.foe-tag`, the
hexed card rimmed violet; `hexed` / `blight` / `entangled` in its
snapshot);

#### The status in the figure (0.00272, the developer's ask)

A
blighted foe's portrait turns sickly (a static sepia + green hue-rotate,
drained) and a rooted one earth-brown (`.char-card.blighted` /
`.rooted`, the two together darker), and either slows its idle loop
(`.slowed`: each family's duration at 1.5x) — never an animated filter;
the hit flash reads the portrait's filter as its base, so the unit drops
that cache (`baseFilter`) when the status changes; the phone keeps the
slowed loop and the tag, not the tint (section 16's twins set `filter:
none` — a filter on a looping figure is a per-frame software filter on
iOS); every new log line has a colour (mark, blight, entangle,
entangled, charge, thrall, thrallhit, thrallfall; `styles.css`). Not yet: a
thrall card (the log alone says it rose, took a blow, crumbled), a rage
chip. `tools/test/classes.test.mjs` is the behaviour, class by class.

#### What the class changes

The knight's card in combat and the hall's knight card draw the chosen
hero's figure (`shared/portraits.js portraitUrl('player')`; 0.00264:
the knight's standing looks too; 0.00291: his crouch as well — a look
marked `sprite: true` (`heroes.js lookIsSprite`) draws its own figure
and only keeps the wide placement, its card without `.hero-standing`;
the old photoreal `cards.json player.art` it used to draw is gone from
the game) and the card is named after the class — the name ABOVE the
card (`.hero-title`, 0.00251, the developer's layout), the gear as two
columns at the card's top (`.gear-block`: names left, LV / damage /
armor right) and a standing hero a full card tall behind them
(`.hero-standing`), the knight's crouching look as the wide sprite it was
(the class's own numbers and heavy are the gameplay block above, live
since 0.00267). The
preloader fetches the figures the screen opens on (every hero's first
look and the profile's own) first among the Descend essentials, the
other looks after them and before the rooms (`preload.js
heroLaterUrls`). `tools/layout-check.mjs` visits the screen at the five
sizes (seven cards inside the window, the title inside it and the chosen
figure clear of it, the switcher clear of the bar, Proceed on screen) and
runs the hall and the dungeon as the Necromancer, so a standing figure
on the cards is looked at; the knight's wide sprite is the easy case.

### The classes' sounds (0.00270, the developer's ask: each class its own attack and get-hit sounds)

`audio.json clips` has `atk_<id>`,
`heavy_<id>` and `hurt_<id>` per hero — since 0.00271 a rendered
recording per clip and per foe (`assets/audio/sfx/<clip>_v1.mp3`, below;
0.00270 shipped the developer's two recordings `sfx-attack.mp3` /
`sfx-hurt.mp3` pitched per class — `rate`: the Barbarian low and slow,
the Wizard and the women higher) with the class's own `variation` layers
from `audio/synth.js` on top: `swing` (a heavy swing),
`crackle` (fire: a roar bed and pops), `zap` (an arcane buzz falling),
`wail` (a grave voice with vibrato, breath under it; low, a growl),
`rake` (three claws), `chime` (an inharmonic bell), `hiss` (censer smoke
with the chain's rattle) and `grunt` (the hero struck: a buzz through two
vowel formants, its `layerRate` the class's voice — ~0.8 the Barbarian,
~1.25 the Hexhunter and the Plague Sister — the hurt recordings carry
each class's own cry too, so a struck hero may sound twice, the
recording's cry under the synth grunt: a listen decides whether the
grunt layer goes).

#### The get-hit cries are pulled (0.00287, the developer's call: the content wants more thought)

`audio.json cries`
— `hero` false plays the plain hurt for a blow on the hero instead of
`hurt_<class>`, `foe` false silences the struck foe's `ehurt_<id>` (its
`eatk_` attack stays); the clips and files stay registered, flip to true
to hear them. `combatQueue.js sfxFor(ev)`
picks them by the save's class (a class without the clip falls back to
the plain one); the class events have sounds too (`EV_SFX`: the hex a
chime, the blight a hiss, Entangle a thud and a bound foe's strain a
swoosh, a charge a zap, the thrall a wail, its blows a thud); `dataCheck`
wants the three clips per hero.

#### The recordings (0.00271)

The
developer gave the key the `sound_generation` permission, and
`tools/gen-sfx.mjs` rendered `docs/sfx-prompts.md` (a line per clip: id,
seconds, prompt) through ElevenLabs' sound generation into
`assets/audio/sfx/<clip>_v<k>.mp3` (new names, rule 7; `--redo <clip>` a
fresh take as `_v<k+1>`), measured each with ffmpeg (the loudest 50 ms)
and pointed the clip's `file` / `measuredDb` at it (the API call and
the measure are `tools/elevenlabs.mjs`'s since 0.00283, shared with
gen-vo.mjs; the audio test checks the prompt table and the registry
name the same clips) — then every
rendered clip's `measuredDb` was replaced by the browser's own reading
(`tools/audio-check.mjs`: ffmpeg's 16 kHz downsample under-read the hissy
ones, a zap or a smoke hiss, by up to 4 dB) and the `gainDb` trims set so
every clip lands at its level (a hero's blow and hurt
-12 dB like the hits, a heavy -10, a foe's own sound -14, under the
hero's). The synth layers stay as the class's colour over the
recordings.

#### The foes' sounds (0.00271, "every character")

`eatk_<id>`
/ `ehurt_<id>` per enemy (the same doc and tool): `combatSfx.js` plays
the struck foe's cry with the hero's blow and the striking foe's attack
with the hero's hurt, by the unit's id on the strike's pan and timing; a
foe without a clip is as before.

### Audio

One AudioContext (`audio/audioCore.js`, gesture-gated); every
sound goes music/effects bus → master → limiter (`audio/mixer.js`), levels
and ducking in `audio.json`.

#### Sound registry

`audio.json clips` — per
name a `file` or `synth: true` (`audio/synth.js`), `gainDb` trim
(`measuredDb` = its loudest 50 ms), `stinger`, `rate`, `jitterDb`; a new
sound is one entry. The first gesture (`audioCore.onFirstGesture`, the
mixer's resume) counts pointerup and touchend too — a touch activates at
the tap's END, pointerdown counts for a mouse only (0.00209: a phone's
first tap used to leave the context suspended). Downloads go through `audioCore.fetchBytes`'s pool
(0.00197: two at a time, a sound about to play first — the beds, every
narrator take and the clip set used to start together at the title,
against the Descend essentials; 0.00223: a file already queued is moved
to the front when it is asked to play — the title's welcome take used to
wait behind the whole score — and a MUSIC: OFF / NARRATOR: OFF player no
longer downloads the beds or the takes, turning either on warms them
then).

#### The title bed from the title screen on (0.00285, the developer's ask)

`music.js startEarly` fetches and decodes the title bed at boot (MUSIC ON
only) — on a desktop the first gesture is usually Enter the Castle, and
the download and decode after it put the music's start in the Great Hall
— and resumes the context at once: where the browser lets a page sound
before any click (Chrome's media engagement, Firefox's
`getAutoplayPolicy`) the bed plays over the title; elsewhere the first
click or key starts the decoded bed at once. The hero screen and the hall
ask for the same bed, so it plays on until the descent. Muting the music stops the bed and frees its decoded buffer (two
asks for one bed inside its decode start one loop, and a bed asked for
while MUSIC went OFF and ON is the one that plays — 0.00223); the
narrator's lines decode in the order they were asked for (a death and
the first-death line, a chest and its relic). The three on/off toggles
share `shared/prefs.js mutePref` (0.00223). A second duck under a
longer one keeps the longer release (0.00223: a short stinger under a
narrator line used to bring the music back early). Combat lines go through `ui/combatSfx.js` (panned to the
card, timed to the blow, crit/mega/overkill sweeteners). **The room
change's whoosh** (0.173, `audio.json transition`; **0.00297: one of the
developer's ten whoosh recordings** — `transition.clips`, three long swishes,
four short grainy ones, three "fly away"s in `assets/audio/sfx/whoosh_*_v1.mp3`,
in place of the one pitched-down swoosh and its `variation` entry): `sfx.js
transitionSfx()` from `main.js onTransition` picks one at random and plays
it through `sfxPeakAt(name, atMs)` so ITS measured loudest moment (`peakMs`,
every recording's is under 2 s) lands `peakAtMs` (2 s, the middle of the
crossfade) into every transition; `jitterDb` varies the level, all ten
levelled at the hits' -12 dB (0.00298; at the old swoosh's -19.3 they were
way too quiet, the developer found). **The developer's two hits
(0.00297, `assets/audio/sfx/`):** the `death` clip is the huge wooden tube
(`death_v2.mp3`), a stinger timed by `sfxPeakAt('death', DEATH_PEAK_MS)`
(`fx.js`, the flash's 900 ms build) so its hit lands as the YOU DIED dialog
flashes in; the `revive` clip is the spooky metal hit (`revive_v1.mp3`), a
stinger ducking the music like the shrine's chime, played when the Heart
gives the knight back (`combatQueue.js EV_SFX.revive`; the reliquary's
revive in `treasureUI.js` too). A developer's SFX batch lands as WAVs at
the repo root (GitHub's upload): convert each to a 128 kbps MP3 under a new
name, measure its loudest 50 ms and where it sits (the measure is the
`measureDb` one in `tools/elevenlabs.mjs`; a peak's time is the window's
centre), register it, `git rm` the WAVs (they stay in history). The coin
jingle (`loot`) plays an octave down since 0.00297 (`rate` 0.44-0.56; the
developer found it too high). **The descent's strike (0.00298):** the
`deeper` clip, the developer's huge tom (`deeper_v1.mp3`, the hits' -12 dB,
no duck — it plays every room), struck as the player chooses Push Deeper
(`dungeonScene.js nextRoom`, not the first room's entry) and as the hall's
Descend is pressed (`hubScene.js descend`, 0.00313: on the press itself,
before the "Descend Now?" prompt and the art's gathering — it used to wait
for both, and felt late) and on the title's Enter the Castle; the
recording's 70 ms of leading silence went in 0.00313 (`deeper_v2.mp3`, the
hit 55 ms in) and the clip is `prime: true` (`initSfx` decodes a primed
clip ahead: Enter the Castle is the first gesture, and a decode after it
put the strike late). **Reviewing the
sounds:** the SFX Lab (`labs/sfx/`, "Where things live") plays every clip
where it belongs with the bed under it and hands the edits to
`tools/render-sfx.mjs`; `sfx()` takes `plain` (no variation, no jitter)
and `sfxFrom(name, buffer, opts)` plays a buffer of the caller's through
the same path (both 0.00301, the lab's). **The first review (0.00304,
`render-sfx.mjs --apply`):** 7 approvals, 31 re-renders (every foe's cry
and attack pitched down 5-10 semitones, some slowed; the death, shrine,
rare and kill lower; the whooshes lifted another 3-7.5 dB to -4.5..-9),
9 trims. **Its notes (0.00305):** the strikes' layers `tick` / `thud` /
`slice` / `clank` and the crit's `ring` are RECORDINGS now (ElevenLabs,
their lines in `docs/sfx-prompts.md`'s third table; `gen-sfx.mjs
readPrompts` takes any clip id since) — a `variation` layer may be a
file clip (`sfx.js start`: decoded once, started at the blow's moment;
`initSfx` decodes them ahead; dataCheck allows either), their trims
keep the synths' raw levels (tick -17.1, slice -23.5; the thud -8 and
the clank -10, "stronger, with reverb") so the mix under the hits is as
it was; the ring lands at -10 with `sweeteners.crit.ringDb` 0 and
`mega.ringDb` +2 (they offset the synth's raw level before), and the
Iron Coffer's coins play the loot jingle; `heal` is a new recording (a
cork, a gulp, a shimmer — the old read as coins) and the hollow hound's
attack a gnarl. `gen-sfx.mjs nextFile` never goes below the registry's
current version (a `--redo` after a render-sfx move wrote `_v1` again).
`audio/synth.js` keeps the five old instruments unused. **The second paste (0.00306):** the lab's
sliders had kept their positions after the first apply (its state is
this browser's), so the re-export restated every edit over the
re-rendered files — only the five whose values had changed were applied
(the shrine 7 semitones further down and its speed back to 100%, the
hounds' cries, the new heal and ring takes pitched down as set); since,
`render-sfx.mjs` stamps every clip it touches with `reviewed` and the
lab drops a stored entry older than the stamp (the row says "review
applied <date>"), so the sliders start from the clip as it is now.

#### Music beds

Five beds (`audio.json music.tracks`), all ElevenLabs scores since 0.00282
(title and combat 0.00280 — "Generated scores" below), each a loop of
`loopS` with `tailS` more past it, restarted every `loopS` by
`musicLoop.js` and crossfaded over the tail (`crossfade: 'power'`); the
procedural beds before them (`python3 tools/gen-music.py --suffix vN`, an
exact loop with its own first `tailS` seconds appended, equal gain) are
in git history. Measure
for real with `node tools/audio-check.mjs`; tests use a fake AudioContext
(`tools/test/fakeAudio.mjs`, which rejects NaN like browsers).

#### Generated scores (0.00273, the music thread; every bed the game plays since 0.00282)

`docs/music-prompts.md` is a brief per bed —
a style block, a common avoid list, the bed's line, global styles and
timed sections ending where they began (the beds loop) — and
`tools/gen-score.mjs` sends it to three models: **ElevenLabs Music** by
its own API as a composition plan (`planFor`: the sections in ms, the
avoid list as negative styles; the session's ELEVENLABS_API_KEY can
compose), **Lyria 3 Pro** on Replicate (`lyriaPrompt`: the sections as
`[0:00 - 0:16]` timestamps; `--image` attaches the bed's painting as
the picture to score) and **Stable Audio 2.5** (`stablePrompt`: no
structure, it ignores it). Every take is transcoded to 192 kbps MP3 in
`assets/audio/candidates/<bed>_c<n>.mp3` (lab-only, never overwritten;
the orphan check reads files directly in `assets/audio`, not this
folder) and recorded in `assets/data/music-art.json` with its plan or
prompt, seed, length and EBU R128 loudness (ffmpeg), the shipped beds'
loudness under `current`. The bake-off (`--bakeoff`: title + combat,
two takes per model, Lyria's second on the painting) went to the
Music Lab in 0.00273; **the developer picked ElevenLabs for both**
(`title_c2`, `combat_c2`; boss / shrine / end rolled on it in 0.00280,
two takes each, and picked in 0.00282: `boss_c2`, `shrine_c2`, `end_c1`). New takes change `assets/data/music-art.json`, which the bump check
counts as loaded by players (everything under `assets/data`): ship them
with `tools/ship.mjs`, never a bare push (0.00288).

#### The boss's second brief (0.00288, the developer's note: `boss_c2` too in-your-face)

60 s,
the menace held back — no organ opening, no full-ensemble climax, the
choir distant; four takes, `boss_c3`–`c6`; the developer took
`boss_c4` "for now" (0.00289): 0:13.0 → 0:46.3, a 33 s loop (the take
opens on its pulse and fades after 0:53; a 43 s loop from 0:02 put the
seam in a quiet bar).

#### The import (0.00280, `--import <bed>_c<n>`)

`tools/music-seam.mjs` finds the loop seam — per frame
a chroma + log-band vector, a seam's score the mean likeness of the 4 s
after START against the 4 s after END, less 0.015 per dB of level
difference, plus a little per second of loop; END then nudged ±140 ms so
the onsets line up — START searched in the first 40%, END from the middle
to where the compared window would reach the piece's fade (`autoRanges`;
`--start a-b` / `--end c-d` pin them: the developer's note put combat's
start at 0:23); the file is cut from START to END + `tailS` (3 s: the
music's own continuation, not a copy of the start) at 128 kbps as
`assets/audio/music-<bed>-v<k>.mp3`, levelled to the bed it replaces
(`gainFor`: the old gainDb moved by the loudness difference), written
into `audio.json` in place (`setTrack`) with **`crossfade: 'power'`**
(`audioMath.fadeCurve(n, out, power)`, `musicLoop.js`: two different
passages sum by power — equal gain dipped up to 3 dB mid-seam; the
procedural beds keep equal gain, their tail IS their start), the old
file removed, the take marked `imported`. Title: 0:25.7 → 1:49.9 (an
84 s loop, the start pinned to the first 30 s; unpinned it found a
closer but 64 s loop); combat: 0:23.2 → 1:24.5 (61 s; the take falls
away after 1:26); 0.00282, each from the developer's note: boss 0:28.2 →
1:08.2 (40 s, `--min-loop` — the take has ~55 s between its organ opening
and its fade; a 47 s loop to 1:14 matched less well), shrine 0:02.4 →
0:38.8 (36 s, "the first about 37 secs", through the phrase's breath at
0:36), end 0:39.0 → 1:17.9 (39 s, "0:37 to the end", the end pinned to
the last steady stretch before the fade). `tools/audio-check.mjs` judges
a generated bed by its seam's level: the quietest 0.5 s inside the
crossfade as rendered, against the quietest 0.5 s of the same span in
either passage alone (the take carrying on past the loop point, or its
start) — a seam you hear is quieter than both; flagged under -3 dB
(0.00289: it was the quieter of the seconds either side, which the boss
take's drum gaps and sparser start fooled). As of 0.00289: title +0.5,
combat +9.6, boss +3.7, shrine +3.7, end +4.7.

#### ElevenLabs limits

Two requests at a time per
subscription (`DEFAULTS.elevenConcurrency`; a 429 — busy or over the
limit — waits and retries), and the API key carries its own credit cap
(ElevenLabs → Developers → API Keys; ~12.5 credits a second of music:
a 90 s bed ~1,125) — the developer raised it in 0.00280.

#### Voice-over (0.161, `audio/narrator.js`)

The voice-over: the Old Wizard, a chronicler
who never shouts — the script is `docs/narration-script.md` (33 lines,
four takes each; OVERKILL nine since 0.188, a plain crit five and the mega
crit eight since 0.00278 (re-recorded steadier in 0.00279)), rendered with ElevenLabs by `tools/gen-vo.mjs` (voice
"Old Wizard", `eleven_multilingual_v2`; the tool strips stage directions,
sends "!" as "." and drops a leading "…", never overwrites a take — delete
the file to re-render it, `--stability/--style/--speed` for a steadier
one) into `assets/audio/vo/vo_<id>_<take>.mp3` and listed in
`assets/data/narration.json` (generated: file, text, `measuredDb` = the
loudest 50 ms). **When** a line plays is `audio.json narration.lines`
(`chance` per event, `firstInRoom`, `oncePerRoom` / `oncePerRun` /
`oncePerSession`, `cooldownMs`); the scenes only call `narrate('overkill')`,
the dungeon marks rooms and runs (`narratorRoom()` / `narratorRun()`), and
`combatQueue.js voFor()` maps combat events (OVERKILL, a multi-kill = the
script's SMASH, mega crit, a plain crit (12% with a 20 s cooldown — Precision
makes them common), revive, summon, room cleared, low HP) to items'
`vo`, said as the line prints (+ `combatDelayMs`). A room's threshold says
one line at most (boss / shrine / treasure, else descent, `stretch_N`,
new record, elite; `roomEntryDelayMs` so it lands with the painting). One
line at a time: a second waits (`gapS`) or is dropped past `maxWaitS` —
a dropped line spends no once-per rule (0.00223); every take levelled to
`targetDb` through the effects bus, the music ducking under it (SOUND:
OFF, or its slider at 0, skips a line entirely: no take, no duck); no
take twice in a row; NARRATOR: ON/OFF in the corner column — OFF stops
the line playing and drops the ones waiting (0.00223). Once-per-save lines (victory, first death) are gated by their
callers. New line: the script table, `node tools/gen-vo.mjs`, a rule in
audio.json, a `narrate()` call — the suite checks the three agree.

#### Reviewing takes (0.163)

Reviewing takes: the VO Lab (`labs/vo/`) plays each take as the
game levels it; the developer approves or disapproves (volatility less/more =
stability, shouty less/more = style and speed; `gen-vo.mjs NUDGE`), and
RE-RENDER downloads `vo-rerender.json` (also to the clipboard). Then
`node tools/gen-vo.mjs --rerender vo-rerender.json` marks the approvals in
narration.json (`approved`), re-renders the disapproved takes nudged from
the settings they were rendered at (`settings`, recorded per take; a redo
gets a fresh seed), measures them, bumps and ships as usual — the developer
can paste the JSON into the chat for that. A re-rendered take comes back
unapproved. Edge caches: a re-rendered take keeps its filename, but
`--rerender` stamps it (`rendered` in narration.json) and `narrator.js
urlOf` fetches it as `<file>?r=<stamp>`, so no cache serves the old take
(rule 7 holds by the query, not the name). A take re-rendered by
deleting its file and running plain `gen-vo.mjs` gets no stamp and may
be served stale for ~4 hours.

### UI conventions

- Every dialog: `ui/dialog.js openDialog({ label, children, onKey, closeKeys, proceed })`
  (`closeKeys`, 0.00299: the letters that close it, Escape and Enter
  implied — the changelist, the benchmark's results, the victory modal,
  the LOOT pop-up)
  — it owns the keyboard (key-trap stack) and is tracked (`anyDialogOpen`,
  `closeAllDialogs`). Dialogs live above the scenes, so a scene switch does
  not close them; the YOU DIED dialog is one too (0.157: it used to sit in
  `#app` without a key trap, and a reliquary death left Push Deeper live
  under it). Yes/no: `ui/confirmPrompt.js` (the title's Start a New Game
  included). Never the browser's `confirm()`.
- Keyboard-reachable buttons get `key: 'x'` in `el()` (a second key: a
  `data-key-alt` attribute, served after every button's own — 0.00286: H on
  every class's special, whose own key is a letter of its name, `heroes.json
  heavyKey`); a screen's way
  forward also gets `proceed: true` (Space clicks it, a tiny `[space]` sits
  under its label; in a dialog pass it as `openDialog({ proceed })`).
  Yes/no prompts and text fields don't get one. A held Space steps once.
- The obvious next button gets `class: 'active'` (pulsing yellow) or
  `'active active-red'`. The Great Hall's Descend pulses while nothing
  there can be bought (a new player's first visit: three panels of
  upgrades and nothing to spend; 0.00200). **The Forge never stops a
  descent (0.00285, the developer's call: its use is very optional):**
  the "Descend Now?" prompt counts XP (`canSpendXp`) and Alchemy
  (`canSpendAlchemy`) only, and Descend pulses when only a Forge level is
  affordable; the green Coins box and the phone's Equipment dot still
  point at the Forge (`canSpendCoins` / `canForgeAny`). Buy Potion pulses whenever a
  potion can be bought (0.00216; it used to wait for the stock to run low).
  **A purchase's feedback (0.00216):** every hub row carries `data-row`;
  a handler calls `flashNext(row)` and then its own `render(root)`, and
  `settleFlash(root)`, run at the end of both assemblies, finds the row
  by `data-row` and glows, grows and flashes its label at its new level
  (`fx.js pulseNumber`, one `element.animate`, 0.8 s). The three
  sections' rows (Train, Alchemy, Equipment) are built in
  `ui/hubSections.js` (0.00223; each row's text is `rowText`: a title —
  name + level or count — over a small muted line, one line on a phone,
  0.00232); `hubScene.js` keeps the hall's table,
  **the desktop / tablet hall (0.00238, the developer's layout; the phone keeps
  its sheets until its own pass):** the name and the records up top, then
  the knight (`hubSections.js knightSection`: his card with the gear
  around it — three slots left, four right, as tall as the card, the
  Forge in each slot's outer top corner — and Attack / HP / Armor / Crit /
  Lifesteal / Potions under it), TRAIN and ALCHEMY as three panels of one
  height (`.hall-desk`), each purse in its section's head (`secHead`);
  1001-1400px wide the panels `zoom` down in three steps (an iPad gets the
  same hall smaller), under 1000px one scrolling column; on a large window
  the title, panels and buttons `zoom` UP in five steps, 1.15 at 1700x1000
  to 2.2 at 3400x1900 (0.00281: the 1400px panels sat small on a 2560px
  Mac mini screen; each step needs the height too);
  **a run's finds revealed (0.00249, the owner's ask):** `equipItems`
  records `changes` (each slot the finds filled: from → to), the run's end
  hands them to the hall (`go('hub', { fromRun, finds })`), and the hall
  opens with the OLD items there (`shownProfile`; no Forge on them), then
  each find takes its slot in turn — a gold flare, its name flashing, the
  numbers it moves rolling up — and keeps a NEW tag for the visit;
  the stat boxes a purchase moved rolling up with the glow (`settleStats`,
  0.00235: Attack after Power or a forge, Coins / XP never),
  the two assemblies, Descend and the flash. A new player is asked their
  name on Enter the Castle, not over the title (0.00200). Its glow is a `::after` layer whose opacity
  animates (0.00197): never animate `box-shadow` or `filter` in a loop —
  that repaints every frame for as long as it is on screen; loops animate
  opacity / transform (the idle loops' translate / rotate / scale).
- Hotkeys (`core/hotkeys.js`): a dialog's key trap takes every key but
  F-keys and Tab (0.00197: a dialog used to swallow F5 and F12), and it
  is served before the transition guard, so a dialog opened mid-transition
  hears the keyboard (0.00223); the scene-change listener (the update
  prompt) fires once the windows are back.
- A scene whose `enter()` throws shows a "Something went wrong" panel with
  a Reload button Space presses (0.00223; the home-screen app has no
  reload control of its own) instead of an empty, un-hidden `#app`.
- Loops animate opacity or a transform, nowhere else in the stylesheet
  either (0.00223): the rarity lines, the low-HP chip, the record tag, the
  summon bar, the death and victory titles all breathe on opacity over a
  static glow; a smoke check parses every infinite `@keyframes`. The
  panel rooms' HP number and bar turn red at `lowHpShare` like the chip.
- Upper-right corner (`ui/cornerToggles.js`; a SETTINGS menu since
  0.00243, the developer's call): the top row is FULLSCREEN (an icon, not on a
  phone) and ☰ SETTINGS (☰ alone on a phone); the menu drops down under it
  in groups — AUDIO (MUSIC, SOUND, NARRATOR, VOLUME), DISPLAY (BATTERY
  SAVER), GAME (EXPORT SAVE, IMPORT SAVE — 0.00302, the developer's call:
  they were buttons at the title's foot; `ui/saveTransfer.js`, a loaded
  save returns to the title — and CHANGELIST) — and DEBUG MODE last. Add items in main.js's
  `cornerBar([...], lead)` with `menuHead` / `onOffToggle` / `panelToggle`.
  A click outside the open menu closes it and is swallowed, except inside
  a dialog an item opened (0.00255: BENCHMARK's Start was eaten).
  BENCHMARK mid-run (0.00256) settles the run as a retreat first (the
  dungeon scene's `leaveRun(next)`), then runs and returns to the hall.
  **DEBUG MODE** (`ui/debugToggles.js debugMenu`): ON shows the testing
  tools under it (INVULNERABLE, background views and tuning, FORCE CRITS,
  SWITCH CLASS (0.00269, the developer's ask: each click moves the save to
  the next class, first look, kit as worn, and re-renders the screen — the
  hall and CHOOSE YOUR HERO through `relayout()`, a run through the dungeon
  scene's `switchClass()`: the run's stats rebuilt for the class, this run's
  shrine boons dropped (0.00299: `run.buffs` and `run.coinMult` reset with
  the stats — the bar and the run record used to keep them, Greed
  survived), health kept as a share of the new maximum, the
  fight's charges / hex / thrall / the roots (entangled) reset, the battle line
  rebuilt in place and dealt in, a DEBUG line in the log; `debugToggles.js
  switchClassButton`), LABS (the menu page), BENCHMARK; each `.dbg`, hidden until the corner
  carries `.debug-on`); remembered in this browser (`castle-debug-mode`),
  so testers need no `?debug` — `?debug` still turns it on for the visit,
  and only `?debug` in the address lets software GL draw the 3D background
  (the headless checks). OFF clears every testing switch. No pixel offsets.
- A scene that is mid-run sets `inRun: true` (the update prompt waits).
- Transitions go strictly in order (0.154, the developer's call):
  `transitionTo` fades the windows out fully, runs the swap, and when it
  changed the background waits for `setBackground`'s promise (the painting
  fully faded in: bg3d's `fadeMs`, or the CSS layer's own fade, after the
  image loads; 4s at most) before the windows return.
- Combat layout (styles.css) is fluid (vh/vw) on purpose — no fixed px
  there (the phone layer's tap-sized strips are the designed exception);
  panel scenes stay in px. Card size is `--card-h` (min of 50vh and
  what fits `--n` enemies); card internals are `em`. Card frame art on
  the card's `.card-frame` layer (opacity 0.85; 0.195: a real element,
  the shader light inside it); portraits overflow the frame;
  per-enemy tweaks via `enemy-<id>` classes.
- **Handhelds (0.00205 tablets, 0.00208 phones; `shared/platform.js`):**
  a touch handheld by user agent (iPadOS calls itself a Macintosh — the
  stats page said macOS; `perfMonitor.js osOf` reads iPadOS / iOS /
  Android), phone or tablet by the screen's longer side against
  `TABLET_MIN_PX` (1000). Both play sideways: a `.rotate-notice` covers
  the game in portrait (`pointer: coarse` + `orientation: portrait`);
  touch gets `touch-action: manipulation` (rapid Attack taps are double
  taps), no image callout, 44px tap targets, no hotkey hints, hover
  styles only under `(hover: hover)`; the layout honours the notch
  (`env(safe-area-inset-*)`, `viewport-fit=cover`) and Safari's toolbars
  (`--card-h` in `svh`); the hub's three columns fit 1024 wide and keep
  clear of the corner column under 1400. `manifest.webmanifest` + the
  Apple metas make a home-screen app (fullscreen, landscape — iPhone
  Safari has no page fullscreen and ignores the orientation; the
  FULLSCREEN toggle also speaks Safari's prefixed API). **A desktop's Enter the Castle
  takes full screen** (0.00296, the developer's ask: `titleScene.js
  enterFull`, the click being the browser's gesture; not on a handheld —
  the phone's PLAY gate does it there; denied, the game plays windowed;
  Esc and the corner's icon leave it). `?desktop` skips
  the device check (testers, the headless checks).
  **The phone layer (0.00208; rule 8 says how it is kept):** `styles.css`
  section 16 says what it does, screen by screen (combat as one line of
  72svh cards with the knight's buttons under his card and a one-line
  log; the Great Hall as three stacked sheets under their tabs, 45% wide,
  the picked one lifted, a green dot per sheet by what IT sells —
  `canSpendXp` / `canSpendAlchemy` / `canForgeAny`; the corner column
  folded behind ☰; the panel rooms and dialogs compacted, a text field's
  dialog at the top for the keyboard; `--n` / `--slots` on `#app` too, so
  the log strip and the boons' bar read the cards' real height).
  `ui/phoneGate.js` is the PLAY / INSTALL card before the title (a
  dialog; its tap is the audio gesture and the narrator's welcome; Android
  goes fullscreen and locks landscape, iPhone gets the Share → Add to Home
  Screen line (0.00216: no "aA, then Hide Toolbar" — that menu is Safari's
  own; the developer tests in Brave); a home-screen app skips it; leaving fullscreen on Android
  brings it back). iOS: the home-screen app has its OWN storage — a save
  made in Safari is not there (the title's save code carries it; Export /
  Import are dialogs since 0.00209). Hover-only text (a boon's full line,
  the elite star) has no touch path yet (backlog).
- Asset loading (`shared/preload.js`): boot waits for the title + Great
  Hall art only; the hub's Descend waits only for the essentials (shrine /
  death art, portraits); the 49 room, throne and treasure paintings
  (~18MB; `preload.js roomUrls`, the entrance corridors first) keep
  loading behind — a room whose painting isn't in yet keeps the last one up
  (0.00222: into the HTTP cache only, `fetchOnly` — the renderer decodes a
  painting itself as the room is entered; decoding 34 of them here warmed
  nothing it could reuse). The display font ships as WOFF2 only
  (`assets/fonts/D-DINCondensed-Bold.woff2`, ~22KB; the labs load the
  same file — no TTF since the D-DIN swap, 0.00226).
- **Only fights are numbered (0.171, the developer's call):** `run.roomNumber`
  counts fights (the boss's included), so room 8 is always the throne room.
  The shrine and the treasure room are interludes met on the way to a
  numbered room (`runState.enterNextRoom`, `roomGen.generateInterlude`):
  `number: null`, `depth` = the room they lead to (prices and loot),
  titled by name alone ("An Ominous Shrine", "The Frozen Tribute"), no
  record tag. A stretch is now eight fights, not seven + the shrine (the
  sim: ~20% more coins per run, bosses a little easier — 0.171's notes).
  Room 1 is always a corridor from `backgrounds.json entrance`, and the
  room before each boss (7, 15, 23) always an antechamber from
  `antechambers`, which appear nowhere else (both lists are fight
  paintings, also in `rooms`; the entrance ones load first behind the
  title; four antechambers — The Antechamber, The Royal Bedchamber, The
  Hall of Mirrors, The Iron Gate — so no run repeats one). Saves made
  before 0.171 count shrines in `bestRoom` (one or two rooms high; left
  as is).
- Treasure rooms (0.155, `run/treasure.js` + `ui/treasureUI.js`, tuning
  `difficulty.json treasure`): a run gets one with `chance` (30%) once the
  save's best room reaches `unlockRoom` (5; silent), on the way to a room in
  reach (`minRoom`..best room, not a boss room; the stretch's shrine steps
  aside);
  painted from `backgrounds.json treasure` (7: the six `treasure_*` and,
  since 0.182, The Treasury — none of them ever a fight room). Three
  chests, open one: Iron
  Coffer (coins worth `coffer.fights` fights at that depth), Gilded Chest
  (one item of the depth's tier, made for a slot it improves, else
  salvaged), Sealed Reliquary (`hpCost` 20% of max HP as damage — it can
  kill, `killedBy: 'reliquary'`; inside, a relic with `relicChance` from
  t4MinRoom, one per run, else a tier-3 item). Shares the shrine's panel
  (`shrineUI.js renderPanelRoom`); the sim's bot opens the gilded chest.
- Painted icons (0.177, the developer's art): every shrine boon (`shrines.json
  offers[].img`) and treasure chest (`treasureUI.js LOOK`) shows a picture
  from `assets/icons/` (192px WebP with alpha, `buffs.js iconArt`; the
  glyph in `icon` is its alt text), on the cards and in the buff bar;
  preloaded with the Descend essentials. New boon = new picture, the
  suite checks every one is on disk.
- **BATTERY SAVER** and the other corner toggles are `onOffToggle`s in
  `main.js cornerBar` (0.00222: the saver remembers its state in
  `shared/prefs.js`, key `castle-power-saver`).
- The boss's card is twice as wide (0.196, the developer's call): `.boss-card`
  aspect 826 / 1106, its frame a 9-slice of `card_enemy.png` (border-image,
  so corners and border keep their shape); `battleRoom.js BOSS_SLOTS`
  counts it as two enemy widths in the row's `--slots` (the `--card-h`
  budget), so the boss and its three summons (`maxAlive`) still fit
  without shrinking at 16:9. New boss art should suit a wide card.
- The knight's card turns over on a click (0.00256 / 0.00258, the
  developer's call): front → STATS → INVENTORY → front (`battleLine.js
  cardBack`, the card's `.flipped` / `.page-inv`, three page dots). STATS
  is the run's totals only (health, attack, armor, crit chance / damage,
  lifesteal, the heavy blow, potions, a potion's heal); INVENTORY the gear
  worn per `GEAR_SLOTS` as strips like the hall's slots (0.00290, the
  developer's layout: the item's picture on the right fading under its
  name, forge level and stats on the left, the rarity's rim; an empty slot
  dashed) — the run's finds are no longer listed there — the LOOT pop-up lists
  them (0.00292; `I`, or the FINDS line at the page's foot since 0.00299). The shown page refreshes on the update tick; the
  turn is two `rotateY` halves with the face swapped edge-on (`flipCard`,
  `composite: 'add'` like the kick; instant under reduced motion). A
  still gold ⓘ under the gear names says the card turns; the phone's
  twins compact the pages.
- Enemy cards (0.155) attack on a click, exactly as their Attack button
  would and only while it could (`.targetable`). **A foe's stats card
  (0.00295, the developer's call):** a tap on its NAME (dotted, an ⓘ after
  it — a long name wraps it to a second line, accepted) turns the card over
  (`battleLine.js foeBack`, `flipCard`, `.enemy-char.flipped .foe-back`):
  the name, LV and Boss / Elite, health (kept current by the tick), attack,
  its special (the boss's summons, an elite's relic, a summon's no reward),
  its immunities as chips (`enemies.json immune`) and a line of lore
  (`enemies.json lore`, dataCheck wants one per enemy) — no armor (foes have
  none); a tap on the back turns it face up, the card's click does not
  attack while turned, and a fallen foe collapses face up. No tooltips on the cards (0.00300, the developer's call: the hero card's, the name's, the elite star's, the summon bar's, the LOOT row's went — the stats card says it); the ⓘ glows while the name or the ⓘ is hovered (a mouse only). A fallen enemy's figure
  collapses and its whole card leaves the row (0.00216, the developer's call —
  the faint skull cards went; summons did this since 0.092): `battleLine.js
  vanish` → `onGone` → `battleRoom.js fit()` recounts `--n`, so the cards
  left grow into the room (`.char-card` eases its height). Combat ends
  with an empty row. **The death is a step of its own (0.00220, the
  developer's call — the restack used to land in the middle of the enemies'
  turn):** after the death line's sink tick the playback waits for the
  card to leave (`battleRoom.js whenGone(i)` through the scene's
  `onDeath` hook), lets the row close up for `combatPacing.restackMs`,
  and only then prints the loot and the enemy phase; `deathMaxMs` caps
  the wait (a hidden tab pauses animations), `reset()` drops it. **Only
  while a card is off screen (the developer's call, after the heavy blow
  had slowed to a pause per victim):** `battleRoom.js deathStep` hands
  the playback the card's leaving only when an enemy card sits partly
  off the screen (`restackDue`, the cards' rects against the window);
  a row that fits — every desktop, tablet and phone row measured, 3-6
  enemies — keeps the old quick pace, the row closing up behind it. A
  multi-kill does this per victim, in order; an OVERKILL's victims fall
  together as the replay ends (their kills are silent).
- Room art (0.153): 26 rooms from the developer's batch (`dungeon_*` /
  `treasure_*`, names in `backgrounds.json roomNames`) join the 8 castle
  rooms in the random pick. Source PNGs → 2048x1152 JPEG q86 (~370KB);
  `treasure_frozen_tribute` had an image-generator sparkle in its corner and
  was cropped 7% to lose it — check new batches' corners the same way.
- Room art 2 (0.156): 7 `corridor_*` rooms join the fights (35 paintings);
  the bosses fight in a throne room drawn from `backgrounds.json bosses`
  (4: the old throne room + 3 `throne_*`). No painting twice in a run
  (`run.seenBackgrounds`, `roomGen.js pickFresh`; a pool shown out starts
  over). Throne rooms stream with the rooms (not a Descend essential).
- Shared helpers: `shared/version.js` (never compare build numbers as
  strings), `shared/level.js`, `shared/prefs.js` (per-browser settings).

### Play stats and performance

Every finished run appends a record to
`profile.history` (`meta/history.js`, newest 250), including its frame-rate
summary (`core/perfMonitor.js`: fps, slowest 5% frame ms, refresh rate,
dropped frames, worst frame and whether it fell in a room change
(`worstOut`), stalls of 100 ms or more, background mode and the power
mode — recorded from dungeon entry to the run's end). **The refresh rate
(0.00222):** the busiest frame interval snapped to a standard rate
(`shared/refreshRates.js`), a faster rate when `perf.paceShare` of the
frames sit on its pace, and the average corrects it when it beats the
display (`perf.nearShare`; `telemetry.json perf` holds the judgments,
the definition stays in src — rule 2). The fastest 10% of frames used to
decide, and jittered timestamps put them a refresh short: the developer's
120 Hz Macs read 144 Hz (119.8 fps graded amber), the 60 Hz iPhones 90
and 75 with 56-61% "dropped" at 59 fps. Records before `perf.hzSince`
carry the old reading: the dashboard grades such a row by its fps (full
rate when it sits at a standard rate) and hides its dropped share; a
player's medians use the trusted runs once there is one. The Performance
card shows Stalls, the median run's worst frame and the worst run's with
its moment (a room change or in play). `meta/telemetry.js` POSTs the save's stats (anonymous
`playerId`, the typed `profile.name`, plus the device: GPU, browser, OS,
cores — never stored in the save) after every run and once per session to
the collector (endpoint in `telemetry.json`; off when empty, never from
localhost). The collector (`collector/worker.js`, Cloudflare KV) keeps only
the dashboard's fields, typed and capped, merges history by timestamp and
rate-limits; reads need the Bearer `READ_KEY`. Collector 0.00222 keeps
`stalls`, `worstOut` and `power` — the developer pastes the Worker; until
then the old one drops the three fields (the saves keep them). The dashboard shows the
collected players and this browser's save (every record untrusted:
`sanitizeProfile()`; pasting save codes went in 0.00224 — every tester is
collected), deduped by playerId; its By build table shows the newest ten
builds and the three most played older ones (`stats.js condenseBuilds`);
the developer can give each player a
**tester name** (kept in that browser, shown as "tester · player name").

#### The device report (0.00225, `meta/perfReport.js`)

What a later speed
optimization needs that the run summary does not say, sent with the
stats after every run and benchmark (one per upload, `telemetry.js
statsPayload`; never in the save): per phase the frame summary, the
frame-time histogram (`perfMonitor.js histogramOf`, 22 buckets), the main
thread's time per subsystem (`core/perfSpans.js span()` wraps the
renderer's draw, the card light, the particles' frame and a printed
line's work — `bg`, `cards`, `particles`, `playback`, per call), every
stall of 100 ms or more with what was happening (`markActivity`: the
last effect played, else play, or a room change) and the browser's long
tasks; plus the device (DPR, viewport, touch, the home-screen app,
reduced motion), the renderer's state (`bg3d.js rendererState`: quality
step, fog, backing store, mist divisor, the caps in force, the rAF rate,
WebGL facts), the card light's and the particles' knobs
(`cardFxState` / `particleState`) and the last `telemetry.json
report.runs` runs' summaries (`report.stalls` stalls kept). The
collector keeps the newest three per player, bounded rather than typed
(`cleanReport`: strings cut, lists and depth capped, 24 KB at most); the
dashboard's Device reports card shows each with a Copy button and a Copy
all — the JSON goes to the clipboard (or into a box to copy by hand) for
pasting into the chat. Raising it: `REPORT_VERSION`.

#### BENCHMARK

BENCHMARK (`ui/benchmark.js` + `ui/scenes/benchmarkScene.js`): a seeded, fixed ~36 s
fight (idle / combat / overkill) on the real combat pieces, the background's
quality ladder held; result → `profile.bench` (newest 10, never the run
history) → the dashboard's Benchmarks card. **The ask** (`telemetry.json
benchmarkPrompt`; off 0.00201–0.00218, on again since 0.00219 for the
phone testers; the `?debug` button runs it either way): every player is
asked once, entering the Great Hall with best room ≥ `benchmarkPromptRoom`
(6) and no result from this round yet (Continue only; it waits for the
hall's windows — never mid-transition — and while another dialog is up,
never interrupts a descent, and asks only where stats are sent:
`telemetryEnabled`, an endpoint and not localhost; the `?debug` button
returns to the scene it was pressed on — 0.00223). On a phone the
benchmark budgets its cards like the dungeon (`fit()` on `#app`). The
dashboard's Benchmarks card (0.00221, `analytics/perf.js benchTable`)
reads the same knob: each result shows its build in a Build column, and
a result from before `benchmarkSince` is marked there and its row muted,
so an old round never reads as the current one. **A round** is
`benchmarkSince` (0.00219): a result from an older build does not count,
so raising it to the build being shipped asks everyone again — do that
when the script (`PHASES`) or what it draws changes (the card effects in
0.183, the fallen cards leaving in 0.00216, the phone profile and the
phases at rest in 0.00222, the device report in 0.00225): the numbers
mean something else then; say so in the changelist. **Each phase's clock starts at rest (0.00222):** the
painting faded in, the windows back, the push settled, the deal played
(`benchmarkScene.js nextPhase`; "settling…" in the title meanwhile) —
Idle used to record the room change itself, the renderer's heaviest
moment on a phone; `benchmarkSeconds()` adds the settles (about 50 s). **Phones (0.00219):** the scene
holds a screen wake lock for the hands-off 40 s (where the browser has
the API), and a benchmark that went to the background partway (the
lock, a call, the home button — no frames are drawn there) is not saved:
"Benchmark interrupted", and the hall asks again. Reading results: a
30 Hz rate means the browser capped the page (macOS Low Power Mode, iOS
Low Power Mode, Chrome / Brave Energy Saver), not a slow machine; every
iPhone reports its GPU as "Apple GPU" (Android names the real one), so
the tester name, the screen size and the DPR tell the phones apart; a
phone that stepped down the quality ladder during the run before the
hall benchmarks at that step (`q` on the result, shown on the dashboard).

## Testing notes

- `tools/smoke-test.mjs` runs `tools/test/*.test.mjs` (17 files, by area:
  scenes, combat, shrines, progression, content, backgrounds, audio, sim,
  history, narration, art, cards, classes, fx, heroes, items, layout — the
  order is `smoke-test.mjs ORDER` (0.00299: the last four used to sort after
  layout by accident); layout last checks the phone layer's `html.phone` twins against the code and
  the desktop rules, rule 8; ~1200 checks),
  each starting from `fresh()`; a test file imports only the harness
  names it uses (0.00197). CI (`check-bump.mjs`) fails a push to `main`
  that changes what players load without a higher build number. `tools/test/harness.mjs` holds the DOM shim
  and a **virtual clock** (timers, rAF, Date.now, performance.now; `sleep(ms)`
  advances it) — write tests with `sleep()` as if time were real; even a
  whole benchmark runs in milliseconds.
- The shim has deliberate limits: no `appendChild` / `querySelector` on
  elements, `match()` supports hardcoded selectors only, `children` is
  read-only, and `classList` doesn't update `className` (check
  `classList.contains`). Click = `el.listeners.click[0]()` or `handleKey()`.
  Dialogs mount on `document.body` (an `El`; `document.querySelector` looks
  in `#app`, then there); `fresh()` closes any left open.
- The check count can vary by one (an assertion that runs only when a
  fixture run dies). A flake gets one rerun; a repeat is real — and a
  random-dependent check should be seeded (0.136).
- Balance-sensitive tests use constructed fixtures; per-level stat changes
  need them retuned. Refactors of combat or rooms: compare `simulate.mjs`,
  `--seeds 1-4` and `shrine-study.mjs` output before and after (all three
  tools start a campaign through `simCore.fresh(hero)`, the class on and
  its kit fitted — until 0.00299 the two studies played a classless knight
  who could wear anything, so every shrine-study row before it is on
  another footing)
  (byte-identical — the order of `Math.random()` calls is part of it: a
  room rolls its enemies before its painting).
- Browser checks: Playwright with Chromium at `/opt/pw-browsers/chromium`
  (`--use-gl=angle --use-angle=swiftshader` for WebGL; it's slow, so judge
  relative numbers only). Use a fresh context; disable CSS transitions for
  stills if a fade gets in the way. `tools/layout-check.mjs` and
  `tools/audio-check.mjs` both read `PLAYWRIGHT_PATH` and `CHROMIUM`,
  defaulting to the cloud container's /opt paths.
- The harness (0.00223) has `withSeedAsync(seed, fn)` — the scene fights
  are seeded; re-pick a seed when the room build or the combat path gains
  a `Math.random()` call — and `withAnimations(fn)`, an opt-in Web
  Animations recorder (`el.animations`; the kick, the deal and the glint
  sweep are asserted through it; keep it off for the instant collapse /
  vanish checks). Test files may not assume a module singleton (the
  mixer, scene.js's active layer) is untouched by an earlier file: read
  the state relative to what is there. **`fresh()` restores `DATA`
  (0.00283):** every block is put back to the loaded JSON, in place, so a
  test may patch a price or a pacing knob and leave it (before, a patch
  stayed for every file after it). The harness also finds things on the
  screen by class list, not by exact `className` — `byClass(root, cls)`,
  `firstByClass`, `buttons(root, label)` / `button` (a button whose text
  starts with the label: the hotkey hint and the pips follow it) and
  `click(el)` (its click listeners, as the game fires them); a row
  carrying two classes (`back-row st-hp`) used to be missed. The `check-bump` check runs on a
  throwaway git repository of its own (the live repo's answer depends on
  where in a ship it runs), and an orphan-asset check guards the folders
  players download.
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

## Art batches from the developer (the workflow, 0.153 / 0.156)

The developer uploads PNGs through GitHub's web upload (to `main` or the
working branch, usually the repo root). Per batch: review a contact sheet
and the bottom-right corners (image-generator watermarks: crop them out,
see 0.153), convert to 2048x1152 JPEG q86 in `assets/bg/` (new names, never
replace), `python3 tools/gen-depth.py <model.onnx> <file>.jpg` for each (the
model URL is in the script's header; download it to /tmp in a new session),
name them in `backgrounds.json roomNames` ("The …", unique), add them to
the right list (`rooms` / `bosses` / `treasure`; a corridor or an
antechamber also goes in `entrance` / `antechambers`), `git rm` the PNGs, check a
few in the game, bump, ship. The upload lands outside the working branch
sometimes — fetch all branches to find it.

## Starting a new session (repo and branches)

- Repo: **https://github.com/pjarvilehto/CastleoftheCrimsonMoon** (`main` =
  the live site; everything shipped is there).
- Start from the latest `main`: `git fetch origin main` and branch from
  `origin/main`. `tools/ship.mjs` pushes every build to `main` AND to the
  branch the session is given, so every `claude/*` branch that shipped
  ends on `main` (`claude/elegant-volta-ahaall` carried 0.00246–0.00272,
  the classes thread). Never pick an old branch up by name: use the
  branch the new session is given.
- Ship with `node tools/ship.mjs --note "..."` (rule 6): it is the
  bump-suite-fetch-merge-push loop with the collision handling two
  threads need. No PRs unless the developer asks. **Two sessions may ship at
  once** (0.161–0.195 came from two threads; 0.182, 0.193 and 0.194 were
  each taken twice): never pick a build number by hand, and read the
  suite's exit code, never its last line through a pipe.

## History by thread (the state at each handover)

- Live: the card effects from the Card Lab (0.183–0.195: a glow behind
  every portrait by material, the cards in 3D, the glint, see-through
  plates), the room push and swoosh (0.171–0.178), the Old Wizard
  (0.161–0.188), the Fog Lab's living mist (0.164–0.169), treasure rooms,
  the Art Lab (0.184–0.194, the other thread; nine candidates approved
  in 0.194 — by 0.00244 `art.json` holds 39 candidates, 31 approved,
  none imported: the game still draws the original portraits, and `node
  tools/gen-art.mjs --import` is the step), build numbers with five
  decimals.
- 0.00197 was a review of the whole project (three audits, every file
  read, plus a headless profile): the JavaScript side of a five-enemy
  fight idles at ~2% of a core; the GPU cost is the mist (forty large
  sprites at half resolution), then the card glow, then the mesh — the
  ladder handles weak devices. Fixed: the card glow's per-frame readback,
  the uncapped frame rate under motion, the 40 Hz ladder trap, the flat
  layers animating under the canvas, the glow repaint, the dialog
  swallowing F5, the narrator's order race, muted music still running, a
  malformed save code breaking the hub, `wipeProfile` throwing, the
  changelist fetched unversioned, a chest paying twice, the lights' and
  the ladder's default copies (now data), the boss id / starting gear /
  shrine deal count / potion thresholds in src (now data), stale
  comments, the copied test import line. New: `tools/ship.mjs`,
  `tools/check-bump.mjs`, `shared/motion.js`, `.nojekyll`, the build
  file read once per page and cache-busted everywhere, the update poll
  every minute. The simulator's output is byte-identical to 0.196.
- 0.00198 fixed the heavy attack's off-by-one cooldown (the heavy's own
  turn no longer counts as recharge) and raised `combat.heavyMult` 2 →
  2.3 to compensate in part; the simulator's baseline moved with it (run
  depth 16.0 → 15.8, coins level, the room-24 boss 30% → ~10% clears — the
  wall the backlog names got taller).
- 0.00205–0.00209 (this thread): tablets, then phones (the phone layer,
  the stacked Great Hall, the gate), the Retreat advice and the Attack
  breathing (0.00206), the hub's height budget (0.00207). 0.00209 was
  the review after the phone work (three audits): the phone layer became
  `html.phone` twins (a plain `.panel` lost to `#app > .panel` and the
  shrine kept its desktop padding on phones), the hall's two assemblies
  one table, `tools/layout-check.mjs` and the `layout` test area; fixed:
  the boot with no catch, the windows not waiting for the CSS crossfade
  once the renderer was gone, the audio gesture on touch, the DPR-3
  phone drawing 1080p's pixels, a bed starting behind the muted bus, the
  preload not waiting for decode, a throwing effect soft-locking a room,
  the gate as a dialog with INSTALL rebuilt per render, the Forge's dot
  on Alchemy, the title's save boxes under a phone's keyboard, ship.mjs
  renumbering main's lines and crashing on a refused push, CI's bump
  guard reading one commit, number copies in the renderer and synth.
- 0.00210–0.00221: the World Lab prototype (0.00210–0.00215), CI's bump
  check repaired (0.00211–0.00212), the fallen cards leaving the row, the
  purchase flash and Buy Potion pulsing (0.00216), the changelist
  scrolling inside the build prompt (0.00217), equal-height equipment
  rows on phones (0.00218), the benchmark ask back with rounds and the
  wake lock (0.00219), the death as its own playback step (0.00220), the
  Benchmarks card's build column (0.00221).
- 0.00222: the phone power profile (`deviceBlock`, lower DPR / fps / fewer
  puffs on a phone, BATTERY SAVER), the refresh-rate reading judged by
  the frame-time modes with stalls and the worst frame's moment recorded,
  the benchmark's phases starting at rest, the shader vignette, the glint
  mounted on demand, the glow loops as opacity layers, the newest log line
  first.
- 0.00223 was the review after the phone work and the dashboard rounds
  (eleven read-only audits, adversarial verification, then every
  confirmed fix applied by hand in thirteen batches; the simulator's
  output is byte-identical to 0.00222). Fixed: the reliquary death
  settling at the fights so far (now the room it led to), a potion drunk
  between rooms arming the knight, an unknown item id breaking settle and
  loot, a scene whose enter() throws leaving an empty window, a dialog
  opened mid-transition deaf to the keyboard, the benchmark ask landing
  mid-fade and its Continue dropped, the ?debug BENCHMARK always returning
  to the title, the hidden tab polling for builds, OVERKILL's banner
  placed from a fallen card's 0x0 rect, five layouts forced per printed
  line, every card rewritten per tick, summons marked elite, the welcome
  take queued behind the score, muted players downloading the beds and
  the takes, two loops of one bed, MUSIC: OFF forgetting the bed asked
  for, NARRATOR: OFF playing on, a dropped line spending its once-per
  rule, SOUND: OFF still ducking, a second duck cutting the first's
  release, the rarity / low-HP / death / victory text-shadow loops,
  Drink Potion's dead quicker pulse, the save dialogs' twin that never
  matched, the one-column hall with Descend unreachable, the boons over
  a panel room's log on phones, a long room title into the counters, a
  cut-off Push Deeper on phones, a fractional or huge room killing the
  dashboard, the collector's and the dashboard's run sanitizers
  disagreeing, the dashboard reading the CDN's old telemetry.json, a
  newer Worker told to roll back, a GL shader leak, the ladder's step
  past the end, the Card Lab's second glint and stale defaults, the Fog
  Lab's saved state spread whole, the Particle Lab's `bg.boss`, the World
  Lab rebuilding its clouds per input tick, ship.mjs hiding a crashed
  suite, the two Playwright tools disagreeing on paths. New:
  `ui/hubSections.js`, `prefs.js mutePref`, `loot.tryRevive`, the
  `overkill` event name, the WOFF2 font, the labs' versioned stylesheets,
  the narrow-window layout profile, `withSeedAsync` / `withAnimations`,
  the check-bump fixture, the orphan-asset check, a dozen behavioural
  checks in place of source greps.
- 0.00224–0.00225: the By build table condensed and the save-code entry
  gone (every tester is collected); the device report with every run and
  benchmark, the collector keeping the newest three, the dashboard's
  Device reports card with Copy / Copy all (the phone's heat is gone
  since 0.00222, the developer reports). The first report (0.00225, the
  iPhone): the renderer's draw 0.1-0.3 ms of main thread, the card light
  13.5 ms a tick in Idle and 6-8 ms in the fights — Safari's
  `createImageBitmap` from a WebGL canvas is a readback — hence the Idle
  phase's 29% dropped frames at the display rate.
- 0.00231–0.00244 (the art thread): the portraits redrawn by Nano
  Banana in their own photoreal rendering, 31 of 39 candidates approved
  across all 13 characters (none imported yet — the game still draws the
  originals; `gen-art.mjs --import` with `--pick` per character is the
  step); the character LoRA trained on them (`crimson-moon-style`: a
  character from its line alone, the mimic chest first) and the room
  LoRA on the paintings (`crimson-moon-rooms`; both private models,
  run by version); the background bake-off on nine models with the
  developer's prompting guide (`docs/image-prompting-guide.md`): Seedream
  4 the pick; `tools/gen-bg.mjs` with its stages and the Background Lab
  (`labs/backgrounds/`); the first two generated rooms in the castle,
  The Clock Tower and The Blood Baths (0.00244); `tools/replicate.mjs`
  shared by the three art tools. Six rooms sit in the lab as drafts.
- 0.00227: the card light's pool — a WebGL canvas per lit card, reused
  across rooms, no copy at all (an OffscreenCanvas whose
  `transferToImageBitmap` MOVES the picture was tried first and measured
  at 420 ms a tick under the sandbox's software GL: a transfer there is a
  readback too). A new benchmark round (`benchmarkSince` 0.00228: the
  pool went out as 0.00227 behind another thread's 0.00226, the font
  swap, so its notes named the round one build low): the next iPhone
  report says how much it bought.
- 0.00246–0.00272 (the classes thread, `claude/elegant-volta-ahaall`):
  the heroes — `heroes.json`, the Hero Lab (0.00247) and CHOOSE YOUR HERO
  (0.00248: seven classes on the developer's cut-out sheets, the figure on
  the knight's card, save version 5), the choice once per save and the
  look picker (0.00253: `profile.hero` null until PROCEED, version 6, the
  hero / look in every run record and the Worker 0.00253), the colour
  themes (0.00254: the plate's hue, the card light), the knight's card
  turning over to STATS and INVENTORY (0.00256 / 0.00258), the knight's
  four standing looks (0.00264), the kits (0.00265), the stat colours
  (0.00266), the classes' gameplay with the heavy's name per class and the
  combat UI's minimum (0.00267: `heroes.json class`, drafted 0.00258 under
  `simulate.mjs --hero`), the classes' particles (0.00268), SWITCH CLASS
  in the debug menu (0.00269), the class synth sounds (0.00270), Entangle
  in Go Feral's place with the 45 rendered recordings — a blow, a heavy
  and a hurt per class, an attack and a hurt per foe (0.00271) — and the
  status tints in the foes' figures (0.00272). The other thread's builds
  meanwhile: the item art (0.00259–0.00261), the LOOT row and the find
  flying into it (0.00262), the potion's picture and card (0.00263).
  The simulator, 4 campaigns x 40 runs per class: the knight median 15.8
  / room-24 boss 6%, the others 16.5–18.3 (the Heroes notes).
- 0.00276–0.00283 (the review after the classes; 0.00278–0.00279 were the narrator's crit lines, 0.00280–0.00282 the music and the hall's large-screen zoom, other threads'): the documentation sweep
  (0.00276: CLAUDE.md, ARCHITECTURE.md, the collector's README, the labs'
  headers, the prompt docs), the seven display mismatches (0.00277, the
  Backlog's list) and the refactors (0.00283: the class registry
  `run/classes.js`, `run.hero`, `classFx.js`, the `LOOKS` table,
  `tools/elevenlabs.mjs`, the harness helpers — all byte-identical in the
  simulator and the shrine study; the Backlog's "Refactors done" entry).
- 0.00303 (the character-gen thread): the 30 approved enemy redraws live,
  dealt per fight as variants (the Portraits notes); the Vampire Lord's
  three undecided candidates, the gargoyle's two and the mimic's three
  wait in the Art Lab.
- 0.00293 and 0.00299 (this thread; 0.00285–0.00292 and 0.00294 were the
  other threads' — the title bed from the title, the special-attack keys,
  the cries pulled, the calmer boss take, the inventory strips, the
  knight's crouch as a figure, the LOOT pop-up, the run end's layout):
  the immunities (0.00293) and the second review (0.00299: four read-only
  audits — engine and data, UI and stylesheet, audio and tools, docs and
  tests — then three fixers by file ownership). Fixed: the Plague
  Sister's swing rolled against blight immunity (and her target rolled
  twice), a thrall rising in a cleared room, the knight's kit dropping as
  the other classes' off-class junk, the two studies playing a classless
  knight, CHOOSE YOUR HERO stacking a stale screen on a relayout, the
  LOOT pop-up promising a slot to a beaten find and having no key or
  phone path, SWITCH CLASS keeping the boons' bar and Greed, ship.mjs's
  renumbering skipping a file after a shared mention, a take starting
  through a silenced bus and ducking the music, the pulled cries warmed
  every session, a device report lost on a failed upload, gen-score's
  import on a bed not in audio.json, a dead `player.baseHeavyCd`.
  Refactors: `shrine.js BOONS` (the boons as a registry, dataCheck reading
  their needs), `simCore.fresh(hero)`, `previewProfile`, `living` /
  `multiKill` shared, the tier colour tokens and `hud.js` builders
  (`tierOf`, `itemTitle`, `findBody`, `wornId`), `openDialog closeKeys`,
  `elevenlabs.mjs post` with the 429 retry and the format fallback,
  `tools/util.mjs` (`seedFor`, `cli`), the harness fixtures (`enemy`,
  `fight`, `heavy`, `types`, `heroProfile`), the suite's ORDER naming
  every file, seven dead selectors and four dead exports gone, two
  1920x1080 / 2560x1440 layout profiles. The simulator byte-identical for
  the six classes the fixes did not touch; CLAUDE.md's Systems got
  headings (the audio and the items in play out of the paragraphs that
  buried them).
- Left as found: `icon.png` (374KB, 512x512) at the root is the
  manifest's home-screen icon (`manifest.webmanifest`, purpose `any
  maskable`; index.html links only `icon-64.png` as the favicon by
  design — a padded maskable variant would be the developer's art);
  the `fog-lab/`, `particle-lab/`, `vo-lab/` forwarding stubs;
  `wrangler.jsonc` + `.assetsignore` (the unused Workers path);
  `assets/chars/candidates` (12MB), `assets/items/candidates` (1.3MB,
  0.00260), `assets/audio/candidates` (30MB, 0.00273) and `assets/style` (17MB with the hero sheets, 0.00248) are
  lab-only art no player fetches but every clone and deploy carries (an
  Actions deploy could exclude those two; `assets/bg/candidates` (22MB,
  the largest) and `assets/chars/candidates` are read by the public
  Background and Art labs, `assets/world` by the World Lab); the Particle
  Lab is a standalone copy of the ~0.128–0.135 looks (no heal material,
  none of the class looks, no status tints); four portraits weigh
  200-260KB (content, not quality: re-encoding saved 3%); the root's duplicate
  `SIL Open Font License.txt` (byte-identical to `assets/fonts/D-DIN-OFL.txt`)
  went in 0.00273, and a `robots.txt` keeps crawlers out of `tools/`,
  `docs/`, `collector/`, the labs, the stats page and the candidate
  folders (they stay public: GitHub Pages serves the whole repo). The
  `.pyc` cache file under `tools/__pycache__` is no longer tracked (0.00223).

## Backlog

- Voice-over: a NARRATOR volume slider if players ask · the ElevenLabs
  key is the developer's (quota per key) · the reliquary's revive is not
  narrated · the get-hit cries (`hurt_<class>`, `ehurt_<foe>`) are
  pulled behind `audio.json cries` (0.00287) until their content is
  rethought — new recordings would be new files (rule 7).
- Video (0.00307, the title's fly-in; shipping since 0.00311): `tools/gen-video.mjs`
  with candidates, verdicts and `--import` (the cut, the bake, the encode,
  the 720p file) like the other generators, and a lab to compare takes · a
  dialog opened during the film (the update prompt fires as the title's
  windows return) sits over it at z 70 and the first key skips the film
  before the dialog hears it · a take with the painting's own crows and smoke (the models add
  their own) · the other cinematics (the descent, the boss's entrance, YOU
  DIED, the victory) once the title's sticks.
- Game: a foe's immunities show nowhere before the cast (0.00293: a tag or
  a hover line on the card would let the Wizard and the Plague Sister aim)
  · the classes' next round — the thrall card and the rage chip (the
  class UI's "not yet": the log alone says the thrall rose, took a blow,
  crumbled; the Barbarian's rage shows nowhere), the kits' own numbers
  (0.00265: every kit item has the Rusty Sword's or the Oak Shield's),
  the mock-ups in the chat as the design to grow into · merchant room
  (endgame coin sink) · more bosses (only the Vampire Lord; `boss.enemy`
  is data now) · the room-24 boss is a wall (~5% clear in the simulator
  for the knight) and meta saturates past ~60 runs — deeper tiers or NG+
  (then move `finalBossRoom`) · thorns relic is a flat 4 damage, weak
  against scaled enemy HP (it can finish a foe since 0.00243) · more room
  kinds · a portrait phone layout (0.00208 plays sideways only) ·
  treasure rooms are not in the play stats · the world map (the World
  Lab's design, 0.00210: a scene between the Great Hall and the dungeon;
  a place = a dungeon with its own boss, room count, paintings and curve;
  clearing its last boss marks it in the profile at settle time (rule 1)
  and the save gains a world record (rule 3); the hall's Descend goes to
  the last place chosen with a MAP beside; `labs/world/lab.js WORLD` is
  the shape of the future `world.json`).
- Engineering: `go()` is silently dropped
  during a transition (queue it) · about 160 of the ~1200 checks still
  assert on source text rather than behaviour (inject recording stubs
  instead; 0.00283 gave the harness `byClass` / `button` and a `DATA`
  restore in `fresh()` for it) · the Actions deploy job (off until the developer opts in)
  could exclude `tools`, `docs`, `collector`, `assets/style` (17MB) and
  `assets/items/candidates` (1.3MB) — those two are unused by every
  page; `assets/bg/candidates` (22MB), `assets/chars/candidates` (12MB)
  and `assets/world` are read by the public labs, so excluding them
  breaks the Background, Art and World labs ·
  the manifest has no 192 px icon (180 and 512 only; Android wants 192)
  · ship.mjs is
  still two commits per ship (the work commit carries the previous
  build's number; rehearse against a bare scratch remote) · `guide_torch_corridor` is approved in
  `rooms-art.json` but never imported (`gen-bg.mjs --import`) ·
  `gen-bg.mjs --import` rewrites backgrounds.json through JSON.stringify
  (1.0 → 1, the phone block on several lines — harmless, noisy; 0.00244
  added its two rooms by hand) · the room LoRA's captions are mine, not
  the guide's: retrain with the guide's words if it is to be used · the
  Particle Lab lacks the heal material, the class looks and the status
  tints: rewire it to `particleLooks.spawnParticles` / `spawnClassBurst`
  or retire it (the developer's call) · WebP room paintings under new
  names (~49% smaller at q80; the developer judges q80 / q85 in the Fog
  Lab; `bg3dPuffs seedOf` should hash the stem first).
- Refactors done in 0.00283 (the classes had landed as switches; the
  simulator and the shrine study byte-identical for all seven classes):
  `run/classes.js`, the class registry — `HEAVIES` by kind (`spills`,
  `onHeavy`), `AFTER_BLOW` and `FOE_TURN` hook lists in the old phases'
  order, `HEAVY_KINDS` / `CLASS_KEYS` that `dataCheck` reads (an unknown
  heavy kind or a missing key is named) — in place of the heavy-kind
  switches in `combat.js` and `shrine.js` (`usesCharges`); `combat.js
  damageFoe` for the four damage copies, and every foe a `fighter` with
  `blight` / `entangled` 0 (summons too) · `run.hero` (`heroes.js
  heroSnapshot`: id, name, heavyName, theme, look) snapshotted at
  `createRun` and on SWITCH CLASS, read by `combatQueue.js sfxFor(ev,
  run.hero)`, `battleLine.js createPlayerUnit` (`heroArt(hero)`, the
  title, the heavy's name, `frame(theme)`), `cardFx.js cardStyle(id,
  boss, theme)` and `classFx.js` through the fx context's `run` — the
  combat UI reads no class from the profile (a test plays a Wizard run
  on a knight save) · `fxParts.js lunge()` for the three lunges (the
  dodge and the thrall's blow took the attack's eased keyframes) and
  the class effects in `ui/classFx.js` (`CLASS_FX` by kind, `traceFor`)
  · `particleLooks.js LOOKS`, a table of generators on the shared
  primitives (`ink` / `spark` / `heal` kept as written: restating them
  would move the seeded shapes) · `tools/elevenlabs.mjs` (above) · the
  harness helpers and the `DATA` restore (Testing notes); the new
  `fx.test.mjs` asserts the lunges and the class-from-run reads. Still
  open: `combatFx.js` could hand kick / enter / deal to a
  `cardMotion.js` (contested: the kick is part of the hit's
  choreography).
- Open from the 0.00299 review (none urgent): `run.heroId` and `run.hero.id`
  are two fields for one class — derive the first from the second once the
  null-hero meaning is settled (today `heroId` null = "can use anything",
  `run.hero` falls back to the knight; only tests and a null save reach it)
  · the generating tools repeat their candidate registries (load / save /
  entry / nextN / applyVerdicts, with a hidden fork: gen-bg's approve
  drops the note, gen-score's keeps it), their contact sheets and the
  Playwright launch — a `tools/registry.mjs` and `browser.mjs`; `cli()`
  reached six tools, the rest parse their own way · shrine-study.mjs and
  stat-study.mjs repeat the baseline-and-paired-runs loops (`simCore`
  could hold `baselineSnapshots` / `pairedRuns`) · the collector's and the
  dashboard's sanitizers are kept in step by one test on the run fields;
  a fixture run through both and diffed would catch the next drift ·
  `heroScene.js` and `lookPicker.js` build the look switcher twice ·
  `battleLine.js createPlayerUnit` (~95 lines) and the LOOT row's state
  spread over `dungeonScene.js` want their own modules · the hotkey alt's
  "served after every own key" has no two-button test · ~180 of the 1224
  checks still read source text (the GLSL, the labs' HTML and the tool
  CLIs stay that way by design).
- Phone: a tap-to-show for hover-only text (a boon's full line, the elite
  star, the summon note) · the labs under a short window get no phone
  layer (by design) but the Card Lab's side panel and a 96vw budget
  disagree · a real-device pass (the developer's) is still owed.
- Art: the Background Lab's draft rooms await verdicts (The Rookery,
  The Collapsed Gallery, The Spiral Stair, The Crimson Veil, The Drowned
  Throne, the ossuary test); the guide's other unused rooms are the next
  batch (`docs/image-prompting-guide.md` §3: arenas, thrones, corridors,
  antechambers, shrines) · a generated painting's fog is a default until
  the Fog Lab tunes it · the mimic chest has art but no enemy entry ·
  the item pictures have no lab view yet (0.00260: reviewed on
  `gen-items.mjs --sheet`; the Art Lab's COMPARE would suit them) ·
  Moonbrand's runes and the Blood Eclipse amulet's corona were
  re-asked for in their lines — a redraw with `--hint` if they still
  read too plain in the game · the heroes' lore and traits in
  `heroes.json` are placeholders of mine.
- Other: orphaned legacy staging site cleanup.

**Tried and removed:** 3D exploration (0.139–0.151): a three.js Dungeon
Lab (generated floors, themed rooms, the game's fights in them) and a
`?debug` mode walking 3D corridors between the game's rooms. The developer
dropped it in 0.152 — it didn't fit the creative direction; the game is
back to its 0.138 shape. The code is in git history (0.151, `6081e7a`).

# CLAUDE.md — Context notes for AI assistants

**Castle of the Crimson Moon** — a gothic roguelite browser game. Vanilla JS
ES modules, **no framework, no build step**. DOM-based UI over full-screen
painted backgrounds (3D when WebGL allows); D-DIN Condensed Bold via
@font-face (Datto, SIL Open Font License, `assets/fonts/D-DIN-OFL.txt`;
0.00226 — it replaced Apple's DIN Condensed, which had no web licence).
D-DIN carries 231 glyphs: the symbols the UI uses (★ ⚔ ☰ → …) fall back
to the next font in the stack, and a text minus is a plain hyphen. You play as The Curious Knight pushing deeper into a castle:
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
  menu of the testing pages, opened from the `?debug` corner column (LABS).
  Each lab is a folder `labs/<name>/` with a card on `labs/index.html` and a
  "‹ Labs" link back (a smoke check keeps cards, folders and links in step);
  the old `particle-lab/`, `fog-lab/`, `vo-lab/` are forwarding stubs.
  - **Fog Lab (0.164):** `labs/fog/` — the game's real 3D renderer on every
    painting with every fog knob as a live slider, presets, the flash lights
    on demand, and COPY JSON for a `parallax` patch (see "3D backgrounds").
  - **VO Lab:** `labs/vo/` — (booted through `labs/boot.js` like the
    others since 0.00197) every narrator take with its text, when it
    plays and how often; Play / Approve / Disapprove (+ volatility and shouty
    nudges); RE-RENDER gives a JSON for `node tools/gen-vo.mjs --rerender`
    (see "Audio").
  - **Particle Lab:** `labs/particles/` — trying particle looks (see
    "Effects").
  - **Card Lab (0.174):** `labs/cards/` — the game's real card units
    (`battleLine.js` + `styles.css`) with three proposals on top, each with
    options: a shader behind each portrait (`cardFx.js`: fog, blood,
    flames, embers, ether, by the enemy's particle material), the cards in
    3D (hit kicks, turning or dealt entrances, a mouse tilt) and a glint
    sweeping the bitmap as it turns (a bright masked copy of the portrait).
    0.181: a Plate opacity slider fades the card's dark inside and its
    light under an untouched border (the frame art cut in two for the lab,
    `card_*_border.png` / `card_*_plate.png`; the game's one PNG is 0.85).
    COPY JSON gives the picks back; the owner's picks shipped in 0.183
    (see "Card effects" below). The lab draws the game's shader
    (`src/ui/cardFx.js`) and the units' own glint, so a look changed there
    changes here too; Reset is cards.json's shipped picks and the boss
    sits on the 0.196 double-wide card (0.00223). The Card and Art labs
    load styles.css versioned through `labs/boot.js` (`data-versioned`
    links, 0.00223); the Fog Lab's saved state merges knob by knob over
    the shipped values; the Particle Lab's room list has the throne and
    treasure paintings (its 'shipped mix' stage is still a pre-0.136
    copy — see the Backlog).
  - **Art Lab (0.184):** `labs/art/` — the portraits redrawn in the room
    paintings' style (see "Portraits" below) on the real card units over
    any room painting: COMPARE (one character, current beside every
    candidate, Approve / Reject with a note, Flip), LINE-UP (all 13, new
    or current), FIGHT (the knight and four enemies at the game's size).
    COPY JSON packs the verdicts and queued re-rolls as `art-rerender.json`
    for `node tools/gen-art.mjs --rerender`.
  - **World Lab (0.00210):** `labs/world/` — the world map above the
    dungeon, a prototype: the owner's painting (`assets/world/world_v1.webp`,
    1500 px; the real one wants three times that or tiles) under a canvas of
    cloud puffs, the places as pins (the castle you play today is the first;
    the data in `lab.js WORLD` is shaped as the future `world.json`: position,
    name, boss and room count, `needs` = the place whose clearing opens the
    road), a cleared place burning the clouds away (`destination-out`
    circles, a radius per state, a timed burn) around it and its roads; two
    looks (THE KNOWN WORLD frames every revealed circle from above; FROM THE
    SKY hangs low and tilted over one place — the owner's picks; a
    cartographer's-table look was dropped as unimmersive) and DESCEND, the
    dive through the clouds to the place's first room. Drag, wheel and
    pinch; CLEAR fakes progress; COPY JSON gives the data and tuning back.
    Nothing touches the save; the design it prototypes is in the Backlog.
- **Staging (legacy):** ublgmuyncizrq.kimi.page, published by the owner from
  Kimi version cards — not maintained here.

## Quick start

```bash
python3 -m http.server 8000                  # repo root -> http://localhost:8000
node tools/ship.mjs --note "..."             # ship: commit, merge main, next number, bump, suite, push (rule 6)
node tools/smoke-test.mjs                    # the suite: ~870 checks, a second or two on the virtual clock
node tools/layout-check.mjs [--only phone]   # desktop AND phone: the real game headless at five screens (rule 8; needs Playwright)
node tools/smoke-test.mjs combat             # test files whose name contains "combat"
node tools/simulate.mjs --runs 40 --seed 1   # headless balance bot (one campaign)
node tools/simulate.mjs --seeds 1-12 [--retreat]   # 12 campaigns, mean ± sd
node tools/shrine-study.mjs --n 500          # per-boon shrine balance (paired runs)
node tools/stat-study.mjs [--set path=json]  # what each upgrade is worth
node tools/gen-vo.mjs [--dry-run|--only id]  # render missing voice-over takes (ElevenLabs; needs ELEVENLABS_API_KEY)
node tools/reports.mjs [--reports|--json|--player x]   # the play stats from the collector (needs CASTLE_READ_KEY + the host allowed)
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
   now 4): bump it and append a step to `MIGRATIONS` — never edit a shipped
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
   `node tools/layout-check.mjs`: the real game headless at five screens
   (desktop, a 960x720 narrow desktop window, tablet, phone, the smallest
   phone), what each layout promises asserted (0.00223: the save dialogs
   up top, the room title clear of the counters, the boons clear of a
   panel room's log, Descend reachable in the narrow window's one-column
   hall), screenshots to look at. The labs never set `html.phone`, so the
   layer never reaches them.

## Working with the owner

- `main` is the live site: merge what lands there, never force-push it.
  Don't touch `CNAME` or the Pages / DNS settings — the owner handles them.
- **The collector is deployed by hand:** after changing
  `collector/worker.js`, bump its `VERSION` and `telemetry.json
  collectorVersion` together and ask the owner to paste the file into the
  Cloudflare dashboard (Edit code → Deploy; copy the raw file — GitHub's
  normal view can truncate a selection). Until then the dashboard warns
  that the collector is older, and the old Worker drops new fields (saves
  keep them; they arrive with the next upload). A Worker NEWER than the
  page's telemetry.json gets a neutral note instead (0.00223: it used to
  be told to roll back). The Worker to paste as of 0.00223 carries the
  phone power / stall fields (0.00222) and the run-record clamp (a run
  whose `room` is not a whole number up to 999 is dropped, the counts
  clamped; one such record used to break the whole dashboard).
- The collector's `READ_KEY` is the owner's secret: never ask for it.
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
- CI's deploy job stays off until the owner opts in (see Testing).

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

**Combat and pacing.** A turn (`run/combat.js playerAttack`) runs in phases:
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

**Progression.** The opening and the ramp (0.00230, the owner's call:
an easier first run that reaches about room 3, the overpowered phase in
the early rooms a little later, the march to room 24 unchanged): the
tier-1 enemies hit ~25% softer (rat 30, Cave Shrieker 22, skeleton 45,
Crypt Spider 38), a new save starts with 3 potions, and a trained level
gives +2 damage / +72 HP / +8 armor (was 3 / 90 / 10) for a base cost of
13 XP (was 15). The simulator, 12 campaigns: the first run reaches room
3-4 (was 2), rooms 1-5 cost under 10% of max HP from about run 12-13
(was about run 11), room 24 first reached at run ~33 (was ~31), its boss
beaten at ~41 (was ~39). Tried and turned down by the owner: early rooms
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

**Effects.** One-shots (lunge, hit, numbers, entrance, shake) live in
`ui/combatFx.js` + `fxParts.js`, driven by `fx` descriptors on playback
items, and use `element.animate` so they never restart the CSS idle loops
(per enemy FAMILY: `battleLine.js IDLE_FAMILY` + `.idle-<family>`; loops
animate only translate/rotate/scale, never filter). **Card effects
(0.183, the owner's picks from the Card Lab; tuning `cards.json`):**
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
report (0.00225, the owner's iPhone) put that at 13.5 ms of main thread
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
pixels at `fx.fps`, a fallen card lit until its unit leaves the row
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
with it). **Particles** (looks
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
motion. **The phone power profile (0.00222, the owner's iPhone ran hot):**
`parallax.phone` = the knobs that differ on a phone — `maxDpr` 1.5 (1278
px wide on an 852-px phone, 44% fewer fragments than DPR 2), `maxFps` 24
at rest, `motionMaxFps` 30, `puffDiv` 3 (the mist buffer at a third of
the canvas; `puffDiv` 2 on the desktop — a constant in the renderer
before) — merged by `bg3dTuning.js tuning()` under the per-file
overrides on a phone (`platform.js deviceBlock`, the device, once per
session; `?desktop` keeps the desktop values, so the owner can A/B on one
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
over the canvas every frame, 3 MP a frame on a phone). **BATTERY SAVER**
(the corner column, 0.00222, remembered per browser): the ladder's last
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
revive): `bgLight(kind, rect)`, settings in `parallax.lights`. Big-hit sway:
`swayDeg` / `swayHitShare`. **The mist's own motion and light (0.164,
tuned in the Fog Lab):** `parallax.puffs` carries what used to be
constants — `drift` (per-puff wind speed spread), `rock`, `period`,
`bob`, `breathe`, `shadeVar`, `alphaVar` — and the new `turbulence` /
`turbulencePeriod` (each puff wanders on its own loop), `pulse` /
`pulsePeriod` (fades in and out), `flow` / `flowScale` / `flowAmount`
(tileable noise churning inside each puff, one extra half-res texture
read); `parallax.mist` = the puffs' lighting (`shade` self-shadow
strength, `litTint` / `shadeTint`, `sceneLight` = the painting's own
bright pixels glow through the mist, read with a mip bias, `nearBright`);
`parallax.haze` = the distance haze's shape. 0.166–0.169: the shipped base
is the lab's Rolling Mist toned down to the owner's reference (drift
spread 0.7–1.0, turbulence 0.015 / 12 s, breathe 0.04, bob 0.006, pulse
0.3; drift 3.5, haze 0.38 / curve 1.55), and every painting has its own
`fog` + `fogWind` override
(outdoors and the large halls a notch windier; the wander goes in before
the box wrap, so a wrap never pops); `setLiveTuning` re-rolls a layer's
puffs when its block changes (same seed: no jump). The lab never writes
the game's saved tuning (`castle-bg-tuning`): it keeps its own key.
**The room push (0.171, `parallax.push`):** a room change moves the
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
1 s in) are the owner's and unchanged.
New room art: JPEG in `assets/bg/`, entries in
`backgrounds.json` (`rooms`, `roomNames`) and a depth map (`python3
tools/gen-depth.py <model.onnx> new.jpg`; the suite fails without one).

**Portraits (0.184).** The file is data: `enemies.json art` per enemy and
`cards.json player.art` for the knight, read through
`shared/portraits.js portraitUrl(id)` (battleLine, preload; `dataCheck`
fails on a missing one) — a redraw lands under a NEW filename (rule 7,
`rat_v2.webp`) and the data points at it, so the old art is one edit
away. **Redrawing them (0.00201, after three directions):**
`docs/portrait-prompts.md` holds the style block and a line per
character (`[FACING]` = left for enemies, right for the knight; an
ACCENT per character; a boss gets its own wide, waist-up COMPOSITION,
`gen-art.mjs BOSS_COMPOSITION`). The direction that stuck is the
originals' own rendering — photoreal dark-fantasy, the character's glow
lighting it, one hue family each — NOT the inked room style: the inked
sheets in `assets/style/` (the owner's, 0.191) and a Mignola / Darkest
Dungeon block cost the glows and the presence, and were dropped. Image 1
is the current portrait, image 2 the character's OWN portrait (`--refs
own`; `family` = the colour family's best original, `sheets` = the inked
sheets); a character whose art is no reference (the gargoyle) is drawn
onto another's original with `--from-sheet skeleton` (the picture's
figure replaced). **Models** (`--model`, one adapter each in `MODELS`):
Kontext Pro / Max (two input pictures), Nano Banana (`banana`, the
owner's pick: faithful, cheap, ~$0.04) and Nano Banana Pro (`bananapro`,
2K, ~$0.15), Seedream 4 (`seedream`, the most dramatic — the only boss
that read as one), GPT Image 1.5 (`gpt`, slow, shades its backgrounds),
FLUX 2 Pro (`flux2`); prices from memory, the API has none. Inputs go
inline as data URIs (`--inputs files` uploads; the models' own fetch of
an uploaded file timed out a third of the time). **The cut-out:** a
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
**The loop:** generate → the Art Lab (`labs/art/`: Approve / Reject with
a note, Flip, Clean = a Kontext pass painting out a shadow or panel,
Regenerate with notes = this candidate as the design, the note as the
direction, the panel's model) → COPY JSON → `--rerender
art-rerender.json` (verdicts recorded, re-rolls generated: `{ id, n,
hint, style, model }`, `{ id, clean: n }`, `{ id, basedOn: n, hint, n,
model }`) → `--prune` (an approved character keeps only its approval;
`--keep-models a,b [--clear-verdicts]` for a change of direction) →
`--import` (the approved candidate, or `--pick rat=3`, to
`assets/chars/<id>_v<k>.webp` and the data; a Clean first if a shadow
is in it) → ship. `--model lora --new mimic --line "CHARACTER: ..."`
draws a character the game does not have (a default canvas; the lab
shows it on a stand-in card) once the LoRA exists. `sharp` is the one
npm dependency (`package.json`; the suite runs without it). **The style
LoRA** (`tools/train-lora.mjs`, `ostris/flux-dev-lora-trainer` into
`pjarvilehto/crimson-moon-style`, captions written from the data,
trigger `CRMSNMOON`; `assets/data/lora.json`) is built but NOT trained:
the first run was cancelled — train it on the approved set, never on
candidates the owner has not approved, and not on the room paintings
for characters (a different style).

**Audio.** One AudioContext (`audio/audioCore.js`, gesture-gated); every
sound goes music/effects bus → master → limiter (`audio/mixer.js`), levels
and ducking in `audio.json`. **Sound registry:** `audio.json clips` — per
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
then). Muting the music stops the bed and frees its decoded buffer (two
asks for one bed inside its decode start one loop, and a bed asked for
while MUSIC went OFF and ON is the one that plays — 0.00223); the
narrator's lines decode in the order they were asked for (a death and
the first-death line, a chest and its relic). The three on/off toggles
share `shared/prefs.js mutePref` (0.00223). A second duck under a
longer one keeps the longer release (0.00223: a short stinger under a
narrator line used to bring the music back early). Combat lines go through `ui/combatSfx.js` (panned to the
card, timed to the blow, crit/mega/overkill sweeteners). The room change's
swoosh (0.173, `audio.json transition`): the owner's SFX pitched down three
quarters of an octave (`sfx-room-swoosh-v2.mp3`, 0.175; 30% quieter than 0.173, and 30% again in 0.178), played by `sfx.js transitionSfx()`
from `main.js onTransition` so its measured loudest moment (`peakMs`)
lands `peakAtMs` (2 s, the middle) into every transition, varied a little
each play (its `variation` entry + `jitterDb`). Music: five
generated beds (`audio.json music.tracks`; `python3 tools/gen-music.py
--suffix vN`, new suffix = new files), each an exact loop with its first
`tailS` seconds appended, restarted every `loopS` by `musicLoop.js`. Measure
for real with `node tools/audio-check.mjs`; tests use a fake AudioContext
(`tools/test/fakeAudio.mjs`, which rejects NaN like browsers).
**Voice-over** (0.161, `audio/narrator.js`): the Old Wizard, a chronicler
who never shouts — the script is `docs/narration-script.md` (32 lines,
four takes each; OVERKILL nine since 0.188), rendered with ElevenLabs by `tools/gen-vo.mjs` (voice
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
script's SMASH, mega crit, revive, summon, room cleared, low HP) to items'
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
**Reviewing takes** (0.163): the VO Lab (`labs/vo/`) plays each take as the
game levels it; the owner approves or disapproves (volatility less/more =
stability, shouty less/more = style and speed; `gen-vo.mjs NUDGE`), and
RE-RENDER downloads `vo-rerender.json` (also to the clipboard). Then
`node tools/gen-vo.mjs --rerender vo-rerender.json` marks the approvals in
narration.json (`approved`), re-renders the disapproved takes nudged from
the settings they were rendered at (`settings`, recorded per take; a redo
gets a fresh seed), measures them, bumps and ships as usual — the owner
can paste the JSON into the chat for that. A re-rendered take comes back
unapproved. Edge caches: a re-rendered take keeps its filename, but
`--rerender` stamps it (`rendered` in narration.json) and `narrator.js
urlOf` fetches it as `<file>?r=<stamp>`, so no cache serves the old take
(rule 7 holds by the query, not the name). A take re-rendered by
deleting its file and running plain `gen-vo.mjs` gets no stamp and may
be served stale for ~4 hours.

**UI conventions.**
- Every dialog: `ui/dialog.js openDialog({ label, children, onKey, proceed })`
  — it owns the keyboard (key-trap stack) and is tracked (`anyDialogOpen`,
  `closeAllDialogs`). Dialogs live above the scenes, so a scene switch does
  not close them; the YOU DIED dialog is one too (0.157: it used to sit in
  `#app` without a key trap, and a reliquary death left Push Deeper live
  under it). Yes/no: `ui/confirmPrompt.js` (the title's Start a New Game
  included). Never the browser's `confirm()`.
- Keyboard-reachable buttons get `key: 'x'` in `el()`; a screen's way
  forward also gets `proceed: true` (Space clicks it, a tiny `[space]` sits
  under its label; in a dialog pass it as `openDialog({ proceed })`).
  Yes/no prompts and text fields don't get one. A held Space steps once.
- The obvious next button gets `class: 'active'` (pulsing yellow) or
  `'active active-red'`. The Great Hall's Descend pulses while nothing
  there can be bought (a new player's first visit: three panels of
  upgrades and nothing to spend; 0.00200). Buy Potion pulses whenever a
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
- Upper-right column (`ui/cornerToggles.js`): add buttons in main.js's
  `cornerBar([...])` with `onOffToggle` / `panelToggle`; the `?debug` tools
  (INVULNERABLE, background views and tuning, FORCE CRITS, LABS (the menu page),
  BENCHMARK) are in `ui/debugToggles.js`. No pixel offsets.
- A scene that is mid-run sets `inRun: true` (the update prompt waits).
- Transitions go strictly in order (0.154, the owner's call):
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
  FULLSCREEN toggle also speaks Safari's prefixed API). `?desktop` skips
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
  own; the owner tests in Brave); a home-screen app skips it; leaving fullscreen on Android
  brings it back). iOS: the home-screen app has its OWN storage — a save
  made in Safari is not there (the title's save code carries it; Export /
  Import are dialogs since 0.00209). Hover-only text (a boon's full line,
  the elite star) has no touch path yet (backlog).
- Asset loading (`shared/preload.js`): boot waits for the title + Great
  Hall art only; the hub's Descend waits only for the essentials (shrine /
  death art, portraits); the 47 room, throne and treasure paintings
  (~17MB; `preload.js roomUrls`, the entrance corridors first) keep
  loading behind — a room whose painting isn't in yet keeps the last one up
  (0.00222: into the HTTP cache only, `fetchOnly` — the renderer decodes a
  painting itself as the room is entered; decoding 34 of them here warmed
  nothing it could reuse). The display font ships as WOFF2 (~68KB,
  0.00223) with the TTF (212KB) as the fallback and for the labs.
- **Only fights are numbered (0.171, the owner's call):** `run.roomNumber`
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
- Painted icons (0.177, the owner's art): every shrine boon (`shrines.json
  offers[].img`) and treasure chest (`treasureUI.js LOOK`) shows a picture
  from `assets/icons/` (192px WebP with alpha, `buffs.js iconArt`; the
  glyph in `icon` is its alt text), on the cards and in the buff bar;
  preloaded with the Descend essentials. New boon = new picture, the
  suite checks every one is on disk.
- **BATTERY SAVER** and the other corner toggles are `onOffToggle`s in
  `main.js cornerBar` (0.00222: the saver remembers its state in
  `shared/prefs.js`, key `castle-power-saver`).
- The boss's card is twice as wide (0.196, the owner's call): `.boss-card`
  aspect 826 / 1106, its frame a 9-slice of `card_enemy.png` (border-image,
  so corners and border keep their shape); `battleRoom.js BOSS_SLOTS`
  counts it as two enemy widths in the row's `--slots` (the `--card-h`
  budget), so the boss and its three summons (`maxAlive`) still fit
  without shrinking at 16:9. New boss art should suit a wide card.
- Enemy cards (0.155) attack on a click, exactly as their Attack button
  would and only while it could (`.targetable`). A fallen enemy's figure
  collapses and its whole card leaves the row (0.00216, the owner's call —
  the faint skull cards went; summons did this since 0.092): `battleLine.js
  vanish` → `onGone` → `battleRoom.js fit()` recounts `--n`, so the cards
  left grow into the room (`.char-card` eases its height). Combat ends
  with an empty row. **The death is a step of its own (0.00220, the
  owner's call — the restack used to land in the middle of the enemies'
  turn):** after the death line's sink tick the playback waits for the
  card to leave (`battleRoom.js whenGone(i)` through the scene's
  `onDeath` hook), lets the row close up for `combatPacing.restackMs`,
  and only then prints the loot and the enemy phase; `deathMaxMs` caps
  the wait (a hidden tab pauses animations), `reset()` drops it. A
  multi-kill does this per victim, in order; an OVERKILL's victims fall
  together as the replay ends (their kills are silent).
- Room art (0.153): 26 rooms from the owner's batch (`dungeon_*` /
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

**Play stats and performance.** Every finished run appends a record to
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
decide, and jittered timestamps put them a refresh short: the owner's
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
`stalls`, `worstOut` and `power` — the owner pastes the Worker; until
then the old one drops the three fields (the saves keep them). The dashboard shows the
collected players and this browser's save (every record untrusted:
`sanitizeProfile()`; pasting save codes went in 0.00224 — every tester is
collected), deduped by playerId; its By build table shows the newest ten
builds and the three most played older ones (`stats.js condenseBuilds`);
the owner can give each player a
**tester name** (kept in that browser, shown as "tester · player name").
**The device report (0.00225, `meta/perfReport.js`):** what a later speed
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
pasting into the chat. Raising it: `REPORT_VERSION`. **BENCHMARK**
(`ui/benchmark.js` + `ui/scenes/benchmarkScene.js`): a seeded, fixed ~36 s
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

- `tools/smoke-test.mjs` runs `tools/test/*.test.mjs` (by area: scenes,
  combat, shrines, progression, content, backgrounds, audio, sim, history,
  narration, art, cards, layout — the last checks the phone layer's
  `html.phone` twins against the code and the desktop rules, rule 8),
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
  `--seeds 1-4` and `shrine-study.mjs` output before and after
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
  the state relative to what is there. The `check-bump` check runs on a
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

## Art batches from the owner (the workflow, 0.153 / 0.156)

The owner uploads PNGs through GitHub's web upload (to `main` or the
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
  ends on `main` (the latest, `claude/busy-hawking-blufll`, carried
  0.00205–0.00223). Never pick an old branch up by name: use the branch
  the new session is given.
- Ship with `node tools/ship.mjs --note "..."` (rule 6): it is the
  bump-suite-fetch-merge-push loop with the collision handling two
  threads need. No PRs unless the owner asks. **Two sessions may ship at
  once** (0.161–0.195 came from two threads; 0.182, 0.193 and 0.194 were
  each taken twice): never pick a build number by hand, and read the
  suite's exit code, never its last line through a pipe.

## State at handover (0.00223)

- Live: the card effects from the Card Lab (0.183–0.195: a glow behind
  every portrait by material, the cards in 3D, the glint, see-through
  plates), the room push and swoosh (0.171–0.178), the Old Wizard
  (0.161–0.188), the Fog Lab's living mist (0.164–0.169), treasure rooms,
  the Art Lab (0.184–0.194, the other thread: 38 candidates, nine
  approved in 0.194, none imported — the game still draws the original
  portraits; `node tools/gen-art.mjs --import` is the next step, four
  characters still undecided), build numbers with five decimals.
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
  since 0.00222, the owner reports). The first report (0.00225, the
  iPhone): the renderer's draw 0.1-0.3 ms of main thread, the card light
  13.5 ms a tick in Idle and 6-8 ms in the fights — Safari's
  `createImageBitmap` from a WebGL canvas is a readback — hence the Idle
  phase's 29% dropped frames at the display rate.
- 0.00227: the card light's pool — a WebGL canvas per lit card, reused
  across rooms, no copy at all (an OffscreenCanvas whose
  `transferToImageBitmap` MOVES the picture was tried first and measured
  at 420 ms a tick under the sandbox's software GL: a transfer there is a
  readback too). A new benchmark round (`benchmarkSince` 0.00228: the
  pool went out as 0.00227 behind another thread's 0.00226, the font
  swap, so its notes named the round one build low): the next iPhone
  report says how much it bought.
- Left as found: `icon.png` (374KB, 512x512) at the root is the
  manifest's home-screen icon (`manifest.webmanifest`, purpose `any
  maskable`; index.html links only `icon-64.png` as the favicon by
  design — a padded maskable variant would be the owner's art);
  the `fog-lab/`, `particle-lab/`, `vo-lab/` forwarding stubs;
  `wrangler.jsonc` + `.assetsignore` (the unused Workers path);
  `assets/chars/candidates` (12.6MB) and `assets/style` (9MB) are
  lab-only art no player fetches but every clone and deploy carries (an
  Actions deploy could exclude them); the Particle Lab is a standalone
  copy of the pre-0.128 looks; four portraits weigh 200-260KB (content,
  not quality: re-encoding saved 3%). The `.pyc` cache file under
  `tools/__pycache__` is no longer tracked (0.00223).

## Backlog (as of 0.00223)

- Voice-over: a NARRATOR volume slider if players ask · the ElevenLabs
  key is the owner's (quota per key).
- Game: merchant room (endgame coin sink) · more bosses (only the Vampire
  Lord; `boss.enemy` is data now) · the room-24 boss is a wall (~5% clear
  in the simulator) and meta saturates past ~60 runs — deeper tiers or
  NG+ (then move `finalBossRoom`) · thorns relic is a flat 4 damage, weak
  against scaled enemy HP · more room kinds · a portrait phone layout
  (0.00208 plays sideways only) · the reliquary's revive is not narrated
  · treasure rooms are not in the play stats · the world map (the World
  Lab's design, 0.00210: a scene between the Great Hall and the dungeon;
  a place = a dungeon with its own boss, room count, paintings and curve;
  clearing its last boss marks it in the profile at settle time (rule 1)
  and the save gains a world record (rule 3); the hall's Descend goes to
  the last place chosen with a MAP beside; `labs/world/lab.js WORLD` is
  the shape of the future `world.json`).
- Engineering: the hall rows' comments (hubText.js, hubSections.js, styles.css) say 0.00231 for 0.00232 — fix with the next build · `go()` is silently dropped during a transition (queue it)
  · ~60 checks still assert on source text rather than behaviour (inject
  recording stubs instead) · `fresh()` does not restore `DATA` after a
  test patches it · the Actions deploy job (off until the owner opts in)
  should exclude `assets/chars/candidates`, `assets/style`, `tools`,
  `docs`, `collector` · import the nine approved portraits
  (`gen-art.mjs --import`) once the owner decides the last four ·
  ship.mjs: one commit per ship (the work commit carries the previous
  build's number; rehearse against a bare scratch remote) · the Particle
  Lab's shipped-mix stage: rewire to `particleLooks.spawnParticles` or
  retire the lab (the owner's call) · WebP room paintings under new names
  (~49% smaller at q80; the owner judges q80 / q85 in the Fog Lab;
  `bg3dPuffs seedOf` should hash the stem first) · `combatFx.js` could
  hand kick / enter / deal to a `cardMotion.js` of its own (contested:
  the kick is part of the hit's choreography).
- Phone: a tap-to-show for hover-only text (a boon's full line, the elite
  star, the summon note) · the labs under a short window get no phone
  layer (by design) but the Card Lab's side panel and a 96vw budget
  disagree · a real-device pass (the owner's) is still owed.
- Other: orphaned legacy staging site cleanup.

**Tried and removed:** 3D exploration (0.139–0.151): a three.js Dungeon
Lab (generated floors, themed rooms, the game's fights in them) and a
`?debug` mode walking 3D corridors between the game's rooms. The owner
dropped it in 0.152 — it didn't fit the creative direction; the game is
back to its 0.138 shape. The code is in git history (0.151, `6081e7a`).

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
    (`src/ui/cardFx.js`), so a look changed there changes here too.
  - **Art Lab (0.184):** `labs/art/` — the portraits redrawn in the room
    paintings' style (see "Portraits" below) on the real card units over
    any room painting: COMPARE (one character, current beside every
    candidate, Approve / Reject with a note, Flip), LINE-UP (all 13, new
    or current), FIGHT (the knight and four enemies at the game's size).
    COPY JSON packs the verdicts and queued re-rolls as `art-rerender.json`
    for `node tools/gen-art.mjs --rerender`.
- **Staging (legacy):** ublgmuyncizrq.kimi.page, published by the owner from
  Kimi version cards — not maintained here.

## Quick start

```bash
python3 -m http.server 8000                  # repo root -> http://localhost:8000
node tools/ship.mjs --note "..."             # ship: commit, merge main, next number, bump, suite, push (rule 6)
node tools/smoke-test.mjs                    # the suite: ~740 checks, under a second
node tools/smoke-test.mjs combat             # test files whose name contains "combat"
node tools/simulate.mjs --runs 40 --seed 1   # headless balance bot (one campaign)
node tools/simulate.mjs --seeds 1-12 [--retreat]   # 12 campaigns, mean ± sd
node tools/shrine-study.mjs --n 500          # per-boon shrine balance (paired runs)
node tools/stat-study.mjs [--set path=json]  # what each upgrade is worth
node tools/gen-vo.mjs [--dry-run|--only id]  # render missing voice-over takes (ElevenLabs; needs ELEVENLABS_API_KEY)
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
   animation durations, shader constants, synth instrument definitions.
3. **Save format changes go through `SAVE_VERSION`** (`meta/migrations.js`,
   now 4): bump it and append a step to `MIGRATIONS` — never edit a shipped
   step. New defaults: `DEFAULTS` / `freshProfile()` in `meta/profile.js`.
   After the steps `migrateProfile` makes an imported code whole (gear
   slots, numbers, lists; 0.00197) — a malformed paste used to break the
   Great Hall on every entry.
4. **Loot (0.091):** a drop that can't beat the gear (as it will be after
   this run's finds, `run.gearPreview`) is salvaged on the spot; only
   upgrades land in `run.itemsFound` — one path, `run/loot.js takeItem`,
   for kill loot and treasure chests (the Heart's revive is one too:
   `runState.tryRevive`). One shrine per stretch of `bossEvery`
   rooms (`run.shrineRooms`: on the way to rooms 2-7, 10-15, ...); coin
   boons can have a flat price (`flatCost`, else priced by the room the
   shrine leads to).
5. **Potions persist** (0.080): a run draws the profile's stock and
   `settleRun()` writes back what's left, capped by `potionCap`; pickups go
   through `runState.addPotion()` (sold when the satchel is full).
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
   never served; the update prompt polls every minute and on tab focus,
   so a player sees "Build available" within about two minutes of the
   push (mid-run it waits for the run's end).
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
strike (a heavy blow = `combat.heavyMult` x damage, 2.3 since 0.00198,
and its cooldown `player.baseHeavyCd` counts ORDINARY turns — the
heavy's own turn used to count too, so a cooldown of 3 was back after
two blows and two Quicken boons made it every turn; the fix cost the
room-24 boss most of its clears in the simulator (30% → 3%), 2.3 bought
back the run depth and coins and leaves that boss at ~9%) (+ spill: heavies of `spillThreshold` x the target's HP sweep on) →
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
animate only translate/rotate/scale, never filter). **Card effects
(0.183, the owner's picks from the Card Lab; tuning `cards.json`):**
`ui/cardFx.js` lights every card from behind — a slow fog, blood, flames,
embers or ether by the enemy's particle material (`cardStyle`: bone fog,
embers flames, the wraith ether, flesh blood; the boss flames, the knight
ether), the shrine's boons and the treasure chests each their own
(`SHRINE_STYLE` / `CHEST_STYLE`, through `shrineUI.js litCard`). ONE
WebGL context for the session draws every card in turn into a hidden
canvas and each card's own canvas takes its picture as an ImageBitmap
(a `bitmaprenderer` context; a `drawImage` into a small 2D canvas was a
GPU readback per card per frame, 0.00197; 2D stays as the fallback)
(`.card-fx`,
screen-blended over the frame's dark plate INSIDE the card's plate layer —
`.card-frame` / the panel's `.card-plate`, which carries the card's
see-through opacity, so the plate stays as transparent as the lab's
(0.195) — masked to the frame's window or a panel's rounded edge; a WebGL context per card would run the browser
out of them as rooms come and go). Drawn at `fx.scale` of the card's
pixels at `fx.fps`, dead cards frozen; off with the particles (flat
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
glint: `battleLine.js glint` is a second, bright copy of each portrait
masked to a band (`--band` on the unit; `.portrait.glint`) that
`fxParts.js glintSweep` sweeps across the figure on a hit and the
entrance. The benchmark draws all of it from 0.183 on (its numbers moved
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
motion. Frame rate: at most `maxPixels` (2.1M), redrawn at `maxFps` (30)
when nothing moves, and all session a device under `minFps` (22) steps
down — resolution x0.8, x0.64, no fog, flat (`core/bg3dQuality.js`;
`parallax.quality` = the window, the pause gap and how many slow
windows step down; a window is slow only against the rate the `maxFps`
throttle can reach on this screen, so a 40 Hz display is not punished —
0.00197). While a jolt, sway, flash or push plays the cap is
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
sound is one entry. Downloads go through `audioCore.fetchBytes`'s pool
(0.00197: two at a time, a sound about to play first — the beds, every
narrator take and the clip set used to start together at the title,
against the Descend essentials). Muting the music stops the bed and
frees its decoded buffer; the narrator's lines decode in the order they
were asked for (a death and the first-death line, a chest and its
relic). Combat lines go through `ui/combatSfx.js` (panned to the
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
line at a time: a second waits (`gapS`) or is dropped past `maxWaitS`;
every take levelled to `targetDb` through the effects bus, the music
ducking under it; no take twice in a row; NARRATOR: ON/OFF in the corner
column. Once-per-save lines (victory, first death) are gated by their
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
unapproved. Edge caches: a re-rendered take keeps its filename, so players
may hear the old one for ~4 hours.

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
  `'active active-red'`. Its glow is a `::after` layer whose opacity
  animates (0.00197): never animate `box-shadow` or `filter` in a loop —
  that repaints every frame for as long as it is on screen; loops animate
  opacity / transform (the idle loops' translate / rotate / scale).
- Hotkeys (`core/hotkeys.js`): a dialog's key trap takes every key but
  F-keys and Tab (0.00197: a dialog used to swallow F5 and F12).
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
  there; panel scenes stay in px. Card size is `--card-h` (min of 50vh and
  what fits `--n` enemies); card internals are `em`. Card frame art on
  the card's `.card-frame` layer (opacity 0.85; 0.195: a real element,
  the shader light inside it); portraits overflow the frame;
  per-enemy tweaks via `enemy-<id>` classes.
- Phones and tablets (0.125, `shared/platform.js isMobile`) get a "Mobile
  platforms not supported yet" card and the boot stops; `?desktop` skips
  the check. Remove it when a portrait layout lands.
- Asset loading (`shared/preload.js`): boot waits for the title + Great
  Hall art only; the hub's Descend waits only for the essentials (shrine /
  death art, portraits); the 34 room paintings (0.153, ~13MB) keep
  loading behind — a room whose painting isn't in yet keeps the last one up.
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
- The boss's card is twice as wide (0.196, the owner's call): `.boss-card`
  aspect 826 / 1106, its frame a 9-slice of `card_enemy.png` (border-image,
  so corners and border keep their shape); `battleRoom.js BOSS_SLOTS`
  counts it as two enemy widths in the row's `--slots` (the `--card-h`
  budget), so the boss and its three summons (`maxAlive`) still fit
  without shrinking at 16:9. New boss art should suit a wide card.
- Enemy cards (0.155) attack on a click, exactly as their Attack button
  would and only while it could (`.targetable`).
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

## Testing notes

- `tools/smoke-test.mjs` runs `tools/test/*.test.mjs` (by area: scenes,
  combat, shrines, progression, content, backgrounds, audio, sim, history,
  narration, art, cards),
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
  `origin/main`. The last working branches, `claude/busy-hawking-blufll`
  (cleanup, fog) and `claude/sweet-franklin-bwkdsh` (voice-over), both
  end on `main` at 0.170. Treat them as finished: use the branch the new
  session is given.
- Ship with `node tools/ship.mjs --note "..."` (rule 6): it is the
  bump-suite-fetch-merge-push loop with the collision handling two
  threads need. No PRs unless the owner asks. **Two sessions may ship at
  once** (0.161–0.195 came from two threads; 0.182, 0.193 and 0.194 were
  each taken twice): never pick a build number by hand, and read the
  suite's exit code, never its last line through a pipe.

## State at handover (0.00197)

- Live: the card effects from the Card Lab (0.183–0.195: a glow behind
  every portrait by material, the cards in 3D, the glint, see-through
  plates), the room push and swoosh (0.171–0.178), the Old Wizard
  (0.161–0.188), the Fog Lab's living mist (0.164–0.169), treasure rooms,
  the Art Lab's redrawn portraits (0.186–0.194, the other thread; four
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
- Left as found: `icon.png` (374KB) at the root referenced by nothing;
  the `fog-lab/`, `particle-lab/`, `vo-lab/` forwarding stubs;
  `wrangler.jsonc` + `.assetsignore` (the unused Workers path);
  `assets/chars/candidates` (12.6MB) and `assets/style` (9MB) are
  lab-only art no player fetches but every clone and deploy carries (an
  Actions deploy could exclude them); the Particle Lab is a standalone
  copy of the pre-0.128 looks; four portraits weigh 200-260KB (content,
  not quality: re-encoding saved 3%).

## Backlog (as of 0.00197)

- Voice-over: a NARRATOR volume slider if players ask · the ElevenLabs
  key is the owner's (quota per key) · a dropped line (queued past
  `maxWaitS`) still spends its once-per rule.
- Game: merchant room (endgame coin sink) · more bosses (only the Vampire
  Lord; `boss.enemy` is data now) · the room-24 boss is a wall (~5% clear
  in the simulator) and meta saturates past ~60 runs — deeper tiers or
  NG+ (then move `finalBossRoom`) · thorns relic is a flat 4 damage, weak
  against scaled enemy HP · more room kinds · portrait / phone layout
  (then drop the mobile notice) · the reliquary's revive is not narrated
  · treasure rooms are not in the play stats.
- Engineering: rename the `smash` combat event to `overkill` (engine,
  sound keys, narration ids and the script disagree on the name) · the
  mute pattern is copied in music / sfx / narrator (`shared/prefs.js
  mutePref`) · `go()` is silently dropped during a transition (queue it)
  · `hubScene.render` is ~150 lines · seed the two unseeded fight tests
  (`withSeed` from `simCore.mjs`) · ~75 checks assert on source text
  rather than behaviour (inject recording stubs instead) · `fresh()` does
  not restore `DATA` after a test patches it · the Actions deploy job
  (off until the owner opts in) should exclude `assets/chars/candidates`,
  `assets/style`, `tools`, `docs`, `collector` · font as WOFF2 (212KB
  TTF) · the Particle Lab can go once nobody is experimenting with looks.
- Other: check the DIN Condensed web-embedding licence (macOS system font)
  · orphaned legacy staging site cleanup.

**Tried and removed:** 3D exploration (0.139–0.151): a three.js Dungeon
Lab (generated floors, themed rooms, the game's fights in them) and a
`?debug` mode walking 3D corridors between the game's rooms. The owner
dropped it in 0.152 — it didn't fit the creative direction; the game is
back to its 0.138 shape. The code is in git history (0.151, `6081e7a`).

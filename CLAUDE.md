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
- **Fog Lab (0.164):** `fog-lab/`, from the `?debug` column — the game's real
  3D renderer on every painting with every fog knob as a live slider,
  presets, the flash lights on demand, and COPY JSON for a `parallax`
  patch (see "3D backgrounds").
- **VO Lab:** `vo-lab/`, same column (VO LAB) — every narrator take with its
  text, when it plays and how often; Play / Approve / Disapprove (+
  volatility and shouty nudges); RE-RENDER gives a JSON for
  `node tools/gen-vo.mjs --rerender` (see "Audio").
- **Staging (legacy):** ublgmuyncizrq.kimi.page, published by the owner from
  Kimi version cards — not maintained here.

## Quick start

```bash
python3 -m http.server 8000                  # repo root -> http://localhost:8000
node tools/smoke-test.mjs                    # the suite: ~630 checks, under a second
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
   line (a smoke check also greps `src/` for `.knob ?? N`). What stays in
   `src/`: the look — animation durations, shader constants, synth
   instrument definitions.
3. **Save format changes go through `SAVE_VERSION`** (`meta/migrations.js`,
   now 4): bump it and append a step to `MIGRATIONS` — never edit a shipped
   step. New defaults: `DEFAULTS` / `freshProfile()` in `meta/profile.js`.
4. **Loot (0.091):** a drop that can't beat the gear (as it will be after
   this run's finds, `run.gearPreview`) is salvaged on the spot; only
   upgrades land in `run.itemsFound` — one path, `run/loot.js takeItem`,
   for kill loot and treasure chests (the Heart's revive is one too:
   `runState.tryRevive`). One shrine per stretch of `bossEvery`
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
`parallax.haze` = the distance haze's shape. 0.166: the shipped base is
the lab's Rolling Mist with the owner's drift 3.5 and haze 0.38 / curve
1.55, and every painting has its own `fog` + `fogWind` override
(outdoors and the large halls a notch windier; the wander goes in before
the box wrap, so a wrap never pops); `setLiveTuning` re-rolls a layer's
puffs when its block changes (same seed: no jump). The lab never writes
the game's saved tuning (`castle-bg-tuning`): it keeps its own key.
New room art: JPEG in `assets/bg/`, entries in
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
**Voice-over** (0.161, `audio/narrator.js`): the Old Wizard, a chronicler
who never shouts — the script is `docs/narration-script.md` (32 lines,
four takes each), rendered with ElevenLabs by `tools/gen-vo.mjs` (voice
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
**Reviewing takes** (0.163): the VO Lab (`vo-lab/`) plays each take as the
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
  `'active active-red'`.
- Upper-right column (`ui/cornerToggles.js`): add buttons in main.js's
  `cornerBar([...])` with `onOffToggle` / `panelToggle`; the `?debug` tools
  (INVULNERABLE, background views and tuning, FORCE CRITS, PARTICLE LAB, FOG LAB,
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
  `.char-card::before` (opacity 0.85); portraits overflow the frame;
  per-enemy tweaks via `enemy-<id>` classes.
- Phones and tablets (0.125, `shared/platform.js isMobile`) get a "Mobile
  platforms not supported yet" card and the boot stops; `?desktop` skips
  the check. Remove it when a portrait layout lands.
- Asset loading (`shared/preload.js`): boot waits for the title + Great
  Hall art only; the hub's Descend waits only for the essentials (shrine /
  death art, portraits); the 34 room paintings (0.153, ~13MB) keep
  loading behind — a room whose painting isn't in yet keeps the last one up.
- Treasure rooms (0.155, `run/treasure.js` + `ui/treasureUI.js`, tuning
  `difficulty.json treasure`): a run gets one with `chance` (30%) once the
  save's best room reaches `unlockRoom` (5; silent), at a room in reach
  (`minRoom`..best room, no boss rooms; the stretch's shrine steps aside);
  painted from `backgrounds.json treasure`. Three chests, open one: Iron
  Coffer (coins worth `coffer.fights` fights at that depth), Gilded Chest
  (one item of the depth's tier, made for a slot it improves, else
  salvaged), Sealed Reliquary (`hpCost` 20% of max HP as damage — it can
  kill, `killedBy: 'reliquary'`; inside, a relic with `relicChance` from
  t4MinRoom, one per run, else a tier-3 item). Shares the shrine's panel
  (`shrineUI.js renderPanelRoom`); the sim's bot opens the gilded chest.
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
  combat, shrines, progression, content, backgrounds, audio, sim, history),
  each starting from `fresh()`. `tools/test/harness.mjs` holds the DOM shim
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
the right list (`rooms` / `bosses` / `treasure`), `git rm` the PNGs, check a
few in the game, bump, ship. The upload lands outside the working branch
sometimes — fetch all branches to find it.

## Starting a new session (repo and branches)

- Repo: **https://github.com/pjarvilehto/CastleoftheCrimsonMoon** (`main` =
  the live site; everything shipped is there).
- Start from the latest `main`: `git fetch origin main` and branch from
  `origin/main`. The last working branch, `claude/sweet-franklin-bwkdsh`,
  is identical to `main` at 0.161. Treat it as finished: use the branch
  the new session is given.
- Ship as before: bump, suite green, push to `main` and to the session's
  working branch. No PRs unless the owner asks.

## State at handover (0.161)

- Live: the Old Wizard voice-over (0.161, 122 takes), treasure rooms
  (0.155), click-to-attack, 35 fight paintings + 4 throne rooms + 6
  treasure rooms, no repeats in a run, ordered transitions.
- 0.157 was a cleanup pass over the whole project (four audits, every
  file read): no new content. Fixed on the way: a reliquary death left
  the room's buttons live under YOU DIED; Export Save read localStorage
  (stale when a write was refused); the balance bot ignored `--tactic`
  in single-seed mode; the 3D renderer leaked its GL context when the
  quality ladder stepped down to flat, and the camera lurched after a
  hidden tab; a bad strike-layer name played a crit ring. The sim output
  is byte-identical to 0.156.
- Not yet heard in a real browser session: the narrator's level against the
  music and hits (`audio.json narration.targetDb`, -11: just over the hits)
  and the room-entry delay against the painting's fade — tune by ear.
- Not yet browser-checked: a boss fight in the new throne rooms (tests cover
  the pick). Treasure rooms aren't in the play stats yet (no history field —
  a candidate: which chest, what it gave; the collector would need it too).
- Open ideas the owner floated: a mimic chest (needs enemy art).
- Left as found (owner's call): `icon.png` (374KB) at the root is
  referenced by nothing (the master art? move it out of the site root or
  delete); the Particle Lab's "current" style is the pre-0.128 burst and
  the lab is out of step with `particleLooks.js`; `collector/worker.js`
  could cache `/players` and send `access-control-max-age` (a redeploy —
  not done here); the nine test files share one long copy-pasted import
  line; the shipped v1→v2 migration keeps its `?? N` copies (rule 3).

## Backlog (as of 0.161)

- Voice-over: a few more takes per frequent line (OVERKILL, room cleared)
  so the wizard repeats less on long sessions · a NARRATOR volume slider if
  players ask · the ElevenLabs key is the owner's (quota per key).
- Game: merchant room (endgame coin sink) · more bosses (only the Vampire
  Lord) · the room-24 boss is a wall (~5% clear in the simulator) and meta
  saturates past ~60 runs — deeper tiers or NG+ (then move `finalBossRoom`)
  · thorns relic is a flat 4 damage, weak against scaled enemy HP · more
  room kinds · portrait / phone layout (then drop the mobile notice).
- Engineering: deploy through the test workflow once the HTTPS setup is
  settled · font as WOFF2 (212KB TTF) · the Particle Lab can go once nobody
  is experimenting with looks.
- Other: check the DIN Condensed web-embedding licence (macOS system font)
  · orphaned legacy staging site cleanup.

**Tried and removed:** 3D exploration (0.139–0.151): a three.js Dungeon
Lab (generated floors, themed rooms, the game's fights in them) and a
`?debug` mode walking 3D corridors between the game's rooms. The owner
dropped it in 0.152 — it didn't fit the creative direction; the game is
back to its 0.138 shape. The code is in git history (0.151, `6081e7a`).

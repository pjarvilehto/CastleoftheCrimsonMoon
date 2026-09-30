# CLAUDE.md — Context notes for AI assistants

**Castle of the Crimson Moon** — a gothic roguelite browser game. Vanilla JS
ES modules, **no framework, no build step**. DOM-based UI over full-screen
painted backgrounds; DIN Condensed Bold via @font-face. You play as The
Curious Knight pushing deeper into a castle: card-based combat rooms, one
shrine per run, a boss every 8 rooms, and meta progression (training,
alchemy, forge) in the hub between runs.

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
- `ARCHITECTURE.md` = full code map, data flow, keyboard map, conventions.
  Read it before making structural changes.

## Quick start

```bash
python3 -m http.server 8000     # from the repo root, open http://localhost:8000
node tools/smoke-test.mjs       # DOM-shim test suite: expect 168–169 checks green
node tools/simulate.mjs --runs 40 --seed 1   # headless balance bot
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
   card text in sync with them).
6. **Save format changes go through `SAVE_VERSION`** (`meta/profile.js`,
   0.079): bump it and append a step to `MIGRATIONS` — never edit a
   shipped step.
3. **Potions persist** (0.080): a run draws the profile's stock and
   `settleRun()` writes back what's left, capped by `potionCap`; pickups
   go through `runState.addPotion()` (sold when the satchel is full).
   **`run.stats` is a snapshot** taken at run start. Mid-run loot does
   nothing until `settleRun()` auto-equips it into the profile.
4. **Bump the build with `node tools/bump.mjs 0.0NN`** for every
   player-facing change (writes version + module list into
   `assets/data/build.json`), and run the smoke suite before pushing.
   index.html loads CSS/JS under `?v=<version>` from that list (0.082), so
   a deploy can't leave players on a mix of old and new files.
5. **Never replace an asset file in place** (edge caches hold ~4 hours) —
   new content = new filename.

## Architecture in one paragraph

`src/main.js` boots: load all data JSONs into a `DATA` singleton →
preload/decode all art → title scene. `src/core/scene.js` is the scene
manager (`show()`, transitions, background crossfader, the `el()` DOM helper,
hotkey dispatch). `src/meta/` is persistent profile state (localStorage,
save schema v1 + migration, export/import base64 save codes on the title
screen). `src/run/` is per-dungeon state (room generation with threat
budgets, combat core with heavy-attack multi-kill spill, shrine boons,
loot). `src/ui/` renders it — combat is a chromeless fluid card layout
(`vh/vw`, cards 50vh tall), panel scenes use tuned px. `src/audio/` has the
music beds and SFX (gesture-gated AudioContext).

## Testing notes

- The smoke suite uses a custom DOM shim (`El` class) with deliberate
  limits: no `appendChild`/`querySelector` on elements, `match()` supports
  only hardcoded selectors, `children` is read-only. Click =
  `el.listeners.click[0]()` or `handleKey()`.
- Check count varies 168/169 run-to-run (one assertion only runs when the
  T4 fixture run dies — RNG). A flake gets one rerun; a repeat is real.
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

- New enemy → `enemies.json` (tier 1–3) + `assets/chars/<id>.webp` (alpha, q85 — 0.078); room
  generation, scaling, LV naming, and the card portrait pick it up.
- New item → `items.json` with slot + tier; loot/equipment/salvage follow.
- New shrine boon → `shrines.json` + matching case in `run/shrine.js`.
- New room background → JPEG into `assets/bg/` + entries in
  `backgrounds.json` (`rooms` and `roomNames`) + its depth map:
  `python3 tools/gen-depth.py <model.onnx> new.jpg` (setup in the script's
  header; the smoke suite fails if a background has no depth map).
- 3D backgrounds (0.083, `src/core/bg3d.js`): the art sits on a depth-
  displaced mesh with a slowly swaying camera. Tune in `backgrounds.json`
  `parallax` (per-file `overrides`); `enabled: false` is the kill switch.
  Falls back to the flat CSS backgrounds with no WebGL, software-only GL,
  <20fps in the first 4s, context loss, or prefers-reduced-motion. If you
  raise the sway/depth, the smoke suite's coverage check says when
  `overscan` must grow too.
- `?debug` also adds HIDE FOREGROUND, BG VIEW (3D / FLAT / DEPTH),
  NEXT BG and BG TUNING (0.084: live sliders for depth/speed/sway/focus;
  "Save Depth Settings" stores them in that browser's localStorage and
  copies JSON — when the owner sends that JSON, put the values into
  `backgrounds.json` `parallax` to make them the default for everyone).
  The skirt (overscan) now grows automatically for larger sway.
- Keep files under ~300 lines; one responsibility per file.
- Every keyboard-reachable button gets `key: 'x'` in `el()`.
- The obvious next button gets the **'active'** state: `class: 'active'`
  (pulsing yellow) or `'active active-red'` (pulsing red) — 0.079.
- `?debug` in the URL shows the INVULNERABLE toggle (hidden otherwise).
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

## Backlog (as of 0.078)

Merchant room
(would fix the endgame coin-sink) · boss variety · more room kinds · music
loop variations · endgame content ceiling (meta saturates past ~60 trained
runs; needs deeper tiers or prestige/NG+) · orphaned legacy staging site
cleanup · portrait-phone layout.

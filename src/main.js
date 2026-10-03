// main.js — entry point: boot loader (data + the first screens' art,
// fully decoded), stamp build number, show title, then load the rest of
// the art in the background (0.098). The loader exists because art only
// starts loading when first rendered — without preloading, backgrounds
// and portraits painted half-drawn on first view.

import { onBackgroundChange, onTransition, go, currentScene } from './core/scene.js';
import { el } from './core/dom.js';
import { initHotkeys } from './core/hotkeys.js';
import { warmCardFx } from './ui/cardFx.js';
import { initBg3d, showBackground3d, bgPush, setPowerSaver, powerSaver } from './core/bg3d.js';
import { setCardFxSaver } from './ui/cardFx.js';
import { getPref, setPref } from './shared/prefs.js';
import { volumeToggle } from './ui/volumePanel.js';
import { changelogToggle } from './ui/changelog.js';
import { exportSaveToggle, importSaveToggle } from './ui/saveTransfer.js';
import { cornerBar, onOffToggle, menuHead } from './ui/cornerToggles.js';
import { debugMenu, debugModeOn, debugFromUrl } from './ui/debugToggles.js';
import { loadData, DATA } from './shared/data.js';
import { preloadAssets, preloadRest } from './shared/preload.js';
import './ui/scenes/index.js'; // registers the scenes with the router
import { initMusic, isMuted, toggleMuted } from './audio/music.js';
import { initSfx, sfx, transitionSfx, isMuted as sfxMuted, toggleMuted as toggleSfx } from './audio/sfx.js';
import { initNarrator, isNarratorMuted, toggleNarrator, armOnGesture } from './audio/narrator.js';
import { initUpdateCheck } from './ui/updatePrompt.js';
import { shareStats } from './meta/telemetry.js';
import { getProfile } from './meta/profile.js';
import { isPhone, watchPhoneLayout, fullscreenOn, enterFullscreen, exitFullscreen } from './shared/platform.js';
import { phoneGate, regateOnExit } from './ui/phoneGate.js';
import { preloadIntro, introReady, introPending } from './ui/titleIntro.js';
import { ensureCtx } from './audio/audioCore.js';

const SAVER_KEY = 'castle-power-saver'; // BATTERY SAVER (0.00222), this browser's choice

async function boot() {
  // The display font is a lazily-fetched @font-face (font-display: swap) —
  // without gating on it, the loader and title painted in a fallback font,
  // then visibly flipped. The <link rel=preload> in index.html starts the
  // fetch at parse time; here we just await it (capped, so a failed fetch
  // can never hang boot).
  const fontReady = (document.fonts?.load('32px "D-DIN Condensed"', 'C') ?? Promise.resolve()).catch(() => {});
  await Promise.race([fontReady, new Promise((r) => setTimeout(r, 800))]);
  // Render the loader directly (not via show()) — there is nothing to
  // fade out from yet, and #app starts hidden in index.html.
  const app = document.getElementById('app');
  app.classList.remove('hidden');
  watchPhoneLayout(() => currentScene()?.relayout?.(app)); // <html class="phone"> while platform.js PHONE_MQ matches: styles.css section 16 (0.00209); scenes may offer relayout(root) — the Great Hall does, its phone assembly is a different DOM
  // Handhelds play sideways (0.00205 tablets, 0.00208 phones): a device held
  // upright gets styles.css .rotate-notice over everything.
  document.body.append(el('div', { class: 'rotate-notice' }, el('div', { class: 'panel' }, el('h1', {}, 'Turn your device sideways'), el('p', { class: 'mobile-sub' }, 'The castle is played in landscape.'))));
  const fill = el('div', { class: 'loader-fill' });
  const pct = el('div', { class: 'subtitle loader-pct' }, '0%');
  app.append(el('div', { class: 'panel loader' },
    el('h1', {}, 'CASTLE OF THE CRIMSON MOON'),
    el('div', { class: 'subtitle' }, 'Gathering the castle’s shadows…'),
    el('div', { class: 'loader-track' }, fill),
    pct));

  await loadData();
  preloadIntro(); // the title's fly-in (0.00307): its film is fetched beside the art
  await preloadAssets((loaded, total) => {
    const p = Math.round((loaded / total) * 100);
    fill.style.width = `${p}%`;
    pct.textContent = `${p}%`;
  });

  await fontReady; // images took seconds — the font is long done, this is free
  initHotkeys();
  const tag = document.createElement('div');
  tag.className = 'build-tag';
  tag.textContent = `build v${DATA.build.version}`;
  // The upper-right corner (ui/cornerToggles.js, 0.115): the SETTINGS menu
  // in groups since 0.00243, FULLSCREEN beside it as an icon, DEBUG MODE
  // last — ON shows the testing tools (ui/debugToggles.js; ?debug turns it
  // on for the visit, else this browser remembers the choice).
  const dbg = debugMenu();
  document.body.append(tag, cornerBar([
    menuHead('Audio'),
    onOffToggle('MUSIC', { cls: 'music-toggle', get: () => !isMuted(), flip: () => !toggleMuted() }),
    onOffToggle('SOUND', { cls: 'sfx-toggle', get: () => !sfxMuted(), flip: () => !toggleSfx() }),
    onOffToggle('NARRATOR', { cls: 'vo-toggle', get: () => !isNarratorMuted(), flip: () => !toggleNarrator() }), // the Old Wizard (0.161)
    volumeToggle(),
    menuHead('Display'),
    onOffToggle('BATTERY SAVER', { cls: 'saver-toggle', get: powerSaver, flip: () => { const on = !powerSaver(); setPowerSaver(on); setCardFxSaver(on); setPref(SAVER_KEY, on ? '1' : '0'); return on; } }), // (0.00222: the smallest canvas, no mist, the card light at saverFps — the player's choice, never automatic)
    menuHead('Game'),
    exportSaveToggle(),
    importSaveToggle(() => go('title')), // (0.00302: from the title's foot; a loaded save starts again at the title)
    changelogToggle(),
    dbg.toggle,
    ...dbg.items,
  ], [!isPhone() && fullscreenToggle()])); // (a phone: the gate is the way to the full screen; iPhone has none, and on Android OFF would only bring the gate back)
  dbg.apply(debugModeOn());
  // Living 3D backgrounds (0.083). Software-rendered GL is allowed only
  // under ?debug in the address (headless testing); real players on a
  // GPU-less machine, or with reduced motion requested, keep the flat CSS
  // backgrounds.
  if (initBg3d({ allowSoftware: debugFromUrl() })) { onBackgroundChange(showBackground3d); warmCardFx(); } // (0.00222: the card light's shader compiles behind the title, not in the first fight's transition)
  if (getPref(SAVER_KEY) === '1') { setPowerSaver(true); setCardFxSaver(true); } // remembered from the last visit (0.00222)
  // Every transition (0.171/0.173): the swoosh, timed to land mid-way, and the camera's push through the picture.
  onTransition(() => { if (!introPending()) transitionSfx(); bgPush(); }); // (0.00310: the boot's own transition leaves the whoosh to the fly-in about to play — two a second apart otherwise)
  // Every button in the game clicks (delegated, so dynamically rendered
  // scenes need no per-button wiring).
  document.addEventListener?.('click', (e) => {
    if (e.target?.closest?.('button')) sfx('click');
  });
  initMusic();
  initSfx();
  initNarrator();
  initUpdateCheck(); // "Build 0.0NN available" prompt (0.094)
  // A phone in a browser tab (0.00208): PLAY (full screen and landscape where
  // the browser allows), INSTALL where it offers, before the title.
  if (isPhone()) {
    armOnGesture('title_welcome'); // the gate's tap is the session's first gesture (the title arms it too, for everyone else)
    await phoneGate({ onPlay: () => ensureCtx()?.resume?.().catch?.(() => {}) }); // a touch activates on the tap's end: resume the context in the gesture itself
    regateOnExit();
  }
  await introReady(); // the fly-in's film (0.00307): up to intro.waitMs for it — on a phone after the PLAY tap (0.00311), the wait used to run before the gate — else the title shows as it always has
  go('title');
  preloadRest(); // dungeon art, in the background (0.098; the hub's Descend waits for it)
  shareStats(getProfile()); // play stats: history from before this session too (0.102)
}

// FULLSCREEN: the label tracks the real state — Esc/F11 also exit
// fullscreen without this button.
// FULLSCREEN (0.069; an icon beside SETTINGS since 0.00243): four corners
// pointing out, or in while the page is full screen.
const FS_ICON = { off: 'M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4', on: 'M5 1v4H1M15 5h-4V1M11 15v-4h4M1 11h4v4' };
function fullscreenToggle() {
  const draw = () => {
    const on = fullscreenOn();
    btn.classList.toggle('on', on);
    btn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${on ? FS_ICON.on : FS_ICON.off}"/></svg>`;
  };
  const btn = el('button', {
    class: 'debug-toggle fs-toggle', 'aria-label': 'Fullscreen', title: 'Fullscreen',
    onclick: () => { (fullscreenOn() ? exitFullscreen() : enterFullscreen()).finally(draw); }, // (platform.js: Safari's prefixed names too — iPad Safari has them)
  });
  btn.sync = draw;
  draw();
  document.addEventListener?.('fullscreenchange', () => btn.sync());
  document.addEventListener?.('webkitfullscreenchange', () => btn.sync());
  return btn;
}

boot().catch((e) => { // a failed data or art fetch: say so, and a tap reloads (the home-screen app has no reload button)
  console.error(e);
  const pct = document.querySelector('.loader-pct');
  if (pct) pct.textContent = 'The castle could not load — tap to try again.';
  document.addEventListener?.('click', () => globalThis.location?.reload(), { once: true });
});

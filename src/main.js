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
import { cornerBar, onOffToggle } from './ui/cornerToggles.js';
import { debugToggles, invulnerableToggle } from './ui/debugToggles.js';
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
  // The upper-right column (ui/cornerToggles.js, 0.115). ?debug in the URL
  // (0.079) adds the testing tools; players never see them.
  const debugMode = new URLSearchParams(globalThis.location?.search ?? '').has('debug');
  if (debugMode) document.body.classList.add('debug');
  document.body.append(tag, cornerBar([
    debugMode && invulnerableToggle(),
    onOffToggle('MUSIC', { cls: 'music-toggle', get: () => !isMuted(), flip: () => !toggleMuted() }),
    !isPhone() && fullscreenToggle(), // (a phone: the gate is the way to the full screen; iPhone has none, and on Android OFF would only bring the gate back)
    onOffToggle('SOUND', { cls: 'sfx-toggle', get: () => !sfxMuted(), flip: () => !toggleSfx() }),
    onOffToggle('NARRATOR', { cls: 'vo-toggle', get: () => !isNarratorMuted(), flip: () => !toggleNarrator() }), // the Old Wizard (0.161)
    onOffToggle('BATTERY SAVER', { cls: 'saver-toggle', get: powerSaver, flip: () => { const on = !powerSaver(); setPowerSaver(on); setCardFxSaver(on); setPref(SAVER_KEY, on ? '1' : '0'); return on; } }), // (0.00222: the smallest canvas, no mist, the card light at saverFps — the player's choice, never automatic)
    volumeToggle(),
    changelogToggle(),
    ...(debugMode ? debugToggles() : []),
  ]));
  // Living 3D backgrounds (0.083). Software-rendered GL is allowed only
  // under ?debug (headless testing); real players on a GPU-less machine,
  // or with reduced motion requested, keep the flat CSS backgrounds.
  if (initBg3d({ allowSoftware: debugMode })) { onBackgroundChange(showBackground3d); warmCardFx(); } // (0.00222: the card light's shader compiles behind the title, not in the first fight's transition)
  if (getPref(SAVER_KEY) === '1') { setPowerSaver(true); setCardFxSaver(true); } // remembered from the last visit (0.00222)
  // Every transition (0.171/0.173): the swoosh, timed to land mid-way, and the camera's push through the picture.
  onTransition(() => { transitionSfx(); bgPush(); });
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
  go('title');
  preloadRest(); // dungeon art, in the background (0.098; the hub's Descend waits for it)
  shareStats(getProfile()); // play stats: history from before this session too (0.102)
}

// FULLSCREEN: the label tracks the real state — Esc/F11 also exit
// fullscreen without this button.
function fullscreenToggle() {
  const btn = onOffToggle('FULLSCREEN', {
    cls: 'fs-toggle',
    get: () => fullscreenOn(),
    flip: () => { // (platform.js: Safari's prefixed names too — iPad Safari has them)
      (fullscreenOn() ? exitFullscreen() : enterFullscreen()).finally(() => btn.sync());
      return fullscreenOn();
    },
  });
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

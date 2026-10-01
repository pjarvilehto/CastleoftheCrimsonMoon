// core/scene.js — scene manager, transitions, background crossfader, and
// the scene router (0.117). Scenes are objects with enter(el). 0.117: the
// el() DOM builder lives in core/dom.js and hotkeys + dialog key traps in
// core/hotkeys.js.
//
// Transition model (timings in styles.css, #app / .bg-layer):
//   - Scene switches and room changes go through transitionTo(): windows
//     fade OUT (1s), content/background swap, the new painting fully in
//     (0.154), windows fade IN (1s).
//   - Background changes crossfade between two stacked layers (2s), or
//     through the 3D renderer's own crossfade when it runs.
//   - The very first background appears instantly (windows fade in over it).
//   - Re-renders WITHIN a scene (combat updates, hub training) stay instant.

const app = () => document.getElementById('app');

let current = null;
let activeBg = null;   // the bg-layer element currently opaque
let transitioning = false; // re-entry guard (rapid keys during a fade)
let bgListener = null;     // the 3D background renderer, when running (0.083)
let bgShown = null;        // the latest background change, resolved once fully faded in (0.154)
let bgChanges = 0;         // how many there have been (did work() change it?)
const BG_WAIT_MAX_MS = 4000; // never hold the windows longer than this for a painting (a slow load)
const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let sceneListener = null;  // the update check (0.094): told after every scene switch

// Tell a listener (core/bg3d.js) about every background change; it is
// told the current one immediately.
export function onBackgroundChange(fn) {
  bgListener = fn;
  if (activeBg) fn(activeBg.dataset.file);
}

export function show(scene) {
  transitionTo(() => {
    const el = app();
    el.innerHTML = '';
    current = scene;
    scene.enter(el);
    sceneListener?.(scene);
  });
}

// The scene on screen, and a listener for scene switches (0.094: the
// update prompt waits for a run to end — scenes mid-run set inRun).
export const currentScene = () => current;
export function onSceneChange(fn) { sceneListener = fn; }
// Mid-fade: the outgoing scene is still in the DOM (hotkeys.js ignores keys).
export const isTransitioning = () => transitioning;

// The router (0.117): scenes switch by name — go('hub'), go('runEnd', run,
// outcome) — instead of importing each other (title <-> hub, hub ->
// dungeon -> run end -> hub was an import cycle). ui/scenes/index.js
// registers the four scenes.
const scenes = {};
export function registerScene(name, factory) { scenes[name] = factory; }
export function go(name, ...args) {
  if (!scenes[name]) throw new Error(`unknown scene: ${name}`);
  show(scenes[name](...args));
}

// Fade the windows out, run `work()` (swap content and/or background),
// then fade the windows back in. Ignored if a transition is already
// running — this is what makes rapid hotkey presses safe.
// 0.154 (the owner's call): strictly in order — the windows fade out
// fully before the background changes, and when work() changed it, the
// windows come back only once the new painting has fully faded in (keys
// stay ignored meanwhile: isTransitioning()).
export function transitionTo(work, fadeOutMs = 1000) {
  if (transitioning) return;
  transitioning = true;
  const el = app();
  el.classList.add('hidden');
  setTimeout(async () => {
    const changes = bgChanges;
    try {
      work();
      if (bgChanges !== changes) await Promise.race([bgShown, later(BG_WAIT_MAX_MS)]);
    } finally {
      // Never leave the UI stuck hidden / the guard latched, even if
      // the scene's render throws mid-transition.
      void el.offsetWidth; // reflow, so the fade-in animates reliably
      el.classList.remove('hidden');
      transitioning = false;
    }
  }, fadeOutMs);
}

// Crossfade between the two stacked background layers. Same file = no-op.
// First background ever: instant (the windows fade in over it). Returns a
// promise that resolves once the new painting is fully in (0.154): the 3D
// renderer's crossfade when it runs, else the CSS layer's own fade, each
// after the image has loaded.
export function setBackground(file) {
  const a = document.getElementById('bg0');
  const b = document.getElementById('bg1');
  const url = `url("assets/bg/${file}")`;
  if (activeBg && activeBg.dataset.file === file) return Promise.resolve();
  const next = activeBg === a ? b : a;
  next.dataset.file = file;
  if (!activeBg) {
    next.style.transition = 'none';
    next.style.backgroundImage = url;
    next.style.opacity = '1';
    void next.offsetWidth;
    next.style.transition = '';
  } else {
    next.style.backgroundImage = url;
    next.style.opacity = '1';
    activeBg.style.opacity = '0';
  }
  activeBg = next;
  bgChanges++;
  bgShown = Promise.resolve(bgListener ? bgListener(file) : cssFaded(next, file)).catch(() => {});
  return bgShown;
}

// the CSS layer's crossfade: the image loaded, then its transition's length
function cssFaded(layer, file) {
  const css = globalThis.getComputedStyle?.(layer)?.transitionDuration ?? '0s';
  const ms = parseFloat(css) * (/ms/.test(css) ? 1 : 1000) || 0;
  const loaded = typeof Image === 'undefined' ? Promise.resolve() : new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = `assets/bg/${file}`;
  });
  return loaded.then(() => later(ms));
}

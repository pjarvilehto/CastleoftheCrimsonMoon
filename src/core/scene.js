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

import { el as build } from './dom.js'; // (dom.js imports nothing: no cycle)

const app = () => document.getElementById('app');

let current = null;
let activeBg = null;   // the bg-layer element currently opaque
let transitioning = false; // re-entry guard (rapid keys during a fade)
let bgListener = null;     // the 3D background renderer, when running (0.083)
// The 3D canvas is drawing over the CSS layers (bg3d.js marks #bg-stack
// .gl from its first frame to its shutdown): their push is skipped and
// styles.css hides them — they still get every painting, as the fallback
// the moment the renderer gives up (0.00197).
const glCovers = () => !!document.getElementById('bg-stack')?.classList?.contains('gl');
let bgShown = null;        // the latest background change, resolved once fully faded in (0.154)
let bgChanges = 0;         // how many there have been (did work() change it?)
const BG_WAIT_MAX_MS = 4000; // never hold the windows longer than this for a painting (a slow load)
const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let sceneListener = null;  // the update check (0.094): told after every scene switch
let transitionListener = null; // the 3D renderer's push (0.171): told as the windows start to fade

// Tell a listener (core/bg3d.js) about every background change; it is
// told the current one immediately.
export function onBackgroundChange(fn) {
  bgListener = fn;
  if (activeBg) fn(activeBg.dataset.file);
}

export function show(scene) {
  transitionTo(() => {
    const root = app();
    root.innerHTML = '';
    current = scene;
    // 0.00223: a scene whose enter() throws used to leave an empty, un-hidden
    // #app with no way forward — now a panel with a Reload button (the
    // home-screen app has no reload control of its own; main.js's boot
    // catch does the same)
    try { scene.enter(root); } catch (e) {
      console.error(e);
      root.innerHTML = '';
      root.append(build('div', { class: 'panel' }, build('h1', {}, 'Something went wrong'), build('button', { class: 'primary', proceed: true, onclick: () => globalThis.location?.reload?.() }, 'Reload')));
      return;
    }
    // the listener (the update prompt) is told once the new scene's windows
    // are back (0.00223: it fired 1 s into the fade, with the windows
    // hidden — the prompt opened over a black screen)
    whenWindowsBack().then(() => { if (current === scene) sceneListener?.(scene); });
  });
}

// The scene on screen, and a listener for scene switches (0.094: the
// update prompt waits for a run to end — scenes mid-run set inRun), told
// once the new scene's windows are back.
export const currentScene = () => current;
export function onSceneChange(fn) { sceneListener = fn; }
// Mid-fade: the outgoing scene is still in the DOM (hotkeys.js ignores its
// keys; a dialog keeps the keyboard, 0.00223).
export const isTransitioning = () => transitioning;

// The router (0.117): scenes switch by name — go('hub'), go('runEnd', run,
// outcome) — instead of importing each other (title <-> hub, hub ->
// dungeon -> run end -> hub was an import cycle). ui/scenes/index.js
// registers the scenes (title, hub, dungeon, run end, benchmark).
const scenes = {};
export function registerScene(name, factory) { scenes[name] = factory; }
export function go(name, ...args) {
  if (!scenes[name]) throw new Error(`unknown scene: ${name}`);
  const scene = scenes[name](...args);
  scene.name ??= name; // (0.00223: a scene knows its name — the ?debug BENCHMARK returns to where it was pressed; one shown by show() directly stays unnamed)
  show(scene);
}

// Fade the windows out, run `work()` (swap content and/or background),
// then fade the windows back in. Ignored if a transition is already
// running — this is what makes rapid hotkey presses safe.
// 0.154 (the owner's call): strictly in order — the windows fade out
// fully before the background changes, and when work() changed it, the
// windows come back only once the new painting has fully faded in (the
// scene's keys stay ignored meanwhile: isTransitioning(); a dialog's work).
// Told at the start of every transition (0.171): the background's push.
export function onTransition(fn) { transitionListener = fn; }

// Resolves once the current transition's windows are back (fading in);
// at once when none is under way. The dungeon deals its cards then (0.184):
// a room is rendered while the windows are fully out, so anything played
// at render time happens unseen.
let windowWaiters = [];
export const whenWindowsBack = () => (transitioning ? new Promise((resolve) => windowWaiters.push(resolve)) : Promise.resolve());

export function transitionTo(work, fadeOutMs = 1000) {
  if (transitioning) return;
  transitioning = true;
  const el = app();
  el.classList.add('hidden');
  // the push (0.171): the current painting starts moving as the windows
  // fade — the 3D renderer dollies in; the flat layer scales (styles.css)
  transitionListener?.(fadeOutMs);
  if (!glCovers()) activeBg?.classList.add('push'); // the flat fallback's push; under the live canvas it animated for nobody (0.00197)
  setTimeout(async () => {
    const changes = bgChanges;
    try {
      work();
      if (bgChanges !== changes) await Promise.race([bgShown, later(BG_WAIT_MAX_MS)]);
    } catch (e) { console.error(e); } finally {
      // Never leave the UI stuck hidden / the guard latched, even if
      // the scene's render throws mid-transition.
      void el.offsetWidth; // reflow, so the fade-in animates reliably
      el.classList.remove('hidden');
      transitioning = false;
      const waiting = windowWaiters; windowWaiters = [];
      for (const resolve of waiting) resolve();
    }
  }, fadeOutMs);
}

// Crossfade between the two stacked background layers. Same file = no-op.
// First background ever: instant (the windows fade in over it) — and its
// promise resolves at once on BOTH paths (0.00223: the CSS layer is painted
// under `transition: none`, so the stylesheet's 2 s was dead time holding
// the windows). Every later one returns a promise that resolves once the
// new painting is fully in (0.154): the 3D renderer's crossfade when it
// runs, else the CSS layer's own fade, each after the image has loaded.
export function setBackground(file) {
  const a = document.getElementById('bg0');
  const b = document.getElementById('bg1');
  const url = `url("assets/bg/${file}")`;
  if (activeBg && activeBg.dataset.file === file) return Promise.resolve();
  const first = !activeBg;
  const next = activeBg === a ? b : a;
  next.dataset.file = file;
  // the flat layer's push (0.171): the new painting appears pushed in and
  // settles (CSS transition) while the old one keeps pushing as it fades —
  // only when the layers are what the player sees (0.00197)
  if (!glCovers()) {
    next.classList.add('pushed'); next.classList.remove('push');
    void next.offsetWidth;
    next.classList.remove('pushed');
  }
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
  activeBg?.classList.remove('push'); // (the old layer: it is faded out; the class goes with it)
  activeBg = next;
  bgChanges++;
  bgShown = Promise.resolve(bgListener?.(file) ?? cssFaded(next, file, first)).catch(() => {}); // (0.00209: a shut-down renderer answers null and the CSS layer's own fade is waited for, as the strict order wants)
  return bgShown;
}

// the CSS layer's crossfade: the image loaded, then its transition's length (none for the first painting, shown instantly)
function cssFaded(layer, file, instant = false) {
  const css = globalThis.getComputedStyle?.(layer)?.transitionDuration ?? '0s';
  const ms = instant ? 0 : parseFloat(css) * (/ms/.test(css) ? 1 : 1000) || 0;
  const loaded = typeof Image === 'undefined' ? Promise.resolve() : new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = `assets/bg/${file}`;
  });
  return loaded.then(() => later(ms));
}

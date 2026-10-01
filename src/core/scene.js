// core/scene.js — scene manager, transitions, background crossfader, and
// the scene router (0.117). Scenes are objects with enter(el) and optional
// leave(). 0.117: the el() DOM builder lives in core/dom.js and hotkeys +
// dialog key traps in core/hotkeys.js.
//
// Transition model:
//   - Scene switches and room changes go through transitionTo(): windows
//     fade OUT (0.3s), content/background swap, windows fade IN (0.7s).
//   - Background changes crossfade between two stacked layers (0.3s).
//   - The very first background appears instantly (windows fade in over it).
//   - Re-renders WITHIN a scene (combat updates, hub training) stay instant.

const app = () => document.getElementById('app');

let current = null;
let activeBg = null;   // the bg-layer element currently opaque
let transitioning = false; // re-entry guard (rapid keys during a fade)
let bgListener = null;     // the 3D background renderer, when running (0.083)
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
export function transitionTo(work, fadeOutMs = 1000) {
  if (transitioning) return;
  transitioning = true;
  const el = app();
  el.classList.add('hidden');
  setTimeout(() => {
    try {
      work();
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
// First background ever: instant (the windows fade in over it), and so is
// an `instant` swap (0.148: the Dungeon Lab, while the paintings are
// hidden). Returns the listener's promise (bg3d: resolved once the new
// painting is up).
export function setBackground(file, { instant = false } = {}) {
  const a = document.getElementById('bg0');
  const b = document.getElementById('bg1');
  const url = `url("assets/bg/${file}")`;
  if (activeBg && activeBg.dataset.file === file) return undefined;
  const next = activeBg === a ? b : a;
  next.dataset.file = file;
  if (!activeBg || instant) {
    const both = [next, activeBg].filter(Boolean);
    for (const l of both) l.style.transition = 'none';
    next.style.backgroundImage = url;
    next.style.opacity = '1';
    if (activeBg) activeBg.style.opacity = '0';
    void next.offsetWidth;
    for (const l of both) l.style.transition = '';
  } else {
    next.style.backgroundImage = url;
    next.style.opacity = '1';
    activeBg.style.opacity = '0';
  }
  activeBg = next;
  return bgListener?.(file, { instant });
}

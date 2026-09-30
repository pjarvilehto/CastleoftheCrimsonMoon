// core/scene.js — scene manager, transitions, background crossfader.
// Scenes are objects with enter(el) and optional leave().
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

export function show(scene) {
  transitionTo(() => {
    const el = app();
    el.innerHTML = '';
    current = scene;
    scene.enter(el);
  });
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
// First background ever: instant (the windows fade in over it).
export function setBackground(file) {
  const a = document.getElementById('bg0');
  const b = document.getElementById('bg1');
  const url = `url("assets/bg/${file}")`;
  if (activeBg && activeBg.dataset.file === file) return;
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
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue; // boolean attrs: false/absent = not set
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'key') node.setAttribute('data-key', String(v).toLowerCase());
    // Secondary hotkey (e.g. Space for Push Deeper). No label underline —
    // it's a hidden convenience binding, not advertised on the button.
    else if (k === 'key2') node.setAttribute('data-key2', String(v).toLowerCase());
    else node.setAttribute(k, v === true ? '' : v);
  }
  // Hotkey affordance: underline the first occurrence of the key letter
  // in the label (e.g. "<u>A</u>ttack").
  if (attrs.key) {
    const k = String(attrs.key).toLowerCase();
    for (let i = 0; i < children.length; i++) {
      if (typeof children[i] === 'string') {
        const idx = children[i].toLowerCase().indexOf(k);
        if (idx !== -1) {
          const s = children[i];
          children.splice(i, 1,
            s.slice(0, idx),
            el('u', {}, s.slice(idx, idx + 1)),
            s.slice(idx + 1));
          break;
        }
      }
    }
  }
  const content = children.flat();
  if (tag === 'button') {
    // Buttons are flex-centered (styles.css), and flex trims whitespace
    // around anonymous text items — the underline splice splits "Drink
    // Potion" into "Drink " + <u>p</u> + "otion", losing the space
    // ("DRINKPOTION", 0.050). A span wrapper keeps the label one inline
    // context where the space survives.
    node.append(el('span', { class: 'btn-label' }, ...content));
    return node;
  }
  for (const child of content) {
    if (child === null || child === undefined || child === false) continue; // conditional children
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

// ---- keyboard shortcuts ----
// Buttons opt in with `key: 'x'` in el(); pressing the letter clicks the
// FIRST enabled matching button. Enter clicks the primary button.
// Registered once from main.js.

export function handleKey(key) {
  const k = key.toLowerCase();
  if (k === 'enter') {
    const primary = document.querySelector('button.primary:not([disabled])');
    if (primary) { primary.click(); return true; }
    return false;
  }
  // Space is a secondary binding (data-key2) — currently Push Deeper in
  // the dungeon. Deliberately NOT a primary key: space does nothing in
  // the hub, so an idle tap can't start a run.
  if (k === ' ') {
    const btns = document.querySelectorAll('button[data-key2=" "]:not([disabled])');
    if (btns.length) { btns[0].click(); return true; }
    return false;
  }
  if (!/^[a-z0-9]$/.test(k)) return false;
  const btns = document.querySelectorAll(`button[data-key="${k}"]:not([disabled])`);
  if (btns.length) { btns[0].click(); return true; }
  return false;
}

export function initHotkeys() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (handleKey(e.key)) e.preventDefault();
  });
}

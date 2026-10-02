// core/hotkeys.js — keyboard shortcuts (0.117: moved out of core/scene.js).
// Buttons opt in with `key: 'x'` in el(); pressing the letter clicks the
// FIRST enabled matching button. Enter clicks the primary button.
// Registered once from main.js.

import { isTransitioning } from './scene.js';

// A dialog layered over the scene takes the keyboard while it's open
// (0.094): fn(key) handles every key, so the scene's hotkeys underneath
// can't fire. Traps stack (0.115): a dialog opened over another gets the
// keys, and closing it hands them back to the one underneath — whichever
// order they close in. ui/dialog.js does this for every dialog.
const keyTraps = []; // newest last
export function pushKeyTrap(fn) { keyTraps.push(fn); }
export function releaseKeyTrap(fn) {
  const i = keyTraps.lastIndexOf(fn);
  if (i >= 0) keyTraps.splice(i, 1);
}
export const activeKeyTrap = () => keyTraps.at(-1) ?? null;

export function handleKey(key) {
  // The outgoing scene is still in the DOM while it fades — its buttons
  // must not fire (0.077: a second R during the fade re-banked the run).
  if (isTransitioning()) return false;
  // Debug "hide foreground" (0.083): the UI is invisible, so its hotkeys
  // must not click unseen buttons.
  if (document.body?.classList?.contains('fg-hidden')) return false;
  const k = key.toLowerCase();
  if (/^(f\d{1,2}|tab)$/.test(k)) return false; // F5, F11, F12, Tab: the browser's, dialog or not (0.00197: a dialog swallowed them)
  if (keyTraps.length) return keyTraps.at(-1)(k);
  if (k === 'enter') {
    const primary = document.querySelector('button.primary:not([disabled])');
    if (primary) { primary.click(); return true; }
    return false;
  }
  // Space = "proceed further" (0.124): every screen's way forward is built
  // with el(..., { proceed: true }) and shows [space] under its label —
  // Enter the Castle, Descend, Push Deeper, Accept Your Fate, Return to
  // the Great Hall; dialogs pass theirs to openDialog({ proceed }).
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
    // Typing into a text field (the Import Save box) is text, not hotkeys —
    // 'e'/'n'/Enter used to fire title-screen buttons mid-paste (0.077).
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
    // A held Space auto-repeats: it must not race on through the next
    // screens' proceed buttons (0.124) — one press, one step.
    if (e.repeat && e.key === ' ') { e.preventDefault(); return; }
    if (handleKey(e.key)) e.preventDefault();
  });
}

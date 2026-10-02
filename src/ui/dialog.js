// ui/dialog.js — every dialog layered over a scene (0.115): the update
// prompt, yes/no confirms, the name prompt, the changelist. One overlay +
// modal, and the keyboard: while open the dialog owns it (core/hotkeys.js
// key trap stack), so the scene's hotkeys can't fire underneath; closing hands
// it back to whatever was below, even another dialog.
//
// openDialog({ label, children, onKey(k, close), backdropCloses,
//              overlayClass, modalClass, proceed }) -> { el, close, isOpen }
// onKey gets every key (lowercased: 'enter', 'escape', 'y', ...); keys it
// ignores are still swallowed. close() is safe to call twice.

import { el } from '../core/dom.js';
import { pushKeyTrap, releaseKeyTrap } from '../core/hotkeys.js';

// Every open dialog's close() (0.134): a dialog lives on document.body,
// above the scenes, so switching scenes does not close it — the benchmark
// clears them before it takes the screen, and its prompt waits its turn.
const openDialogs = new Set();
export const anyDialogOpen = () => openDialogs.size > 0;
export function closeAllDialogs() { for (const close of [...openDialogs]) close(); }

export function openDialog({
  label, children = [], onKey = null, backdropCloses = false,
  overlayClass = 'update-overlay', modalClass = 'update-modal', onClose = null, proceed = null,
}) {
  let open = true;
  // proceed (0.124): the dialog's way forward (an el() button built with
  // proceed: true) — Space clicks it, like on the scenes.
  const trap = (k) => {
    if (k === ' ' && proceed && !proceed.disabled) proceed.click();
    else onKey?.(k, close);
    return true;
  };
  const overlay = el('div', {
    class: overlayClass, role: 'dialog', 'aria-label': label,
    onclick: backdropCloses ? (e) => { if (e?.target === overlay) close(); } : null,
  }, el('div', { class: modalClass }, ...children));
  function close() {
    if (!open) return;
    open = false;
    openDialogs.delete(close);
    overlay.remove();
    releaseKeyTrap(trap);
    onClose?.();
  }
  document.body.append(overlay);
  openDialogs.add(close);
  pushKeyTrap(trap);
  return { el: overlay, close, isOpen: () => open };
}

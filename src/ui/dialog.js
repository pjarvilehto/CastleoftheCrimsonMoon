// ui/dialog.js — every dialog layered over a scene (0.115): the update
// prompt, yes/no confirms, the name prompt, the changelist. One overlay +
// modal, and the keyboard: while open the dialog owns it (scene.js key
// trap stack), so the scene's hotkeys can't fire underneath; closing hands
// it back to whatever was below, even another dialog.
//
// openDialog({ label, children, onKey(k, close), backdropCloses,
//              overlayClass, modalClass }) -> { el, close, isOpen }
// onKey gets every key (lowercased: 'enter', 'escape', 'y', ...); keys it
// ignores are still swallowed. close() is safe to call twice.

import { el } from '../core/dom.js';
import { pushKeyTrap, releaseKeyTrap } from '../core/hotkeys.js';

export function openDialog({
  label, children = [], onKey = null, backdropCloses = false,
  overlayClass = 'update-overlay', modalClass = 'update-modal', onClose = null,
}) {
  let open = true;
  const trap = (k) => { onKey?.(k, close); return true; };
  const overlay = el('div', {
    class: overlayClass, role: 'dialog', 'aria-label': label,
    onclick: backdropCloses ? (e) => { if (e?.target === overlay) close(); } : null,
  }, el('div', { class: modalClass }, ...children));
  function close() {
    if (!open) return;
    open = false;
    overlay.remove();
    releaseKeyTrap(trap);
    onClose?.();
  }
  document.body.append(overlay);
  pushKeyTrap(trap);
  return { el: overlay, close, isOpen: () => open };
}

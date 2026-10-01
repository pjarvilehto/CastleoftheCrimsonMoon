// deathModal.js — the YOU DIED dialog. Death is THE event of a roguelite run,
// so it gets a centered blood-red modal (not a corner button). It flashes in
// at the peak of the red death flash (fx.js deathFlash) and stays up, its
// button pulsing in the 'active' red state — the only way out.

import { el } from '../core/dom.js';

export function showDeathModal(run, onAccept) {
  let overlay;
  const accept = () => {
    overlay.remove();
    onAccept();
  };
  overlay = el(
    'div',
    { class: 'death-overlay', role: 'dialog', 'aria-label': 'You died' },
    el(
      'div',
      { class: 'death-modal' },
      el('h1', { class: 'death-title' }, 'YOU DIED!'),
      el('p', { class: 'death-sub' }, `The castle claims another soul on room ${run.roomNumber}.`),
      el('button', { class: 'danger death-accept active active-red', key: 'f', proceed: true, onclick: accept }, 'Accept Your Fate')
    )
  );
  document.getElementById('app').append(overlay);
  return overlay;
}

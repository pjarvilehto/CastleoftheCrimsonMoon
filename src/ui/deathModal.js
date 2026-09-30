// deathModal.js — the YOU DIED dialog. Death is THE event of a roguelite run,
// so it gets a centered blood-red modal (not a corner button): the fatal blow
// already fired the red flash; this fades in on top and is the only way out.

import { el } from '../core/scene.js';

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
      el('button', { class: 'danger death-accept', key: 'f', onclick: accept }, 'Accept Your Fate')
    )
  );
  document.getElementById('app').append(overlay);
  return overlay;
}

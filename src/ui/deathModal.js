// ui/deathModal.js — the YOU DIED dialog. Death is THE event of a roguelite run,
// so it gets a centered blood-red modal (not a corner button). It flashes in
// at the peak of the red death flash (fx.js deathFlash) and stays up, its
// button pulsing in the 'active' red state — the only way out. An
// openDialog (0.157): it owns the keyboard and covers the room, so neither
// Space nor a click can reach the room's own buttons underneath (a
// reliquary death used to leave Push Deeper live).

import { el } from '../core/dom.js';
import { openDialog } from './dialog.js';

export function showDeathModal(run, onAccept) {
  const accept = el('button', { class: 'danger death-accept active active-red', key: 'f', proceed: true, onclick: () => { dlg.close(); onAccept(); } }, 'Accept Your Fate');
  const dlg = openDialog({
    label: 'You died', overlayClass: 'death-overlay', modalClass: 'death-modal', proceed: accept,
    children: [
      el('h1', { class: 'death-title' }, 'YOU DIED!'),
      el('p', { class: 'death-sub' }, `The castle claims another soul on room ${run.roomNumber}.`),
      accept,
    ],
    onKey: (k) => { if (k === 'f' || k === 'enter') accept.click(); },
  });
  return dlg;
}

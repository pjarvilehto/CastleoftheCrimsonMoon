// ui/victoryModal.js — the "you've won" dialog (0.121). Beating the boss of
// difficulty.json finalBossRoom (room 24) is the end of the castle's tale
// for now, so the first time a save does it, the fight's playback ends in
// a gold celebration: the castle is conquered, there's little more past
// this point, and a new game starts from the main menu. Shown once per
// save (profile.victorySeen); closing it returns to the cleared room,
// where Push Deeper / Retreat work as usual.

import { el } from '../core/dom.js';
import { openDialog } from './dialog.js';
import { sfx } from '../audio/sfx.js';
import { getProfile } from '../meta/profile.js';

export function showVictoryModal(run, onClose = null) {
  sfx('victory');
  const who = getProfile().name;
  const dlg = openDialog({
    label: 'Victory',
    overlayClass: 'update-overlay victory-overlay', modalClass: 'update-modal victory-modal',
    onClose,
    children: [
      el('h1', { class: 'victory-title' }, 'Victory!'),
      el('p', { class: 'victory-lead' },
        `Congratulations${who ? `, ${who}` : ''}! The lord of room ${run.roomNumber} has fallen, and the Crimson Moon fades from the sky.`),
      el('p', { class: 'victory-text' },
        'You have conquered the castle — you\'ve won the game, for now. This is as far as the tale goes: ' +
        'you may push deeper, but there is little new to find beyond this room.'),
      el('p', { class: 'victory-text' },
        'To play it all again from the beginning, choose Start a New Game on the main menu.'),
      el('div', { class: 'btn-row' },
        el('button', { class: 'primary active victory-accept', key: 'o', onclick: () => dlg.close() }, 'Onward')),
    ],
    onKey: (k, close) => { if (['o', 'enter', 'escape', ' '].includes(k)) close(); },
  });
  return dlg;
}

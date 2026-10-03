// ui/lookPicker.js — the hall's look picker (0.00253, the developer's
// call): a click on the Great Hall's portrait (hubSections.js knightSection;
// the phone's Equipment sheet has a Look row) opens this dialog — the
// chosen hero large, ‹ › (the arrow keys, A / D) turning through its looks
// (heroes.json), the pick saved as it turns and shared with the stats on
// close (meta/telemetry.js). The CLASS is not for changing here: it is
// chosen once per save on CHOOSE YOUR HERO; a new game chooses again.

import { el } from '../core/dom.js';
import { openDialog } from './dialog.js';
import { getProfile, persist } from '../meta/profile.js';
import { heroOf, cleanHero, lookOf, lookUrl } from '../shared/heroes.js';
import { shareStats } from '../meta/telemetry.js';

/** onDone(changed) runs when the dialog closes. */
/** A figure shown in one of its hero's looks (the file and its share of the sheet's height, --fh). */
export function showLook(img, hero, look) {
  img.setAttribute('src', lookUrl(hero, look));
  img.setAttribute('style', `--fh:${lookOf(hero, look).fh}`);
}
/** The look switcher's dots and "Look N of M" line, redrawn for the look shown (0.00323: the hero screen and the picker drew them each). */
export function lookDots(dots, which, n, look) {
  dots.innerHTML = ''; dots.append(...Array.from({ length: n }, (_, i) => el('i', { class: i === look ? 'on' : '' })));
  which.textContent = `Look ${look + 1} of ${n}`;
}

export function openLookPicker(onDone = () => {}) {
  const p = getProfile();
  const hero = heroOf(p), n = hero.looks.length;
  let look = cleanHero(p.hero).look, changed = false;
  const img = el('img', { class: 'look-figure', src: lookUrl(hero, look), style: `--fh:${lookOf(hero, look).fh}`, alt: hero.name, draggable: 'false' });
  const dots = el('div', { class: 'dots' }), which = el('div', { class: 'which' });
  const sync = () => lookDots(dots, which, n, look);
  const turn = (d) => {
    look = (look + d + n) % n;
    showLook(img, hero, look);
    p.hero = { id: hero.id, look }; persist(); changed = true; // (meta state, saved at once like a name change — no run is under way in the hall)
    sync();
  };
  const done = el('button', { class: 'primary active', proceed: true, onclick: () => dlg.close() }, 'Done');
  const dlg = openDialog({
    label: 'Change your look', modalClass: 'update-modal look-modal', proceed: done,
    children: [
      el('h2', {}, hero.name),
      el('div', { class: 'sub' }, n > 1 ? 'The same hero, another look. The class is this game\'s; a new game chooses again.' : 'This hero has one look so far. The class is this game\'s; a new game chooses again.'),
      el('div', { class: 'look-stage' },
        el('button', { class: 'look-arrow', disabled: n < 2, title: 'Previous look', onclick: () => turn(-1) }, '‹'),
        img,
        el('button', { class: 'look-arrow', disabled: n < 2, title: 'Next look', onclick: () => turn(1) }, '›')),
      el('div', { class: 'looks' }, dots, which),
      el('div', { class: 'btn-row' }, done),
    ],
    onKey: (k, close) => {
      if (n > 1 && (k === 'arrowleft' || k === 'a')) turn(-1);
      else if (n > 1 && (k === 'arrowright' || k === 'd')) turn(1);
      else if (k === 'enter' || k === 'escape') close();
    },
    onClose: () => { if (changed) shareStats(p); onDone(changed); },
  });
  sync();
  return dlg;
}

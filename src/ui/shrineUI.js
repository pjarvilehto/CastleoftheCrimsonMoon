// ui/shrineUI.js — renders the shrine room body: three large vertical
// boon cards, one choice (or walk away), styled like the combat cards.
// Pure view + wiring; the boon math lives in run/shrine.js. The shrine
// deals 3 random offers from the pool (kept on the room across renders).

import { el } from '../core/scene.js';
import { sfx } from '../audio/sfx.js';
import { dealOffers, canAffordOffer, acceptOffer, costText } from '../run/shrine.js';

// Hooks: log(text) prints to the combat log; refresh() re-renders the scene.
export function shrineBody(run, room, { log, refresh }) {
  if (room.taken) {
    return el('div', { class: 'subtitle' }, 'The shrine\'s light fades. Its blessing is yours.');
  }
  if (!room.dealtOffers) room.dealtOffers = dealOffers();
  return el('div', {},
    el('div', { class: 'subtitle' }, 'A shrine hums with dark power. Accept one boon — or walk away.'),
    el('div', { class: 'shrine-cards' },
      ...room.dealtOffers.map((o, i) => el('div', { class: 'shrine-card' },
        el('div', { class: 'shrine-buff' }, o.buff),
        el('div', { class: 'shrine-icon' }, o.icon),
        el('div', { class: 'shrine-cost' },
          el('div', { class: 'shrine-cost-label' }, 'COST:'),
          el('div', {}, costText(o, run.roomNumber))),
        el('button', {
          disabled: !canAffordOffer(run, o),
          key: String(i + 1),
          onclick: () => {
            sfx('shrine');
            acceptOffer(run, o);
            room.taken = true;
            log(`The shrine takes its price. ${o.buff} is yours.`);
            refresh();
          },
        }, 'Accept')))));
}

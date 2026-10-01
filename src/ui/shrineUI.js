// ui/shrineUI.js — the shrine room: a panel with the run HUD, three large
// vertical boon cards (one choice, or walk away), the log and the way on.
// Pure view + wiring; the boon math lives in run/shrine.js. The shrine
// deals 3 random offers from the pool (kept on the room across renders).

import { el } from '../core/dom.js';
import { sfx } from '../audio/sfx.js';
import { dealOffers, canAffordOffer, acceptOffer, costText } from '../run/shrine.js';
import { hpBar, logLine } from './hud.js';
import { updateBuffs } from './buffs.js';

// HP color scale: <=25% red, <=75% yellow, above green.
const hpColor = (cur, max) => {
  const pct = cur / max;
  return pct <= 0.25 ? '#c14b4b' : pct <= 0.75 ? '#d8c95a' : '#7bc98a';
};

// The whole shrine room (0.098: moved out of dungeonScene). h: { title
// (h1 content), logEl, buffBar, coins, xp (the HUD counters' shown
// values), onDeeper, onRetreat, refresh }.
export function renderShrineRoom(root, run, room, h) {
  const lowhp = (run.hp / run.maxHp) <= 0.25 ? ' lowhp' : '';
  const potionColor = run.potions >= 3 ? '#7bc98a' : run.potions >= 1 ? '#d8c95a' : '#c14b4b';
  const header = el('div', { class: 'run-hud' },
    el('span', {}, 'Room ', el('b', {}, String(room.number))),
    el('span', { class: `hud-chip${lowhp}`, id: 'hud-hp' }, 'HP ', el('b', { style: `color:${hpColor(run.hp, run.maxHp)}` }, `${run.hp}/${run.maxHp}`), hpBar(run.hp, run.maxHp, hpColor(run.hp, run.maxHp))),
    el('span', {}, 'Coins ', el('b', { id: 'hud-coins' }, String(h.coins))),
    el('span', {}, 'XP ', el('b', { id: 'hud-xp' }, String(h.xp))),
    el('span', {}, 'Potions ', el('b', { style: `color:${potionColor}` }, `${run.potions}/${run.potionCap}`)));
  const proceed = el('div', { class: 'btn-row' },
    el('button', { class: 'primary', key: 'd', proceed: true, onclick: h.onDeeper }, 'Push Deeper'),
    room.taken ? el('button', { class: 'danger', key: 'r', onclick: h.onRetreat }, 'Retreat with Loot') : null);
  root.innerHTML = '';
  root.append(
    el('div', { class: 'panel' },
      el('h1', {}, ...h.title),
      header,
      shrineBody(run, room, { log: (t) => logLine(h.logEl, t, 'loot'), refresh: h.refresh }),
      h.logEl,
      proceed));
  h.logEl.className = '';
  h.logEl.scrollTop = h.logEl.scrollHeight;
  root.append(h.buffBar);
  updateBuffs(h.buffBar, run.buffs);
}

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

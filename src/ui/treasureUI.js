// ui/treasureUI.js — the treasure room (0.155): the shrine's panel with
// three chests, one to open (run/treasure.js has the rules). The cards
// say what kind each chest is, not what's inside; the reliquary shows its
// blood price, in red when it would kill.

import { el } from '../core/dom.js';
import { sfx } from '../audio/sfx.js';
import { narrate } from '../audio/narrator.js';
import { CHESTS, openChest, reliquaryCost } from '../run/treasure.js';
import { renderPanelRoom, litCard } from './shrineUI.js';
import { CHEST_STYLE } from './cardFx.js';
import { iconArt } from './buffs.js';
import { logLine } from './hud.js';
import { DATA } from '../shared/data.js';

const LOOK = {
  coffer: { name: 'Iron Coffer', icon: '💰', img: 'assets/icons/chest_coffer.webp', hint: 'Heavy with coin.' },
  gilded: { name: 'Gilded Chest', icon: '⚜', img: 'assets/icons/chest_gilded.webp', hint: 'Fine gear, made for you.' },
  reliquary: { name: 'Sealed Reliquary', icon: '⚱', img: 'assets/icons/chest_reliquary.webp', hint: 'Something old sleeps within.' },
};

// h: as renderShrineRoom, plus onDeath() (the reliquary's price can kill)
export function renderTreasureRoom(root, run, room, h) {
  const log = (t, cls = 'loot') => logLine(h.logEl, t, cls);
  const body = room.opened
    ? el('div', { class: 'subtitle' }, `The ${LOOK[room.opened].name.toLowerCase()} lies open. The others stay shut.`)
    : el('div', {},
      el('div', { class: 'subtitle' }, 'Three chests in the gloom. Open one — the others stay shut.'),
      el('div', { class: 'shrine-cards treasure-cards' }, ...CHESTS.map((kind, i) => {
        const L = LOOK[kind], cost = kind === 'reliquary' ? reliquaryCost(run) : 0, lethal = cost >= run.hp;
        return litCard(CHEST_STYLE[kind], el('div', { class: `shrine-card treasure-card treasure-${kind}` },
          el('div', { class: 'shrine-buff' }, L.name),
          el('div', { class: 'shrine-icon' }, iconArt(L.img, L.icon)),
          el('div', { class: 'treasure-hint' }, L.hint),
          el('div', { class: 'shrine-cost' },
            el('div', { class: 'shrine-cost-label' }, 'COST:'),
            el('div', { class: lethal ? 'treasure-lethal' : '' }, cost ? `${cost} HP${lethal ? ' — it would kill you' : ''}` : 'Free')),
          el('button', {
            key: String(i + 1),
            class: kind === 'reliquary' ? 'danger' : '',
            onclick: () => {
              const got = openChest(run, room, kind, log);
              room.taken = true;
              if (!got.died) sfx(DATA.items[got.itemId]?.tier === 4 ? 'rare' : got.itemId ? 'loot' : 'ring');
              h.refresh(); // the chests close (and a dead knight gets no way on) before the death dialog
              if (got.died) { h.onDeath(); return; } // the death dialog narrates the reliquary's price
              narrate(`chest_${kind}`);
              if (DATA.items[got.itemId]?.tier === 4) narrate('relic_found'); // follows the chest line
            },
          }, 'Open')));
      })));
  renderPanelRoom(root, run, room, h, body);
}

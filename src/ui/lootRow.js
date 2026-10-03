// ui/lootRow.js — the LOOT row under XP / COINS (0.00260; its own module
// since 0.00323, out of the dungeon scene, where its four state fields were
// spread over the render, the playback's hooks and the fx context): the
// newest LOOT_SHOWN of the run's finds as small pictures, oldest first,
// another class's gear greyed (0.00274: salvaged at the run's end). A find's
// card flies into it (ui/findFx.js, 0.00262): the row shows as the first
// card takes off (reveal), the chip joins as the card lands (land — the
// playback's fx hook hands the flight's length; none under reduced motion:
// at once), and once a room's lines are out every find is shown (settle —
// an OVERKILL's silent finds too; a card still flying lands on its own).
// A button since 0.00299: a click or I opens the LOOT pop-up (the scene's
// onOpen). A phone has no row (styles.css section 16): its way to the
// finds is the hero card's INVENTORY page.
import { el } from '../core/dom.js';
import { itemPic } from './hud.js';
import { canUse } from '../shared/classGear.js';

export const LOOT_SHOWN = 6; // (the look: the row's length)

/** run: a getter for the live run (the scene's changes with every descent). */
export function createLootRow(run) {
  let row = null, tray = null;
  let shown = 0;  // how many of run.itemsFound the row shows
  let flying = 0; // finds whose card is still on its way to the row

  // The row's element for the scene to mount: onOpen on a click (the key I is the button's).
  function mount(onOpen) {
    tray = el('span', { class: 'loot-tray' });
    row = el('button', { class: 'res-row res-loot none', key: 'i', onclick: onOpen }, el('span', { class: 'res-label' }, 'LOOT'), tray);
    shown = 0;
    return row;
  }

  // The row showing the first n finds (the newest LOOT_SHOWN of them).
  // rebuild: redraw even at the same count (a new room); landed: a card
  // has just flown in — the new chip pops (0.00262).
  function show(n, rebuild = false, landed = false) {
    const found = run().itemsFound;
    n = Math.min(n, found.length);
    if (!row || (n === shown && !rebuild)) { shown = Math.max(shown, n); return; }
    const grew = n > shown;
    shown = n;
    tray.textContent = '';
    tray.append(...found.slice(0, n).slice(-LOOT_SHOWN).map((id) => itemPic(id, `loot-chip${canUse(run().heroId, id) ? '' : ' off-class'}`)).filter(Boolean));
    row.classList.toggle('none', n === 0 && !flying);
    const chip = tray.children[tray.children.length - 1];
    if (landed && grew) chip?.animate?.([ // (one-shot: the chip lands with a flash)
      { transform: 'scale(1.7)', filter: 'brightness(2.2)' },
      { transform: 'scale(1)', filter: 'brightness(1)' },
    ], { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
  }

  return {
    mount,
    show,
    get el() { return row; },
    get flying() { return flying; },
    /** A find's card is about to take off: the row shows under it. */
    reveal() { row?.classList.remove('none'); },
    /** The find's card lands in landsIn ms (a number), or at once (reduced motion: no flight). */
    land(landsIn) {
      if (typeof landsIn !== 'number') { show(shown + 1); return; }
      flying++;
      setTimeout(() => { flying--; show(shown + 1, false, true); }, landsIn);
    },
    /** The room's lines are out: every find not still flying is shown. */
    settle() { show(run().itemsFound.length - flying); },
  };
}

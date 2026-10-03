// ui/lootDialog.js — the run's finds as a pop-up (0.00292, the developer's
// ask): a click on the combat screen's LOOT row opens every item found this
// run, newest first, as the hero card's inventory strips (hud.js itemStrip),
// four in view and the rest a scroll away (wheel, a swipe, the arrow keys).
// Each strip says the slot it will upgrade when the run ends, or that it is
// another class's gear, salvaged then.

import { el } from '../core/dom.js';
import { DATA } from '../shared/data.js';
import { canUse } from '../shared/classGear.js';
import { openDialog } from './dialog.js';
import { itemStrip } from './hud.js';

const SLOT = (slot) => slot.charAt(0).toUpperCase() + slot.slice(1);

export function openLootDialog(run) {
  const ids = run.itemsFound.filter((id) => DATA.items[id]).reverse();
  const list = el('div', { class: 'loot-list inv-strips' }, ...ids.map((id) => {
    const item = DATA.items[id], usable = canUse(run.heroId, id);
    return itemStrip(id, item, el('span', { class: `inv-tag${usable ? '' : ' inv-off'}` }, usable ? `${SLOT(item.slot)} ↑` : 'Salvage'));
  }));
  const step = (dir) => list.scrollBy?.({ top: dir * (list.children[0]?.offsetHeight ?? 0), behavior: 'smooth' });
  const dlg = openDialog({
    label: 'Loot', backdropCloses: true,
    overlayClass: 'update-overlay loot-overlay', modalClass: 'update-modal loot-modal',
    children: [
      el('h2', { class: 'update-title' }, 'Loot'),
      el('div', { class: 'loot-sub' }, `${ids.length} found this run · worn when the run ends`),
      list,
      el('div', { class: 'btn-row' }, el('button', { class: 'primary', key: 'c', onclick: () => dlg.close() }, 'Close')),
    ],
    onKey: (k, close) => {
      if (k === 'arrowdown') step(1);
      else if (k === 'arrowup') step(-1);
      else if (k === 'c' || k === 'escape' || k === 'enter') close();
    },
  });
  return dlg;
}

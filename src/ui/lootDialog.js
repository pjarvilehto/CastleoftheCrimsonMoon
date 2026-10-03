// ui/lootDialog.js — the run's finds as a pop-up (0.00292, the developer's
// ask): the combat screen's LOOT row (a click, or I) and the hero card's
// INVENTORY page's FINDS line (0.00299: the phone's way in — its top strip
// has no LOOT row) open every item found this run, newest first, as the hero
// card's inventory strips (hud.js itemStrip), four in view and the rest a
// scroll away (wheel, a swipe, the arrow keys). Each strip says what becomes
// of the find when the run ends (0.00299): the slot it is worn in — judged
// against run.gearPreview, what settleRun's equipItems will put on — or
// "Beaten · salvaged" for a find a later one beat (it stays in
// run.itemsFound, so the pop-up used to promise it a slot), or "Salvage" for
// another class's gear.

import { el } from '../core/dom.js';
import { DATA } from '../shared/data.js';
import { canUse } from '../shared/classGear.js';
import { equippedItemIds } from '../meta/equipment.js';
import { openDialog } from './dialog.js';
import { itemStrip, gearLabel } from './hud.js';

// The slot a worn find takes, as the hall names it (hud.js gearLabel: "Ring I" / "Ring II" by the preview's place).
const slotOf = (run, id, item) => (item.slot === 'ring' ? gearLabel({ slot: 'rings', index: Math.max(0, run.gearPreview.rings.indexOf(id)) }) : gearLabel({ slot: item.slot }));

export function openLootDialog(run) {
  const ids = run.itemsFound.filter((id) => DATA.items[id]).reverse();
  const worn = new Set(equippedItemIds(run.gearPreview));
  const list = el('div', { class: 'loot-list inv-strips' }, ...ids.map((id) => {
    const item = DATA.items[id], usable = canUse(run.heroId, id);
    const tag = !usable ? 'Salvage' : worn.has(id) ? `${slotOf(run, id, item)} ↑` : 'Beaten · salvaged';
    return itemStrip(id, item, el('span', { class: `inv-tag${tag.endsWith('↑') ? '' : ' inv-off'}` }, tag));
  }));
  // a strip and the gap under it (0.00299: the gap used to be left out, so each step drifted off the snap)
  const stride = () => { const [a, b] = list.children; return (b && a ? b.offsetTop - a.offsetTop : 0) || a?.offsetHeight || 0; };
  const step = (dir) => list.scrollBy?.({ top: dir * stride(), behavior: 'smooth' });
  const dlg = openDialog({
    label: 'Loot', backdropCloses: true,
    overlayClass: 'update-overlay loot-overlay', modalClass: 'update-modal loot-modal',
    children: [
      el('h2', { class: 'update-title' }, 'Loot'),
      el('div', { class: 'loot-sub' }, `${ids.length} found this run · the best of each slot is worn when the run ends`),
      list,
      el('div', { class: 'btn-row' }, el('button', { class: 'primary', key: 'c', onclick: () => dlg.close() }, 'Close')),
    ],
    closeKeys: ['c'],
    onKey: (k) => { if (k === 'arrowdown') step(1); else if (k === 'arrowup') step(-1); },
  });
  return dlg;
}

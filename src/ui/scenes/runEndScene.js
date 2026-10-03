// ui/scenes/runEndScene.js — death or retreat summary, then back to hub.

import { setBackground, go } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { DATA } from '../../shared/data.js';
import { statBox, itemPic, describeItem, gearLabel } from '../hud.js';
import { gainLine } from '../../shared/itemArt.js';
import { play } from '../../audio/music.js';
import { narrate } from '../../audio/narrator.js';

// The run's finds (0.00259): a card per slot they changed — the picture
// fading down into the slot, the name in its rarity, its stats and what it
// beat; a relic tagged. What was salvaged (the gear they replaced, a find a
// later one beat) is a row of small grey chips with the coins.
function findCard({ slot, index, from, to }) {
  const it = DATA.items[to];
  if (!it) return null;
  const gain = gainLine(from, to);
  return el('div', { class: `find-card tier-${Math.min(4, it.tier)}` },
    el('div', { class: 'fc-art' }, itemPic(to)),
    it.tier >= 4 ? el('div', { class: 'fc-tag' }, 'Relic') : null,
    el('div', { class: 'fc-text' },
      el('div', { class: 'fc-slot' }, gearLabel({ slot, index })),
      el('div', { class: 'fc-name' }, it.name),
      el('div', { class: 'fc-desc' }, describeItem(it)),
      el('div', { class: 'fc-cmp' }, from && DATA.items[from] ? `over ${DATA.items[from].name}` : 'into an empty slot', gain ? [' · ', el('span', { class: 'up' }, gain)] : null)));
}
function salvageRow(sum) {
  return el('div', { class: 'loot-summary salvage-row' },
    el('span', { class: 'salvage-head' }, 'Salvaged'),
    ...sum.salvaged.map((it) => el('span', { class: 'salvage-chip' }, itemPic(it.id), it.name)),
    el('span', { class: 'salvage-coins' }, `+${sum.coins} coins`));
}

export function runEndScene(run, outcome) {
  return {
    enter(root) {
      play('end');
      if (outcome !== 'death') narrate('retreat'); // the narrator alone (0.162: the escape fanfare is gone; the win dialog keeps its chime)
      setBackground(DATA.backgrounds.death);
      root.append(
        el('div', { class: 'panel' },
          el('h1', {}, outcome === 'death' ? 'YOU DIED' : 'YOU ESCAPED'),
          el('div', { class: 'subtitle' },
            outcome === 'death'
              ? `The castle claims another soul on room ${run.roomNumber}.`
              : `You slipped away after room ${run.roomNumber}, purse heavy.`),
          el('div', { class: 'stat-grid' },
            // dying in room N means N-1 were cleared; a retreat follows a win (0.097)
            statBox('Rooms Cleared', outcome === 'death' ? Math.max(0, run.roomNumber - 1) : run.roomNumber),
            statBox('Kills', run.kills),
            statBox(outcome === 'death' ? 'Coins Retrieved' : 'Coins Earned', run.coinsRetrieved ?? run.coins),
            statBox('XP Earned', run.xp),
            statBox('Items Found', run.itemsFound.length)),
          run.equipSummary?.changes?.length
            ? el('div', { class: 'finds-row' }, ...run.equipSummary.changes.map(findCard))
            : null,
          run.equipSummary?.salvaged?.length ? salvageRow(run.equipSummary) : null,
          outcome === 'death'
            ? el('div', { class: 'toll-line' },
                run.coinsLost > 0 ? `The castle claims its toll — ${run.coinsLost} gold lost (${Math.round(run.tollPct * 100)}%).` : null)
            : el('div', { class: 'retrieved-line' },
                run.coinsRetrieved > 0 ? `All ${run.coinsRetrieved} gold retrieved.` : null),
          el('div', { class: 'btn-row' },
            el('button', { class: 'primary', key: 'g', proceed: true, onclick: () => go('hub', { fromRun: true, finds: run.equipSummary?.changes ?? [] }) }, 'Return to the Great Hall'))
        )
      );
    },
  };
}

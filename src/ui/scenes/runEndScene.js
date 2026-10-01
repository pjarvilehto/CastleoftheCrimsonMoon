// ui/scenes/runEndScene.js — death or retreat summary, then back to hub.

import { setBackground, go } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { DATA } from '../../shared/data.js';
import { statBox, itemName } from '../hud.js';
import { play } from '../../audio/music.js';
import { sfx } from '../../audio/sfx.js';

// Join rendered item names with plain separators: [a, ', ', b, ', ', c]
function joinItems(list, render) {
  return list.flatMap((it, i) => (i ? [', ', render(it)] : [render(it)]));
}

export function runEndScene(run, outcome) {
  return {
    enter(root) {
      play('end');
      if (outcome !== 'death') sfx('victory');
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
          // Loot lists: equipped items in their rarity colors; salvaged
          // stays muted in the lowest-tier ash tone on purpose.
          run.equipSummary && run.equipSummary.equipped.length
            ? el('div', { class: 'loot-summary equipped-line' },
                'Equipped: ', ...joinItems(run.equipSummary.equipped, itemName))
            : null,
          run.equipSummary && run.equipSummary.salvaged.length
            ? el('div', { class: 'loot-summary salvaged-line' },
                'Salvaged: ',
                ...joinItems(run.equipSummary.salvaged,
                  (it) => el('span', { class: 'rarity-1 salvaged' }, it.name)),
                ` (+${run.equipSummary.coins} coins)`)
            : null,
          outcome === 'death'
            ? el('div', { style: 'text-align:center;color:#e07b7b;margin-top:8px' },
                run.coinsLost > 0 ? `The castle claims its toll — ${run.coinsLost} gold lost (${Math.round(run.tollPct * 100)}%).` : null)
            : el('div', { style: 'text-align:center;color:#c9a227;margin-top:8px' },
                run.coinsRetrieved > 0 ? `All ${run.coinsRetrieved} gold retrieved.` : null),
          el('div', { class: 'btn-row' },
            el('button', { class: 'primary', key: 'g', onclick: () => go('hub') }, 'Return to the Great Hall'))
        )
      );
    },
  };
}

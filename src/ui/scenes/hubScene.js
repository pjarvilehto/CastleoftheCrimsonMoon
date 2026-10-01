// ui/scenes/hubScene.js — the meta game: disciplines, shop, alchemy, forge.
// Currency split (0.059): XP trains disciplines; coins buy potions,
// alchemy tracks, and Forge item enhancements.

import { setBackground, currentScene, go } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { preloadRest, restProgress } from '../../shared/preload.js';
import { sfx } from '../../audio/sfx.js';
import { DATA } from '../../shared/data.js';
import { getProfile } from '../../meta/profile.js';
import { derivedStats, itemWithForge, playerLevel } from '../../meta/stats.js';
import { equippedItemIds } from '../../meta/equipment.js';
import {
  STAT_DEFS, statCost, canAfford, buyStat,
  restockPotion, potionCost, satchelFull, satchelCost, satchelMaxed, expandSatchel,
  ALCHEMY_DEFS, alchemyCost, alchemyMaxed, trainAlchemy, potionHealAmount, infusionArmor,
  forgeCost, forgeMaxed, forgeItem,
} from '../../meta/leveling.js';
import { statBox, describeItem, itemName, potionLevel } from '../hud.js';
import { statDesc, efficiencyDesc } from '../hubText.js';
import { play } from '../../audio/music.js';
import { confirmPrompt } from '../confirmPrompt.js';
import { maybeAskBenchmark } from '../benchmark.js';
import { narrate } from '../../audio/narrator.js';

// XP / Coins turn green when there's something to spend them on (0.090),
// so a returning player remembers to train before descending again.
export function canSpendXp(p) {
  return Object.keys(STAT_DEFS).some((k) => p.xp >= statCost(p.stats[k]).xp);
}

export function canSpendCoins(p) {
  if (!satchelFull(p) && p.coins >= potionCost()) return true;
  if (!satchelMaxed(p) && p.coins >= satchelCost(p)) return true;
  if (Object.keys(ALCHEMY_DEFS).some((t) => !alchemyMaxed(t) && p.coins >= alchemyCost(t))) return true;
  return equippedItemIds(p.equipment)
    .some((id) => DATA.items[id]?.tier > 1 && !forgeMaxed(id) && p.coins >= forgeCost(id));
}

// Buy Potion gets the pulsing 'active' glow below 30% of the satchel.
export function potionsLow(p) {
  return p.potions < p.potionCap * 0.3;
}

// opts.fromRun: entered from a run's end (the narrator's "Rest… while you can.", 0.161)
export function hubScene(opts = {}) {
  let leaving = false;
  const scene = {
    enter(root) {
      play('title');
      setBackground(DATA.backgrounds.hub);
      render(root);
      if (opts.fromRun) narrate('hall_return');
      // 0.133: the one-time benchmark request, once the hall has faded in;
      // 0.134: never over another dialog — it waits its turn
      // 0.136: …and never once a descent has started ("Gathering shadows…"
      // waits for the art; the run would start under the prompt and be lost)
      const ask = () => { if (currentScene() === scene && !leaving && maybeAskBenchmark() === 'wait') setTimeout(ask, 1000); };
      setTimeout(ask, 1200);
    },
  };
  return scene;

  // Descend (0.098): the dungeon's art loads in the background after the
  // title; if the player is quicker, the button waits for it (showing the
  // progress) rather than letting the first room paint half-drawn.
  // Unspent XP / coins (0.102): something could still be trained or
  // bought — ask once before leaving, the default answer is to stay.
  function descend(btn) {
    const p = getProfile();
    const left = [canSpendXp(p) && `${p.xp.toLocaleString('en-US')} XP`, canSpendCoins(p) && `${p.coins.toLocaleString('en-US')} Coins`].filter(Boolean);
    if (!left.length) return enterDungeon(btn);
    confirmPrompt({
      title: 'Descend Now?',
      lines: [`You still have ${left.join(' and ')} to spend.`, 'Are you sure you want to proceed?'],
      yes: ['Descend Anyway', 'y'],
      no: ['Stay and Spend', 'n'],
      onYes: () => enterDungeon(btn),
    });
  }

  async function enterDungeon(btn) {
    leaving = true; // no benchmark ask once a descent is under way (it may wait for the art)
    if (!restProgress().ready) {
      btn.setAttribute('disabled', '');
      const label = () => { const q = restProgress(); btn.textContent = `Gathering shadows… ${q.total ? Math.round((100 * q.done) / q.total) : 0}%`; };
      label();
      const timer = setInterval(label, 200);
      await preloadRest();
      clearInterval(timer);
      if (currentScene() !== scene) return; // left the hall meanwhile
    }
    go('dungeon');
  }

  function render(root) {
    const p = getProfile();
    const stats = derivedStats(p);
    const every = DATA.difficulty.breakthroughEvery;

    // 0.081: fixed 3x3 layout — Level/Coins/XP, Attack/HP/Armor, then
    // Potions alone in the middle column (hub-stats in styles.css).
    const statsRow = el('div', { class: 'stat-grid hub-stats' },
      statBox('Level', playerLevel(p)), // 0.080: same LV as the combat card
      statBox('Coins', p.coins, canSpendCoins(p) ? 'spendable' : ''),
      statBox('XP', p.xp, canSpendXp(p) ? 'spendable' : ''),
      statBox('Attack', stats.dmg),
      statBox('HP', stats.maxHp),
      statBox('Armor', stats.armor),
      statBox('Potions', `${p.potions}/${p.potionCap}`, `stat-potions ${potionLevel(p)}`));

    // ---- TRAIN: five disciplines, XP-only. Breakthrough ★ every 5th level. ----
    const trainSection = el('div', {},
      el('h2', {}, 'Train (permanent upgrades)'),
      el('div', { class: 'subtitle' }, 'XP only — every 5th level is a ★ breakthrough and counts double'),
      ...Object.entries(STAT_DEFS).map(([key, def]) => {
        const lvl = p.stats[key];
        const star = lvl > 0 && lvl % every === 0 ? ' ★' : '';
        const desc = statDesc(key, lvl);
        return el('div', { class: 'item-row' },
          el('div', {},
            el('b', {}, el('u', {}, def.name[0]), def.name.slice(1) + ' '),
            el('span', {}, `Lv ${lvl}${star} — ${desc}`)),
          el('button', {
            disabled: !canAfford(key),
            key: def.key,
            onclick: () => {
              sfx('levelup');
              const lv = playerLevel(getProfile());
              buyStat(key);
              if (playerLevel(getProfile()) > lv) narrate('level_up'); // a character level (every 5 trained levels)
              render(root);
            },
          }, `Train (${statCost(lvl).xp}xp)`));
      }));

    // ---- ALCHEMY: potions + three coin tracks. ----
    const alchemyDesc = {
      potency: () => `+${DATA.difficulty.alchemyTracks.potency.healPerLevel} potion healing per level (now ${potionHealAmount()} HP)`,
      efficiency: () => efficiencyDesc(), // 0.112: tapering — shows the next level's gain
      infusion: () => `potions grant armor until the room ends (now +${infusionArmor()})`,
    };
    const alchemySection = el('div', {},
      el('h2', {}, 'Alchemy (coins)'),
      // 0.080: potions are a persistent stock; the satchel caps it.
      el('div', { class: 'item-row' },
        el('div', {}, el('b', {}, 'Healing Potion '),
          el('span', {}, `${p.potions}/${p.potionCap} carried — unused potions come home after a run`)),
        el('button', {
          disabled: p.coins < potionCost() || satchelFull(p),
          // running low and able to buy: the obvious next step (0.090)
          class: potionsLow(p) && p.coins >= potionCost() && !satchelFull(p) ? 'active' : '',
          key: 'u', // b-u-y
          onclick: () => { restockPotion(); render(root); },
        }, satchelFull(p) ? 'Satchel full' : `Buy (${potionCost()}c)`)),
      el('div', { class: 'item-row' },
        el('div', {}, el('b', {}, 'Potion Satchel '),
          el('span', {}, satchelMaxed(p) ? `carries ${p.potionCap} potions (max)` : `+1 potion capacity (now ${p.potionCap})`)),
        satchelMaxed(p)
          ? el('span', { class: 'forge-max' }, 'MAX')
          : el('button', {
              disabled: p.coins < satchelCost(p),
              key: 'x', // e-x-pand
              onclick: () => { sfx('levelup'); expandSatchel(); render(root); },
            }, `Expand (${satchelCost(p)}c)`)),
      ...Object.entries(ALCHEMY_DEFS).map(([track, def]) => {
        const lvl = p.alchemy[track] ?? 0;
        return el('div', { class: 'item-row' },
          el('div', {},
            el('b', {}, el('u', {}, def.name[0]), def.name.slice(1) + ' '),
            el('span', {}, `Lv ${lvl} — ${alchemyDesc[track]()}`)),
          alchemyMaxed(track)
            ? el('span', { class: 'forge-max' }, 'MAX')
            : el('button', {
              disabled: p.coins < alchemyCost(track),
              key: def.key,
              onclick: () => { sfx('levelup'); trainAlchemy(track); render(root); },
            }, `Train (${alchemyCost(track)}c)`));
      }));

    // ---- EQUIPMENT with per-item Forge enhancement. ----
    const eq = p.equipment;
    const slotRow = (label, id) => {
      const item = id ? itemWithForge(id, p) : null;
      const forgeLvl = id ? (p.forged[id] ?? 0) : 0;
      // The Forge only enhances tier 2+ gear — tier 1 starter junk is not
      // worth the coins, so it gets no enhance button at all (0.068).
      const forgeable = !!item && item.tier > 1;
      return el('div', { class: 'item-row' },
        el('span', { style: 'color:#9a8b6a;flex-shrink:0' }, label),
        item
          ? el('div', { class: 'equip-right' },
              el('div', { style: 'text-align:right' },
                el('div', {}, itemName(item), forgeLvl ? ` +${forgeLvl}` : null),
                el('div', { style: 'color:#7a6d4f;font-size:0.85rem' }, describeItem(item))),
              !forgeable
              ? null
              : forgeMaxed(id)
                ? el('span', { class: 'forge-max' }, 'MAX')
                : el('button', {
                    class: 'forge-btn',
                    disabled: p.coins < forgeCost(id),
                    onclick: () => { sfx('forge'); narrate('forge'); forgeItem(id); render(root); },
                  }, `+${forgeCost(id)}c`))
          : el('span', { style: 'color:#4a4234' }, '— empty —'));
    };
    const equipSection = el('div', {},
      slotRow('Weapon', eq.weapon),
      slotRow('Armor', eq.armor),
      slotRow('Boots', eq.boots),
      slotRow('Ring I', eq.rings[0]),
      slotRow('Ring II', eq.rings[1]),
      slotRow('Trinket', eq.trinket),
      slotRow('Amulet', eq.amulet));

    const descendBtn = el('button', { class: 'primary', key: 'd', proceed: true, onclick: () => descend(descendBtn) }, 'Descend into the Dungeon');
    root.innerHTML = '';
    root.append(
      el('div', { class: 'hub-container' },
        el('div', { class: 'hub-wrap' },
          // Left: the Great Hall — resources and disciplines.
          el('div', { class: 'panel' },
            el('h1', {}, 'THE GREAT HALL'),
            el('div', { class: 'subtitle' }, 'Your war camp at the castle gates'),
            statsRow,
            trainSection),
          // Middle: alchemy (coins) with lifetime records beneath.
          el('div', { class: 'hub-col' },
            el('div', { class: 'panel' }, alchemySection),
            el('div', { class: 'panel' },
              el('h2', {}, 'RECORDS'),
              el('div', { class: 'subtitle records-line' },
                `${p.records.runs} runs, ${p.records.kills} kills, deepest room ${p.records.bestRoom}.`))),
          // Right: equipment slots with per-item Forge enhancement.
          el('div', { class: 'panel' },
            el('h1', {}, 'EQUIPMENT'),
            el('div', { class: 'subtitle' }, 'What you carry into the dark — the Forge enhances it for coins'),
            equipSection)),
        el('div', { class: 'btn-row' },
          descendBtn,
          el('button', { key: 'b', onclick: () => go('title') }, 'Back')))
    );
  }
}

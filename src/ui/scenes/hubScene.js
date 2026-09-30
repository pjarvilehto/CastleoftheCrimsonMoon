// ui/scenes/hubScene.js — the meta game: disciplines, shop, alchemy, forge.
// Currency split (0.059): XP trains disciplines; coins buy potions,
// alchemy tracks, and Forge item enhancements.

import { el, setBackground, show, currentScene } from '../../core/scene.js';
import { preloadRest, restProgress } from '../../shared/preload.js';
import { sfx } from '../../audio/sfx.js';
import { DATA } from '../../shared/data.js';
import { getProfile, derivedStats, itemWithForge, playerLevel } from '../../meta/profile.js';
import {
  STAT_DEFS, statDesc, statCost, canAfford, buyStat,
  restockPotion, potionCost, satchelFull, satchelCost, satchelMaxed, expandSatchel,
  ALCHEMY_DEFS, alchemyCost, trainAlchemy, potionHealAmount, efficiencyChance, infusionArmor,
  forgeCost, forgeMaxed, forgeItem,
} from '../../meta/leveling.js';
import { statBox, describeItem, itemName } from '../hud.js';
import { play } from '../../audio/music.js';
import { dungeonScene } from './dungeonScene.js';
import { titleScene } from './titleScene.js';
import { confirmPrompt } from '../confirmPrompt.js';

// Great Hall potion count color (0.089): green when the satchel is full,
// red when running low (1 or none, or a quarter of the satchel or less).
export function potionLevel(p) {
  if (p.potions >= p.potionCap) return 'potions-full';
  if (p.potions <= Math.max(1, Math.floor(p.potionCap / 4))) return 'potions-low';
  return 'potions-ok';
}

// XP / Coins turn green when there's something to spend them on (0.090),
// so a returning player remembers to train before descending again.
export function canSpendXp(p) {
  return Object.keys(STAT_DEFS).some((k) => canAfford(k));
}

export function canSpendCoins(p) {
  if (!satchelFull(p) && p.coins >= potionCost()) return true;
  if (!satchelMaxed(p) && p.coins >= satchelCost(p)) return true;
  if (Object.keys(ALCHEMY_DEFS).some((t) => p.coins >= alchemyCost(t))) return true;
  const eq = p.equipment;
  return [eq.weapon, eq.armor, eq.boots, ...eq.rings, eq.trinket, eq.amulet]
    .some((id) => id && (DATA.items[id]?.tier ?? 1) > 1 && !forgeMaxed(id) && p.coins >= forgeCost(id));
}

// Buy Potion gets the pulsing 'active' glow below 30% of the satchel.
export function potionsLow(p) {
  return p.potions < p.potionCap * 0.3;
}

export function hubScene() {
  const scene = {
    enter(root) {
      play('title');
      setBackground(DATA.backgrounds.hub);
      render(root);
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
    if (!left.length) return go(btn);
    confirmPrompt({
      title: 'Descend Now?',
      lines: [`You still have ${left.join(' and ')} to spend.`, 'Are you sure you want to proceed?'],
      yes: ['Descend Anyway', 'y'],
      no: ['Stay and Spend', 'n'],
      onYes: () => go(btn),
    });
  }

  async function go(btn) {
    if (!restProgress().ready) {
      btn.setAttribute('disabled', '');
      const label = () => { const q = restProgress(); btn.textContent = `Gathering shadows… ${q.total ? Math.round((100 * q.done) / q.total) : 0}%`; };
      label();
      const timer = setInterval(label, 200);
      await preloadRest();
      clearInterval(timer);
      if (currentScene() !== scene) return; // left the hall meanwhile
    }
    show(dungeonScene());
  }

  function render(root) {
    const p = getProfile();
    const stats = derivedStats(p);
    const every = DATA.difficulty.breakthroughEvery ?? 5;

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
            onclick: () => { sfx('levelup'); buyStat(key); render(root); },
          }, `Train (${statCost(lvl).xp}xp)`));
      }));

    // ---- ALCHEMY: potions + three coin tracks. ----
    const alchemyDesc = {
      potency: () => `+${DATA.difficulty.alchemyTracks?.potency?.healPerLevel ?? 50} potion healing per level (now ${potionHealAmount()} HP)`,
      efficiency: () => `chance a potion is not consumed (now ${Math.round(efficiencyChance() * 100)}%)`,
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
          el('button', {
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
      const forgeable = !!item && (item.tier ?? 1) > 1;
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
                    onclick: () => { sfx('forge'); forgeItem(id); render(root); },
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

    const descendBtn = el('button', { class: 'primary', key: 'd', onclick: () => descend(descendBtn) }, 'Descend into the Dungeon');
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
          el('button', { key: 'b', onclick: () => show(titleScene()) }, 'Back')))
    );
  }
}

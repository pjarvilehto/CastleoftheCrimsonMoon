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
  ALCHEMY_DEFS, alchemyCost, alchemyMaxed, trainAlchemy,
  forgeCost, forgeMaxed, forgeItem, forgeable } from '../../meta/leveling.js';
import { statBox, describeItem, itemName, potionLevel } from '../hud.js';
import { statDesc, alchemyDesc, potionDesc, satchelDesc, recordsLine } from '../hubText.js';
import { phoneLayout } from '../../shared/platform.js';
import { play } from '../../audio/music.js';
import { confirmPrompt } from '../confirmPrompt.js';
import { maybeAskBenchmark } from '../benchmark.js';
import { narrate } from '../../audio/narrator.js';

// XP / Coins turn green when there's something to spend them on (0.090),
// so a returning player remembers to train before descending again.
export function canSpendXp(p) {
  return Object.keys(STAT_DEFS).some((k) => p.xp >= statCost(p.stats[k]).xp);
}

// Coins buy in two places: the alchemy panel (potions, the satchel, the
// tracks) and the Forge (equipment). The phone's tabs dot each by its own
// (0.00209: Alchemy used to carry the Forge's dot).
export function canSpendAlchemy(p) {
  if (!satchelFull(p) && p.coins >= potionCost()) return true;
  if (!satchelMaxed(p) && p.coins >= satchelCost(p)) return true;
  return Object.keys(ALCHEMY_DEFS).some((t) => !alchemyMaxed(t) && p.coins >= alchemyCost(t));
}
export function canForgeAny(p) {
  return equippedItemIds(p.equipment).some((id) => forgeable(id) && !forgeMaxed(id) && p.coins >= forgeCost(id));
}
export const canSpendCoins = (p) => canSpendAlchemy(p) || canForgeAny(p);

// Buy Potion gets the pulsing 'active' glow below potions.lowShare of the satchel.
export function potionsLow(p) {
  return p.potions < p.potionCap * DATA.difficulty.potions.lowShare;
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
    relayout(root) { render(root); }, // the phone query flipped (main.js watchPhoneLayout): the other assembly
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
    const phone = phoneLayout(); // 0.00208: the phone's assembly and wording (below)

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
        const desc = statDesc(key, lvl, phone);
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
    const alchemySection = el('div', {},
      el('h2', {}, 'Alchemy (coins)'),
      // 0.080: potions are a persistent stock; the satchel caps it.
      el('div', { class: 'item-row' },
        el('div', {}, el('b', {}, 'Healing Potion '),
          el('span', {}, potionDesc(p, phone))),
        el('button', {
          disabled: p.coins < potionCost() || satchelFull(p),
          // running low and able to buy: the obvious next step (0.090)
          class: potionsLow(p) && p.coins >= potionCost() && !satchelFull(p) ? 'active' : '',
          key: 'u', // b-u-y
          onclick: () => { restockPotion(); render(root); },
        }, satchelFull(p) ? 'Satchel full' : `Buy (${potionCost()}c)`)),
      el('div', { class: 'item-row' },
        el('div', {}, el('b', {}, phone ? 'Satchel ' : 'Potion Satchel '),
          el('span', {}, satchelDesc(p, satchelMaxed(p), phone))),
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
            el('span', {}, `Lv ${lvl} — ${alchemyDesc(track, phone)}`)), // (efficiency: 0.112's tapering, the next level's gain)
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
      const canForge = !!item && forgeable(id);
      return el('div', { class: 'item-row' }, // (0.00209: classes, not inline styles — the phone layer restyles them)
        el('span', { class: 'equip-slot' }, label),
        item
          ? el('div', { class: 'equip-right' },
              el('div', { class: 'equip-item' },
                el('div', {}, itemName(item), forgeLvl ? ` +${forgeLvl}` : null),
                el('div', { class: 'equip-desc' }, describeItem(item))),
              !canForge
              ? null
              : forgeMaxed(id)
                ? el('span', { class: 'forge-max' }, 'MAX')
                : el('button', {
                    class: 'forge-btn',
                    disabled: p.coins < forgeCost(id),
                    onclick: () => { sfx('forge'); narrate('forge'); forgeItem(id); render(root); },
                  }, `+${forgeCost(id)}c`))
          : el('span', { class: 'equip-empty' }, '— empty —'));
    };
    const equipSection = el('div', {},
      slotRow('Weapon', eq.weapon),
      slotRow('Armor', eq.armor),
      slotRow('Boots', eq.boots),
      slotRow('Ring I', eq.rings[0]),
      slotRow('Ring II', eq.rings[1]),
      slotRow('Trinket', eq.trinket),
      slotRow('Amulet', eq.amulet));

    // the way forward pulses when nothing here can be bought (the first visit: 0 XP, 0 coins, three panels of upgrades — 0.00200)
    const descendBtn = el('button', { class: `primary${!canSpendXp(p) && !canSpendCoins(p) ? ' active' : ''}`, key: 'd', proceed: true, onclick: () => descend(descendBtn) }, 'Descend into the Dungeon');
    // The hall's three sections, ONE table for both assemblies (0.00209): the
    // desktop lays them out as three columns, the phone as three stacked
    // sheets under tabs (phoneHall). A new section is a row here and nothing
    // else. spend: something in it can be bought now (the phone's tab dot).
    const hall = [
      { tab: 'Train', title: 'THE GREAT HALL', subtitle: 'Your war camp at the castle gates', body: trainSection, spend: canSpendXp(p) },
      { tab: 'Alchemy', body: alchemySection, spend: canSpendAlchemy(p) },
      { tab: 'Equipment', title: 'EQUIPMENT', subtitle: 'What you carry into the dark — the Forge enhances it for coins', body: equipSection, spend: canForgeAny(p) },
    ];
    const records = el('div', { class: 'subtitle records-line' }, recordsLine(p));
    const wayOn = [descendBtn, el('button', { key: 'b', onclick: () => go('title') }, 'Back')];
    root.innerHTML = '';
    if (phone) { root.append(phoneHall(hall, statsRow, records, wayOn)); settleSheet(root); return; }
    const [train, alchemy, equipment] = hall;
    root.append(
      el('div', { class: 'hub-container' },
        el('div', { class: 'hub-wrap' },
          // Left: the Great Hall — resources and disciplines.
          el('div', { class: 'panel' }, el('h1', {}, train.title), el('div', { class: 'subtitle' }, train.subtitle), statsRow, train.body),
          // Middle: alchemy (coins) with lifetime records beneath.
          el('div', { class: 'hub-col' },
            el('div', { class: 'panel' }, alchemy.body),
            el('div', { class: 'panel' }, el('h2', {}, 'RECORDS'), records)),
          // Right: equipment slots with per-item Forge enhancement.
          el('div', { class: 'panel' }, el('h1', {}, equipment.title), el('div', { class: 'subtitle' }, equipment.subtitle), equipment.body)),
        el('div', { class: 'btn-row' }, ...wayOn)));
  }
}

// The phone's Great Hall (0.00208, styles.css's phone layer, .phone-hub):
// a strip of stat chips beside the title, then TRAIN / ALCHEMY / EQUIPMENT
// as a stack of three sheets under their tabs — each 45% wide at its tab's
// position, the picked one lifted to the front, the others dimmed behind
// it; a tap on a sheet's edge or its tab lifts it — and the records line
// with Descend and Back fixed along the bottom. A green dot on a tab says
// something there can be bought (the desktop shows all three panels at
// once; a phone shows one). The pick lasts the session, so a purchase's
// re-render stays on the same sheet.
let phonePick = 0, phoneScroll = 0; // the picked sheet and how far it was scrolled (a purchase re-renders: the sheet stays put)
function phoneHall(hall, statsRow, records, wayOn) {
  const tabs = el('div', { class: 'tabs' });
  const body = el('div', { class: 'tab-body' });
  const pick = (i) => {
    if (phonePick !== i) phoneScroll = 0;
    phonePick = i;
    [...tabs.children].forEach((b, j) => b.classList.toggle('on', j === i));
    [...body.children].forEach((q, j) => q.classList.toggle('on', j === i));
    tabs.className = `tabs pick-${i + 1}`; body.className = `tab-body pick-${i + 1}`; // the stacking order (styles.css)
  };
  hall.forEach(({ tab, body: section, spend }, i) => {
    tabs.append(el('button', { class: spend ? 'spend' : '', onclick: () => pick(i) }, tab));
    const sheet = el('div', { class: 'panel', onclick: () => { if (phonePick !== i) pick(i); } }, section); // (a sheet behind: the tap only lifts it — its buttons take no taps, styles.css)
    sheet.addEventListener?.('scroll', () => { if (phonePick === i) phoneScroll = sheet.scrollTop; });
    body.append(sheet);
  });
  pick(Math.min(phonePick, hall.length - 1));
  return el('div', { class: 'hub-container phone-hub' },
    el('div', { class: 'hub-head' }, el('h1', {}, hall[0].title), statsRow),
    tabs, body,
    el('div', { class: 'hub-foot' }, records, ...wayOn));
}
// after the phone hall is in the DOM: the picked sheet back where it was scrolled
function settleSheet(root) {
  const sheet = root.querySelector?.('.phone-hub .tab-body > .panel.on');
  if (sheet && phoneScroll) sheet.scrollTop = phoneScroll;
}

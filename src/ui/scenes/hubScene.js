// ui/scenes/hubScene.js — the meta game: disciplines, shop, alchemy, forge.
// Currency split (0.059): XP trains disciplines; coins buy potions,
// alchemy tracks, and Forge item enhancements. The three sections' rows
// are built in ui/hubSections.js (0.00223); this file keeps the hall's
// table, the two assemblies (rule 8), Descend and the purchase flash.

import { setBackground, currentScene, go, whenWindowsBack } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { preloadRest, restProgress } from '../../shared/preload.js';
import { DATA } from '../../shared/data.js';
import { getProfile } from '../../meta/profile.js';
import { derivedStats, playerLevel } from '../../meta/stats.js';
import { equippedItemIds } from '../../meta/equipment.js';
import {
  STAT_DEFS, statCost,
  potionCost, satchelFull, satchelCost, satchelMaxed,
  ALCHEMY_DEFS, alchemyCost, alchemyMaxed,
  forgeCost, forgeMaxed, forgeable } from '../../meta/leveling.js';
import { statBox, potionLevel } from '../hud.js';
import { recordsLine } from '../hubText.js';
import { trainSection, alchemySection, equipSection, knightSection, gearLabel } from '../hubSections.js'; // the sections (0.00223; the knight 0.00238)
import { phoneLayout } from '../../shared/platform.js';
import { play } from '../../audio/music.js';
import { confirmPrompt } from '../confirmPrompt.js';
import { maybeAskBenchmark } from '../benchmark.js';
import { narrate } from '../../audio/narrator.js';
import { pulseNumber, tickUp } from '../fx.js';
import { sfx } from '../../audio/sfx.js';

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

// opts.fromRun: entered from a run's end (the narrator's "Rest… while you can.", 0.161)
// opts.finds: the slots that run's finds filled (equipment.js equipItems
// `changes`, 0.00248, the owner's ask): the hall opens with the OLD items
// there, then each new one takes its place in turn — the slot glows, its
// name flashes, the numbers it moves roll up — and keeps a NEW tag.
const REVEAL_MS = 900, REVEAL_FIRST_MS = 700; // (the look: the beat between finds)
export function hubScene(opts = {}) {
  let leaving = false;
  const pending = (opts.fromRun ? opts.finds ?? [] : []).map((c) => ({ ...c, label: gearLabel(c) })).filter((c) => c.label);
  const found = new Set();
  // The profile as the hall shows it mid-reveal: the slots still to come wear their old item.
  const shownProfile = (p) => {
    if (!pending.length) return p;
    const eq = { ...p.equipment, rings: [...p.equipment.rings] };
    for (const c of pending) { if (c.slot === 'rings') eq.rings[c.index] = c.from; else eq[c.slot] = c.from; }
    return { ...p, equipment: eq };
  };
  const waiting = () => new Set(pending.map((c) => c.label)); // (their old item is salvaged already: no Forge button until the reveal)
  const scene = {
    enter(root) {
      play('title');
      setBackground(DATA.backgrounds.hub);
      render(root);
      if (opts.fromRun) narrate('hall_return');
      // the finds take their slots one by one once the hall's windows are in
      const reveal = () => {
        if (currentScene() !== scene || leaving || !pending.length) return;
        const c = pending.shift();
        found.add(c.label);
        flashNext(`slot-${c.label}`);
        render(root);
        const row = root.querySelector?.(`[data-row="slot-${c.label}"]`);
        row?.animate?.([ // (one-shot: a gold flare round the slot)
          { boxShadow: '0 0 0 0 rgba(232,196,92,0)', borderColor: 'rgba(232,196,92,1)' },
          { boxShadow: '0 0 22px 4px rgba(232,196,92,0.85)', borderColor: 'rgba(255,236,170,1)', offset: 0.3 },
          { boxShadow: '0 0 0 0 rgba(232,196,92,0)' },
        ], { duration: 1400, easing: 'ease-out' });
        row?.querySelector?.('.slot-art img')?.animate?.([ // (0.00260, one-shot: the find's picture flashes in as it lands)
          { opacity: 0, filter: 'brightness(2.6) contrast(1.08) saturate(0.6)', transform: 'scale(1.18)' }, // (the filter list matches styles.css .slot-art img's, so it eases back into it)
          { opacity: 1, filter: 'brightness(1.9) contrast(1.08) saturate(1.1)', transform: 'scale(1.04)', offset: 0.3 },
          { opacity: 1 },
        ], { duration: 1400, easing: 'ease-out' });
        sfx(DATA.items[c.to]?.tier >= 3 ? 'rare' : 'loot');
        if (pending.length) setTimeout(reveal, REVEAL_MS);
      };
      if (pending.length) whenWindowsBack().then(() => setTimeout(reveal, REVEAL_FIRST_MS));
      // 0.133: the one-time benchmark request, once the hall has faded in;
      // 0.134: never over another dialog — it waits its turn
      // 0.136: …and never once a descent has started ("Gathering shadows…"
      // waits for the art; the run would start under the prompt and be lost)
      // 0.00223: …and only once the hall's windows are back (enter() runs inside the
      // transition; the ask used to open mid-fade and its Continue's go() was dropped)
      const ask = () => { if (currentScene() === scene && !leaving && maybeAskBenchmark() === 'wait') setTimeout(ask, 1000); };
      whenWindowsBack().then(() => setTimeout(ask, 1200));
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
    const p = shownProfile(getProfile()); // (mid-reveal: the finds still to come show their old items, and the numbers follow)
    const stats = derivedStats(p);
    const phone = phoneLayout(); // 0.00208: the phone's assembly and wording (below)

    const purchase = !!flashRow; // (render after a buy: the boxes it moved glow, below)
    // the phone's stat strip (0.081's boxes; the desktop's numbers sit under the knight, knightSection)
    let vals = { Level: playerLevel(p), Attack: stats.dmg, HP: stats.maxHp, Armor: stats.armor, Potions: `${p.potions}/${p.potionCap}` };
    let boxes = {
      Level: statBox('Level', vals.Level), // 0.080: same LV as the combat card
      Coins: statBox('Coins', p.coins, canSpendCoins(p) ? 'spendable' : ''),
      XP: statBox('XP', p.xp, canSpendXp(p) ? 'spendable' : ''),
      Attack: statBox('Attack', vals.Attack),
      HP: statBox('HP', vals.HP),
      Armor: statBox('Armor', vals.Armor),
      Potions: statBox('Potions', vals.Potions, `stat-potions ${potionLevel(p)}`),
    };
    const statsRow = el('div', { class: 'stat-grid hub-stats' }, ...Object.values(boxes));

    // the three sections (ui/hubSections.js); done = a purchase landed: the row flashes after the re-render
    const done = (row) => { flashNext(row); render(root); };
    const [trainBody, alchemyBody, equipBody] = [trainSection(p, phone, done, canSpendXp(p)), alchemySection(p, phone, done, canSpendAlchemy(p)), phone ? equipSection(p, done, found, waiting()) : null];

    // the way forward pulses when nothing here can be bought (the first visit: 0 XP, 0 coins, three panels of upgrades — 0.00200)
    const descendBtn = el('button', { class: `primary${!canSpendXp(p) && !canSpendCoins(p) ? ' active' : ''}`, key: 'd', proceed: true, onclick: () => descend(descendBtn) }, 'Descend into the Dungeon');
    // The hall's sections as the phone's sheets (0.00209: one table; phoneHall
    // stacks them under tabs). 0.00238: the desktop and the tablet draw the
    // knight panel, TRAIN and ALCHEMY instead (below) — the phone's own pass
    // is still to come. spend: something in it can be bought now (the tab's dot).
    const hall = [
      { tab: 'Train', title: 'THE GREAT HALL', subtitle: 'Your war camp at the castle gates', body: trainBody, spend: canSpendXp(p) },
      { tab: 'Alchemy', body: alchemyBody, spend: canSpendAlchemy(p) },
      { tab: 'Equipment', title: 'EQUIPMENT', subtitle: 'What you carry into the dark — the Forge enhances it for coins', body: equipBody, spend: canForgeAny(p) },
    ];
    const records = el('div', { class: 'subtitle records-line' }, recordsLine(p));
    const wayOn = [descendBtn, el('button', { key: 'b', onclick: () => go('title') }, 'Back')];
    root.innerHTML = '';
    if (phone) { root.append(phoneHall(hall, statsRow, records, wayOn)); settleSheet(root); settleFlash(root); settleStats(boxes, vals, purchase); return; }
    // The desktop and the tablet (0.00238, the developer's layout): the hall's
    // name and the records up top; the knight with his gear and numbers,
    // TRAIN and ALCHEMY as three panels of one height; the way on at the
    // foot. Each purse sits in the head of the section that spends it.
    const knight = knightSection(p, done, found, waiting());
    ({ boxes, vals } = knight);
    root.append(
      el('div', { class: 'hub-container hall-desk' },
        el('div', { class: 'hall-top' }, el('h1', {}, hall[0].title), records),
        el('div', { class: 'hub-wrap' }, knight.panel, el('div', { class: 'panel' }, trainBody), el('div', { class: 'panel' }, alchemyBody)),
        el('div', { class: 'btn-row' }, ...wayOn)));
    settleFlash(root);
    settleStats(boxes, vals, purchase);
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
// A purchase's feedback (0.00216, the developer's ask): the row just bought
// re-renders at its new level and its label glows, grows a little and
// flashes — Precision LV2 to LV3, 3/4 potions to 4/4. The handlers name
// the row (data-row) before the re-render; settleFlash finds it after.
let flashRow = null;
const flashNext = (row) => { flashRow = row; }; // (then the handler's own render(root))
function settleFlash(root) {
  if (!flashRow) return;
  const row = root.querySelector?.(`[data-row="${flashRow}"]`); flashRow = null;
  const label = row?.querySelector?.('.equip-item, .slot-name, .row-title') ?? row?.children?.[0]; // (a forged slot: the item's name and bonus; an upgrade: its title, not the small line)
  if (label) { label.style.display = 'inline-block'; label.style.transformOrigin = 'left center'; pulseNumber(label); } // (a block would scale around its own centre, off the row)
}
// ...and the attribute it raised (0.00235, the developer's ask): a box whose
// value a purchase changed — Attack after Power or a forged blade, HP after
// Vitality, Armor after Endurance or forged armor, the Level every fifth
// trained level, Potions after a buy or a bigger satchel — rolls up to its
// new value and glows while it does. Coins and XP (what was spent) do not.
let shownStats = null; // the boxes' values as last drawn
function settleStats(boxes, vals, purchase) {
  if (purchase && shownStats) {
    for (const [k, v] of Object.entries(vals)) {
      const from = shownStats[k];
      if (from === v) continue;
      const value = boxes[k]?.children?.[1];
      if (!value) continue;
      value.style.display = 'inline-block'; value.style.transformOrigin = 'right center'; // (the value sits at the box's right: grow from there)
      if (typeof v === 'number' && typeof from === 'number') tickUp(value, from, v, 900); else pulseNumber(value);
    }
  }
  shownStats = vals;
}
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

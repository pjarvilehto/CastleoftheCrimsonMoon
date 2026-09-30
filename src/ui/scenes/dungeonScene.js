// ui/scenes/dungeonScene.js — one room at a time: enter, fight, loot, choose.
// Combat rooms use the chromeless card layout (battle-line.js); shrine
// rooms keep the panel layout. Playback queue: combatPlayback.js.
//
// Log line colors (see #combat-log CSS):
//   atk  — red    (player attacks, enemy attacks, deaths)
//   heal — green  (potions, lifesteal)
//   move — yellow (entering / moving between rooms, room-cleared rewards)
//   loot — gold   (per-kill drops, shrine blessings)
//   multi— gold bold (multi-kill)
//   sys  — gray   (deaths, misc)

import { el, setBackground, show, transitionTo } from '../../core/scene.js';
import { createRun, enterNextRoom, applyLoot, drinkPotion, settleRun } from '../../run/runState.js';
import { getProfile } from '../../meta/profile.js';
import { createCombat, playerAttack, canHeavy, useHeavy } from '../../run/combat.js';
import { logLine, hpBar, itemName } from '../hud.js';
import { deathFlash, tickUp } from '../fx.js';
import { createPlayback } from '../combatPlayback.js';
import { shrineBody } from '../shrineUI.js';
import { createBuffBar, updateBuffs } from '../buffs.js';
import { playerCard, enemyCard } from '../battleLine.js';
import { DATA } from '../../shared/data.js';
import { play } from '../../audio/music.js';
import { sfx } from '../../audio/sfx.js';
import { showDeathModal } from '../deathModal.js';
import { runEndScene } from './runEndScene.js';

export function dungeonScene() {
  const run = createRun();
  let combat = null;
  let logEl = null;      // ONE persistent log for the whole dungeon visit
  let roomStart = null;  // loot snapshot at room entry, for the victory summary
  let currentRoot = null;
  let shownCoins = 0;    // animated HUD counter values (tick up to reality)
  let shownXp = 0;
  let buffBar = null;    // bottom-left shrine blessing bar
  let deathShown = false; // death modal fired for the fatal blow

  const playback = createPlayback({
    logEl: () => logEl,
    renderNow: () => render(currentRoot),
    onEmpty: () => {
      tickUpChips();
      if (combat.over && !combat.victory) openDeathModal();
    },
  });

  // Combat event -> sound effect (attached at enqueue time so each sound
  // fires when its line PRINTS, not when the button was clicked).
  // (Above `return` like hpColor — consts below the factory return are TDZ.)
  const EV_SFX = {
    atk: 'attack', spill: 'attack', thorns: 'attack',
    dmg: 'hurt', dodge: 'swoosh', heal: 'heal',
    kill: 'kill', multi: 'kill', smash: 'kill', revive: 'shrine',
  };

  // Shared HP color scale: <=25% red, <=75% yellow, above green.
  // (Declared before `return` — the factory's return exits before any
  // statement below it would run, which put this in TDZ for render.)
  const hpColor = (cur, max) => {
    const pct = cur / max;
    return pct <= 0.25 ? '#c14b4b' : pct <= 0.75 ? '#d8c95a' : '#7bc98a';
  };

  return {
    enter(root) {
      logEl = el('div', { id: 'combat-log' });
      buffBar = createBuffBar();
      // First room enters inline — show()'s own transition is already
      // fading the windows, a nested transitionTo would deadlock on guard.
      nextRoom(root, true);
    },
  };

  function nextRoom(root, instant = false) {
    const setup = () => {
      const firstRoom = run.roomNumber === 0;
      const room = enterNextRoom(run);
      play(room.kind === 'boss' ? 'boss' : room.kind === 'shrine' ? 'shrine' : 'combat');
      combat = createCombat(run, room);
      deathShown = false;
      playback.reset(combat);
      setBackground(room.background);
      roomStart = { coins: run.coins, xp: run.xp, items: run.itemsFound.length };
      shownCoins = run.coins; // reset counters per room (no tick-up anim)
      shownXp = run.xp;
      logLine(logEl, firstRoom
        ? `You enter the castle: ${room.name} (room ${room.number}).`
        : `You move to the next room... ${room.name} (room ${room.number}).`, 'move');
      render(root);
    };
    if (instant) setup();
    else { sfx('swoosh'); transitionTo(setup); } // windows out, bg crossfade, windows in
  }

  function render(root) {
    currentRoot = root;
    const room = run.room;
    if (room.kind === 'shrine') renderShrine(root, room);
    else renderCombat(root, room);
  }

  // ---- combat: chromeless card battle line ----
  function renderCombat(root, room) {
    const printing = playback.isPrinting();
    const lowhp = (run.hp / run.maxHp) <= 0.25 ? ' lowhp' : '';

    // Cards keep their combat slot even when dead — only the attack
    // button goes away (battleLine mounts an invisible placeholder row
    // so a dead card can't shift vertically either).
    const enemyStates = combat.enemies
      .map((e, i) => ({ e, i, hp: playback.hpOf(i, e.hp) }));

    const pCard = playerCard(run, {
      printing,
      heavyReady: canHeavy(combat) && !printing && !combat.over,
      heavyCd: combat.heavyCd,
      onHeavy: () => { useHeavy(combat); act(() => playerAttack(combat, firstAlive(), true)); },
      onPotion: () => {
        if (combat.over || playback.isPrinting()) return;
        const sip = drinkPotion(run);
        if (sip) {
          sfx('heal');
          logLine(logEl, `You drink a potion. (+${sip.healed} HP)${sip.free ? ' The elixir is not spent!' : ''}${sip.armor ? ` (+${sip.armor} armor until the room ends)` : ''}`, 'heal');
        }
        render(root);
      },
      lowhp,
    });

    const eCards = enemyStates.map(({ e, i, hp }) => enemyCard(e, i, hp, {
      printing,
      combatOver: combat.over,
      onAttack: () => act(() => playerAttack(combat, i, false)),
    }));

    // Death has no corner button — the fatal blow triggers the blood-red
    // flash and the centered YOU DIED dialog (openDeathModal, 0.067).
    const proceed = el('div', { class: 'combat-proceed' });
    if (combat.over && !printing && combat.victory) {
      proceed.append(
        // 'active' (0.079): pulsing yellow — the obvious next step.
        el('button', { class: 'primary active', key: 'd', key2: ' ', onclick: () => nextRoom(root) }, 'Push Deeper'),
        el('button', { class: 'danger', key: 'r', onclick: () => endRun(root, 'retreat') }, 'Retreat with Loot'));
    }

    root.innerHTML = '';
    root.append(
      el('h1', { class: 'room-title' }, room.isBoss ? room.name : `Room ${room.number} - ${room.name}`, recordTag()),
      // --n drives the card size (styles.css --card-h): crowded rooms
      // shrink their cards to fit the width instead of wrapping (0.078).
      el('div', { class: 'battle-line', style: `--n:${combat.enemies.length}` }, pCard, el('div', { class: 'enemy-row' }, ...eCards)),
      el('div', { class: 'resources' },
        el('div', { class: 'res-row' }, el('span', { class: 'res-label' }, 'XP'), el('b', { id: 'hud-xp' }, String(shownXp))),
        el('div', { class: 'res-row' }, el('span', { class: 'res-label' }, 'COINS'), el('b', { id: 'hud-coins' }, String(shownCoins)))),
      logEl,
      proceed);
    logEl.className = 'docked';
    logEl.scrollTop = logEl.scrollHeight;
    root.append(buffBar);
    updateBuffs(buffBar, run.buffs);
  }

  // ---- shrine: panel layout (same as pre-card builds) ----
  function renderShrine(root, room) {
    const printing = playback.isPrinting();
    const lowhp = (run.hp / run.maxHp) <= 0.25 ? ' lowhp' : '';
    const potionColor = run.potions >= 3 ? '#7bc98a' : run.potions >= 1 ? '#d8c95a' : '#c14b4b';

    const header = el('div', { class: 'run-hud' },
      el('span', {}, 'Room ', el('b', {}, String(room.number))),
      el('span', { class: `hud-chip${lowhp}`, id: 'hud-hp' }, 'HP ', el('b', { style: `color:${hpColor(run.hp, run.maxHp)}` }, `${run.hp}/${run.maxHp}`), hpBar(run.hp, run.maxHp, hpColor(run.hp, run.maxHp))),
      el('span', {}, 'Coins ', el('b', { id: 'hud-coins' }, String(shownCoins))),
      el('span', {}, 'XP ', el('b', { id: 'hud-xp' }, String(shownXp))),
      el('span', {}, 'Potions ', el('b', { style: `color:${potionColor}` }, String(run.potions))));

    const proceed = el('div', { class: 'btn-row' });
    proceed.append(
      el('button', { class: 'primary', key: 'd', key2: ' ', onclick: () => nextRoom(root) }, 'Push Deeper'));
    if (room.taken) {
      proceed.append(
        el('button', { class: 'danger', key: 'r', onclick: () => endRun(root, 'retreat') }, 'Retreat with Loot'));
    }

    root.innerHTML = '';
    root.append(
      el('div', { class: 'panel' },
        el('h1', {}, `Room ${room.number} - ${room.name}`, recordTag()),
        header,
        shrineBody(run, room, { log: (t) => logLine(logEl, t, 'loot'), refresh: () => render(currentRoot) }),
        logEl,
        proceed));
    logEl.className = '';
    logEl.scrollTop = logEl.scrollHeight;
    root.append(buffBar);
    updateBuffs(buffBar, run.buffs);
  }

  // Execute a combat action. Combat resolves synchronously; the resulting
  // log lines are queued and printed one by one (logDelayMs apart) so the
  // fight reads as it happens. Input is locked while the queue drains.
  function act(fn) {
    // Ghost-click guard: Safari still fires click events on buttons that
    // were disabled/replaced mid-gesture. Ignore clicks after combat ends
    // or while a previous action is still printing.
    if (combat.over || playback.isPrinting()) return;
    const events = fn();
    for (const ev of events) {
      if (ev.type === 'kill' && ev.enemy) {
        if (ev.silent) {
          // Smash kill: loot silently — the single SMASH line plus the
          // room-cleared summary carry the whole event.
          applyLoot(run, ev.enemy, () => {});
        } else {
          // Death line prints on one tick; the card sinks on the next.
          playback.enqueue({ text: ev.text, cls: 'atk', sink: combat.enemies.indexOf(ev.enemy), sfx: 'kill' });
          applyLoot(run, ev.enemy, (text, cls) => playback.enqueue({ text, cls, sfx: cls === 'relic' ? 'rare' : 'loot' }));
        }
      } else if (ev.type === 'multi') {
        playback.enqueue({ text: ev.text, cls: 'multi', sfx: 'kill' });
      } else {
        const cls = (ev.type === 'dmg' || ev.type === 'spill') ? 'atk' : ev.type;
        playback.enqueue({ text: ev.text, cls, sfx: EV_SFX[ev.type] });
      }
    }
    if (combat.over && combat.victory) {
      playback.enqueue({ text: roomSummaryText(), cls: 'move' });
    }
    playback.begin();
  }

  // Roll the coin/XP HUD counters up to their true values after each
  // action's playback finishes. The chips display shownCoins/shownXp.
  function tickUpChips() {
    const cEl = document.getElementById('hud-coins');
    const xEl = document.getElementById('hud-xp');
    if (cEl && run.coins !== shownCoins) { tickUp(cEl, shownCoins, run.coins, 700); shownCoins = run.coins; }
    if (xEl && run.xp !== shownXp) { tickUp(xEl, shownXp, run.xp, 700); shownXp = run.xp; }
  }

  // Rich log line (array of strings/Nodes): looted item names print in
  // their rarity colors. logLine() accepts both strings and arrays.
  function roomSummaryText() {
    const dc = run.coins - roomStart.coins;
    const dx = run.xp - roomStart.xp;
    const parts = [`Room cleared! Rewards: +${dc} coins, +${dx} XP`];
    const newItems = run.itemsFound.slice(roomStart.items);
    if (newItems.length) {
      parts.push(' — loot: ');
      newItems.forEach((id, i) => {
        if (i > 0) parts.push(', ');
        parts.push(itemName(DATA.items[id]));
      });
    }
    return parts;
  }

  // "★ RECORD DEPTH" tag on the room title: shown when this room is at or
  // past the player's best-ever depth (i.e. the frontier — reached on an
  // earlier run but never cleared, or beyond it). Never on the first run.
  function recordTag() {
    const rec = getProfile().records;
    return rec.runs > 0 && run.roomNumber >= rec.bestRoom
      ? el('span', { class: 'record-tag' }, '★ Record depth')
      : null;
  }

  // Death is an event: after the fatal blow finishes printing, the screen
  // bleeds slowly to red, the YOU DIED dialog flashes in at the peak, and
  // the red fades back out behind it (fx.js deathFlash, 0.079).
  function openDeathModal() {
    if (deathShown) return;
    deathShown = true;
    sfx('death');
    deathFlash(() => showDeathModal(run, () => endRun(currentRoot, 'death')));
  }

  function firstAlive() {
    return combat.enemies.findIndex((e) => e.hp > 0);
  }

  function endRun(root, outcome) {
    settleRun(run, outcome);
    show(runEndScene(run, outcome));
  }
}

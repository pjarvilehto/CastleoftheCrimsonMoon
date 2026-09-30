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
import { createPlayerUnit, createEnemyUnit } from '../battleLine.js';
import { fxFor, playFx, holdFor } from '../combatFx.js';
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
  let ui = null;         // the persistent battle line of the current combat room (0.086)

  const playback = createPlayback({
    logEl: () => logEl,
    onTick: () => { if (ui) updateCombat(); },
    onEmpty: () => {
      tickUpChips();
      if (combat.over && !combat.victory) openDeathModal();
    },
    onFx: (fx) => fx && playFx(fx, fxCtx),
  });
  // What effects can touch: the live units of the battle line.
  const fxCtx = {
    unit: (who) => (!ui ? null : who === 'player' ? ui.player : ui.enemies[who] ?? null),
    get layer() { return ui?.layer ?? null; },
  };

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
      ui = null; // the new room builds its own battle line
      playback.reset();
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
  // Built ONCE per room (0.086) and patched in place on every playback
  // tick — a full rebuild every 100ms restarted any CSS animation.
  function renderCombat(root, room) {
    if (!ui || ui.room !== room || ui.root !== root) buildCombat(root, room);
    updateCombat();
  }

  function buildCombat(root, room) {
    const player = createPlayerUnit(run, {
      onHeavy: () => { if (canAct()) { useHeavy(combat); act(() => playerAttack(combat, firstAlive(), true)); } },
      onPotion: () => {
        // 0.080: potions persist, so topping up between rooms is allowed
        // (after a win) — never while dead or mid-playback.
        if ((combat.over && !combat.victory) || playback.isPrinting()) return;
        const sip = drinkPotion(run);
        if (sip) {
          sfx('heal');
          logLine(logEl, `You drink a potion. (+${sip.healed} HP)${sip.free ? ' The elixir is not spent!' : ''}${sip.armor ? ` (+${sip.armor} armor until the room ends)` : ''}`, 'heal');
          playFx({ kind: 'heal', to: 'player', amount: sip.healed, potion: true }, fxCtx);
        }
        updateCombat();
      },
    });
    const enemies = combat.enemies.map((e, i) => createEnemyUnit(e, i, {
      onAttack: () => act(() => playerAttack(combat, i, false)),
    }));
    // Death has no corner button — the fatal blow triggers the blood-red
    // flash and the centered YOU DIED dialog (openDeathModal, 0.067).
    const proceed = el('div', { class: 'combat-proceed' });
    const layer = el('div', { class: 'fx-layer' }); // floating numbers (0.087)
    root.innerHTML = '';
    root.append(
      el('h1', { class: 'room-title' }, room.isBoss ? room.name : `Room ${room.number} - ${room.name}`, recordTag()),
      // --n drives the card size (styles.css --card-h): crowded rooms
      // shrink their cards to fit the width instead of wrapping (0.078).
      el('div', { class: 'battle-line', style: `--n:${combat.enemies.length}` }, player.el, el('div', { class: 'enemy-row' }, ...enemies.map((u) => u.el))),
      el('div', { class: 'resources' },
        el('div', { class: 'res-row' }, el('span', { class: 'res-label' }, 'XP'), el('b', { id: 'hud-xp' }, String(shownXp))),
        el('div', { class: 'res-row' }, el('span', { class: 'res-label' }, 'COINS'), el('b', { id: 'hud-coins' }, String(shownCoins)))),
      layer,
      logEl,
      proceed);
    logEl.className = 'docked';
    logEl.scrollTop = logEl.scrollHeight;
    root.append(buffBar);
    updateBuffs(buffBar, run.buffs);
    ui = { room, root, player, enemies, proceed, layer };
    playFx({ kind: 'enter' }, fxCtx);
  }

  function updateCombat() {
    const printing = playback.isPrinting();
    ui.player.update({
      hp: playback.playerHpOf(run.hp),
      printing,
      heavyReady: canHeavy(combat) && !printing && !combat.over,
      heavyCd: combat.heavyCd,
      dead: combat.over && !combat.victory,
    });
    ui.enemies.forEach((u, i) => {
      const real = combat.enemies[i].hp;
      u.update({ hp: playback.hpOf(i, real), dead: playback.deadOf(i, real), printing, combatOver: combat.over });
    });
    const showProceed = combat.over && !printing && combat.victory;
    if (showProceed && !ui.proceed.children.length) {
      ui.proceed.append(
        // 'active' (0.079): pulsing yellow — the obvious next step.
        el('button', { class: 'primary active', key: 'd', key2: ' ', onclick: () => nextRoom(ui.root) }, 'Push Deeper'),
        el('button', { class: 'danger', key: 'r', onclick: () => endRun(ui.root, 'retreat') }, 'Retreat with Loot'));
    } else if (!showProceed && ui.proceed.children.length) {
      ui.proceed.innerHTML = '';
    }
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
      el('span', {}, 'Potions ', el('b', { style: `color:${potionColor}` }, `${run.potions}/${run.potionCap}`)));

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
    if (!canAct()) return;
    // The replay starts from the state BEFORE the action resolves (0.086).
    const pre = { enemies: combat.enemies.map((e) => e.hp), hp: run.hp };
    const events = fn();
    for (const ev of events) {
      if (ev.type === 'kill' && ev.enemy) {
        if (ev.silent) {
          // Smash kill: loot silently — the single SMASH line plus the
          // room-cleared summary carry the whole event.
          applyLoot(run, ev.enemy, () => {});
        } else {
          // Death line prints on one tick; the card goes down on the next.
          playback.enqueue({ text: ev.text, cls: 'atk', snap: ev.snap, sink: combat.enemies.indexOf(ev.enemy), sfx: 'kill' });
          applyLoot(run, ev.enemy, (text, cls) => playback.enqueue({ text, cls, sfx: cls === 'relic' ? 'rare' : 'loot' }));
        }
      } else {
        const cls = ev.type === 'multi' ? 'multi' : (ev.type === 'dmg' || ev.type === 'spill') ? 'atk' : ev.type;
        const sound = ev.type === 'multi' ? 'kill' : EV_SFX[ev.type];
        const fx = fxFor(ev);
        playback.enqueue({ text: ev.text, cls, snap: ev.snap, fx, hold: holdFor(fx), sfx: sound });
      }
    }
    if (combat.over && combat.victory) {
      playback.enqueue({ text: roomSummaryText(), cls: 'move' });
    }
    playback.begin(pre);
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

  // Ghost-click guard: Safari still fires click events on buttons that
  // were disabled/replaced mid-gesture — no action once combat is over or
  // while a previous action is still printing.
  function canAct() {
    return !combat.over && !playback.isPrinting();
  }

  function firstAlive() {
    return combat.enemies.findIndex((e) => e.hp > 0);
  }

  function endRun(root, outcome) {
    settleRun(run, outcome);
    show(runEndScene(run, outcome));
  }
}

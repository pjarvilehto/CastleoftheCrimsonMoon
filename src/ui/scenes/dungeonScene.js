// ui/scenes/dungeonScene.js — one room at a time: enter, fight, loot, choose.
// Combat rooms use the chromeless card layout (battleLine.js); shrine
// rooms keep the panel layout (shrineUI.js). Combat events become queue
// items in combatQueue.js; combatPlayback.js prints them.
//
// Log line colors (see #combat-log CSS):
//   atk  — red    (player attacks, enemy attacks, deaths)
//   heal — green  (potions, lifesteal)
//   move — yellow (entering / moving between rooms, room-cleared rewards)
//   loot — gold   (per-kill drops, shrine blessings)
//   multi— gold bold (multi-kill)
//   sys  — gray   (deaths, misc)
//   summon — violet (the boss calls a skeleton, 0.092)
//   relic — crimson (a relic found), revive — the Heart's second life

import { setBackground, transitionTo, go, whenWindowsBack } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { createRun, enterNextRoom, drinkPotion, settleRun } from '../../run/runState.js';
import { derivedStats } from '../../meta/stats.js';
import { heroOf } from '../../shared/heroes.js';
import { shareStats } from '../../meta/telemetry.js';
import { getProfile, markVictorySeen } from '../../meta/profile.js';
import { createCombat, playerAttack, canHeavy, useHeavy, heavyTarget } from '../../run/combat.js';
import { logLine, itemName, itemPic, markWayOn } from '../hud.js';
import { deathFlash, tickUp } from '../fx.js';
import { createPlayback } from '../combatPlayback.js';
import { combatSfx } from '../combatSfx.js';
import { renderShrineRoom } from '../shrineUI.js';
import { renderTreasureRoom } from '../treasureUI.js';
import { queueEvents } from '../combatQueue.js';
import { createBuffBar, updateBuffs } from '../buffs.js';
import { mountBattle, fxContext, snapshot } from '../battleRoom.js';
import { playFx } from '../combatFx.js';
import { DATA } from '../../shared/data.js';
import { play } from '../../audio/music.js';
import { sfx } from '../../audio/sfx.js';
import { showDeathModal } from '../deathModal.js';
import { showVictoryModal } from '../victoryModal.js';
import { startPerf, stopPerf } from '../../core/perfMonitor.js';
import { keepReport, runReport } from '../../meta/perfReport.js';
import { narrate, narratorRoom, narratorRun } from '../../audio/narrator.js';
import { isElite } from '../../shared/balance.js';

const LOOT_SHOWN = 6; // (the look: the row's length under XP / COINS; a phone has none, styles.css — the hero card's inventory page lists them)

export function dungeonScene() {
  const run = createRun();
  let combat = null;
  let logEl = null;      // ONE persistent log for the whole dungeon visit
  let roomStart = null;  // loot snapshot at room entry, for the victory summary
  let currentRoot = null;
  let shownCoins = 0;    // animated HUD counter values (tick up to reality)
  let shownXp = 0;
  let buffBar = null;    // the shrine blessings' bar (bottom-left; on a phone on top of the knight's card)
  let deathShown = false; // death modal fired for the fatal blow
  let ui = null;         // the persistent battle line of the current combat room (0.086)
  let lootEl = null;    // the LOOT row under XP / COINS (0.00260): the run's finds as small pictures
  let lootShown = 0;    // how many of run.itemsFound it shows — a find joins when its card has flown in
  let lootFlying = 0;   // finds whose card is still on its way to the row (0.00262)

  const playback = createPlayback({
    logEl: () => logEl,
    onTick: () => { if (ui) updateCombat(); },
    onEmpty: () => {
      tickUpChips();
      showLoot(run.itemsFound.length - lootFlying); // (an OVERKILL's silent finds too, once the room's lines are out; a card still flying lands on its own)
      if (combat.over && !combat.victory) openDeathModal();
      // a boss falls: the win dialog the first time, else the narrator's word (0.161)
      if (combat.over && combat.victory && !maybeShowVictory() && run.room.isBoss) narrate('boss_slain');
    },
    onFx: (fx) => {
      if (!fx) return;
      if (fx.kind === 'find') lootEl?.classList.remove('none'); // (0.00262: the row shows before the first find takes off — the card flies into it)
      const landsIn = playFx(fx, fxCtx);
      if (fx.kind !== 'find') return;
      if (typeof landsIn !== 'number') { showLoot(lootShown + 1); return; } // (no flight — reduced motion: at once)
      lootFlying++;
      setTimeout(() => { lootFlying--; showLoot(lootShown + 1, false, true); }, landsIn); // (the row takes it as the card lands)
    },
    onSfx: (item) => combatSfx(item, fxCtx), // stereo + timed to the blow (0.107)
    onVo: (id) => narrate(id, { delayMs: DATA.audio.narration.combatDelayMs }), // the narrator, just after the line's sound (0.161)
    onDeath: (i) => ui?.battle.deathStep(i), // the fallen card's leaving and the restack are a step of their own (0.00220) — only while a card is off screen (battleRoom.js)
  });
  const fxCtx = fxContext(() => ui); // what effects can touch (ui/battleRoom.js)
  fxCtx.loot = () => lootEl; // a find's card flies into the LOOT row (0.00262, ui/findFx.js) —
  fxCtx.lootAhead = () => lootFlying; // — past the ones still on their way
  fxCtx.run = () => run; // (a found potion's card says the satchel's count, 0.00263)

  return {
    inRun: true, // a reload now would lose the run (update prompt waits, 0.094)
    // DEBUG MODE's BENCHMARK mid-run (0.00256): the run settles as it stands
    // (a retreat; a death if the knight is down), then `next` instead of the run's end.
    leaveRun: (next) => endRun(null, run.hp > 0 ? 'retreat' : 'death', next),
    // DEBUG MODE's SWITCH CLASS mid-run (0.00269, ui/debugToggles.js): the
    // run's stats rebuilt for the class now on the profile (this run's
    // shrine boons go with the old ones — a debug tool), its health kept
    // as a share of the new maximum, the fight's class state reset and the
    // room rendered again — the battle line is rebuilt in place, dealt in.
    switchClass(root) {
      const stats = derivedStats();
      const share = run.maxHp > 0 ? run.hp / run.maxHp : 1;
      run.stats = stats;
      run.maxHp = stats.maxHp;
      run.hp = Math.max(1, Math.min(run.maxHp, Math.round(run.maxHp * share)));
      run.wild = 0;
      if (combat) { combat.charges = stats.klass.charges; combat.marked = -1; combat.thrall = null; combat.heavyCd = Math.min(combat.heavyCd, run.stats.heavyCdMax); }
      playback.reset();
      ui = null;
      logLine(logEl, `DEBUG: you fight on as ${heroOf(getProfile()).name} (the run's boons reset).`, 'sys');
      render(root);
    },
    enter(root) {
      startPerf(); // the run's frame rate, for the play stats (0.130)
      narratorRun();
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
      play(room.kind === 'boss' ? 'boss' : room.kind === 'shrine' || room.kind === 'treasure' ? 'shrine' : 'combat');
      combat = createCombat(run, room);
      deathShown = false;
      ui = null; // the new room builds its own battle line
      playback.reset();
      setBackground(room.background);
      roomStart = { coins: run.coins, xp: run.xp, items: run.itemsFound.length };
      shownCoins = run.coins; // reset counters per room (no tick-up anim)
      shownXp = run.xp;
      logLine(logEl, room.number === null ? `On the way, you come upon ${room.name}.` // a shrine or treasure room (0.171: unnumbered)
        : firstRoom ? `You enter the castle: ${room.name} (room ${room.number}).`
          : `You move to the next room... ${room.name} (room ${room.number}).`, 'move');
      render(root);
      narrateRoom(room, firstRoom);
    };
    if (instant) setup();
    else transitionTo(setup); // windows out, bg crossfade, windows in (the swoosh and the push: main.js onTransition)
  }

  // The narrator on a room's threshold (0.161): one line at most, the first
  // of these that its rule lets through — the boss, the shrine, the chests;
  // else the descent, the start of a deeper stretch (room 9: stretch_2,
  // 17: stretch_3...), the first room past the save's best, an elite.
  function narrateRoom(room, firstRoom) {
    narratorRoom();
    const rec = getProfile().records;
    const stretch = Math.floor((room.number - 1) / DATA.difficulty.bossEvery);
    const ids = room.kind === 'boss' ? ['boss_enter'] : room.kind === 'shrine' ? ['shrine_enter'] : room.kind === 'treasure' ? ['treasure_enter'] : [
      firstRoom && 'descent_begin',
      stretch > 0 && room.number % DATA.difficulty.bossEvery === 1 && `stretch_${stretch + 1}`,
      rec.runs > 0 && room.number > rec.bestRoom && 'new_record',
      room.enemies.some(isElite) && 'elite',
    ].filter(Boolean);
    const opts = { delayMs: DATA.audio.narration.roomEntryDelayMs };
    for (const id of ids) if (narrate(id, opts)) break;
  }

  function render(root) {
    currentRoot = root;
    const room = run.room;
    if (room.kind === 'shrine') renderShrine(root, room);
    else if (room.kind === 'treasure') renderTreasure(root, room);
    else renderCombat(root, room);
  }

  // ---- combat: chromeless card battle line ----
  // Built ONCE per room (0.086) and patched in place on every playback
  // tick — a full rebuild every 100ms restarted any CSS animation.
  function renderCombat(root, room) {
    const battle = mountBattle(run, combat, {
      // Heavy goes to the front: a summon standing before the boss (0.092).
      onHeavy: () => { if (canAct()) { useHeavy(combat); act(() => playerAttack(combat, heavyTarget(combat), true)); } },
      onPotion: () => {
        // 0.080: potions persist, so topping up between rooms is allowed
        // (after a win) — never while dead or mid-playback.
        if ((combat.over && !combat.victory) || playback.isPrinting()) return;
        const sip = drinkPotion(run, !combat.over); // (between rooms: no Infusion armor the next room would discard, 0.00223)
        if (sip) {
          combatSfx({ sfx: 'heal', fx: { kind: 'heal', to: 'player' } }, fxCtx);
          narrate('potion');
          logLine(logEl, `You drink a potion. (+${sip.healed} HP)${sip.free ? ' The elixir is not spent!' : ''}${sip.armor ? ` (+${sip.armor} armor until the room ends)` : ''}`, 'heal');
          playFx({ kind: 'heal', to: 'player', amount: sip.healed, potion: true }, fxCtx);
        }
        updateCombat();
      },
      onAttack: (i) => act(() => playerAttack(combat, i, false)),
    });
    // Death has no corner button — the fatal blow triggers the blood-red
    // flash and the centered YOU DIED dialog (openDeathModal, 0.067).
    const proceed = el('div', { class: 'combat-proceed' });
    const layer = el('div', { class: 'fx-layer' }); // floating numbers (0.087)
    root.innerHTML = '';
    root.append(
      el('h1', { class: 'room-title' }, room.isBoss ? room.name : `Room ${room.number} - ${room.name}`, recordTag()),
      battle.line, // ui/battleRoom.js
      el('div', { class: 'resources' },
        el('div', { class: 'res-row' }, el('span', { class: 'res-label' }, 'XP'), el('b', { id: 'hud-xp' }, String(shownXp))),
        el('div', { class: 'res-row' }, el('span', { class: 'res-label' }, 'COINS'), el('b', { id: 'hud-coins' }, String(shownCoins))),
        lootEl = el('div', { class: 'res-row res-loot none' }, el('span', { class: 'res-label' }, 'LOOT'), el('span', { class: 'loot-tray' }))),
      layer,
      logEl,
      proceed);
    logEl.className = 'docked';
    showLoot(run.itemsFound.length, true); // (a new room: every find so far is out — a chest's too)
    battle.fit(); // (the line is in #app now: its card numbers go on #app too, for the phone's strip and boons)
    root.append(buffBar);
    updateBuffs(buffBar, run.buffs);
    ui = { root, battle, player: battle.player, enemies: battle.enemies, proceed, layer };
    playFx({ kind: 'enter' }, fxCtx); // the units wait unseen...
    const built = ui;
    whenWindowsBack().then(() => { if (ui === built) playFx({ kind: 'deal' }, fxCtx); }); // ...and are dealt in once the windows are back (0.184)
    updateCombat();
  }

  function updateCombat() {
    ui.battle.update(playback, { heavyReady: canHeavy(combat), dead: combat.over && !combat.victory });
    const printing = playback.isPrinting();
    const showProceed = combat.over && !printing && combat.victory;
    if (showProceed && !ui.proceed.children.length) {
      ui.proceed.append(
        // 'active' (0.079): pulsing yellow — the obvious next step.
        el('button', { class: 'primary active', key: 'd', proceed: true, onclick: () => nextRoom(ui.root) }, 'Push Deeper'),
        el('button', { class: 'danger', key: 'r', onclick: () => endRun(ui.root, 'retreat') }, 'Retreat with Loot'));
    } else if (!showProceed && ui.proceed.children.length) {
      ui.proceed.innerHTML = '';
    }
    // Low with nothing to drink: Retreat pulses red and Push Deeper is plain (hud.js markWayOn, 0.00206) — on every update, since a potion drunk after the win changes the advice.
    if (showProceed) markWayOn(ui.proceed.children[0], ui.proceed.children[1], run);
  }

  // The LOOT row (0.00260): the newest LOOT_SHOWN of the run's finds, oldest first.
  // landed: a card has just flown in — the new chip pops (0.00262).
  function showLoot(n, rebuild = false, landed = false) {
    n = Math.min(n, run.itemsFound.length);
    if (!lootEl || (n === lootShown && !rebuild)) { lootShown = Math.max(lootShown, n); return; }
    const grew = n > lootShown;
    lootShown = n;
    const tray = lootEl.children[1];
    tray.textContent = '';
    tray.append(...run.itemsFound.slice(0, n).slice(-LOOT_SHOWN).map((id) => itemPic(id, 'loot-chip')).filter(Boolean));
    lootEl.classList.toggle('none', n === 0 && !lootFlying);
    const chip = tray.children[tray.children.length - 1];
    if (landed && grew) chip?.animate?.([ // (one-shot: the chip lands with a flash)
      { transform: 'scale(1.7)', filter: 'brightness(2.2)' },
      { transform: 'scale(1)', filter: 'brightness(1)' },
    ], { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
  }

  // ---- shrine: panel layout (shrineUI.js) ----
  // ---- treasure (0.155): the shrine's panel, three chests ----
  // what a panel room (the shrine, the chests) gets from the scene (0.171: titled by name alone — "An Ominous Shrine")
  function panelHooks(root, room) { // (a declaration: render() runs before this line is reached)
    return {
      title: [room.name], logEl, buffBar, coins: shownCoins, xp: shownXp,
      onDeeper: () => nextRoom(root), onRetreat: () => endRun(root, 'retreat'), onDeath: () => openDeathModal(),
      refresh: () => { render(currentRoot); tickUpChips(); },
    };
  }
  function renderTreasure(root, room) { renderTreasureRoom(root, run, room, panelHooks(root, room)); }
  function renderShrine(root, room) { renderShrineRoom(root, run, room, panelHooks(root, room)); }

  // Execute a combat action. Combat resolves synchronously; the resulting
  // log lines are queued and printed one by one (logDelayMs apart) so the
  // fight reads as it happens. Input is locked while the queue drains.
  function act(fn) {
    if (!canAct()) return;
    const pre = snapshot(combat); // the replay starts from the state BEFORE the action resolves (0.086)
    queueEvents(fn(), { run, combat, playback, potionQueued: () => ui?.battle.player.holdPotion?.() }); // (0.00263: the card's count waits for the found potion's card to fly in)
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
        parts.push(itemPic(id, 'log-art'), itemName(DATA.items[id])); // (0.00260: with its picture, like the Found line)
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
    // the narrator on a death (0.161): the reliquary's or the boss's own line, then the save's first death
    narrate(run.killedBy === 'reliquary' ? 'death_reliquary' : DATA.enemies[run.killedBy]?.boss ? 'death_boss' : 'death');
    if (getProfile().records.deaths === 0) narrate('first_death');
    deathFlash(() => showDeathModal(run, () => endRun(currentRoot, 'death')));
  }

  // The final boss falls (0.121): the first time a save beats the boss of
  // finalBossRoom, a one-off "you've won" dialog celebrates it before the
  // usual Push Deeper / Retreat choice. True when it showed.
  function maybeShowVictory() {
    const room = run.room;
    if (!room.isBoss || room.number < DATA.difficulty.finalBossRoom || getProfile().victorySeen) return false;
    markVictorySeen();
    showVictoryModal(run);
    return true;
  }

  // Ghost-click guard: Safari still fires click events on buttons that
  // were disabled/replaced mid-gesture — no action once combat is over or
  // while a previous action is still printing.
  function canAct() {
    return !combat.over && !playback.isPrinting();
  }

  function endRun(root, outcome, next = null) {
    run.perf ??= stopPerf(); // ??=: a double Retreat must not wipe it (0.130)
    const settled = settleRun(run, outcome);
    keepReport(runReport(settled)); // the device report rides with this upload (0.00225)
    shareStats(settled); // play stats (0.102)
    if (next) next(); else go('runEnd', run, outcome);
  }
}

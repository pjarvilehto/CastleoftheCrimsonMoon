// run/combat.js — turn-based combat engine, UI-agnostic core.
// Operates on the run object + a room's enemy list.
// The scene layer renders state and feeds player actions in.
//
// The hero's class (heroes.json class, snapshotted as run.stats.klass;
// drafted 0.00258, live since 0.00267) shapes the turn through the
// registry in run/classes.js (0.00283): the heavy's kind — the knight's
// blow with spill and OVERKILL, cleave, fireball, drain, mark, censer,
// entangle — is HEAVIES[klass.heavy], the passives are AFTER_BLOW and
// FOE_TURN hooks; this file calls them in a fixed order and switches on no
// class name.
//
// Damage spill: the knight's heavy attacks only. When a heavy hit rolls at least
// spillThreshold x the target's remaining HP, the excess cleaves into
// every remaining living enemy (multi-kill). Basic attacks never spill —
// they kill at most their target, no matter how overpowered.

import { DATA } from '../shared/data.js';
import { DEBUG } from '../shared/debug.js';
import { scaleEnemy } from '../shared/balance.js';
import { tryRevive } from './loot.js';
import { HEAVIES, AFTER_BLOW, FOE_TURN, usesCharges, rollImmune, immuneEvent } from './classes.js';

// Crit multiplier (0.104): critMult, varied ±critJitter; a mega crit
// multiplies it by megaCritMult. difficulty.json `combat`.
export function critMultiplier(tune, mega = false, r = Math.random()) {
  const m = tune.critMult * (1 + (r * 2 - 1) * tune.critJitter);
  return mega ? m * tune.megaCritMult : m;
}

// A foe as the fight holds it: the room's enemy copied, at full HP, with the
// classes' statuses at zero (0.00283: `blight` stacks, the roots' `entangled`
// turns — the hooks count on the numbers being there; a summon gets the
// same in summonPhase).
const fighter = (e) => ({ ...e, hp: e.maxHp, blight: 0, entangled: 0 });

export function createCombat(run, room) {
  return {
    run,
    roomNumber: room.number, // summons scale to the room
    isBoss: !!room.isBoss,   // run history counts boss kills (0.095)
    enemies: room.enemies.map(fighter),
    turn: 1,
    heavyCd: 0,
    over: false,
    victory: false,
    // the class (0.00258, live 0.00267; run.stats.klass): the wizard's charges per fight, the hexhunter's mark, the necromancer's thrall
    charges: run.stats.klass.charges,
    marked: -1,
    thrall: null,
  };
}

function living(combat) {
  return combat.enemies.filter((e) => e.hp > 0);
}

// Takes `dmg` off the foe at `idx` — never past its HP — and pushes its line
// (`ev(applied)`: the event, the caller's text and fields) and, when it
// fell, its kill. Returns the damage applied. 0.00283: the one path for the
// strike chain, a heavy's sweep (classes.js), the blight's tick and the
// thorns — four copies before.
export function damageFoe(combat, idx, dmg, ev, push) {
  const t = combat.enemies[idx];
  const applied = Math.min(dmg, t.hp);
  t.hp -= applied;
  push(ev(applied));
  if (t.hp === 0) push({ type: 'kill', text: `${t.name} died!`, enemy: t });
  return applied;
}

// One player action, in phases (0.117: split out of one 154-line
// function; the order of random rolls is unchanged, so seeded runs play
// exactly as before):
//   rollHit -> player's blow (smash | hit + spill) -> lifesteal ->
//   classPhase (the class's heavy effect, blight, mending, thrall) ->
//   enemies strike back -> summons -> room cleared?
// Returns the events for logging. Every event carries `snap` (0.086):
// enemy HPs + player HP right after it happened, so the UI can replay the
// fight line by line (HP bars move with the log, animations land on beat).
export function playerAttack(combat, targetIndex, heavy = false) {
  const events = [];
  const push = (ev) => {
    ev.snap = {
      enemies: combat.enemies.map((e) => e.hp),
      hp: combat.run.hp,
      meters: combat.enemies.map((e) => (e.summonEvery ? e.summonMeter : null)), // 0.092
      status: combat.enemies.map((e, i) => statusOf(combat, e, i)), // 0.00277: the hex, the blight and the roots as they stand at this line (the tags and the figures' looks follow the replay)
    };
    events.push(ev);
  };
  // the turn's outputs (0.00283): what the phases and the class hooks write through
  const turn = { push, hurt: (idx, dmg, ev) => damageFoe(combat, idx, dmg, ev, push) };
  const target = combat.enemies[targetIndex];
  if (!target || target.hp <= 0 || combat.over) return events;
  combat.run.turns += 1; // run history (0.095)

  const deadBefore = combat.enemies.filter((e) => e.hp <= 0).length; // (the turn's kills, for the wizard's charges — 0.00258, live 0.00267)
  const hit = rollHit(combat, heavy, targetIndex);
  // an elemental heavy on a foe immune to it (0.00293, the developer's ask): the blow does nothing —
  // no damage, no lifesteal — and "Immune!" prints in its place; the heavy's reach still plays
  // (classes.js: the fire rolls every other foe), the charge or the cooldown is spent all the same
  const element = heavy ? HEAVIES[combat.run.stats.klass.heavy].element : null;
  if (element && rollImmune(target, element)) push(immuneEvent(combat, targetIndex, element));
  else {
    if (!smash(combat, hit, turn)) strike(combat, targetIndex, hit, turn);
    lifesteal(combat, hit.dmg, turn);
  }
  classPhase(combat, targetIndex, hit, deadBefore, turn); // the class's heavy, its blight, its mending, its thrall (0.00258, live 0.00267; nothing for the knight)
  if (enemyPhase(combat, turn)) return events; // the hero fell
  summonPhase(combat, turn);
  if (living(combat).length === 0) {
    combat.over = true;
    combat.victory = true;
    if (combat.isBoss) combat.run.bossesBeaten += 1;
    push({ type: 'sys', text: 'The room is cleared.' });
  }
  combat.turn += 1;
  // the cooldown counts ORDINARY turns (0.00198): the heavy's own turn used
  // to count too, so a cooldown of 3 was back after two blows and two
  // Quicken boons (floor 1) made it every turn
  if (!heavy && combat.heavyCd > 0) combat.heavyCd -= 1;
  return events;
}

// The blow's damage: heavy x heavyMult; a crit (chance = run.stats.crit)
// x critMultiplier (0.104: varied ±critJitter; megaCritChance of crits are
// MEGA CRITS for megaCritMult more; crit damage bonus from Precision and
// overflow adds to critMult, 0.112/0.113). Rolls: crit, mega, jitter.
function rollHit(combat, heavy, targetIndex = -1) {
  const tune = DATA.difficulty.combat, run = combat.run, k = run.stats.klass;
  // the hexhunter's mark (0.00258, live 0.00267): every hit on the marked foe crits — no roll spent
  const marked = combat.marked >= 0 && combat.marked === targetIndex;
  const crit = marked || DEBUG.forceCrit || DEBUG.forceMegaCrit || Math.random() < run.stats.crit;
  const megaCrit = crit && (DEBUG.forceMegaCrit || Math.random() < tune.megaCritChance);
  // whole numbers always (0.00199): a heavy at heavyMult 2.3 printed 358.79999 on an OVERKILL
  // the class (0.00258, live 0.00267): its heavy's factor, the barbarian's rage (more damage the lower the HP)
  const rage = k.rage > 0 ? 1 + k.rage * (1 - run.hp / run.maxHp) : 1;
  let dmg = Math.round(run.stats.dmg * (heavy ? tune.heavyMult * k.heavyMult : 1) * rage);
  if (crit) dmg = Math.round(dmg * critMultiplier({ ...tune, critMult: tune.critMult + combat.run.stats.critBonus + (marked ? k.markCrit : 0) }, megaCrit)); // (the hex's own crit damage, 0.00258, live 0.00267)
  return { dmg: Math.max(1, dmg), crit, megaCrit, heavy, marked }; // (marked: the class's own trace on the blow, ui/combatFx.js — 0.00268)
}

// SMASH / OVERKILL: a heavy hit whose damage covers EVERY living enemy's
// remaining HP (2+ enemies) wipes the room in one line — no per-enemy
// drip, so overpowered players breeze through early rooms. Kill events
// are silent: the scene still applies loot per enemy. True if it overkilled
// (the smash phase; 0.00223: the event is `overkill`, as the UI names it).
// A heavy that spills (the knight's blow, classes.js HEAVIES) alone.
function smash(combat, { dmg, heavy }, { push }) {
  const alive = living(combat);
  if (!heavy || !HEAVIES[combat.run.stats.klass.heavy].spills || alive.length < 2 || dmg < alive.reduce((s, e) => s + e.hp, 0)) return false;
  for (const e of alive) e.hp = 0; // before the line: its snap shows the wiped room
  // victims: their indices, so every card can burst (0.128)
  push({ type: 'overkill', text: 'OVERKILL! Everyone dies!', dmg, victims: alive.map((e) => combat.enemies.indexOf(e)) });
  for (const e of alive) push({ type: 'kill', enemy: e, silent: true });
  return true;
}

// The blow on its target; a heavy blow of at least spillThreshold x the
// target's HP strikes through into every other living enemy (no cap — a
// strong enough blow sweeps the room) when the class's heavy spills (the
// knight's; the other heavies have their own reach, classes.js). Basic
// attacks never spill.
function strike(combat, targetIndex, { dmg, crit, megaCrit, heavy, marked }, turn) {
  const target = combat.enemies[targetIndex];
  const chain = [targetIndex];
  if (heavy && HEAVIES[combat.run.stats.klass.heavy].spills && dmg >= target.hp * DATA.difficulty.spillThreshold) {
    for (const [i, e] of combat.enemies.entries()) if (i !== targetIndex && e.hp > 0) chain.push(i);
  }
  let remaining = dmg;
  let kills = 0;
  chain.forEach((idx, n) => {
    const t = combat.enemies[idx];
    if (remaining <= 0 || t.hp <= 0) return;
    remaining -= turn.hurt(idx, remaining, (applied) => (n === 0
      ? {
        type: 'atk',
        text: `You attack ${t.name} for ${dmg} dmg${heavy ? ' (heavy attack)' : ''}${megaCrit ? ' — MEGA CRIT!' : crit ? ' — CRITICAL!' : '.'}`,
        target: idx, dmg, crit, megaCrit, heavy, marked,
      }
      : { type: 'spill', text: `...the blow strikes through into ${t.name} for ${applied} dmg!`, target: idx, dmg: applied }));
    if (t.hp === 0) kills += 1;
  });
  if (kills >= 2) turn.push({ type: 'multi', text: `MULTI-KILL! One blow fells ${kills} enemies!` });
}

// The class's own turn (0.00258; live since 0.00267 — the UI plays every
// event: the tags and log colours 0.00267, the particles 0.00268, the
// sounds 0.00270 / 0.00271; the knight makes none): after the blow, its
// heavy's effect (classes.js HEAVIES: cleave / fireball sweep the other
// foes, drain heals, mark marks, censer blights, entangle binds), then the
// passives in AFTER_BLOW's order — the blight's tick, the druid's mending,
// the necromancer's thrall rising from this turn's kill.
function classPhase(combat, targetIndex, hit, deadBefore, turn) {
  if (hit.heavy) HEAVIES[combat.run.stats.klass.heavy].onHeavy?.(combat, targetIndex, hit, turn);
  for (const hook of AFTER_BLOW) hook(combat, deadBefore, turn);
}

// Lifesteal: once per blow, off the full rolled damage.
function lifesteal(combat, dmg, { push }) {
  const run = combat.run;
  const ls = run.stats.lifesteal;
  if (!(ls > 0) || dmg <= 0) return;
  const healed = Math.min(run.maxHp - run.hp, Math.round(dmg * ls));
  if (healed > 0) {
    run.hp += healed;
    push({ type: 'heal', text: `You drain ${healed} HP.`, healed });
  }
}

// Every living enemy strikes back. True if the hero fell (combat over).
// Rolls per enemy: damage jitter, then dodge.
function enemyPhase(combat, turn) {
  for (const enemy of living(combat)) {
    const source = combat.enemies.indexOf(enemy); // who acts, for the UI
    if (enemyStrike(combat, enemy, source, turn)) return true;
  }
  for (const hook of FOE_TURN.end) hook(combat); // the Druid's roots loosen a turn (0.00271)
  return false;
}

function enemyStrike(combat, enemy, source, turn) {
  const run = combat.run;
  const tune = DATA.difficulty.combat;
  const { push } = turn;
  // the Druid's roots (0.00271): a bound foe rolls to attack at all (classes.js FOE_TURN.hold)
  if (FOE_TURN.hold.some((hook) => hook(combat, enemy, source, turn))) return false;
  const raw = enemy.dmg + Math.floor(Math.random() * (tune.enemyDmgJitter + 1));
  // the necromancer's thrall (0.00258, live 0.00267) takes the blow instead, unarmored (FOE_TURN.take)
  if (FOE_TURN.take.some((hook) => hook(combat, enemy, raw, source, turn))) return false;
  // T4 relic: dodge — the blow misses entirely.
  if (!DEBUG.invulnerable && run.stats.dodge > 0 && Math.random() < run.stats.dodge) {
    push({ type: 'dodge', text: `You dodge ${enemy.name}'s attack!`, source });
    return false;
  }
  // Armor (+ Infusion potions) soaks at most 1 - armorMinTakenPct of a
  // blow (0.062; 17% since the 0.093 x10 HP scale): the floor scales with
  // the hit, so deep foes stay dangerous. ?debug INVULNERABLE takes none.
  const armor = run.stats.armor + run.tempArmor;
  const taken = DEBUG.invulnerable ? 0 : Math.max(Math.ceil(raw * tune.armorMinTakenPct), raw - armor);
  run.hp = Math.max(0, run.hp - taken);
  push({ type: 'dmg', text: `${enemy.name} hits you for ${taken} dmg.`, taken, source });
  // T4 relic: thorns wound the attacker, and can finish it (0.00243: they
  // used to stop at 1 HP — a tester's foes stood at 1 HP, which read as a
  // bug); a thorns kill is a kill like any other, its rewards and its fall.
  const thorns = run.stats.thorns;
  if (thorns > 0 && taken > 0) turn.hurt(source, thorns, (dealt) => ({ type: 'thorns', text: `Your thorns tear into ${enemy.name} for ${dealt}.`, target: source, dmg: dealt }));
  if (run.hp > 0) return false;
  const revived = tryRevive(run); // T4 relic: the Heart of the Dying Moon, once per run
  if (revived) { push({ type: 'revive', text: revived }); return false; }
  combat.over = true;
  combat.victory = false;
  run.killedBy = enemy.id; // run history (0.095)
  push({ type: 'sys', text: 'You have fallen...' });
  return true;
}

// Boss summons (0.092): a summoner's meter fills one step per turn; when
// full it calls a (weakened) enemy that steps in front of it. Summons give
// no rewards — stalling the boss to farm them is pointless. Capped alive.
function summonPhase(combat, { push }) {
  const cfg = DATA.difficulty.boss.summon;
  for (const [i, e] of combat.enemies.entries()) {
    if (!e.summonEvery || e.hp <= 0) continue;
    e.summonMeter = Math.min(e.summonEvery, e.summonMeter + 1);
    const alive = combat.enemies.filter((x) => x.summoned && x.hp > 0).length;
    if (e.summonMeter < e.summonEvery || alive >= cfg.maxAlive) continue; // full: waits for room
    const s = scaleEnemy(cfg.enemy, combat.roomNumber + cfg.depthBonus);
    s.maxHp = Math.max(1, Math.round(s.maxHp * cfg.hpScale));
    s.dmg = Math.max(1, Math.round(s.dmg * cfg.dmgScale));
    combat.enemies.push(Object.assign(fighter(s), { summoned: true, xp: 0, coins: [0, 0] })); // (a fighter like the room's: full HP, no blight, no roots)
    // Snapshot BEFORE the reset: the bar shows full as the summon lands,
    // then drains when playback settles on the real state.
    push({ type: 'summon', text: `${e.name} summons a ${s.name}!`, source: i, target: combat.enemies.length - 1 });
    e.summonMeter = 0;
  }
}

// A foe's statuses as the UI shows them (0.00277; battleRoom.js reads the
// replay's snapshot through combatPlayback.statusOf): hexed by the
// Hexhunter, blight stacks, the roots' turns — none once it has fallen.
export function statusOf(combat, e, i) {
  const live = e.hp > 0;
  return { hexed: live && combat.marked === i, blight: live && e.blight > 0 ? e.blight : 0, entangled: live && e.entangled > 0 ? e.entangled : 0 };
}
// Heavy Attack's target: the front-most living summon, else the first
// living enemy (0.092 — summons stand in front of the boss).
export function heavyTarget(combat) {
  const s = combat.enemies.findIndex((e) => e.summoned && e.hp > 0);
  return s >= 0 ? s : combat.enemies.findIndex((e) => e.hp > 0);
}

export function canHeavy(combat) {
  return combat.heavyCd === 0 && !combat.over && (!usesCharges(combat.run.stats.klass) || combat.charges > 0); // (the wizard's charges per fight, 0.00258, live 0.00267)
}

export function useHeavy(combat) {
  // The cooldown starts at player.baseHeavyCd (meta/stats.js derivedStats);
  // relics and the quicken boon lower it (floor 1): that many ordinary
  // turns pass before the next heavy.
  combat.heavyCd = combat.run.stats.heavyCdMax;
  if (usesCharges(combat.run.stats.klass)) combat.charges -= 1; // (0.00258, live 0.00267)
}

// run/combat.js — turn-based combat engine, UI-agnostic core.
// Operates on the run object + a room's enemy list.
// The scene layer renders state and feeds player actions in.
//
// Damage spill: heavy attacks only. When a heavy hit rolls at least
// spillThreshold x the target's remaining HP, the excess cleaves into
// every remaining living enemy (multi-kill). Basic attacks never spill —
// they kill at most their target, no matter how overpowered.

import { DATA } from '../shared/data.js';
import { DEBUG } from '../shared/debug.js';
import { scaleEnemy } from '../shared/balance.js';

// Crit multiplier (0.104): critMult, varied ±critJitter; a mega crit
// multiplies it by megaCritMult. difficulty.json `combat`.
export function critMultiplier(tune, mega = false, r = Math.random()) {
  const m = tune.critMult * (1 + (r * 2 - 1) * tune.critJitter);
  return mega ? m * tune.megaCritMult : m;
}

export function createCombat(run, room) {
  return {
    run,
    roomNumber: room.number, // summons scale to the room
    isBoss: !!room.isBoss,   // run history counts boss kills (0.095)
    enemies: room.enemies.map((e) => ({ ...e, hp: e.maxHp })),
    turn: 1,
    heavyCd: 0,
    over: false,
    victory: false,
  };
}

function living(combat) {
  return combat.enemies.filter((e) => e.hp > 0);
}

// One player action, in phases (0.117: split out of one 154-line
// function; the order of random rolls is unchanged, so seeded runs play
// exactly as before):
//   rollHit -> player's blow (smash | hit + spill) -> lifesteal ->
//   enemies strike back -> summons -> room cleared?
// Returns the events for logging. Every event carries `snap` (0.086):
// enemy HPs + player HP right after it happened, so the UI can replay the
// fight line by line (HP bars move with the log, animations land on beat).
export function playerAttack(combat, targetIndex, heavy = false) {
  const events = [];
  combat.run.turns += 1; // run history (0.095)
  const push = (ev) => {
    ev.snap = {
      enemies: combat.enemies.map((e) => e.hp),
      hp: combat.run.hp,
      meters: combat.enemies.map((e) => (e.summonEvery ? e.summonMeter : null)), // 0.092
    };
    events.push(ev);
  };
  const target = combat.enemies[targetIndex];
  if (!target || target.hp <= 0 || combat.over) return events;

  const hit = rollHit(combat, heavy);
  if (!smash(combat, hit, push)) strike(combat, targetIndex, hit, push);
  lifesteal(combat, hit.dmg, push);
  if (enemyPhase(combat, push)) return events; // the knight fell
  summonPhase(combat, push);
  if (living(combat).length === 0) {
    combat.over = true;
    combat.victory = true;
    if (combat.isBoss) combat.run.bossesBeaten += 1;
    push({ type: 'sys', text: 'The room is cleared.' });
  }
  combat.turn += 1;
  if (combat.heavyCd > 0) combat.heavyCd -= 1;
  return events;
}

// The blow's damage: heavy x heavyMult; a crit (chance = run.stats.crit)
// x critMultiplier (0.104: varied ±critJitter; megaCritChance of crits are
// MEGA CRITS for megaCritMult more; crit damage bonus from Precision and
// overflow adds to critMult, 0.112/0.113). Rolls: crit, mega, jitter.
function rollHit(combat, heavy) {
  const tune = DATA.difficulty.combat;
  const crit = DEBUG.forceCrit || DEBUG.forceMegaCrit || Math.random() < combat.run.stats.crit;
  const megaCrit = crit && (DEBUG.forceMegaCrit || Math.random() < tune.megaCritChance);
  let dmg = combat.run.stats.dmg * (heavy ? tune.heavyMult : 1);
  if (crit) dmg = Math.round(dmg * critMultiplier({ ...tune, critMult: tune.critMult + (combat.run.stats.critBonus ?? 0) }, megaCrit));
  return { dmg: Math.max(1, dmg), crit, megaCrit, heavy };
}

// SMASH / OVERKILL: a heavy hit whose damage covers EVERY living enemy's
// remaining HP (2+ enemies) wipes the room in one line — no per-enemy
// drip, so overpowered players breeze through early rooms. Kill events
// are silent: the scene still applies loot per enemy. True if it smashed.
function smash(combat, { dmg, heavy }, push) {
  const alive = living(combat);
  if (!heavy || alive.length < 2 || dmg < alive.reduce((s, e) => s + e.hp, 0)) return false;
  for (const e of alive) e.hp = 0; // before the line: its snap shows the wiped room
  // victims: their indices, so every card can burst (0.128)
  push({ type: 'smash', text: 'OVERKILL! Everyone dies!', dmg, victims: alive.map((e) => combat.enemies.indexOf(e)) });
  for (const e of alive) push({ type: 'kill', enemy: e, silent: true });
  return true;
}

// The blow on its target; a heavy blow of at least spillThreshold x the
// target's HP strikes through into every other living enemy (no cap — a
// strong enough blow sweeps the room). Basic attacks never spill.
function strike(combat, targetIndex, { dmg, crit, megaCrit, heavy }, push) {
  const target = combat.enemies[targetIndex];
  const chain = [targetIndex];
  if (heavy && dmg >= target.hp * DATA.difficulty.spillThreshold) {
    for (const [i, e] of combat.enemies.entries()) if (i !== targetIndex && e.hp > 0) chain.push(i);
  }
  let remaining = dmg;
  let kills = 0;
  chain.forEach((idx, n) => {
    const t = combat.enemies[idx];
    if (remaining <= 0 || t.hp <= 0) return;
    const applied = Math.min(remaining, t.hp);
    t.hp -= applied;
    remaining -= applied;
    if (n === 0) {
      push({
        type: 'atk',
        text: `You attack ${t.name} for ${dmg} dmg${heavy ? ' (heavy attack)' : ''}${megaCrit ? ' — MEGA CRIT!' : crit ? ' — CRITICAL!' : '.'}`,
        target: idx, dmg, crit, megaCrit, heavy,
      });
    } else {
      push({ type: 'spill', text: `...the blow strikes through into ${t.name} for ${applied} dmg!`, target: idx, dmg: applied });
    }
    if (t.hp === 0) {
      kills += 1;
      push({ type: 'kill', text: `${t.name} died!`, enemy: t });
    }
  });
  if (kills >= 2) push({ type: 'multi', text: `MULTI-KILL! One blow fells ${kills} enemies!` });
}

// Lifesteal: once per blow, off the full rolled damage.
function lifesteal(combat, dmg, push) {
  const run = combat.run;
  const ls = run.stats.lifesteal;
  if (!(ls > 0) || dmg <= 0) return;
  const healed = Math.min(run.maxHp - run.hp, Math.round(dmg * ls));
  if (healed > 0) {
    run.hp += healed;
    push({ type: 'heal', text: `You drain ${healed} HP.`, healed });
  }
}

// Every living enemy strikes back. True if the knight fell (combat over).
// Rolls per enemy: damage jitter, then dodge.
function enemyPhase(combat, push) {
  for (const enemy of living(combat)) {
    const source = combat.enemies.indexOf(enemy); // who acts, for the UI
    if (enemyStrike(combat, enemy, source, push)) return true;
  }
  return false;
}

function enemyStrike(combat, enemy, source, push) {
  const run = combat.run;
  const tune = DATA.difficulty.combat;
  const raw = enemy.dmg + Math.floor(Math.random() * (tune.enemyDmgJitter + 1));
  // T4 relic: dodge — the blow misses entirely.
  if (!DEBUG.invulnerable && (run.stats.dodge ?? 0) > 0 && Math.random() < run.stats.dodge) {
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
  // T4 relic: thorns wound the attacker — but never finish it (kill/loot
  // flow stays on the player's own blows).
  const thorns = run.stats.thorns ?? 0;
  if (thorns > 0 && taken > 0 && enemy.hp > 1) {
    enemy.hp = Math.max(1, enemy.hp - thorns);
    push({ type: 'thorns', text: `Your thorns tear into ${enemy.name} for ${thorns}.`, target: source, dmg: thorns });
  }
  if (run.hp > 0) return false;
  // T4 relic: the Heart of the Dying Moon beats again — once per run.
  if (run.revive) {
    run.revive = false;
    run.hp = Math.ceil(run.maxHp * DATA.difficulty.player.reviveHpPct);
    push({ type: 'revive', text: 'The Heart of the Dying Moon beats again! You rise at half health.' });
    return false;
  }
  combat.over = true;
  combat.victory = false;
  run.killedBy = enemy.id; // run history (0.095)
  push({ type: 'sys', text: 'You have fallen...' });
  return true;
}

// Boss summons (0.092): a summoner's meter fills one step per turn; when
// full it calls a (weakened) enemy that steps in front of it. Summons give
// no rewards — stalling the boss to farm them is pointless. Capped alive.
function summonPhase(combat, push) {
  const cfg = DATA.difficulty.boss?.summon ?? {};
  for (const [i, e] of combat.enemies.entries()) {
    if (!e.summonEvery || e.hp <= 0) continue;
    e.summonMeter = Math.min(e.summonEvery, e.summonMeter + 1);
    const alive = combat.enemies.filter((x) => x.summoned && x.hp > 0).length;
    if (e.summonMeter < e.summonEvery || alive >= cfg.maxAlive) continue; // full: waits for room
    const s = scaleEnemy(cfg.enemy ?? 'skeleton', (combat.roomNumber ?? 1) + cfg.depthBonus);
    s.maxHp = Math.max(1, Math.round(s.maxHp * cfg.hpScale));
    s.dmg = Math.max(1, Math.round(s.dmg * cfg.dmgScale));
    Object.assign(s, { hp: s.maxHp, summoned: true, xp: 0, coins: [0, 0] });
    combat.enemies.push(s);
    // Snapshot BEFORE the reset: the bar shows full as the summon lands,
    // then drains when playback settles on the real state.
    push({ type: 'summon', text: `${e.name} summons a ${s.name}!`, source: i, target: combat.enemies.length - 1 });
    e.summonMeter = 0;
  }
}

// Heavy Attack's target: the front-most living summon, else the first
// living enemy (0.092 — summons stand in front of the boss).
export function heavyTarget(combat) {
  const s = combat.enemies.findIndex((e) => e.summoned && e.hp > 0);
  return s >= 0 ? s : combat.enemies.findIndex((e) => e.hp > 0);
}

export function canHeavy(combat) {
  return combat.heavyCd === 0 && !combat.over;
}

export function useHeavy(combat) {
  // Cooldown is player.baseHeavyCd (3); relics and the quicken boon lower it (floor 1).
  combat.heavyCd = combat.run.stats.heavyCdMax ?? DATA.difficulty.player?.baseHeavyCd;
}

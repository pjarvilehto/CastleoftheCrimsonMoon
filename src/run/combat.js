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

// Player basic attack on enemy index. Returns events for logging.
// Every event carries `snap` (0.086): enemy HPs + player HP right after
// it happened, so the UI can replay the fight line by line (HP bars move
// with the log, animations land on the right beat).
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

  const tune = DATA.difficulty.combat ?? {};
  const crit = DEBUG.forceCrit || DEBUG.forceMegaCrit || Math.random() < combat.run.stats.crit;
  // 0.104: a crit's multiplier varies ±critJitter, and a rare crit
  // (megaCritChance of crits) is a MEGA CRIT for megaCritMult more.
  const megaCrit = crit && (DEBUG.forceMegaCrit || Math.random() < tune.megaCritChance);
  const mult = heavy ? tune.heavyMult : 1;
  let dmg = combat.run.stats.dmg * mult;
  if (crit) dmg = Math.round(dmg * critMultiplier({ ...tune, critMult: tune.critMult + (combat.run.stats.critBonus ?? 0) }, megaCrit));
  dmg = Math.max(1, dmg);

  // --- SMASH: a heavy hit whose damage covers EVERY living enemy's
  // remaining HP wipes the room in one line ("SMASH! Everyone dies!") —
  // no per-enemy damage/death drip, so overpowered players breeze through
  // early rooms. Kill events are marked silent: the scene still applies
  // loot per enemy, it just doesn't print each death. ---
  const livingEnemies = living(combat);
  const smashed = heavy && livingEnemies.length >= 2
    && dmg >= livingEnemies.reduce((s, e) => s + e.hp, 0);
  if (smashed) {
    for (const e of livingEnemies) e.hp = 0; // before the line: its snap shows the wiped room
    push({ type: 'smash', text: 'OVERKILL! Everyone dies!', dmg });
    for (const e of livingEnemies) push({ type: 'kill', enemy: e, silent: true });
  }

  // --- hit chain (damage spill) ---
  const diff = DATA.difficulty;
  const chain = [targetIndex];
  // Spill is a heavy-attack privilege: basic attacks are single-target.
  const overpowered = !smashed && heavy && dmg >= target.hp * (diff.spillThreshold);
  if (overpowered) {
    // No target cap: a strong enough blow sweeps the whole room.
    for (const [i, e] of combat.enemies.entries()) {
      if (i !== targetIndex && e.hp > 0) chain.push(i);
    }
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
        target: idx,
        dmg,
        crit,
        megaCrit,
        heavy,
      });
    } else {
      push({
        type: 'spill',
        text: `...the blow strikes through into ${t.name} for ${applied} dmg!`,
        target: idx,
        dmg: applied,
      });
    }
    if (t.hp === 0) {
      kills += 1;
      push({ type: 'kill', text: `${t.name} died!`, enemy: t });
    }
  });
  if (kills >= 2) {
    push({ type: 'multi', text: `MULTI-KILL! One blow fells ${kills} enemies!` });
  }

  // lifesteal (once, off the full rolled damage)
  const ls = combat.run.stats.lifesteal;
  if (ls > 0 && dmg > 0) {
    const healed = Math.min(combat.run.maxHp - combat.run.hp, Math.round(dmg * ls));
    if (healed > 0) {
      combat.run.hp += healed;
      push({ type: 'heal', text: `You drain ${healed} HP.`, healed });
    }
  }

  // enemy phase
  for (const enemy of living(combat)) {
    const source = combat.enemies.indexOf(enemy); // who acts, for the UI
    const raw = enemy.dmg + Math.floor(Math.random() * (tune.enemyDmgJitter + 1));
    // T4 relic: dodge — the blow misses entirely.
    if (!DEBUG.invulnerable && (combat.run.stats.dodge ?? 0) > 0 && Math.random() < combat.run.stats.dodge) {
      push({ type: 'dodge', text: `You dodge ${enemy.name}'s attack!`, source });
      continue;
    }
    // Testing switch (corner toggle): player shrugs off all damage.
    const armor = combat.run.stats.armor + combat.run.tempArmor; // Infusion potions
    // Armor soaks at most 83% of a blow (0.062; 85% until 0.093): stacked
    // Endurance + relic plates used to reduce deep-room enemies to 0-1 dmg,
    // removing all pressure. The floor scales with the hit, so deep foes
    // stay dangerous. (0.093: the x10 HP scale made the floor's ceil() much
    // finer — 17% keeps the old effective floor.)
    const taken = DEBUG.invulnerable ? 0 : Math.max(Math.ceil(raw * tune.armorMinTakenPct), raw - armor);
    combat.run.hp = Math.max(0, combat.run.hp - taken);
    push({ type: 'dmg', text: `${enemy.name} hits you for ${taken} dmg.`, taken, source });
    // T4 relic: thorns wound the attacker — but never finish it (kill/loot
    // flow stays on the player's own blows).
    const thorns = combat.run.stats.thorns ?? 0;
    if (thorns > 0 && taken > 0 && enemy.hp > 1) {
      enemy.hp = Math.max(1, enemy.hp - thorns);
      push({ type: 'thorns', text: `Your thorns tear into ${enemy.name} for ${thorns}.`, target: source, dmg: thorns });
    }
    if (combat.run.hp <= 0) {
      // T4 relic: the Heart of the Dying Moon beats again — once per run.
      if (combat.run.revive) {
        combat.run.revive = false;
        combat.run.hp = Math.ceil(combat.run.maxHp * DATA.difficulty.player?.reviveHpPct);
        push({ type: 'revive', text: 'The Heart of the Dying Moon beats again! You rise at half health.' });
        continue;
      }
      combat.over = true;
      combat.victory = false;
      combat.run.killedBy = enemy.id; // run history (0.095)
      push({ type: 'sys', text: 'You have fallen...' });
      return events;
    }
  }

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

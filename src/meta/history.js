// meta/history.js — the run history (0.095): one compact record per
// finished run, appended to the profile by settleRun (the single run ->
// profile transaction). It travels with the save, so a tester's exported
// save code carries their whole history to the /analytics/ dashboard.

import { DATA } from '../shared/data.js';

export const HISTORY_MAX = 250; // newest runs kept (~60KB of save)

export const newPlayerId = () => Math.random().toString(36).slice(2, 10);

// What one run looked like. `run` is the finished run object (after the
// settle math: coinsRetrieved is known).
export function runRecord(run, outcome, now = Date.now()) {
  return {
    at: now,
    build: DATA.build?.version ?? '?',
    outcome,
    room: run.roomNumber,
    kills: run.kills,
    xp: run.xp,
    coins: run.coins,
    banked: run.coinsRetrieved,
    items: run.itemsFound.length,
    relic: !!run.relicFound,
    boons: (run.buffs ?? []).map((b) => b.id).filter(Boolean),
    bosses: run.bossesBeaten ?? 0,
    killedBy: outcome === 'death' ? run.killedBy ?? null : null,
    potions: run.potionsDrunk ?? 0,
    turns: run.turns ?? 0,
    ms: run.startedAt ? Math.max(0, now - run.startedAt) : 0,
    // who went in: level and the stat snapshot at the door
    level: run.level ?? 1,
    maxHp: run.stats?.maxHp ?? run.maxHp,
    dmg: run.stats?.dmg ?? 0,
    armor: run.stats?.armor ?? 0,
  };
}

export function recordRun(p, run, outcome) {
  if (!Array.isArray(p.history)) p.history = [];
  p.history.push(runRecord(run, outcome));
  if (p.history.length > HISTORY_MAX) p.history.splice(0, p.history.length - HISTORY_MAX);
}

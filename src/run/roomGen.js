// run/roomGen.js — procedural room generation via threat budget.
// Each combat room has a budget; we spend it on scaled enemies whose
// tier matches the room's depth. Boss rooms every bossEvery rooms.
// Only fights are numbered (0.171): a shrine (one per stretch of bossEvery
// rooms, 0.091) or a treasure room is an interlude BETWEEN numbered rooms
// (generateInterlude), so room 8 is always the throne room. Room 1, the
// way in from the Great Hall, is always a corridor (backgrounds.json
// entrance); the room before each throne room an antechamber
// (antechambers, 0.171) — and only that room.

import { DATA } from '../shared/data.js';
import { scaleEnemy, roomTier, pick } from '../shared/balance.js';

// A painting the run hasn't shown yet (0.156: no repeats within a run while
// the pool lasts — run.seenBackgrounds; then the whole pool again).
function pickFresh(pool, run) {
  const seen = run.seenBackgrounds;
  const fresh = seen ? pool.filter((f) => !seen.includes(f)) : pool;
  const bg = pick(fresh.length ? fresh : pool);
  seen?.push(bg);
  return bg;
}

// Which paintings a fight room draws from (0.171): the entrance corridors
// for room 1, an antechamber before each boss, else every fight painting
// but the antechambers.
function fightPool(roomNumber) {
  const b = DATA.backgrounds, every = DATA.difficulty.bossEvery;
  if (roomNumber === 1) return b.entrance;
  if (roomNumber % every === every - 1) return b.antechambers;
  return b.rooms.filter((f) => !b.antechambers.includes(f));
}

function roomNameFor(bgFile) {
  return DATA.backgrounds.roomNames[bgFile];
}

export function generateRoom(roomNumber, run = {}) {
  const diff = DATA.difficulty;
  const isBossRoom = roomNumber % diff.bossEvery === 0;

  if (isBossRoom) {
    const bg = pickFresh(DATA.backgrounds.bosses, run); // (0.156: a throne room of several)
    return {
      number: roomNumber,
      kind: 'boss',
      isBoss: true,
      name: roomNameFor(bg),
      enemies: [makeBoss(roomNumber)],
      background: bg,
    };
  }

  const enemies = roomEnemies(roomNumber); // rolled before the painting (seeded runs depend on the order)
  const bg = pickFresh(fightPool(roomNumber), run);
  return {
    number: roomNumber,
    kind: 'combat',
    isBoss: false,
    name: roomNameFor(bg),
    enemies,
    background: bg,
  };
}

// An interlude (0.171): the stretch's shrine or the run's treasure room,
// met on the way to room `before`. It has no number; `depth` (the room it
// leads to) prices what's inside.
export function generateInterlude(kind, before, run = {}) {
  if (kind === 'shrine') {
    return { number: null, depth: before, kind, isBoss: false, taken: false, name: DATA.backgrounds.shrineName, enemies: [], background: DATA.backgrounds.shrine };
  }
  // A treasure room (0.155, run/treasure.js): three chests, no fight.
  const bg = pickFresh(DATA.backgrounds.treasure, run);
  return { number: null, depth: before, kind: 'treasure', isBoss: false, opened: null, name: roomNameFor(bg), enemies: [], background: bg };
}

// A combat room's line: the threat budget spent on enemies of the depth's
// tiers (also what a treasure coffer's haul is counted from, run/treasure.js).
export function roomEnemies(roomNumber) {
  const diff = DATA.difficulty;
  const budget = diff.budgetBase + roomNumber * diff.budgetPerRoom;
  const tier = roomTier(roomNumber);
  const pool = Object.keys(DATA.enemies).filter(
    (id) => DATA.enemies[id].tier <= tier && !DATA.enemies[id].boss
  );
  const enemies = [];
  let spent = 0;
  while (spent < budget && enemies.length < diff.maxEnemies) {
    const id = pick(pool);
    enemies.push(scaleEnemy(id, roomNumber));
    spent += diff.enemyCost[String(DATA.enemies[id].tier)];
  }
  return enemies;
}

function makeBoss(roomNumber) {
  // 0.072: bosses were dying as fast as deep trash (2/40 sim deaths at boss
  // rooms). They now scale as if {depthBonus} rooms deeper, with an extra
  // HP/damage spike on top. Name still comes from scaleEnemy.
  const b = DATA.difficulty.boss;
  const boss = scaleEnemy('vampire_lord', roomNumber + b.depthBonus);
  boss.maxHp = Math.round(boss.maxHp * b.hpMult);
  boss.dmg = Math.round(boss.dmg * b.dmgMult);
  // Summoner (0.092): its meter fills each turn; see combat.js summonPhase.
  if (b.summon?.every > 0) Object.assign(boss, { summonEvery: b.summon.every, summonMeter: 0 });
  return boss;
}

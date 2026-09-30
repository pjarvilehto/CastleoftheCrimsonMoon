// run/roomGen.js — procedural room generation via threat budget.
// Each combat room has a budget; we spend it on scaled enemies whose
// tier matches the room's depth. Boss rooms every bossEvery rooms.
// One shrine in every stretch of bossEvery rooms (run.shrineRooms: rooms
// 2-7, 10-15, ...), so there's always one before each boss (0.091).

import { DATA } from '../shared/data.js';
import { scaleEnemy, roomTier } from '../shared/balance.js';

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function roomNameFor(bgFile) {
  return (DATA.backgrounds.roomNames && DATA.backgrounds.roomNames[bgFile]) || 'The Chamber';
}

export function generateRoom(roomNumber, run = {}) {
  const diff = DATA.difficulty;
  const isBossRoom = roomNumber % diff.bossEvery === 0;

  if (isBossRoom) {
    return {
      number: roomNumber,
      kind: 'boss',
      isBoss: true,
      name: roomNameFor(DATA.backgrounds.boss),
      enemies: [makeBoss(roomNumber)],
      background: DATA.backgrounds.boss,
    };
  }

  // The guaranteed pre-boss shrine.
  if (run.shrineRooms?.includes(roomNumber)) {
    return {
      number: roomNumber,
      kind: 'shrine',
      isBoss: false,
      taken: false,
      name: DATA.backgrounds.shrineName || 'The Shrine',
      enemies: [],
      background: DATA.backgrounds.shrine,
    };
  }

  const budget = diff.budgetBase + roomNumber * diff.budgetPerRoom;
  const tier = roomTier(roomNumber);
  const pool = Object.keys(DATA.enemies).filter(
    (id) => DATA.enemies[id].tier <= tier && !DATA.enemies[id].boss
  );

  const enemies = [];
  let spent = 0;
  let guard = 0; // safety against pathological loops
  const maxEnemies = diff.maxEnemies ?? 6;
  while (spent < budget && enemies.length < maxEnemies && guard++ < 20) {
    const id = pickRandom(pool);
    const cost = diff.enemyCost[String(DATA.enemies[id].tier)];
    enemies.push(scaleEnemy(id, roomNumber));
    spent += cost;
  }

  const bg = pickRandom(DATA.backgrounds.rooms);
  return {
    number: roomNumber,
    kind: 'combat',
    isBoss: false,
    name: roomNameFor(bg),
    enemies,
    background: bg,
  };
}

function makeBoss(roomNumber) {
  // 0.072: bosses were dying as fast as deep trash (2/40 sim deaths at boss
  // rooms). They now scale as if {depthBonus} rooms deeper, with an extra
  // HP/damage spike on top. Name still comes from scaleEnemy.
  const b = DATA.difficulty.boss ?? {};
  const boss = scaleEnemy('vampire_lord', roomNumber + (b.depthBonus ?? 4));
  boss.maxHp = Math.round(boss.maxHp * (b.hpMult ?? 1.5));
  boss.dmg = Math.round(boss.dmg * (b.dmgMult ?? 1.25));
  // Summoner (0.092): its meter fills each turn; see combat.js summonPhase.
  if (b.summon?.every > 0) Object.assign(boss, { summonEvery: b.summon.every, summonMeter: 0 });
  return boss;
}

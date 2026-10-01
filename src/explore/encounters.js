// explore/encounters.js — what waits in a floor's rooms (0.141). Pure (DATA
// aside): floor n of the dungeon is the game's rooms (n-1)*bossEvery+1 ..
// n*bossEvery — its encounters, nearest the start first, are the combat
// rooms in order and the boss chamber is the stretch's boss room. Each
// encounter's room (enemies scaled to that depth) comes from the game's own
// run/roomGen.js; the strongest enemy in it is the one standing in the
// dungeon for the whole group.

import { generateRoom } from '../run/roomGen.js';

export function planFloor(floor, depth, bossEvery) {
  const base = (depth - 1) * bossEvery;
  return [
    ...floor.encounters.map((e, i) => ({ x: e.x, z: e.z, rect: e.room, number: base + i + 1, boss: false })),
    { x: floor.boss.x, z: floor.boss.z, rect: floor.boss.room, number: base + bossEvery, boss: true },
  ];
}

// the planned spot's game room (combat or boss — never a shrine: the
// lab's run has no shrine rooms)
export const roomFor = (spot) => generateRoom(spot.number, { shrineRooms: [] });

export const leaderOf = (room) => room.enemies.reduce((a, b) => (b.maxHp > a.maxHp ? b : a));

// is cell (x, z) inside a room's rectangle?
export const inRect = (r, x, z) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h;

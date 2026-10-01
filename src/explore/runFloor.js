// explore/runFloor.js — a run's stretch as one 3D floor (0.150, the game's
// 3D corridors). Pure; tested in Node. The game's rooms come in stretches
// of bossEvery (8): fights and the shrine (where the run put it, run.shrineRooms)
// in the first seven, the boss in the eighth. A stretch is one floor,
// laid out very linear (explore.json run.gen over gen): the start (where
// the knight arrives — from the Great Hall, or down the last floor's
// stairs), the stretch's rooms one after another, each a corridor's length
// on from the last, then the stairs down to the next stretch.
// planStretch(stretch, shrineRoom, bossEvery, cfg, seed)
//   -> { floor, base, rooms: Map(room number -> { number, kind, rect, centre }) }

import { generateFloor } from './mapgen.js';

export function planStretch(stretch, shrineRoom, bossEvery, cfg, seed) {
  const base = stretch * bossEvery;
  const floor = generateFloor(seed, { ...cfg.gen, ...cfg.run.gen, encounters: bossEvery - 2, shrineAt: shrineRoom - base - 1 });
  // in walking order: the start, then the stretch's rooms, the boss chamber last
  const rooms = new Map();
  floor.rooms.slice(1).forEach((rect, i) => {
    const number = base + i + 1;
    const kind = rect === floor.boss.room ? 'boss' : rect === floor.shrine.room ? 'shrine' : 'combat';
    rooms.set(number, { number, kind, rect, centre: { x: rect.x + (rect.w >> 1), z: rect.z + (rect.h >> 1) } });
  });
  return { floor, base, rooms };
}

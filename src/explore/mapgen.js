// explore/mapgen.js — a dungeon floor from a seed (0.140). Pure: no DOM, no
// three.js; tested in Node. Rooms are scattered without touching, joined
// by a spanning tree of L-shaped corridors (plus a few extra links, so
// some routes loop), and a few dead-end spurs are dug off the corridors.
// Then the rooms get their parts: the big room is the boss chamber, the
// room farthest from it the start, one room halfway the shrine, and the
// rest (nearest first) the encounters. Out comes the same text map
// grid.js reads — '#' wall, '.' floor, 'S' start — with the rooms marked
// at their centres: 'E' encounter, 'H' shrine, 'B' boss.

import { seeded, DIRS } from './grid.js';

const W = '#', O = '.';

export function generateFloor(seed, gen) {
  const rnd = seeded(seed);
  for (let attempt = 0; attempt < 100; attempt++) {
    const floor = tryFloor(rnd, gen);
    if (floor) return { seed, ...floor };
  }
  throw new Error(`mapgen: no floor for seed ${seed}`); // (the tests sweep hundreds of seeds)
}

function tryFloor(rnd, gen) {
  const { width: w, height: h } = gen;
  const g = Array.from({ length: h }, () => Array(w).fill(W));
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  // rooms: the boss chamber first (it must fit), then as many as will go
  const rooms = [];
  const fits = (r) => r.x >= 1 && r.z >= 1 && r.x + r.w <= w - 1 && r.z + r.h <= h - 1
    && rooms.every((o) => r.x + r.w + gen.roomGap <= o.x || o.x + o.w + gen.roomGap <= r.x || r.z + r.h + gen.roomGap <= o.z || o.z + o.h + gen.roomGap <= r.z);
  for (let tries = 0; tries < 400 && rooms.length < gen.rooms; tries++) {
    const boss = rooms.length === 0;
    const rw = boss ? gen.bossSize : int(gen.roomMin, gen.roomMax), rh = boss ? gen.bossSize : int(gen.roomMin, gen.roomMax);
    const r = { x: int(1, w - rw - 1), z: int(1, h - rh - 1), w: rw, h: rh };
    if (fits(r)) rooms.push(r);
  }
  const needed = gen.encounters + 3; // + start, shrine, boss
  if (rooms.length < needed) return null;
  for (const r of rooms) for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) g[z][x] = O;
  const centre = (r) => ({ x: r.x + (r.w >> 1), z: r.z + (r.h >> 1) });

  // corridors: a spanning tree (Prim, nearest first), then extra links
  const dist = (a, b) => Math.abs(centre(a).x - centre(b).x) + Math.abs(centre(a).z - centre(b).z);
  const linked = new Set([0]), links = [];
  while (linked.size < rooms.length) {
    let best = null;
    for (const i of linked) rooms.forEach((r, j) => {
      if (!linked.has(j) && (!best || dist(rooms[i], r) < best.d)) best = { i, j, d: dist(rooms[i], r) };
    });
    linked.add(best.j); links.push([best.i, best.j]);
  }
  for (let k = 0; k < gen.loops; k++) {
    const i = int(0, rooms.length - 1);
    const others = rooms.map((_, j) => j).filter((j) => j !== i && !links.some(([a, b]) => (a === i && b === j) || (a === j && b === i)))
      .sort((a, b) => dist(rooms[i], rooms[a]) - dist(rooms[i], rooms[b]));
    if (others.length) links.push([i, others[0]]);
  }
  for (const [i, j] of links) {
    const a = centre(rooms[i]), b = centre(rooms[j]), xFirst = rnd() < 0.5;
    const corner = xFirst ? { x: b.x, z: a.z } : { x: a.x, z: b.z };
    dig(g, a, corner); dig(g, corner, b);
  }

  // dead ends: short spurs off a corridor into solid rock
  const inRoom = (x, z) => rooms.some((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h);
  for (let k = 0, tries = 0; k < gen.deadEnds && tries < 200; tries++) {
    const x = int(1, w - 2), z = int(1, h - 2);
    if (g[z][x] !== O || inRoom(x, z)) continue;
    const [dx, dz] = Object.values(DIRS)[int(0, 3)], len = int(2, gen.deadEndMax);
    const cells = [];
    for (let s = 1; s <= len; s++) {
      const cx = x + dx * s, cz = z + dz * s;
      // solid rock all round (bar the cell we came from), else stop short
      const clear = cx > 1 && cz > 1 && cx < w - 2 && cz < h - 2 && [[0, 0], [dx, dz], [dz, dx], [-dz, -dx], [dx + dz, dz + dx], [dx - dz, dz - dx]]
        .every(([ox, oz]) => g[cz + oz][cx + ox] === W);
      if (!clear) break;
      cells.push([cx, cz]);
    }
    if (cells.length < 2) continue;
    for (const [cx, cz] of cells) g[cz][cx] = O;
    k++;
  }

  // the rooms' parts, by walking distance
  const bossRoom = rooms[0];
  const fromBoss = walk(g, centre(bossRoom));
  const others = rooms.slice(1);
  const startRoom = others.reduce((a, b) => (fromBoss[key(centre(b))] > fromBoss[key(centre(a))] ? b : a));
  const fromStart = walk(g, centre(startRoom));
  const d = (r) => fromStart[key(centre(r))];
  const rest = others.filter((r) => r !== startRoom).sort((a, b) => d(a) - d(b));
  if (rest.some((r) => d(r) >= d(bossRoom))) return null; // the boss is the deepest point
  const shrineRoom = rest.splice(Math.floor(rest.length / 2), 1)[0];
  const encounterRooms = rest.slice(0, gen.encounters);

  const start = centre(startRoom);
  const mark = (r, c) => { const p = centre(r); g[p.z][p.x] = c; return { ...p, room: r }; };
  mark(startRoom, 'S');
  const encounters = encounterRooms.map((r) => mark(r, 'E'));
  const shrine = mark(shrineRoom, 'H'), boss = mark(bossRoom, 'B');
  // face down the longest open line from the start
  const run = ([dx, dz]) => { let n = 0; while (g[start.z + dz * (n + 1)][start.x + dx * (n + 1)] !== W) n++; return n; };
  const facing = Object.keys(DIRS).reduce((a, b) => (run(DIRS[b]) > run(DIRS[a]) ? b : a));
  return { rows: g.map((r) => r.join('')), rooms, start: { ...start, facing }, encounters, shrine, boss };
}

// a straight line of floor from a to b (one of the axes is shared)
function dig(g, a, b) {
  const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
  for (let x = a.x, z = a.z; ; x += dx, z += dz) {
    if (g[z][x] === W) g[z][x] = O;
    if (x === b.x && z === b.z) break;
  }
}

const key = (p) => `${p.x},${p.z}`;

// walking distance (in cells) from p to every open cell
function walk(g, p) {
  const out = { [key(p)]: 0 }, todo = [p];
  for (let i = 0; i < todo.length; i++) {
    const c = todo[i];
    for (const [dx, dz] of Object.values(DIRS)) {
      const n = { x: c.x + dx, z: c.z + dz };
      if (g[n.z]?.[n.x] && g[n.z][n.x] !== W && !(key(n) in out)) { out[key(n)] = out[key(c)] + 1; todo.push(n); }
    }
  }
  return out;
}

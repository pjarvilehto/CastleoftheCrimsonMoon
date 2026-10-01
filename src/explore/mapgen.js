// explore/mapgen.js — a dungeon floor from a seed (0.140; linear since
// 0.143). Pure: no DOM, no three.js; tested in Node. The floor is a chain:
// rooms laid one after another along a winding path (mostly onward, now
// and then a turn), each joined only to the next by a corridor, plus a
// short dead-end spur or so. The first room is the start, then the
// encounters in walking order with the shrine halfway, then the boss
// chamber, and past it a single cell: the stairs down (0.144). Out comes
// the text map grid.js reads — '#' wall, '.' floor, 'S' start — with the
// rooms marked at their centres: 'E' encounter, 'H' shrine, 'B' boss,
// 'X' the stairs.

import { seeded, DIRS } from './grid.js';

const W = '#', O = '.';
const HEADINGS = Object.values(DIRS);

export function generateFloor(seed, gen) {
  const rnd = seeded(seed);
  for (let attempt = 0; attempt < 600; attempt++) {
    const floor = tryFloor(rnd, gen);
    if (floor) return { seed, ...floor };
  }
  throw new Error(`mapgen: no floor for seed ${seed}`); // (the tests sweep hundreds of seeds)
}

function tryFloor(rnd, gen) {
  const { width: w, height: h } = gen;
  const g = Array.from({ length: h }, () => Array(w).fill(W));
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const count = gen.encounters + 4; // start, encounters, shrine, boss, stairs
  const centre = (r) => ({ x: r.x + (r.w >> 1), z: r.z + (r.h >> 1) });
  const inRect = (r, x, z) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h;

  // the chain: each room a corridor's length on from the last
  const rooms = [];
  const fits = (r) => r.x >= 1 && r.z >= 1 && r.x + r.w <= w - 1 && r.z + r.h <= h - 1
    && rooms.every((o) => r.x + r.w + gen.roomGap <= o.x || o.x + o.w + gen.roomGap <= r.x || r.z + r.h + gen.roomGap <= o.z || o.z + o.h + gen.roomGap <= r.z);
  const sw = int(gen.roomMin, gen.roomMax), sh = int(gen.roomMin, gen.roomMax);
  rooms.push({ x: int(1, w - sw - 1), z: int(1, h - sh - 1), w: sw, h: sh });
  let heading = HEADINGS[int(0, 3)];
  while (rooms.length < count) {
    const prev = rooms.at(-1), boss = rooms.length === count - 2, stairs = rooms.length === count - 1;
    let placed = null;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const dir = rnd() < gen.straightness ? heading : HEADINGS[int(0, 3)];
      const size = () => (boss ? gen.bossSize : stairs ? 1 : int(gen.roomMin, gen.roomMax));
      const rw = size(), rh = size();
      const link = int(gen.linkMin, gen.linkMax), [dx, dz] = dir;
      // beyond prev's side in that direction, sliding a little sideways
      const x = dx > 0 ? prev.x + prev.w + link : dx < 0 ? prev.x - link - rw : prev.x + int(-(rw - 1), prev.w - 1);
      const z = dz > 0 ? prev.z + prev.h + link : dz < 0 ? prev.z - link - rh : prev.z + int(-(rh - 1), prev.h - 1);
      const r = { x, z, w: rw, h: rh };
      if (fits(r)) { placed = r; heading = dir; }
    }
    if (!placed) return null; // painted into a corner: start over
    rooms.push(placed);
  }
  for (const r of rooms) for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) g[z][x] = O;

  // corridors: each room to the next only, by an L that touches no other room
  const trail = new Set(); // every cell a corridor runs through, rooms included (the way through them)
  for (let i = 1; i < rooms.length; i++) {
    const a = centre(rooms[i - 1]), b = centre(rooms[i]);
    const others = rooms.filter((_, j) => j !== i && j !== i - 1);
    const clear = (p, q) => {
      const dx = Math.sign(q.x - p.x), dz = Math.sign(q.z - p.z);
      for (let x = p.x, z = p.z; ; x += dx, z += dz) {
        if (others.some((r) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oz]) => inRect(r, x + ox, z + oz)))) return false;
        if (x === q.x && z === q.z) return true;
      }
    };
    const corners = [{ x: b.x, z: a.z }, { x: a.x, z: b.z }];
    if (rnd() < 0.5) corners.reverse();
    const c = corners.find((k) => clear(a, k) && clear(k, b));
    if (!c) return null; // the only ways there cut through another room
    dig(g, a, c, trail); dig(g, c, b, trail);
  }

  // dead ends: short spurs off a corridor into solid rock
  const inAny = (x, z) => rooms.some((r) => inRect(r, x, z));
  for (let k = 0, tries = 0; k < gen.deadEnds && tries < 200; tries++) {
    const x = int(1, w - 2), z = int(1, h - 2);
    if (g[z][x] !== O || inAny(x, z)) continue;
    const [dx, dz] = HEADINGS[int(0, 3)], len = int(2, gen.deadEndMax);
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

  // the rooms' parts, in walking order; the boss is the deepest point
  const startRoom = rooms[0], bossRoom = rooms.at(-2), stairsRoom = rooms.at(-1);
  const fromStart = walk(g, centre(startRoom));
  const d = (r) => fromStart[key(centre(r))];
  // still a chain when walked: every room further on than the one before
  // (a corridor crossing another would make a fork or a shortcut)
  if (!rooms.every((r, i) => i === 0 || d(r) > d(rooms[i - 1]))) return null;
  const middle = rooms.slice(1, -2);
  // the shrine halfway — or, for a run's floor (0.150), where the run put it
  const shrineRoom = middle[gen.shrineAt ?? Math.floor(middle.length / 2)];
  const encounterRooms = middle.filter((r) => r !== shrineRoom);

  const start = centre(startRoom);
  const mark = (r, ch) => { const p = centre(r); g[p.z][p.x] = ch; return { ...p, room: r }; };
  mark(startRoom, 'S');
  const encounters = encounterRooms.map((r) => mark(r, 'E'));
  const shrine = mark(shrineRoom, 'H'), boss = mark(bossRoom, 'B'), stairsAt = mark(stairsRoom, 'X');
  // the stairs go down away from the way in (its one open neighbour)
  const [inX, inZ] = HEADINGS.find(([dx, dz]) => g[stairsAt.z + dz][stairsAt.x + dx] !== W);
  const down = [-inX, -inZ];
  // face down the longest open line from the start
  const run = ([dx, dz]) => { let n = 0; while (g[start.z + dz * (n + 1)][start.x + dx * (n + 1)] !== W) n++; return n; };
  const facing = Object.keys(DIRS).reduce((a, b) => (run(DIRS[b]) > run(DIRS[a]) ? b : a));
  return { rows: g.map((r) => r.join('')), rooms: rooms.slice(0, -1), trail: [...trail], start: { ...start, facing }, encounters, shrine, boss,
    stairs: { x: stairsAt.x, z: stairsAt.z, down } };
}

// a straight line of floor from a to b (one of the axes is shared), its
// cells noted in the trail
function dig(g, a, b, trail) {
  const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
  for (let x = a.x, z = a.z; ; x += dx, z += dz) {
    if (g[z][x] === W) g[z][x] = O;
    trail.add(`${x},${z}`);
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

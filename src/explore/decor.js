// explore/decor.js — the dungeon's props (0.142, the look pass), all from
// code and merged per material (a few draw calls a floor):
//   arches   a stone frame (jambs + lintel) where a corridor opens into a room
//   pillars  in rooms 4+ cells a side, one cell in from each corner (they
//            block the way: `posts`, circles in cell units, for collision)
//   chains   hanging from room ceilings
//   rubble   stones heaped at the foot of the walls
//   puddles  glossy black water that catches the torchlight
//   altar    the shrine room's: a stone block with candles (one light,
//            joining the torches so the light pool can pick it)
// buildDecor(grid, cfg, { rooms, shrine, top, inRoom, isStairs, rnd, M }) ->
//   { group, posts: [{ x, z, r }], lights: [{ position, flames, halos, phase, power }] }
// (flames and halos: sprites with their resting scale in userData.base)

import * as THREE from 'three';
import { isOpen } from './grid.js';
import { mergeParts, worldUV } from './geom.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function buildDecor(grid, cfg, { rooms, shrine, top, inRoom, isStairs, rnd, M }) {
  const C = cfg.cell, H = cfg.wallHeight, D = cfg.decor;
  const open = (x, z) => isOpen(grid, x, z);
  const stone = [], iron = [], water = [], posts = [], lights = [];
  const box = (w, h, d, x, y, z) => stone.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const between = (a, b) => a + rnd() * (b - a);

  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      if (!open(x, z) || isStairs(x, z)) continue; // (nothing floats over the stairwell)
      // arches: a corridor cell opening into a room, walled on both sides
      if (!inRoom(x, z)) {
        for (const [dx, dz] of DIRS4) {
          if (!inRoom(x + dx, z + dz) || open(x + dz, z + dx) || open(x - dz, z - dx)) continue;
          const ex = (x + 0.5 + dx * 0.5) * C - dx * 0.3, ez = (z + 0.5 + dz * 0.5) * C - dz * 0.3; // the edge, set into the corridor
          const along = dx ? [0, 1] : [1, 0], off = C / 2 - 0.22;
          for (const s of [-1, 1]) box(dx ? 0.6 : 0.44, H, dx ? 0.44 : 0.6, ex + along[0] * off * s, H / 2, ez + along[1] * off * s);
          box(dx ? 0.6 : C, 0.5, dx ? C : 0.6, ex, H - 0.25, ez);
        }
      }
      // rubble at the foot of a wall, now and then
      if (rnd() < D.rubble) {
        const walls = DIRS4.filter(([dx, dz]) => !open(x + dx, z + dz));
        if (walls.length) {
          const [dx, dz] = walls[Math.floor(rnd() * walls.length)];
          const cx = (x + 0.5 + dx * 0.38) * C, cz = (z + 0.5 + dz * 0.38) * C;
          for (let k = 0, n = 3 + Math.floor(rnd() * 4); k < n; k++) {
            const r = between(0.07, 0.22);
            const g = new THREE.DodecahedronGeometry(r, 0).scale(1, 0.6, 1).rotateY(rnd() * 6);
            stone.push(g.translate(cx + (dx ? 0 : between(-0.7, 0.7)) + between(-0.2, 0.2), r * 0.45, cz + (dz ? 0 : between(-0.7, 0.7)) + between(-0.2, 0.2)));
          }
        }
      }
      // puddles: a ragged flat blob of black water
      if (rnd() < D.puddles) {
        const shape = new THREE.Shape(), n = 9, R = between(0.35, 0.9);
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2, rr = R * between(0.6, 1.1);
          if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        water.push(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate((x + between(0.25, 0.75)) * C, 0.008, (z + between(0.25, 0.75)) * C));
      }
    }
  }

  for (const r of rooms) {
    const T = top(r.x, r.z);
    // pillars, one cell in from each corner of a big room
    if (r.w >= 4 && r.h >= 4) {
      for (const [px, pz] of [[r.x + 1, r.z + 1], [r.x + r.w - 1, r.z + 1], [r.x + 1, r.z + r.h - 1], [r.x + r.w - 1, r.z + r.h - 1]]) {
        const wx = px * C, wz = pz * C;
        box(0.7, T, 0.7, wx, T / 2, wz);
        box(1.0, 0.32, 1.0, wx, 0.16, wz);
        box(1.0, 0.32, 1.0, wx, T - 0.16, wz);
        posts.push({ x: px, z: pz, r: 0.55 / C });
      }
    }
    // chains from the ceiling, away from the walls and the room's middle
    for (let k = 0, n = Math.floor(between(1, D.chainsPerRoom + 1)); k < n; k++) {
      const cx = (r.x + between(0.3, r.w - 0.3)) * C, cz = (r.z + between(0.3, r.h - 0.3)) * C;
      if (Math.hypot(cx - (r.x + r.w / 2) * C, cz - (r.z + r.h / 2) * C) < 1.2) continue;
      const len = between(0.8, Math.min(2.2, T - 2.1)), step = 0.11;
      for (let i = 0; i * step < len; i++) {
        const link = new THREE.TorusGeometry(0.055, 0.016, 4, 8);
        if (i % 2) link.rotateY(Math.PI / 2);
        iron.push(link.translate(cx, T - 0.05 - i * step, cz));
      }
    }
  }

  // the shrine's altar: a stone block, a slab, candles
  if (shrine) {
    const ax = (shrine.x + 0.5) * C, az = (shrine.z + 0.5) * C;
    box(1.3, 0.85, 0.75, ax, 0.425, az);
    box(1.55, 0.12, 0.95, ax, 0.91, az);
    const wax = [], altar = { position: new THREE.Vector3(ax, 1.7, az), flames: [], halos: [], phase: rnd() * 100, power: D.altarLight };
    for (let i = 0; i < 5; i++) {
      const h = between(0.12, 0.3), cx = ax + between(-0.6, 0.6), cz = az + between(-0.35, 0.35);
      wax.push(new THREE.CylinderGeometry(0.035, 0.04, h, 6).translate(cx, 0.97 + h / 2, cz));
      const flame = new THREE.Sprite(M.flame.clone());
      flame.position.set(cx, 0.97 + h + 0.06, cz); flame.userData.base = [0.08, 0.15];
      const halo = new THREE.Sprite(M.halo.clone());
      halo.position.copy(flame.position); halo.userData.base = [0.55, 0.55];
      altar.flames.push(flame); altar.halos.push(halo);
    }
    lights.push(altar);
    posts.push({ x: shrine.x + 0.5, z: shrine.z + 0.5, r: 0.75 / C });
    stone.wax = mergeParts(wax);
  }

  const group = new THREE.Group();
  if (stone.length) group.add(new THREE.Mesh(worldUV(mergeParts(stone), C, H), M.stone));
  if (iron.length) group.add(new THREE.Mesh(mergeParts(iron), M.iron));
  if (water.length) group.add(new THREE.Mesh(mergeParts(water), M.water));
  if (stone.wax) group.add(new THREE.Mesh(stone.wax, M.wax));
  for (const l of lights) group.add(...l.flames, ...l.halos);
  return { group, posts, lights };
}

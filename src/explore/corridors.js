// explore/corridors.js — the corridors between the rooms (0.146): bare
// stone no longer. Now and then a wall face holds a banner, an iron-bound
// cell door in a stone frame, a small barred grate onto darkness, a skull
// niche with a candle, a cobweb up in the corner; the floor gets bones, a
// skull, a drain grate. Never on a face that holds a torch, never over the
// stairwell. Chances: explore.json corridor. Dressed with the furnish.js
// kit, so it all merges with the rooms' pieces.

import * as THREE from 'three';

const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function dressCorridors(k, grid, { inRoom, isStairs, torchFaces, open }) {
  const D = k.cfg.corridor, H = k.H;
  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      if (!open(x, z) || inRoom(x, z) || isStairs(x, z)) continue;
      for (const [dx, dz] of SIDES) {
        if (open(x + dx, z + dz)) continue;
        const f = { x, z, n: [-dx, -dz], top: H };
        if (torchFaces.has(`${x},${z},${-dx},${-dz}`)) continue;
        const W = k.wall(f), r = k.rnd();
        let acc = 0;
        if (r < (acc += D.banner)) k.banner(f, [355, 275, 25][Math.floor(k.rnd() * 3)], 2.2);
        else if (r < (acc += D.door)) { // a cell door, recessed in a stone frame
          k.panel('door', f, 1.3, 2.3, 0, 0, 0.04);
          for (const s of [-1, 1]) W.box('stone', 0.32, 2.6, 0.3, s * 0.8, 0);
          W.box('stone', 1.9, 0.35, 0.32, 0, 2.45);
          W.blockOut(1.9, 0.3);
        } else if (r < (acc += D.grate)) { // a barred slit onto the dark
          k.panel('black', f, 0.9, 0.55, 0, 1.75, 0.03);
          for (let b = 0; b < 5; b++) { const p = W.at(-0.36 + b * 0.18, 2.02, 0.08); k.cyl('iron', 0.018, 0.018, 0.6, p.x, p.y, p.z, 4); }
          W.box('stone', 1.1, 0.12, 0.2, 0, 1.68); W.box('stone', 1.1, 0.12, 0.2, 0, 2.3);
        } else if (r < (acc += D.niche)) { // a skull in a niche, a candle beside it
          k.panel('black', f, 0.7, 0.6, 0, 1.2, 0.03);
          W.box('stone', 0.9, 0.1, 0.32, 0, 1.12);
          const p = W.at(-0.1, 1.17, 0.18);
          k.add('bone', new THREE.SphereGeometry(0.11, 8, 6).scale(1, 0.9, 1.1).translate(p.x, p.y + 0.1, p.z));
          const c = W.at(0.22, 1.17, 0.18);
          k.candles(c.x, c.y, c.z, 1, 0.01, k.S.candles * 0.6);
        }
        if (k.rnd() < D.cobweb) k.cobweb(f, H);
      }
      const c = k.centreOf({ x, z });
      if (k.rnd() < D.bones) { // bones and a skull on the floor
        for (let i = 0; i < 3; i++) k.add('bone', new THREE.CylinderGeometry(0.025, 0.03, k.between(0.25, 0.45), 5).rotateZ(Math.PI / 2).rotateY(k.rnd() * 6).translate(c.x + k.between(-1, 1), 0.03, c.z + k.between(-1, 1)));
        if (k.rnd() < 0.6) k.add('bone', new THREE.SphereGeometry(0.11, 8, 6).scale(1, 0.9, 1.1).translate(c.x + k.between(-1, 1), 0.09, c.z + k.between(-1, 1)));
      } else if (k.rnd() < D.drain) { // an iron drain grate
        const gx = c.x + k.between(-0.6, 0.6), gz = c.z + k.between(-0.6, 0.6);
        k.add('black', new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2).translate(gx, 0.006, gz));
        for (let b = 0; b < 5; b++) k.box('iron', 0.04, 0.025, 0.7, gx - 0.28 + b * 0.14, 0.012, gz);
      }
    }
  }
}

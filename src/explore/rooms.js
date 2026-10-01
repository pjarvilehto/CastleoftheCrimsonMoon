// explore/rooms.js — what each room theme holds (0.146), after the castle's
// own paintings (assets/bg: the library's shelves and cold window, the
// chapel's stained glass and pews, the great hall's table and fireplace,
// the throne room's banners and braziers, the dungeon's cells and chains,
// the alchemy lab's green bottles and cauldron). Each theme dresses one
// room through the furnish.js kit: wall pieces on room.walls (never on
// the doorways), floor pieces on room.free (never on the path, where the
// corridors arrive and the enemy stands).

import * as THREE from 'three';

const faces = (room) => room.walls.map((f) => ({ ...f, top: room.height }));
const take = (list, rnd, n) => { const a = [...list], out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
// the wall face farthest from the room's first doorway (an altar, a throne, a hearth)
const farWall = (room) => {
  const d = room.doors[0] ?? { x: room.centre.x, z: room.centre.z };
  return faces(room).reduce((a, b) => (Math.hypot(b.x - d.x, b.z - d.z) > Math.hypot(a.x - d.x, a.z - d.z) ? b : a));
};
const rest = (room, used) => faces(room).filter((f) => !used.some((u) => u.x === f.x && u.z === f.z && u.n[0] === f.n[0] && u.n[1] === f.n[1]));

function crate(k, x, z) {
  const s = k.between(0.6, 0.9);
  k.box('wood', s, s, s, x, s / 2, z);
  if (k.rnd() < 0.4) k.box('wood', s * 0.7, s * 0.7, s * 0.7, x + k.between(-0.1, 0.1), s + s * 0.35, z);
  k.block(x - s / 2, z - s / 2, x + s / 2, z + s / 2);
}
function barrel(k, x, z) {
  k.cyl('wood', 0.32, 0.36, 0.95, x, 0.475, z, 10);
  for (const y of [0.2, 0.75]) k.add('iron', new THREE.TorusGeometry(0.35, 0.02, 4, 14).rotateX(Math.PI / 2).translate(x, y, z));
  k.block(x - 0.36, z - 0.36, x + 0.36, z + 0.36);
}
function table(k, x, z, len, wid, alongX) {
  const [w, d] = alongX ? [len, wid] : [wid, len];
  k.box('wood', w, 0.08, d, x, 0.82, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('wood', 0.09, 0.8, 0.09, x + sx * (w / 2 - 0.12), 0.4, z + sz * (d / 2 - 0.12));
  k.block(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
}
function hangingCage(k, x, z, top) {
  const y0 = top - 2.6;
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; k.cyl('iron', 0.018, 0.018, 1.4, x + Math.cos(a) * 0.42, y0 + 0.7, z + Math.sin(a) * 0.42, 4); }
  for (const y of [y0, y0 + 1.4]) k.add('iron', new THREE.TorusGeometry(0.42, 0.03, 4, 16).rotateX(Math.PI / 2).translate(x, y, z));
  k.chain(x, z, top - 0.05, y0 + 1.4);
  if (k.rnd() < 0.6) { k.cyl('bone', 0.025, 0.025, 0.5, x + 0.1, y0 + 0.08, z, 5); k.add('bone', new THREE.SphereGeometry(0.11, 8, 6).translate(x - 0.12, y0 + 0.12, z + 0.05)); }
}
function skull(k, x, y, z) {
  k.add('bone', new THREE.SphereGeometry(0.11, 8, 6).scale(1, 0.9, 1.1).translate(x, y + 0.1, z));
  k.box('bone', 0.12, 0.06, 0.08, x, y + 0.03, z + 0.06);
}

export const THEMES = {
  antechamber(k, room) {
    for (const c of take(room.free, k.rnd, 3)) {
      const p = k.centreOf(c);
      (k.rnd() < 0.5 ? crate : barrel)(k, p.x + k.between(-0.6, 0.6), p.z + k.between(-0.6, 0.6));
      if (k.rnd() < 0.6) barrel(k, p.x + k.between(-0.9, 0.9), p.z + k.between(-0.9, 0.9));
    }
    for (const f of take(faces(room), k.rnd, 2)) k.cobweb(f, room.height);
    const spot = room.free[0];
    if (spot) { const p = k.centreOf(spot); k.brazier(p.x + k.between(-0.4, 0.4), p.z + k.between(-0.4, 0.4)); }
    else { const f = take(faces(room), k.rnd, 1)[0], p = k.wall(f).at(k.between(-0.8, 0.8), 0, 0.5); k.candles(p.x, 0, p.z, 5, 0.3, k.S.candles * 1.6); }
  },

  sanctum(k, room) {
    const fs = take(faces(room), k.rnd, 3);
    fs.slice(0, 2).forEach((f) => k.banner(f, 275, 2.8));
    if (fs[2]) k.window(fs[2], 270, '#9a7cff', 1.6, 3.2);
    for (const c of take(room.free, k.rnd, 3)) { const p = k.centreOf(c); k.candles(p.x, 0, p.z, 6, 0.4); }
  },

  throne(k, room) {
    const C = k.C, cx = (room.centre.x + 0.5) * C, cz = (room.centre.z + 0.5) * C;
    // the carpet: a runner along the path row and column
    k.add('cloth355', new THREE.PlaneGeometry(room.w * C - 0.4, 1.7).rotateX(-Math.PI / 2).translate((room.x + room.w / 2) * C, 0.012, cz));
    k.add('cloth355', new THREE.PlaneGeometry(1.7, room.h * C - 0.4).rotateX(-Math.PI / 2).translate(cx, 0.014, (room.z + room.h / 2) * C));
    const throne = farWall(room), W = k.wall(throne);
    W.box('stone', 2.4, 0.25, 1.6, 0, 0); W.box('stone', 1.8, 0.25, 1.1, 0, 0.25);
    W.box('brass', 1.0, 0.1, 0.8, 0, 0.95, 0.2); W.box('wood', 1.1, 2.6, 0.18, 0, 0.5); // seat, high back
    for (const s of [-1, 1]) W.box('brass', 0.1, 0.5, 0.7, s * 0.48, 1.0, 0.25);
    W.blockOut(2.4, 1.6);
    const others = rest(room, [throne]);
    take(others, k.rnd, others.length).forEach((f, i) => (i % 3 === 1 && f.top > 6 ? k.window(f, 275, '#8a6cf0', 2.2, 3.8) : k.banner(f, 355, 4.2)));
    for (const c of take(room.free, k.rnd, 4)) { const p = k.centreOf(c); k.brazier(p.x, p.z); }
  },

  chapel(k, room) {
    const altar = farWall(room), A = k.wall(altar);
    A.box('stone', 2.0, 1.0, 0.9, 0, 0, 0.3);
    A.box('brass', 0.12, 1.6, 0.08, 0, 1.0, 0.5); A.box('brass', 0.8, 0.12, 0.08, 0, 2.0, 0.5); // the cross
    A.blockOut(2.0, 1.2);
    const ap = A.at(0, 0, 0.75); k.candles(ap.x, 1.0, ap.z, 6, 0.7, k.S.candles * 1.4);
    // pews on the free cells, facing the altar
    const n = A.n;
    for (const c of room.free) {
      const p = k.centreOf(c);
      for (const off of [-0.65, 0.65]) {
        const x = p.x + n.x * off, z = p.z + n.z * off, along = n.z !== 0;
        k.box('wood', along ? 2.3 : 0.45, 0.07, along ? 0.45 : 2.3, x, 0.45, z);
        k.box('wood', along ? 2.3 : 0.07, 0.6, along ? 0.07 : 2.3, x + n.x * 0.22, 0.75, z + n.z * 0.22);
        for (const s of [-1, 1]) k.box('wood', along ? 0.07 : 0.45, 0.48, along ? 0.45 : 0.07, x + (along ? s * 1.1 : 0), 0.24, z + (along ? 0 : s * 1.1));
        k.block(x - (along ? 1.15 : 0.3), z - (along ? 0.3 : 1.15), x + (along ? 1.15 : 0.3), z + (along ? 0.3 : 1.15));
      }
    }
    rest(room, [altar]).forEach((f, i) => (i % 2 === 0 && f.top >= 6 ? k.window(f, i % 4 === 0 ? 355 : 215, i % 4 === 0 ? '#ff5a4a' : '#5a7cff', 1.8, 4.0) : k.banner(f, 215, 3.4)));
  },

  library(k, room) {
    const fs = faces(room), win = fs.length > 4 ? take(fs, k.rnd, 1)[0] : null;
    for (const f of fs) if (f !== win) k.shelf(f, k.C - 0.25, room.height - 0.7);
    if (win) k.window(win, 175, '#7fd0c8', 1.6, 3.4);
    const ladderAt = take(fs.filter((f) => f !== win), k.rnd, 1)[0];
    if (ladderAt) { // two rails and rungs leaning on a shelf
      const L = k.wall(ladderAt), len = room.height - 1.2, lean = 0.28;
      for (const s of [-0.25, 0.25]) {
        const a = L.at(s + 0.6, len / 2, 0.55 + lean * 1.2);
        k.add('wood', new THREE.BoxGeometry(0.06, len, 0.06).rotateX(L.t.x ? lean : 0).rotateZ(L.t.z ? -lean * Math.sign(L.n.x || 1) : 0).translate(a.x, a.y, a.z));
      }
    }
    const desk = take(room.free, k.rnd, 1)[0];
    if (desk) {
      const p = k.centreOf(desk), x = p.x + k.between(-0.3, 0.3), z = p.z + k.between(-0.3, 0.3);
      table(k, x, z, 1.6, 0.9, k.rnd() < 0.5);
      k.cyl('brass', 0.08, 0.1, 0.1, x + 0.3, 0.91, z, 8);
      const lamp = k.flameSprite(new THREE.Vector3(x + 0.3, 1.1, z), 0.09, 0.16, 0.9, '#ffd28a');
      k.light(new THREE.Vector3(x + 0.3, 1.4, z), { power: k.S.lamp, color: '#ffc77a', flames: [lamp.flame], halos: [lamp.halo] });
      for (let i = 0; i < 3; i++) k.box('books', 0.3, 0.08, 0.22, x - 0.35 + k.between(-0.1, 0.1), 0.9 + i * 0.08, z + k.between(-0.1, 0.1));
    }
    for (const f of take(fs, k.rnd, 2)) k.cobweb(f, room.height);
  },

  banquet(k, room) {
    const C = k.C, alongX = room.w >= room.h;
    // the longest run of free cells along the long axis
    let best = null;
    const lines = alongX ? [...new Set(room.free.map((c) => c.z))] : [...new Set(room.free.map((c) => c.x))];
    for (const line of lines) {
      const cells = room.free.filter((c) => (alongX ? c.z : c.x) === line).map((c) => (alongX ? c.x : c.z)).sort((a, b) => a - b);
      let s = cells[0];
      for (let i = 1; i <= cells.length; i++) {
        if (i === cells.length || cells[i] !== cells[i - 1] + 1) {
          const run = { line, a: s, b: cells[i - 1] };
          if (!best || run.b - run.a > best.b - best.a) best = run;
          s = cells[i];
        }
      }
    }
    if (best) {
      const len = (best.b - best.a + 1) * C - 0.5, mid = ((best.a + best.b + 1) / 2) * C, side = (best.line + 0.5) * C;
      const [x, z] = alongX ? [mid, side] : [side, mid];
      table(k, x, z, len, 1.2, alongX);
      k.add('cloth0', new THREE.PlaneGeometry(alongX ? len : 0.6, alongX ? 0.6 : len).rotateX(-Math.PI / 2).translate(x, 0.87, z));
      for (const s of [-1, 1]) { const bx = alongX ? x : x + s * 0.95, bz = alongX ? z + s * 0.95 : z; k.box('wood', alongX ? len : 0.35, 0.08, alongX ? 0.35 : len, bx, 0.45, bz); }
      k.block(x - (alongX ? len / 2 : 1.15), z - (alongX ? 1.15 : len / 2), x + (alongX ? len / 2 : 1.15), z + (alongX ? 1.15 : len / 2));
      for (let u = -len / 2 + 0.8; u < len / 2 - 0.4; u += 1.6) { // candelabras, plates, goblets
        const px = alongX ? x + u : x, pz = alongX ? z : z + u;
        k.cyl('brass', 0.02, 0.06, 0.4, px, 1.06, pz, 6);
        k.candles(px, 1.26, pz, 3, 0.12);
        for (const s of [-1, 1]) { const qx = alongX ? px + 0.6 : px + s * 0.38, qz = alongX ? pz + s * 0.38 : pz + 0.6; k.cyl('brass', 0.13, 0.11, 0.02, qx, 0.875, qz, 10); k.cyl('brass', 0.035, 0.025, 0.14, qx + 0.15, 0.94, qz, 6); }
      }
    }
    // a chandelier over the middle
    const cx = (room.centre.x + 0.5) * C, cz = (room.centre.z + 0.5) * C, cy = room.height - 1.6;
    k.add('iron', new THREE.TorusGeometry(0.9, 0.04, 4, 20).rotateX(Math.PI / 2).translate(cx, cy, cz));
    k.chain(cx, cz, room.height - 0.05, cy + 0.1);
    const flames = [], halos = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, x = cx + Math.cos(a) * 0.9, z = cz + Math.sin(a) * 0.9;
      k.cyl('wax', 0.03, 0.035, 0.2, x, cy + 0.12, z, 6);
      const s = k.flameSprite(new THREE.Vector3(x, cy + 0.28, z), 0.07, 0.14, 0.5); flames.push(s.flame); halos.push(s.halo);
    }
    k.light(new THREE.Vector3(cx, cy - 0.2, cz), { power: k.S.chandelier, flames, halos });
    // the hearth on the far wall, banners elsewhere
    const hearth = farWall(room), W = k.wall(hearth);
    for (const s of [-1, 1]) W.box('stone', 0.5, 1.7, 0.7, s * 1.1, 0);
    W.box('stone', 2.8, 0.45, 0.8, 0, 1.7); W.box('stone', 2.2, room.height - 2.15, 0.5, 0, 2.15);
    k.panel('black', hearth, 1.7, 1.55, 0, 0, 0.03);
    for (const s of [-0.3, 0, 0.3]) { const p = W.at(s, 0.12, 0.35); k.add('wood', new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6).rotateZ(Math.PI / 2).rotateY(W.yaw).translate(p.x, p.y, p.z)); }
    const fp = W.at(0, 0.55, 0.35), fire = k.flameSprite(fp, 0.9, 1.1, 2.4);
    const fire2 = k.flameSprite(W.at(-0.35, 0.45, 0.4), 0.55, 0.8, 1.2);
    k.light(W.at(0, 0.9, 1.0), { power: k.S.hearth, color: '#ff7a30', flames: [fire.flame, fire2.flame], halos: [fire.halo, fire2.halo] });
    W.blockOut(2.8, 0.8);
    rest(room, [hearth]).forEach((f, i) => { if (i % 2 === 0) k.banner(f, 355, 3.0); });
  },

  prison(k, room) {
    const fs = faces(room);
    fs.forEach((f, i) => {
      const W = k.wall(f);
      if (i % 2 === 0) { // a cell behind bars, in a stone frame
        k.panel('black', f, 2.0, 2.5, 0, 0, 0.03);
        for (let b = 0; b < 9; b++) { const p = W.at(-0.9 + b * 0.225, 1.25, 0.2); k.cyl('iron', 0.022, 0.022, 2.5, p.x, p.y, p.z, 5); }
        for (const y of [0.25, 1.4, 2.4]) W.box('iron', 2.0, 0.05, 0.05, 0, y, 0.18);
        for (const s of [-1, 1]) W.box('stone', 0.4, 2.9, 0.4, s * 1.2, 0);
        W.box('stone', 2.8, 0.45, 0.42, 0, 2.6);
        W.blockOut(2.8, 0.45);
      } else { // shackles on the wall
        for (const s of [-0.5, 0.5]) {
          const a = W.at(s, 0, 0.08);
          k.chain(a.x, a.z, 2.4, 1.5);
          k.add('iron', new THREE.TorusGeometry(0.08, 0.02, 4, 10).translate(a.x, 1.42, a.z));
        }
        if (k.rnd() < 0.5) skull(k, W.at(0, 0, 0.3).x, 0, W.at(0, 0, 0.3).z);
      }
    });
    const cells = take(room.free, k.rnd, 3);
    if (cells[0]) { const p = k.centreOf(cells[0]); hangingCage(k, p.x, p.z, room.height); }
    if (cells[1]) { const p = k.centreOf(cells[1]); k.brazier(p.x, p.z); }
    for (const c of room.free) { const p = k.centreOf(c); k.add('straw', new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2).rotateY(k.rnd() * 6).translate(p.x, 0.015, p.z)); }
  },

  alchemy(k, room) {
    const fs = faces(room);
    take(fs, k.rnd, Math.min(3, fs.length)).forEach((f) => k.shelf(f, k.C - 0.35, Math.min(room.height - 0.8, 3.2), 'potions'));
    const cells = take(room.free, k.rnd, 3);
    if (cells[0]) { // the cauldron, a green brew, its glow
      const p = k.centreOf(cells[0]);
      const prof = [[0.15, 0], [0.45, 0.08], [0.6, 0.35], [0.58, 0.62], [0.5, 0.75]].map(([r, y]) => new THREE.Vector2(r, y));
      k.add('iron', new THREE.LatheGeometry(prof, 14).translate(p.x, 0.12, p.z));
      k.add('brew', new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2).translate(p.x, 0.8, p.z));
      const g = k.flameSprite(new THREE.Vector3(p.x, 1.0, p.z), 0.01, 0.01, 2.0, '#4cff6a');
      k.light(new THREE.Vector3(p.x, 1.3, p.z), { power: k.S.cauldron, color: '#4cff6a', flames: [g.flame], halos: [g.halo], haze: 1.5 });
      k.block(p.x - 0.6, p.z - 0.6, p.x + 0.6, p.z + 0.6);
    }
    if (cells[1]) {
      const p = k.centreOf(cells[1]);
      table(k, p.x, p.z, 1.7, 0.9, k.rnd() < 0.5);
      for (let i = 0; i < 5; i++) k.add(i % 2 ? 'potion' : 'amber', new THREE.SphereGeometry(k.between(0.06, 0.11), 8, 6).translate(p.x + k.between(-0.6, 0.6), 0.95, p.z + k.between(-0.3, 0.3)));
      k.candles(p.x, 0.86, p.z, 2, 0.4);
      skull(k, p.x - 0.5, 0.86, p.z);
    }
    if (cells[2]) { const p = k.centreOf(cells[2]); hangingCage(k, p.x, p.z, room.height); }
  },

  crypt(k, room) {
    for (const c of room.free) { // a sarcophagus, lid askew now and then
      const p = k.centreOf(c), along = k.rnd() < 0.5, [w, d] = along ? [2.1, 0.85] : [0.85, 2.1];
      k.box('stone', w, 0.8, d, p.x, 0.4, p.z);
      k.add('stone', new THREE.BoxGeometry(w + 0.12, 0.16, d + 0.12).rotateY(k.rnd() < 0.25 ? 0.25 : 0).translate(p.x, 0.88, p.z));
      k.block(p.x - w / 2, p.z - d / 2, p.x + w / 2, p.z + d / 2);
    }
    const fs = faces(room);
    take(fs, k.rnd, Math.ceil(fs.length / 2)).forEach((f) => {
      k.panel('skulls', f, k.C - 0.5, room.height - 0.6, 0, 0.1, 0.03);
      const W = k.wall(f);
      for (const s of [-1, 1]) W.box('stone', 0.25, room.height, 0.2, s * (k.C / 2 - 0.12), 0);
    });
    for (const f of take(fs, k.rnd, 3)) { const p = k.wall(f).at(k.between(-0.8, 0.8), 0, 0.45); k.candles(p.x, 0, p.z, 6, 0.3, k.S.candles * 1.5); }
    for (let i = 0; i < 4; i++) { const c = take(room.free.length ? room.free : [room.centre], k.rnd, 1)[0], p = k.centreOf(c); skull(k, p.x + k.between(-1.2, 1.2), 0, p.z + k.between(-1.2, 1.2)); }
    for (const f of take(fs, k.rnd, 2)) k.cobweb(f, room.height);
  },
};

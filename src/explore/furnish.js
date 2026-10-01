// explore/furnish.js — dressing the themed rooms (0.146). A Kit collects
// every room's pieces by material (merged into one mesh each at the end:
// a few draw calls for all the furniture of a floor), the light sources
// (candles, braziers, fireplaces, windows — they join the light pool), the
// sprites (flames, glows) and the boxes that block the way (collision,
// in cells: grid.js). The shared pieces live here — placing on a wall
// face, shelves, windows with their shafts of light, candles, braziers,
// banners; rooms.js says what each theme puts where.
// furnish(rooms, cfg, { rnd, M, corridors }) -> { group, lights, boxes }
// (corridors: the corridors.js dressing's inputs, or null)

import * as THREE from 'three';
import { mergeParts, worldUV } from './geom.js';
import { propMaterials } from './propMaterials.js';
import { THEMES } from './rooms.js';
import { dressCorridors } from './corridors.js';

export function furnish(rooms, cfg, { rnd, M, corridors = null }) {
  const kit = createKit(cfg, rnd, M);
  for (const room of rooms) {
    THEMES[room.theme]?.(kit, room);
    // the room's bounce light (0.146): a soft source high in the middle
    // that only the baked light field takes (no flame, no flicker, no haze)
    const fill = cfg.themes[room.theme]?.fill;
    if (fill) kit.light(new THREE.Vector3((room.x + room.w / 2) * kit.C, room.height * 0.7, (room.z + room.h / 2) * kit.C), { power: fill, still: true, bakedOnly: true, reach: Math.max(room.w, room.h) * kit.C * 0.9 });
  }
  if (corridors) dressCorridors(kit, corridors.grid, corridors);
  return kit.finish();
}

function createKit(cfg, rnd, M) {
  const C = cfg.cell, H = cfg.wallHeight, P = propMaterials(cfg), S = cfg.sources;
  const parts = {}, lights = [], boxes = [], sprites = [];
  const between = (a, b) => a + rnd() * (b - a);
  const add = (mat, g) => { (parts[mat] ||= []).push(g); return g; };
  const box = (mat, w, h, d, x, y, z) => add(mat, new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const cyl = (mat, r0, r1, h, x, y, z, seg = 8) => add(mat, new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z));
  // block a box of floor (metres) for walking
  const block = (x0, z0, x1, z1) => boxes.push({ x0: Math.min(x0, x1) / C, z0: Math.min(z0, z1) / C, x1: Math.max(x0, x1) / C, z1: Math.max(z0, z1) / C });
  const centreOf = (c) => ({ x: (c.x + 0.5) * C, z: (c.z + 0.5) * C });

  // A wall face of a room cell, as a frame: o = the wall's middle at floor
  // height, n = into the room, t = along the wall. at(along, up, out).
  const wall = (f) => {
    const n = { x: f.n[0], z: f.n[1] }, t = { x: Math.abs(f.n[1]), z: Math.abs(f.n[0]) };
    const o = { x: (f.x + 0.5 - n.x * 0.5) * C, z: (f.z + 0.5 - n.z * 0.5) * C };
    return {
      n, t, o,
      at: (a, u, out) => new THREE.Vector3(o.x + t.x * a + n.x * out, u, o.z + t.z * a + n.z * out),
      // a box against the wall: width along it, height, depth out from it
      box(mat, w, h, d, a, y0, out = 0) {
        const p = this.at(a, y0 + h / 2, out + d / 2);
        return box(mat, t.x ? w : d, h, t.x ? d : w, p.x, p.y, p.z);
      },
      blockOut(w, d, a = 0) { const p = this.at(a, 0, d / 2); block(p.x - (t.x ? w : d) / 2, p.z - (t.x ? d : w) / 2, p.x + (t.x ? w : d) / 2, p.z + (t.x ? d : w) / 2); },
      yaw: Math.atan2(n.x, n.z), // a plane turned by this faces into the room
    };
  };
  // a flat quad facing into the room off a wall (banners, windows, panels)
  const panel = (mat, f, w, h, a, y0, out) => {
    const W = wall(f), p = W.at(a, y0 + h / 2, out);
    return add(mat, new THREE.PlaneGeometry(w, h).rotateY(W.yaw).translate(p.x, p.y, p.z));
  };
  const flameSprite = (p, w, h, glow = 0.6, color) => {
    const flame = new THREE.Sprite(M.flame.clone()); flame.position.copy(p); flame.userData.base = [w, h];
    const halo = new THREE.Sprite(M.halo.clone()); halo.position.copy(p); halo.userData.base = [glow, glow];
    if (color) halo.material.color.set(color);
    sprites.push(flame, halo);
    return { flame, halo };
  };
  // a light source for the pool
  const light = (position, { color, power = 1, flames = [], halos = [], still = false, reach, haze = 1, bakedOnly = false } = {}) =>
    lights.push({ position, color: color ? new THREE.Color(color) : null, power, phase: rnd() * 100, flames, halos, still, reach, haze, bakedOnly });

  const kit = {
    cfg, C, H, S, rnd, between, box, cyl, add, block, wall, panel, centreOf, light, flameSprite, P,
    // a cluster of candles at p (on the floor or a surface at height y): one light
    candles(x, y, z, n = 4, spread = 0.25, power = S.candles) {
      const flames = [];
      for (let i = 0; i < n; i++) {
        const h = between(0.1, 0.35), cx = x + between(-spread, spread), cz = z + between(-spread, spread);
        cyl('wax', 0.03, 0.036, h, cx, y + h / 2, cz, 6);
        const flame = new THREE.Sprite(M.flame.clone());
        flame.position.set(cx, y + h + 0.05, cz); flame.userData.base = [0.07, 0.14];
        sprites.push(flame); flames.push(flame);
      }
      // one soft glow for the cluster (a sprite is a draw call each)
      const halo = new THREE.Sprite(M.halo.clone());
      halo.position.set(x, y + 0.3, z); halo.userData.base = [0.6 + spread * 2, 0.6 + spread * 2];
      sprites.push(halo);
      light(new THREE.Vector3(x, y + 0.6, z), { power, flames, halos: [halo] });
    },
    // an iron brazier on a tripod, a fire in its bowl
    brazier(x, z, power = S.brazier) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2, g = new THREE.CylinderGeometry(0.025, 0.025, 1.15, 5).rotateZ(0.18).rotateY(a);
        add('iron', g.translate(x + Math.cos(a) * 0.12, 0.55, z + Math.sin(a) * 0.12));
      }
      add('iron', new THREE.CylinderGeometry(0.34, 0.2, 0.22, 10, 1, true).translate(x, 1.12, z));
      add('ember', new THREE.CircleGeometry(0.3, 10).rotateX(-Math.PI / 2).translate(x, 1.18, z));
      const s = flameSprite(new THREE.Vector3(x, 1.5, z), 0.55, 0.85, 1.6);
      light(new THREE.Vector3(x, 1.8, z), { power, color: '#ff8a3a', flames: [s.flame], halos: [s.halo] });
      block(x - 0.35, z - 0.35, x + 0.35, z + 0.35);
    },
    // a banner hanging on a wall face
    banner(f, hue, len) {
      const top = Math.min(f.top - 0.3, len + 1.2);
      panel(`banner${hue}`, f, 1.05, len, 0, top - len, 0.06);
      kit.wall(f).box('iron', 1.25, 0.06, 0.06, 0, top, 0.06); // its rod
    },
    // a tall stained-glass window in a wall face, light pouring in
    window(f, hue, color, y0, h) {
      const W = wall(f);
      panel(`glass${hue}`, f, 1.2, h, 0, y0, 0.03);
      W.box('stone', 0.22, h + 0.2, 0.2, -0.71, y0 - 0.1); W.box('stone', 0.22, h + 0.2, 0.2, 0.71, y0 - 0.1);
      W.box('stone', 1.64, 0.25, 0.24, 0, y0 + h); W.box('stone', 1.64, 0.18, 0.3, 0, y0 - 0.18);
      // the shaft: a widening cone of light slanting down into the room
      const len = 7.5, tilt = 0.85, mid = W.at(0, y0 + h * 0.55 - Math.cos(tilt) * len / 2, Math.sin(tilt) * len / 2);
      const g = new THREE.CylinderGeometry(0.55, 1.5, len, 14, 1, true).rotateX(-tilt).rotateY(W.yaw);
      add(`shaft${hue}`, g.translate(mid.x, mid.y, mid.z));
      light(W.at(0, y0 + h * 0.5, 1.4), { color, power: S.window, still: true, reach: 10, haze: 1.6 });
    },
    // a wooden shelf case against a wall face, filled with books (or bottles)
    shelf(f, w, h, fill = 'books') {
      const W = wall(f), d = 0.45;
      W.box('wood', w, h, 0.06, 0, 0, 0.02); // back
      for (const s of [-1, 1]) W.box('wood', 0.07, h, d, s * (w / 2 - 0.035), 0, 0.02);
      W.box('wood', w, 0.08, d, 0, h - 0.08, 0.02);
      const rows = Math.max(2, Math.round(h / 0.55));
      for (let r = 0; r <= rows; r++) W.box('wood', w - 0.1, 0.05, d, 0, (r / rows) * (h - 0.1), 0.02);
      if (fill === 'books') W.box('books', w - 0.14, h - 0.16, 0.28, 0, 0.06, 0.1);
      else {
        for (let r = 0; r < rows; r++) for (let k = 0; k < 7; k++) {
          if (rnd() < 0.3) continue;
          const p = W.at(-w / 2 + 0.2 + k * (w - 0.4) / 6, (r / rows) * (h - 0.1) + 0.05, 0.25), bh = between(0.12, 0.3);
          cyl(rnd() < 0.6 ? 'potion' : 'amber', between(0.04, 0.08), between(0.05, 0.09), bh, p.x, p.y + bh / 2, p.z, 6);
        }
      }
      W.blockOut(w, d + 0.05);
    },
    // hanging chain from the ceiling: links down to y1
    chain(x, z, y0, y1) {
      for (let i = 0, y = y0; y > y1; i++, y -= 0.11) {
        const link = new THREE.TorusGeometry(0.05, 0.015, 4, 8);
        if (i % 2) link.rotateY(Math.PI / 2);
        add('iron', link.translate(x, y, z));
      }
    },
    cobweb(f, top) { // in the upper corner of a wall face
      const W = wall(f), p = W.at(-C / 2 + 0.4, top - 0.4, 0.4);
      add('cobweb', new THREE.PlaneGeometry(0.9, 0.9).rotateY(W.yaw + Math.PI / 4).rotateZ(0).translate(p.x, p.y, p.z));
    },
    finish() {
      const group = new THREE.Group();
      for (const [mat, list] of Object.entries(parts)) {
        let g = mergeParts(list);
        if (['stone', 'wood', 'books', 'skulls'].includes(mat)) g = worldUV(g, mat === 'books' ? 1.6 : C, mat === 'books' ? 1.6 : H);
        group.add(new THREE.Mesh(g, P.get(mat, M)));
      }
      for (const s of sprites) group.add(s);
      return { group, lights, boxes };
    },
  };
  return kit;
}

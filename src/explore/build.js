// explore/build.js — the 3D dungeon from the 2D map (0.139). Every open cell
// gets a floor and a ceiling; every edge between an open cell and a wall
// gets a wall face. Rooms stand taller than corridors (0.142: roomHeight;
// a header wall closes the step above each opening). Each surface kind is
// ONE merged mesh (a handful of draw calls for the whole level). Corners
// and wall bases are darkened in vertex colours (cheap ambient occlusion —
// the inky contact shadows of painted art). Straight corridors get wooden
// support frames; wall torches (with a soft halo) are spread through the
// level, decor.torchSpacing cells apart; decor.js adds the props. Past
// the boss, the stairs (0.144): the cell is a pit, its walls running on
// down, with steps descending away from the way in.
// buildDungeon(grid, cfg, { rooms, shrine, stairs, tier }) ->
//   { group, torches: [{ position, flames, halos, phase, power }], posts, dispose }
// (flames / halos: sprites, their resting scale in userData.base)
// The caller lights the torches (a small pool of lights follows the
// nearest ones) and collides with `posts` (pillars, in cells).

import * as THREE from 'three';
import { isOpen, corridorAxis, seeded } from './grid.js';
import { wallTexture, floorTexture, ceilingTexture, woodTexture, flameTexture, glowTexture } from './textures.js';
import { quadGeometry, mergeParts, boxesGeometry, worldUV } from './geom.js';
import { buildDecor } from './decor.js';

export function buildDungeon(grid, cfg, { rooms = [], shrine = null, stairs = null, tier = 0 } = {}) {
  const C = cfg.cell, H = cfg.wallHeight, rnd = seeded(cfg.decor.seed + tier);
  const floors = [], ceilings = [], walls = [], wood = [], torches = [];
  const open = (x, z) => isOpen(grid, x, z);
  const inRoom = (x, z) => rooms.some((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h);
  const top = (x, z) => (inRoom(x, z) ? cfg.roomHeight : H); // this cell's ceiling
  const isStairs = (x, z) => stairs && x === stairs.x && z === stairs.z;
  const bottom = (x, z) => (isStairs(x, z) ? -cfg.stairs.depth : 0); // this cell's floor
  // AO at a floor corner: darker the more of the three cells around it are walls
  const cornerAo = (x, z, sx, sz) => {
    const walled = [!open(x + sx, z), !open(x, z + sz), !open(x + sx, z + sz)].filter(Boolean).length;
    return [1, 0.72, 0.55, 0.45][walled];
  };
  // one wall face from y0 to y1 (v follows height: the painting repeats every H)
  const wallFace = (f, y0, y1, ua, ub, aoA, aoB) => walls.push({
    p: [[f.a[0], y0, f.a[1]], [f.b[0], y0, f.b[1]], [f.b[0], y1, f.b[1]], [f.a[0], y1, f.a[1]]], n: f.n,
    uv: [[ua, y0 / H], [ub, y0 / H], [ub, y1 / H], [ua, y1 / H]], ao: [aoA[0], aoB[0], aoB[1], aoA[1]],
  });
  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      if (!open(x, z)) continue;
      const x0 = x * C, x1 = (x + 1) * C, z0 = z * C, z1 = (z + 1) * C, T = top(x, z), B = bottom(x, z);
      const ao = [cornerAo(x, z, -1, -1), cornerAo(x, z, 1, -1), cornerAo(x, z, 1, 1), cornerAo(x, z, -1, 1)];
      floors.push({ p: [[x0, B, z0], [x0, B, z1], [x1, B, z1], [x1, B, z0]], n: [0, 1, 0],
        uv: [[0, 0], [0, 1], [1, 1], [1, 0]], ao: [ao[0], ao[3], ao[2], ao[1]] });
      ceilings.push({ p: [[x0, T, z0], [x1, T, z0], [x1, T, z1], [x0, T, z1]], n: [0, -1, 0],
        uv: [[0, 0], [1, 0], [1, 1], [0, 1]], ao: ao.map((a) => 0.6 + 0.4 * a) });
      // wall faces, each split into a lower and an upper band (dark at the
      // floor, a little dark at the ceiling, darker into inner corners).
      // a -> b runs so that (b - a) x up = the normal into the cell: the
      // corners go counter-clockwise seen from the corridor (front face).
      // side: the neighbour beyond a's end and beyond b's end (a wall
      // there = an inner corner); to: the neighbour across the face.
      const faces = [
        { to: [0, -1], a: [x0, z0], b: [x1, z0], n: [0, 0, 1], side: [[-1, 0], [1, 0]] },  // north
        { to: [1, 0], a: [x1, z0], b: [x1, z1], n: [-1, 0, 0], side: [[0, -1], [0, 1]] },  // east
        { to: [0, 1], a: [x1, z1], b: [x0, z1], n: [0, 0, -1], side: [[1, 0], [-1, 0]] },  // south
        { to: [-1, 0], a: [x0, z1], b: [x0, z0], n: [1, 0, 0], side: [[0, 1], [0, -1]] },  // west
      ];
      for (const f of faces) {
        f.wall = !open(x + f.to[0], z + f.to[1]);
        const u0 = rnd() < 0.5 ? 0 : 0.5, flip = rnd() < 0.5; // vary the repeat
        const ua = flip ? u0 + 1 : u0, ub = flip ? u0 : u0 + 1;
        if (!f.wall) { // open: a room's header wall above a lower opening, a pit's wall below a higher floor
          const nT = top(x + f.to[0], z + f.to[1]), nB = bottom(x + f.to[0], z + f.to[1]);
          if (nT < T) wallFace(f, nT, T, ua, ub, [0.55, 0.7], [0.55, 0.7]);
          if (nB > B) wallFace(f, B, nB, ua, ub, [0.3, 0.6], [0.3, 0.6]);
          continue;
        }
        const cA = !open(x + f.side[0][0], z + f.side[0][1]) ? 0.62 : 1;
        const cB = !open(x + f.side[1][0], z + f.side[1][1]) ? 0.62 : 1;
        const mid = H * 0.38;
        if (B < 0) wallFace(f, B, 0, ua, ub, [0.3 * cA, 0.42 * cA], [0.3 * cB, 0.42 * cB]);
        wallFace(f, 0, mid, ua, ub, [0.42 * cA, 0.95 * cA], [0.42 * cB, 0.95 * cB]);
        wallFace(f, mid, T, ua, ub, [0.95 * cA, 0.7 * cA], [0.95 * cB, 0.7 * cB]);
      }
      // straight corridors: a wooden support frame every few cells
      const axis = corridorAxis(grid, x, z);
      const k = axis === 'ew' ? x : z;
      const beam = axis && !inRoom(x, z) && k % cfg.decor.beamEvery === 0;
      if (beam) {
        const cxm = x0 + C / 2, czm = z0 + C / 2, t = 0.28, inset = t / 2 + 0.02;
        if (axis === 'ew') { // the beam runs north-south, posts on both walls
          wood.push({ size: [t, t, C], at: [cxm, H - t / 2, czm] });
          wood.push({ size: [t, H - t, t], at: [cxm, (H - t) / 2, z0 + inset] }, { size: [t, H - t, t], at: [cxm, (H - t) / 2, z1 - inset] });
        } else {
          wood.push({ size: [C, t, t], at: [cxm, H - t / 2, czm] });
          wood.push({ size: [t, H - t, t], at: [x0 + inset, (H - t) / 2, czm] }, { size: [t, H - t, t], at: [x1 - inset, (H - t) / 2, czm] });
        }
      }
      // a torch on one of the cell's walls, if none burns within torchSpacing cells
      const sides = faces.filter((f) => f.wall);
      if (!beam && !isStairs(x, z) && sides.length && !torches.some((t) => Math.hypot(t.cx - x, t.cz - z) < cfg.decor.torchSpacing)) {
        const f = sides[Math.floor(rnd() * sides.length)];
        const nx = f.n[0], nz = f.n[2], mx = (f.a[0] + f.b[0]) / 2, mz = (f.a[1] + f.b[1]) / 2;
        torches.push({ cx: x, cz: z, x: mx + nx * 0.12, z: mz + nz * 0.12, nx, nz, y: cfg.light.torch.height });
      }
    }
  }
  const M = materials(cfg, tier);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(quadGeometry(floors), M.floor));
  group.add(new THREE.Mesh(quadGeometry(ceilings), M.ceil));
  group.add(new THREE.Mesh(quadGeometry(walls), M.wall));
  if (wood.length) group.add(new THREE.Mesh(boxesGeometry(wood), M.wood));
  // torches: an iron bracket and a wooden handle (merged, all torches in
  // two draw calls), a flame sprite and a soft halo around it
  const iron = [], handles = [];
  const out = torches.map((t) => {
    const bracket = new THREE.BoxGeometry(0.08, 0.08, 0.22);
    bracket.lookAt(new THREE.Vector3(t.nx, 0, t.nz)); bracket.translate(t.x - t.nx * 0.02, t.y - 0.18, t.z - t.nz * 0.02);
    const stick = new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6).rotateX(t.nz * 0.35).rotateZ(-t.nx * 0.35);
    stick.translate(t.x + t.nx * 0.12, t.y - 0.08, t.z + t.nz * 0.12);
    iron.push(bracket); handles.push(stick);
    const flame = new THREE.Sprite(M.flame.clone()); // (own opacity: each flickers)
    flame.position.set(t.x + t.nx * 0.2, t.y + 0.28, t.z + t.nz * 0.2); flame.userData.base = [0.32, 0.6];
    const halo = new THREE.Sprite(M.halo.clone());
    halo.position.set(t.x + t.nx * 0.3, t.y + 0.3, t.z + t.nz * 0.3); halo.userData.base = [cfg.decor.haloSize, cfg.decor.haloSize];
    group.add(flame, halo);
    return { position: new THREE.Vector3(t.x + t.nx * 0.25, t.y + 0.25, t.z + t.nz * 0.25), flames: [flame], halos: [halo], phase: rnd() * 100, power: 1 };
  });
  if (iron.length) group.add(new THREE.Mesh(mergeParts(iron), M.iron), new THREE.Mesh(mergeParts(handles), M.handle));
  // the stairs: steps from the way in down to the pit's floor
  const steps = [];
  if (stairs) {
    const [dx, dz] = stairs.down, n = cfg.stairs.steps, run = C / n, rise = cfg.stairs.depth / (n + 1);
    for (let i = 0; i < n; i++) {
      const h = cfg.stairs.depth - (i + 1) * rise, along = (i + 0.5) * run - C / 2; // from the near edge
      const cx = (stairs.x + 0.5) * C + dx * along, cz = (stairs.z + 0.5) * C + dz * along;
      steps.push(new THREE.BoxGeometry(dx ? run : C, h, dz ? run : C).translate(cx, -cfg.stairs.depth + h / 2, cz));
    }
  }
  if (steps.length) group.add(new THREE.Mesh(worldUV(mergeParts(steps), C, H), M.stone));
  const decor = buildDecor(grid, cfg, { rooms, shrine, top, inRoom, isStairs, rnd, M });
  group.add(decor.group);
  out.push(...decor.lights);
  // free the GPU side when the floor is replaced (textures and materials are shared)
  const dispose = () => group.traverse((o) => {
    if (o.isMesh) o.geometry.dispose();
    if (o.isSprite) o.material.dispose();
  });
  return { group, torches: out, posts: decor.posts, dispose };
}

// The painted textures take a moment to make, so every floor of a depth
// tier shares one set (explore.json tiers: one palette per tier).
const shared = new Map();
function materials(cfg, tier) {
  if (shared.has(tier)) return shared.get(tier);
  const pal = cfg.tiers[tier].palette;
  const tex = { wall: wallTexture(11, pal), floor: floorTexture(23, pal), ceil: ceilingTexture(37, pal), wood: woodTexture(41) };
  const mat = (t, rough = 0.95, ao = true) => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: rough, metalness: 0, vertexColors: ao });
  const additive = (map, color) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const M = {
    floor: mat(tex.floor), ceil: mat(tex.ceil), wall: mat(tex.wall),
    stone: mat(tex.wall, 0.95, false), // props of wall stone (no AO colours)
    wood: mat(tex.wood, 0.85, false),
    iron: new THREE.MeshStandardMaterial({ color: 0x1d1714, roughness: 0.55, metalness: 0.5 }),
    handle: new THREE.MeshStandardMaterial({ map: tex.wood.map, roughness: 0.9 }),
    flame: additive(flameTexture(), 0xffffff),
    halo: additive(glowTexture(), cfg.light.torch.color),
    water: new THREE.MeshStandardMaterial({ color: cfg.tiers[tier].palette.water, roughness: 0.1, metalness: 0.2 }),
    wax: new THREE.MeshStandardMaterial({ color: 0xcdbb8c, roughness: 0.7, emissive: 0x3a2a10 }),
  };
  M.halo.opacity = cfg.decor.haloOpacity;
  shared.set(tier, M);
  return M;
}

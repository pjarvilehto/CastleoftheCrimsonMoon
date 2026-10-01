// explore/build.js — the 3D dungeon from the 2D map (0.139). Every open cell
// gets a floor and a ceiling; every edge between an open cell and a wall
// gets a wall face. Each surface kind is ONE merged mesh (a handful of draw
// calls for the whole level). Corners and wall bases are darkened in vertex
// colours (cheap ambient occlusion — the inky contact shadows of painted
// art). Straight corridors get wooden support frames; wall torches are
// spread through the level, decor.torchSpacing cells apart.
// Returns { group, torches: [{ position, flame }] } — the caller lights
// the torches (a small pool of lights follows the nearest ones).

import * as THREE from 'three';
import { isOpen, corridorAxis, seeded } from './grid.js';
import { wallTexture, floorTexture, ceilingTexture, woodTexture, flameTexture } from './textures.js';

// A quad list -> one BufferGeometry. Each quad: 4 corners (in order around
// the face), their uv, their AO shade (0..1), and the face normal.
function quadGeometry(quads) {
  const pos = [], nor = [], uv = [], col = [];
  for (const q of quads) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...q.p[i]); nor.push(...q.n); uv.push(...q.uv[i]);
      const s = q.ao[i]; col.push(s, s, s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g; // no tangents: three derives them per pixel for the normal maps
}

// Boxes (wood) merged into one geometry.
function boxesGeometry(boxes) {
  const parts = boxes.map(({ size, at }) => new THREE.BoxGeometry(...size).translate(...at).toNonIndexed());
  const total = parts.reduce((n, p) => n + p.attributes.position.count, 0);
  const g = new THREE.BufferGeometry();
  for (const [name, k] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(total * k);
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
    g.setAttribute(name, new THREE.BufferAttribute(arr, k));
  }
  return g;
}

export function buildDungeon(grid, cfg) {
  const C = cfg.cell, H = cfg.wallHeight, rnd = seeded(cfg.decor.seed);
  const floors = [], ceilings = [], walls = [], wood = [], torches = [];
  const open = (x, z) => isOpen(grid, x, z);
  // AO at a floor corner: darker the more of the three cells around it are walls
  const cornerAo = (x, z, sx, sz) => {
    const walled = [!open(x + sx, z), !open(x, z + sz), !open(x + sx, z + sz)].filter(Boolean).length;
    return [1, 0.72, 0.55, 0.45][walled];
  };
  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      if (!open(x, z)) continue;
      const x0 = x * C, x1 = (x + 1) * C, z0 = z * C, z1 = (z + 1) * C;
      const ao = [cornerAo(x, z, -1, -1), cornerAo(x, z, 1, -1), cornerAo(x, z, 1, 1), cornerAo(x, z, -1, 1)];
      floors.push({ p: [[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]], n: [0, 1, 0],
        uv: [[0, 0], [0, 1], [1, 1], [1, 0]], ao: [ao[0], ao[3], ao[2], ao[1]] });
      ceilings.push({ p: [[x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1]], n: [0, -1, 0],
        uv: [[0, 0], [1, 0], [1, 1], [0, 1]], ao: ao.map((a) => 0.6 + 0.4 * a) });
      // wall faces, each split into a lower and an upper band (dark at the
      // floor, a little dark at the ceiling, darker into inner corners).
      // a -> b runs so that (b - a) x up = the normal into the cell: the
      // corners go counter-clockwise seen from the corridor (front face).
      // side: the neighbour beyond a's end and beyond b's end (a wall
      // there = an inner corner).
      const faces = [
        { wall: !open(x, z - 1), a: [x0, z0], b: [x1, z0], n: [0, 0, 1], side: [[-1, 0], [1, 0]] },  // north
        { wall: !open(x + 1, z), a: [x1, z0], b: [x1, z1], n: [-1, 0, 0], side: [[0, -1], [0, 1]] }, // east
        { wall: !open(x, z + 1), a: [x1, z1], b: [x0, z1], n: [0, 0, -1], side: [[1, 0], [-1, 0]] }, // south
        { wall: !open(x - 1, z), a: [x0, z1], b: [x0, z0], n: [1, 0, 0], side: [[0, 1], [0, -1]] },  // west
      ];
      for (const f of faces) {
        if (!f.wall) continue;
        const cornerA = !open(x + f.side[0][0], z + f.side[0][1]) ? 0.62 : 1;
        const cornerB = !open(x + f.side[1][0], z + f.side[1][1]) ? 0.62 : 1;
        const u0 = rnd() < 0.5 ? 0 : 0.5, flip = rnd() < 0.5; // vary the repeat
        const ua = flip ? u0 + 1 : u0, ub = flip ? u0 : u0 + 1;
        // v runs up the wall: canvas textures are flipped, so v = 0 is the
        // painting's bottom edge (where the moss is)
        const mid = H * 0.38, vMid = mid / H;
        walls.push({ p: [[f.a[0], 0, f.a[1]], [f.b[0], 0, f.b[1]], [f.b[0], mid, f.b[1]], [f.a[0], mid, f.a[1]]], n: f.n,
          uv: [[ua, 0], [ub, 0], [ub, vMid], [ua, vMid]], ao: [0.42 * cornerA, 0.42 * cornerB, 0.95 * cornerB, 0.95 * cornerA] });
        walls.push({ p: [[f.a[0], mid, f.a[1]], [f.b[0], mid, f.b[1]], [f.b[0], H, f.b[1]], [f.a[0], H, f.a[1]]], n: f.n,
          uv: [[ua, vMid], [ub, vMid], [ub, 1], [ua, 1]], ao: [0.95 * cornerA, 0.95 * cornerB, 0.7 * cornerB, 0.7 * cornerA] });
      }
      // straight corridors: a wooden support frame every few cells
      const axis = corridorAxis(grid, x, z);
      const k = axis === 'ew' ? x : z;
      const beam = axis && k % cfg.decor.beamEvery === 0;
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
      if (!beam && sides.length && !torches.some((t) => Math.hypot(t.cx - x, t.cz - z) < cfg.decor.torchSpacing)) {
        const f = sides[Math.floor(rnd() * sides.length)];
        const nx = f.n[0], nz = f.n[2], mx = (f.a[0] + f.b[0]) / 2, mz = (f.a[1] + f.b[1]) / 2;
        torches.push({ cx: x, cz: z, x: mx + nx * 0.12, z: mz + nz * 0.12, nx, nz, y: cfg.light.torch.height });
      }
    }
  }
  const tex = { wall: wallTexture(11), floor: floorTexture(23), ceil: ceilingTexture(37), wood: woodTexture(41) };
  const mat = (t, rough = 0.95) => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: rough, metalness: 0, vertexColors: true });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(quadGeometry(floors), mat(tex.floor)));
  group.add(new THREE.Mesh(quadGeometry(ceilings), mat(tex.ceil)));
  group.add(new THREE.Mesh(quadGeometry(walls), mat(tex.wall)));
  if (wood.length) group.add(new THREE.Mesh(boxesGeometry(wood), new THREE.MeshStandardMaterial({ map: tex.wood.map, normalMap: tex.wood.normalMap, roughness: 0.85 })));
  // torches: an iron bracket, a wooden handle, a flame sprite
  const iron = new THREE.MeshStandardMaterial({ color: 0x1d1714, roughness: 0.6, metalness: 0.4 });
  const handle = new THREE.MeshStandardMaterial({ map: tex.wood.map, roughness: 0.9 });
  const flameMat = new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const out = torches.map((t) => {
    const g = new THREE.Group();
    g.position.set(t.x, t.y, t.z);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.22), iron);
    bracket.position.set(-t.nx * 0.02, -0.18, -t.nz * 0.02); bracket.lookAt(t.x + t.nx, t.y - 0.18, t.z + t.nz);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6), handle);
    stick.position.set(t.nx * 0.12, -0.08, t.nz * 0.12); stick.rotation.set(t.nz * 0.35, 0, -t.nx * 0.35);
    const flame = new THREE.Sprite(flameMat.clone());
    flame.position.set(t.nx * 0.2, 0.28, t.nz * 0.2); flame.scale.set(0.32, 0.6, 1);
    g.add(bracket, stick, flame);
    group.add(g);
    return { position: new THREE.Vector3(t.x + t.nx * 0.25, t.y + 0.25, t.z + t.nz * 0.25), flame, phase: rnd() * 100 };
  });
  return { group, torches: out };
}

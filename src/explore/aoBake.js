// explore/aoBake.js — ambient occlusion baked into the props (0.147). The
// walls and floors already carry corner AO in their vertex colours; the
// merged props (furniture, pillars, rubble, chains, doors...) get theirs
// here, per vertex: darker the closer to the floor (the contact shadow
// under a pew, at a pillar's foot) and the closer to a wall (a shelf's
// back, a banner's top). Each mesh gets a colour attribute and an AO copy
// of its material (vertexColors on; the originals stay as they are, shared
// with meshes that have no colours). SSAO adds the fine contact shadows on
// top at run time.
// bakeAO(group, grid, cfg) — every mesh under group that has no colours yet

import * as THREE from 'three';
import { isOpen } from './grid.js';

const variants = new WeakMap();
function aoVariant(m) {
  if (!variants.has(m)) {
    const v = m.clone();
    v.vertexColors = true;
    delete v.userData.field; // (the clone needs its own light-field patch)
    variants.set(m, v);
  }
  return variants.get(m);
}

export function bakeAO(group, grid, cfg) {
  const A = cfg.ao, C = cfg.cell;
  // metres from (x, z) to the nearest wall face of its cell's neighbours
  const wallDist = (x, z) => {
    const cx = Math.floor(x / C), cz = Math.floor(z / C), fx = x / C - cx, fz = z / C - cz;
    let d = Infinity;
    if (!isOpen(grid, cx - 1, cz)) d = Math.min(d, fx * C);
    if (!isOpen(grid, cx + 1, cz)) d = Math.min(d, (1 - fx) * C);
    if (!isOpen(grid, cx, cz - 1)) d = Math.min(d, fz * C);
    if (!isOpen(grid, cx, cz + 1)) d = Math.min(d, (1 - fz) * C);
    return d;
  };
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || !o.material?.isMeshStandardMaterial || o.geometry.attributes.color) return;
    const pos = o.geometry.attributes.position, col = new Float32Array(pos.count * 3);
    o.updateWorldMatrix(true, false);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const floor = A.floor + (1 - A.floor) * smooth(0, A.floorReach, v.y);
      const wall = A.wall + (1 - A.wall) * smooth(0, A.wallReach, wallDist(v.x, v.z));
      const s = floor * wall;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
    }
    o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.material = aoVariant(o.material);
  });
}

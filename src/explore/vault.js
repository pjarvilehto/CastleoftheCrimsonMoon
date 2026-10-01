// explore/vault.js — a pointed stone vault over a tall room (0.146: the
// chapel, the throne hall). The room's walls stop at its height T; the
// vault rises `rise` metres over the short span, its curve the gothic
// point of the castle's chapel windows, run the length of the room, closed
// at both ends by gable walls, with a stone rib at every cell.
// vault(room, C, H, rise) -> { shell, gables, ribs: [BufferGeometry] }
// (shell and gables carry the AO colour attribute the surface materials use)

import * as THREE from 'three';

const SEG = 12;
const shade = (g, s) => g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(s), 3));

export function vault(room, C, H, rise) {
  const alongX = room.w >= room.h, L = (alongX ? room.w : room.h) * C, S = (alongX ? room.h : room.w) * C, T = room.height;
  const x0 = room.x * C, z0 = room.z * C;
  const world = (along, across, y) => (alongX ? [x0 + along, y, z0 + across] : [x0 + across, y, z0 + along]);
  const prof = Array.from({ length: SEG + 1 }, (_, i) => { const u = i / SEG; return { a: u * S, y: T + rise * (1 - Math.pow(Math.abs(2 * u - 1), 1.6)) }; });
  // the shell: strips of quads between profile points, the length of the room
  const pos = [], uv = [];
  let arc = 0;
  for (let i = 0; i < SEG; i++) {
    const p = prof[i], q = prof[i + 1], len = Math.hypot(q.a - p.a, q.y - p.y);
    const A = world(0, p.a, p.y), B = world(0, q.a, q.y), Cc = world(L, q.a, q.y), D = world(L, p.a, p.y);
    const v0 = arc / H, v1 = (arc + len) / H;
    pos.push(...A, ...B, ...Cc, ...A, ...Cc, ...D);
    uv.push(0, v0, 0, v1, L / C, v1, 0, v0, L / C, v1, L / C, v0);
    arc += len;
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shell.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  facing(shell); // (fix the winding so it faces down, into the room)
  shade(shell, 0.75);
  // the gables: under the curve at each end, a strip of quads down to T
  const gpos = [], guv = [];
  for (const end of [0, L]) {
    for (let i = 0; i < SEG; i++) {
      const p = prof[i], q = prof[i + 1];
      const P = world(end, p.a, p.y), Q = world(end, q.a, q.y), Pb = world(end, p.a, T), Qb = world(end, q.a, T);
      gpos.push(...Pb, ...Qb, ...Q, ...Pb, ...Q, ...P);
      guv.push(p.a / C, T / H, q.a / C, T / H, q.a / C, q.y / H, p.a / C, T / H, q.a / C, q.y / H, p.a / C, p.y / H);
    }
  }
  const gables = new THREE.BufferGeometry();
  gables.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
  gables.setAttribute('uv', new THREE.Float32BufferAttribute(guv, 2));
  gables.computeVertexNormals();
  // gables face inward: flip any triangle whose normal points out of the room
  const mid = new THREE.Vector3(...world(L / 2, S / 2, T));
  flipAway(gables, mid);
  shade(gables, 0.6);
  // ribs: stone bands following the curve, at every cell
  const ribs = [];
  for (let k = 0; k <= L / C; k++) {
    for (let i = 0; i < SEG; i++) {
      const p = prof[i], q = prof[i + 1], len = Math.hypot(q.a - p.a, q.y - p.y), ang = Math.atan2(q.y - p.y, q.a - p.a);
      const g = new THREE.BoxGeometry(len + 0.04, 0.22, 0.32).rotateZ(ang);
      const c = world(Math.min(Math.max(k * C, 0.16), L - 0.16), (p.a + q.a) / 2, (p.y + q.y) / 2 - 0.08);
      if (!alongX) g.rotateY(Math.PI / 2);
      ribs.push(g.translate(...c));
    }
  }
  return { shell, gables, ribs };
}

// recompute normals; triangles whose normal points up get their winding flipped
function facing(g) {
  const p = g.attributes.position.array, u = g.attributes.uv.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i); b.fromArray(p, i + 3); c.fromArray(p, i + 6);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.y > 0) swap(p, u, i / 3);
  }
  g.computeVertexNormals();
}
function flipAway(g, mid) {
  const p = g.attributes.position.array, u = g.attributes.uv.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i); b.fromArray(p, i + 3); c.fromArray(p, i + 6);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(new THREE.Vector3().subVectors(mid, a)) < 0) swap(p, u, i / 3);
  }
  g.computeVertexNormals();
}
// swap a triangle's 2nd and 3rd vertex (positions and uvs)
function swap(p, u, v) {
  for (let k = 0; k < 3; k++) [p[(v + 1) * 3 + k], p[(v + 2) * 3 + k]] = [p[(v + 2) * 3 + k], p[(v + 1) * 3 + k]];
  for (let k = 0; k < 2; k++) [u[(v + 1) * 2 + k], u[(v + 2) * 2 + k]] = [u[(v + 2) * 2 + k], u[(v + 1) * 2 + k]];
}

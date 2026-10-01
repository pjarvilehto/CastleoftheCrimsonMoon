// explore/geom.js — geometry helpers for the dungeon (0.142, out of
// build.js): a quad list as one mesh's geometry, and many small parts
// merged into one (a floor's worth of props = one draw call per material).

import * as THREE from 'three';

// Quads -> one BufferGeometry. Each quad: 4 corners (in order around the
// face), their uv, their AO shade (0..1, as vertex colour), the face normal.
export function quadGeometry(quads) {
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

// Geometries (already placed) merged into one: position, normal, uv.
export function mergeParts(parts) {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const total = flat.reduce((n, p) => n + p.attributes.position.count, 0);
  const g = new THREE.BufferGeometry();
  for (const [name, k] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(total * k);
    let o = 0;
    for (const p of flat) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
    g.setAttribute(name, new THREE.BufferAttribute(arr, k));
  }
  for (const p of [...parts, ...flat]) p.dispose();
  return g;
}

// Boxes { size: [w, h, d], at: [x, y, z] } merged into one geometry.
export const boxesGeometry = (boxes) => mergeParts(boxes.map(({ size, at }) => new THREE.BoxGeometry(...size).translate(...at)));

// UVs by world size, picked per face from its normal (a box map): stone
// props keep the walls' stone scale instead of one painting per face.
// uScale: metres per texture repeat across, vScale: up.
export function worldUV(g, uScale, vScale) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / uScale, p.getZ(i) / uScale);
    else if (ax >= az) uv.setXY(i, p.getZ(i) / uScale, p.getY(i) / vScale);
    else uv.setXY(i, p.getX(i) / uScale, p.getY(i) / vScale);
  }
  uv.needsUpdate = true;
  return g;
}

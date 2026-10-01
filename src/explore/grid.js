// explore/grid.js — the dungeon's 2D layout (the dungeon prototype, 0.139).
// Pure: no DOM, no three.js — the smoke suite tests it in Node. The map is
// rows of text: '#' wall, '.' floor, 'S' the start (floor). Cell (x, z) is
// column x of row z; in the 3D world a cell spans [x, x+1) x [z, z+1)
// times the cell size, +x east, +z south.

export function parseMap(rows) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const open = new Uint8Array(w * h);
  let start = null;
  rows.forEach((row, z) => {
    for (let x = 0; x < w; x++) {
      const c = row[x] ?? '#';
      if (c !== '#') open[z * w + x] = 1;
      if (c === 'S') start = { x, z };
    }
  });
  return { w, h, open, start };
}

export const isOpen = (g, x, z) => x >= 0 && z >= 0 && x < g.w && z < g.h && g.open[z * g.w + x] === 1;

export const DIRS = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

// Is the cell a straight corridor piece? 'ns' / 'ew', or null.
export function corridorAxis(g, x, z) {
  const n = isOpen(g, x, z - 1), s = isOpen(g, x, z + 1), e = isOpen(g, x + 1, z), w = isOpen(g, x - 1, z);
  if (n && s && !e && !w) return 'ns';
  if (e && w && !n && !s) return 'ew';
  return null;
}

// A circle (radius r, in cells) at (px, pz) pushed out of every wall cell it
// overlaps — closest point on the cell's square, out along the gap — and
// out of every post (g.posts: pillars and the like, circles {x, z, r} in
// cells, 0.142). Two passes settle corners. Returns the corrected position.
export function collide(g, px, pz, r) {
  let x = px, z = pz;
  for (let pass = 0; pass < 2; pass++) {
    const cx = Math.floor(x), cz = Math.floor(z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gz = cz + dz;
        if (isOpen(g, gx, gz)) continue;
        const nx = Math.max(gx, Math.min(x, gx + 1)), nz = Math.max(gz, Math.min(z, gz + 1));
        const ox = x - nx, oz = z - nz, d2 = ox * ox + oz * oz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2), push = (r - d) / d;
          x += ox * push; z += oz * push;
        } else { // centre inside the wall: out the nearest side
          const out = [[gx - r - x, 0], [gx + 1 + r - x, 0], [0, gz - r - z], [0, gz + 1 + r - z]]
            .sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]))[0];
          x += out[0]; z += out[1];
        }
      }
    }
    for (const p of g.posts ?? []) {
      const ox = x - p.x, oz = z - p.z, d = Math.hypot(ox, oz), min = r + p.r;
      if (d >= min) continue;
      if (d > 1e-9) { x += (ox / d) * (min - d); z += (oz / d) * (min - d); } else x += min;
    }
  }
  return { x, z };
}

// Seeded random (Park-Miller): the same dungeon from the same seed.
export function seeded(seed) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

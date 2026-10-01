// explore/minimap.js — the Dungeon Lab's corner map (0.140): only the cells
// the knight has seen (within `reveal` cells of where he walked, through
// open floor), the rooms' marks once seen — red encounters, gold shrine,
// crimson boss — lit wall torches, and the knight as an arrow.

import { isOpen } from './grid.js';

const MARK = { E: '#b3362c', H: '#c9a227', B: '#e0303a' };

export function createMinimap(canvas, reveal) {
  const ctx = canvas.getContext('2d');
  let floor = null, grid = null, seen = null;

  function setFloor(f, g) { floor = f; grid = g; seen = new Uint8Array(g.w * g.h); }

  // mark what the knight can see from cell (cx, cz): a flood through open
  // floor, `reveal` steps deep, plus the walls that bound it
  function look(cx, cz) {
    const todo = [[cx, cz, 0]], done = new Set();
    while (todo.length) {
      const [x, z, d] = todo.pop();
      const k = z * grid.w + x;
      if (done.has(k)) continue;
      done.add(k); seen[k] = 1;
      if (!isOpen(grid, x, z) || d >= reveal) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < grid.w && nz < grid.h) todo.push([nx, nz, d + 1]);
      }
    }
  }

  function draw(player, torches, cell, cleared) {
    const S = Math.floor(canvas.width / Math.max(grid.w, grid.h)), ox = (canvas.width - S * grid.w) / 2, oz = (canvas.height - S * grid.h) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let z = 0; z < grid.h; z++) for (let x = 0; x < grid.w; x++) {
      if (!seen[z * grid.w + x] || !isOpen(grid, x, z)) continue;
      ctx.fillStyle = 'rgba(216,201,163,0.3)'; ctx.fillRect(ox + x * S, oz + z * S, S, S);
    }
    const marks = [...floor.encounters.map((e) => ({ ...e, c: 'E' })), { ...floor.shrine, c: 'H' }, { ...floor.boss, c: 'B' }];
    for (const m of marks) {
      if (!seen[m.z * grid.w + m.x] || cleared?.has(`${m.x},${m.z}`)) continue;
      ctx.fillStyle = MARK[m.c];
      ctx.beginPath(); ctx.arc(ox + (m.x + 0.5) * S, oz + (m.z + 0.5) * S, S * (m.c === 'B' ? 0.75 : 0.5), 0, Math.PI * 2); ctx.fill();
    }
    for (const t of torches) {
      const tx = Math.floor(t.position.x / cell), tz = Math.floor(t.position.z / cell);
      if (!seen[tz * grid.w + tx]) continue;
      ctx.fillStyle = '#ff9a4a'; ctx.fillRect(ox + t.position.x / cell * S - 1, oz + t.position.z / cell * S - 1, 2, 2);
    }
    const s = player.state, px = ox + s.x / cell * S, pz = oz + s.z / cell * S, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), A = Math.max(S, 5);
    ctx.fillStyle = '#f2e3b5';
    ctx.beginPath(); ctx.moveTo(px + fx * A, pz + fz * A);
    ctx.lineTo(px - fx * A * 0.6 + fz * A * 0.55, pz - fz * A * 0.6 - fx * A * 0.55);
    ctx.lineTo(px - fx * A * 0.6 - fz * A * 0.55, pz - fz * A * 0.6 + fx * A * 0.55); ctx.fill();
  }

  return { setFloor, look, draw };
}

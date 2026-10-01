// explore/mist.js — ground mist (0.142): soft grey puffs hanging low over
// the floor, drifting, a few per open cell's worth of floor. One point
// cloud (one draw call for the whole floor) in the fog's own colour at a
// low opacity — no soft-particle depth test, so the puffs stay small
// enough not to show their edges where they meet a wall.
// createMist(grid, cfg, color, rnd) -> { group, update(t), dispose() }

import * as THREE from 'three';
import { isOpen } from './grid.js';
import { glowTexture } from './textures.js';

let tex = null;

export function createMist(grid, cfg, color, rnd) {
  const m = cfg.mist, C = cfg.cell;
  tex ??= glowTexture();
  const home = [], phase = [];
  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      if (!isOpen(grid, x, z) || rnd() > m.perCell) continue;
      home.push((x + 0.2 + rnd() * 0.6) * C, m.height * (0.6 + rnd() * 0.8), (z + 0.2 + rnd() * 0.6) * C);
      phase.push(rnd() * 100);
    }
  }
  const pos = new Float32Array(home);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: tex, color, size: m.size, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: m.opacity });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; // (the cloud spans the floor; its bounds would go stale as it drifts)
  const group = new THREE.Group();
  group.add(points);
  return {
    group,
    update(t) {
      for (let i = 0; i < phase.length; i++) {
        const p = phase[i];
        pos[i * 3] = home[i * 3] + Math.sin(t * m.drift + p) * 0.4;
        pos[i * 3 + 1] = home[i * 3 + 1] + Math.sin(t * 0.5 + p * 2) * 0.08;
        pos[i * 3 + 2] = home[i * 3 + 2] + Math.cos(t * m.drift * 0.8 + p) * 0.4;
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// explore/lab.js — the Dungeon Lab (0.139): the 3D dungeon prototype, run on
// its own page (dungeon-lab/, opened from the ?debug column) while the look
// and feel are worked out. Loads assets/data/explore.json, builds the
// level from its map (build.js), walks it (player.js) and paints it
// (post.js). Lights: the party's torch rides with the camera; the wall
// torches share a small pool of point lights that follows the nearest ones
// (a fixed light count keeps three.js from recompiling shaders).

import * as THREE from 'three';
import { parseMap, isOpen } from './grid.js';
import { buildDungeon } from './build.js';
import { createPlayer } from './player.js';
import { createPaintPass } from './post.js';

// a cheap, smooth flicker: three detuned sines
const flicker = (t, phase, amount) => 1 - amount * 0.5 + amount * 0.5 * (Math.sin(t * 7.3 + phase) * 0.5 + Math.sin(t * 13.1 + phase * 1.7) * 0.3 + Math.sin(t * 23.7 + phase * 0.3) * 0.2);

export async function startLab({ canvas, hud }) {
  const cfg = await (await fetch('../assets/data/explore.json', { cache: 'no-cache' })).json();
  const grid = parseMap(cfg.map);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NoToneMapping; // the paint pass tone-maps
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.fog.color);
  scene.fog = new THREE.FogExp2(cfg.fog.color, cfg.fog.density);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
  scene.add(camera);

  const level = buildDungeon(grid, cfg);
  scene.add(level.group);
  const amb = cfg.light.ambient;
  scene.add(new THREE.HemisphereLight(amb.sky, amb.ground, amb.intensity));
  const L = cfg.light;
  const party = new THREE.PointLight(L.party.color, L.party.intensity, L.party.distance, L.party.decay);
  party.position.set(0.35, -0.15, -0.3); // the torch in the right hand
  camera.add(party);
  const pool = Array.from({ length: L.pool }, () => {
    const l = new THREE.PointLight(L.torch.color, 0, L.torch.distance, L.torch.decay);
    scene.add(l);
    return l;
  });

  const player = createPlayer(grid, cfg, camera, canvas);
  const paint = createPaintPass(renderer, camera, cfg);

  function resize() {
    const pr = Math.min(devicePixelRatio || 1, cfg.render.maxPixelRatio);
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    paint.setSize(Math.round(innerWidth * pr), Math.round(innerHeight * pr));
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // HUD: the intro card while the mouse is free, fps + cell, a minimap
  document.addEventListener('pointerlockchange', () => hud.intro.classList.toggle('hidden', document.pointerLockElement === canvas));
  const mini = hud.minimap.getContext('2d');
  addEventListener('keydown', (e) => { if (e.code === 'KeyM') hud.minimap.classList.toggle('hidden'); });
  function drawMinimap() {
    const S = hud.minimap.width / Math.max(grid.w, grid.h), C = cfg.cell, s = player.state;
    mini.clearRect(0, 0, hud.minimap.width, hud.minimap.height);
    for (let z = 0; z < grid.h; z++) for (let x = 0; x < grid.w; x++) {
      if (!isOpen(grid, x, z)) continue;
      mini.fillStyle = 'rgba(216,201,163,0.28)'; mini.fillRect(x * S, z * S, S - 1, S - 1);
    }
    for (const t of level.torches) { mini.fillStyle = '#ff9a4a'; mini.fillRect(t.position.x / C * S - 1.5, t.position.z / C * S - 1.5, 3, 3); }
    const px = s.x / C * S, pz = s.z / C * S, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    mini.fillStyle = '#c9a227';
    mini.beginPath(); mini.moveTo(px + fx * S * 0.7, pz + fz * S * 0.7);
    mini.lineTo(px - fx * S * 0.4 + fz * S * 0.35, pz - fz * S * 0.4 - fx * S * 0.35);
    mini.lineTo(px - fx * S * 0.4 - fz * S * 0.35, pz - fz * S * 0.4 + fx * S * 0.35); mini.fill();
  }

  let frames = 0, fpsT = 0, t = 0, last = null;
  const near = new THREE.Vector3();
  function frame(now) {
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000); // (a long stall is not a teleport)
    last = now;
    t += dt;
    player.update(dt);
    // the pool lights go to the nearest torches; every flame flickers
    near.copy(camera.position);
    const byDist = [...level.torches].sort((a, b) => a.position.distanceToSquared(near) - b.position.distanceToSquared(near));
    pool.forEach((l, i) => {
      const tr = byDist[i];
      if (!tr) { l.intensity = 0; return; }
      l.position.copy(tr.position);
      l.intensity = L.torch.intensity * flicker(t, tr.phase, L.flicker);
    });
    for (const tr of level.torches) {
      const f = flicker(t, tr.phase, L.flicker * 1.6);
      tr.flame.scale.set(0.3 * (0.9 + 0.1 * f), 0.58 * f, 1);
      tr.flame.material.opacity = 0.75 + 0.25 * f;
    }
    party.intensity = L.party.intensity * flicker(t, 3.1, L.flicker);
    paint.render(scene);
    frames++; fpsT += dt;
    if (fpsT >= 0.5) {
      const c = player.cell();
      hud.status.textContent = `${Math.round(frames / fpsT)} fps · cell ${c.x},${c.z}`;
      frames = 0; fpsT = 0;
    }
    if (!hud.minimap.classList.contains('hidden')) drawMinimap();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { renderer, scene, camera, player, cfg }; // (for tests and tinkering in the console)
}

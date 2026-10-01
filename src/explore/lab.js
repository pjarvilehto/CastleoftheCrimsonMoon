// explore/lab.js — the Dungeon Lab (0.139): the 3D dungeon prototype, run on
// its own page (dungeon-lab/, opened from the ?debug column) while the look
// and feel are worked out. Loads assets/data/explore.json, generates a
// floor (mapgen.js, 0.140; ?seed=N picks one, N makes the next), builds
// it (build.js), walks it (player.js), paints it (post.js) and peoples it
// (encounterLayer.js, 0.141: the game's own fights, over the dimmed
// view; the boss's fall leads down a floor). The page shares the game's
// data, stylesheet, hotkeys and sound (its <base> is the site root). Lights: the
// party's torch rides with the camera; the wall torches share a small pool
// of point lights that follows the nearest ones (a fixed light count keeps
// three.js from recompiling shaders).

import * as THREE from 'three';
import { parseMap } from './grid.js';
import { generateFloor } from './mapgen.js';
import { buildDungeon } from './build.js';
import { createPlayer } from './player.js';
import { createPaintPass } from './post.js';
import { createMinimap } from './minimap.js';
import { createEncounters } from './encounterLayer.js';
import { loadData, DATA } from '../shared/data.js';
import { initHotkeys } from '../core/hotkeys.js';
import { initMusic } from '../audio/music.js';
import { initSfx } from '../audio/sfx.js';

// a cheap, smooth flicker: three detuned sines
const flicker = (t, phase, amount) => 1 - amount * 0.5 + amount * 0.5 * (Math.sin(t * 7.3 + phase) * 0.5 + Math.sin(t * 13.1 + phase * 1.7) * 0.3 + Math.sin(t * 23.7 + phase * 0.3) * 0.2);

export async function startLab({ canvas, hud }) {
  await loadData();
  const cfg = await (await fetch('assets/data/explore.json', { cache: 'no-cache' })).json();
  initHotkeys(); initSfx(); initMusic();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NoToneMapping; // the paint pass tone-maps
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.fog.color);
  scene.fog = new THREE.FogExp2(cfg.fog.color, cfg.fog.density);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
  scene.add(camera);

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

  const player = createPlayer(cfg, camera, canvas);
  const paint = createPaintPass(renderer, camera, cfg);
  const minimap = createMinimap(hud.minimap, cfg.gen.reveal);
  const encounters = createEncounters({
    scene, camera, player, cfg, paint, appRoot: hud.app, bossEvery: DATA.difficulty.bossEvery,
    onDescend: () => newFloor(lab.floor.seed + 1, lab.depth + 1),
    onDeath: () => newFloor(lab.floor.seed, 1),
  });

  // the floor: generate, build, put the knight at the start
  const lab = { renderer, scene, camera, player, cfg, encounters, floor: null, grid: null, level: null, depth: 1 };
  function newFloor(seed, depth = lab.depth) {
    lab.depth = depth;
    if (lab.level) { scene.remove(lab.level.group); lab.level.dispose(); }
    lab.floor = generateFloor(seed, cfg.gen);
    lab.grid = parseMap(lab.floor.rows);
    lab.level = buildDungeon(lab.grid, cfg);
    scene.add(lab.level.group);
    player.place(lab.grid, lab.floor.start);
    minimap.setFloor(lab.floor, lab.grid);
    encounters.setFloor(lab.floor, depth);
    try { history.replaceState(null, '', `dungeon-lab/?seed=${seed}&depth=${depth}`); } catch { /* (file://) */ }
  }
  const q = new URLSearchParams(location.search), num = (k) => (Number.isInteger(Number(q.get(k))) && Number(q.get(k)) > 0 ? Number(q.get(k)) : null);
  newFloor(num('seed') ?? cfg.gen.seed, num('depth') ?? 1);

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

  // HUD: the intro card while the mouse is free, fps + floor, the map
  let mapOn = true;
  addEventListener('keydown', (e) => {
    if (!encounters.walking()) return; // (a fight has the keyboard)
    if (e.code === 'KeyM') mapOn = !mapOn;
    if (e.code === 'KeyN' && !e.repeat) newFloor(lab.floor.seed + 1);
  });

  let frames = 0, fpsT = 0, t = 0, last = null;
  const near = new THREE.Vector3();
  function frame(now) {
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000); // (a long stall is not a teleport)
    last = now;
    t += dt;
    const walking = encounters.walking();
    if (walking) player.update(dt);
    encounters.update(t, dt);
    hud.intro.classList.toggle('hidden', !walking || document.pointerLockElement === canvas);
    hud.minimap.classList.toggle('hidden', !walking || !mapOn);
    const c = player.cell();
    minimap.look(c.x, c.z);
    // the pool lights go to the nearest torches; every flame flickers
    near.copy(camera.position);
    const torches = lab.level.torches;
    const byDist = [...torches].sort((a, b) => a.position.distanceToSquared(near) - b.position.distanceToSquared(near));
    pool.forEach((l, i) => {
      const tr = byDist[i];
      if (!tr) { l.intensity = 0; return; }
      l.position.copy(tr.position);
      l.intensity = L.torch.intensity * flicker(t, tr.phase, L.flicker);
    });
    for (const tr of torches) {
      const f = flicker(t, tr.phase, L.flicker * 1.6);
      tr.flame.scale.set(0.3 * (0.9 + 0.1 * f), 0.58 * f, 1);
      tr.flame.material.opacity = 0.75 + 0.25 * f;
    }
    party.intensity = L.party.intensity * flicker(t, 3.1, L.flicker);
    paint.render(scene);
    frames++; fpsT += dt;
    if (fpsT >= 0.5) {
      const r = encounters.run, left = encounters.spots.filter((sp) => !sp.cleared).length;
      hud.status.textContent = `${Math.round(frames / fpsT)} fps · depth ${lab.depth} (floor ${lab.floor.seed}) · HP ${Math.max(0, r.hp)}/${r.maxHp} · potions ${r.potions} · ${left} left`;
      frames = 0; fpsT = 0;
    }
    if (walking && mapOn) minimap.draw(player, torches, cfg.cell, encounters.cleared());
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  lab.newFloor = newFloor;
  return lab; // (for tests and tinkering in the console)
}

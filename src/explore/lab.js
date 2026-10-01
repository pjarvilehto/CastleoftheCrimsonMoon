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
import { createMist } from './mist.js';
import { createStairs } from './stairs.js';
import { createLights, shadowAll } from './lights.js';
import { bakeLightField, patchAll } from './lightField.js';
import { bakeAO } from './aoBake.js';
import { createAtmosphere } from './atmosphere.js';
import { themeRooms } from './themes.js';
import { createQuality } from './quality.js';
import { el } from '../core/dom.js';
import { seeded } from './grid.js';
import { loadData, DATA } from '../shared/data.js';
import { initHotkeys } from '../core/hotkeys.js';
import { initMusic } from '../audio/music.js';
import { initSfx } from '../audio/sfx.js';

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
  const hemi = new THREE.HemisphereLight(amb.sky, amb.ground, amb.intensity);
  scene.add(hemi);
  const lights = createLights(scene, camera, renderer, cfg); // (0.145: lights.js — the pool, shadows, flicker)

  const player = createPlayer(cfg, camera, canvas);
  const paint = createPaintPass(renderer, camera, cfg);
  const minimap = createMinimap(hud.minimap, cfg.gen.reveal);
  const encounters = createEncounters({
    scene, camera, player, cfg, paint, appRoot: hud.app, bossEvery: DATA.difficulty.bossEvery,
    onDescend: () => { descent = { t: 0, from: { x: player.state.x, z: player.state.z } }; },
    onDeath: () => newFloor(lab.floor.seed, 1),
    onRestart: () => newFloor(lab.floor.seed + 1, 1),
  });
  const stairs = createStairs(scene, cfg);
  let descent = null; // { t, from } while walking down the stairs
  // Return (0.144): between fights, back to the Great Hall (R, or click)
  const returnBtn = el('button', { class: 'lab-return-btn', key: 'r', onclick: () => encounters.returnHome() }, 'Return to the Great Hall');
  document.body.append(returnBtn);

  // the floor: generate, build, put the knight at the start
  const lab = { renderer, scene, camera, player, cfg, encounters, floor: null, grid: null, level: null, mist: null, air: null, depth: 1 };
  function newFloor(seed, depth = lab.depth) {
    lab.depth = depth;
    if (lab.level) { scene.remove(lab.level.group, lab.mist.group, lab.air.group); lab.level.dispose(); lab.mist.dispose(); lab.air.dispose(); }
    lab.floor = generateFloor(seed, cfg.gen);
    lab.grid = parseMap(lab.floor.rows);
    // the depth tier (0.142): its stone, its fog, its shadows
    lab.tier = Math.min(depth, cfg.tiers.length) - 1;
    const T = cfg.tiers[lab.tier];
    scene.background.set(T.fog); scene.fog.color.set(T.fog);
    hemi.color.set(T.sky); hemi.groundColor.set(T.ground);
    paint.setShadow(T.shadow);
    paint.setGrade(T.grade ?? cfg.post.grade); // (0.147: the tier's colour grade)
    lab.rooms = themeRooms(lab.floor, depth, cfg, seeded(seed * 7 + depth)); // (0.146: each room its theme)
    lab.level = buildDungeon(lab.grid, cfg, { rooms: lab.rooms, shrine: lab.floor.shrine, stairs: lab.floor.stairs, tier: lab.tier });
    stairs.place(lab.floor, cfg.tiers[Math.min(depth + 1, cfg.tiers.length) - 1].glow); // the next depth's colour
    lab.grid.posts = lab.level.posts;
    lab.grid.boxes = lab.level.boxes;
    lab.mist = createMist(lab.grid, cfg, T.mist, seeded(seed * 31));
    bakeAO(lab.level.group, lab.grid, cfg); // (0.147: the props' contact shadows)
    shadowAll(lab.level.group);
    bakeLightField(lab.grid, lab.level.torches, cfg, stoneTint(T.palette.stone)); // (0.146; 0.147 + one bounce)
    patchAll(lab.level.group);
    lab.air = createAtmosphere(lab.level.emitters, cfg, seeded(seed * 13)); // (0.147: dust, embers, smoke)
    scene.add(lab.level.group, lab.mist.group, lab.air.group);
    lights.reset();
    player.place(lab.grid, lab.floor.start);
    minimap.setFloor(lab.floor, lab.grid);
    encounters.setFloor(lab.floor, depth);
    try { history.replaceState(null, '', `dungeon-lab/?seed=${seed}&depth=${depth}`); } catch { /* (file://) */ }
  }
  // the colour light takes on bouncing off a tier's stone (its mean tone,
  // brightest channel at 1, half way to white)
  function stoneTint(st) {
    const c = new THREE.Color().setHSL((st[0] + st[1] / 2) / 360, (st[2] + st[3] / 2) / 100, 0.5);
    const m = Math.max(c.r, c.g, c.b);
    return new THREE.Color(1, 1, 1).lerp(new THREE.Color(c.r / m, c.g / m, c.b / m), 0.5);
  }
  const q = new URLSearchParams(location.search), num = (k) => (Number.isInteger(Number(q.get(k))) && Number(q.get(k)) > 0 ? Number(q.get(k)) : null);
  const hold = q.has('hold');
  newFloor(num('seed') ?? cfg.gen.seed, num('depth') ?? 1);

  let scale = 1; // the quality ladder's resolution step
  const quality = createQuality(cfg, { lights, paint, setScale: (k) => { scale = k; resize(); } });
  let pxScale = 500; // particles: pixels per metre at a metre's distance
  function resize() {
    const pr = Math.min(devicePixelRatio || 1, cfg.render.maxPixelRatio) * scale;
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    paint.setSize(Math.round(innerWidth * pr), Math.round(innerHeight * pr));
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    pxScale = (innerHeight * pr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
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
  function frame(now) {
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000); // (a long stall is not a teleport)
    last = now;
    t += dt;
    const walking = encounters.walking();
    if (walking) player.update(dt);
    encounters.update(t, dt);
    stairs.update(t);
    if (descent) { // down the stairs into the dark, then the next floor fades in
      descent.t += dt;
      const k = descent.t / cfg.stairs.walkSecs;
      if (k < 1) {
        const w = stairs.walkDown(k, descent.from);
        Object.assign(player.state, { x: w.x, z: w.z, yaw: w.yaw, pitch: w.pitch });
        player.update(0);
        camera.position.y = w.y;
        paint.uniforms.fade.value = w.fade;
      } else if (!descent.done) {
        descent.done = true;
        newFloor(lab.floor.seed + 1, lab.depth + 1);
      }
      if (descent.done) {
        paint.uniforms.fade.value = Math.max(0, 1 - (descent.t - cfg.stairs.walkSecs) / 0.9);
        if (paint.uniforms.fade.value === 0) descent = null;
      }
    }
    returnBtn.classList.toggle('hidden', !walking || !!descent);
    hud.intro.classList.toggle('hidden', !walking || document.pointerLockElement === canvas);
    hud.minimap.classList.toggle('hidden', !walking || !mapOn);
    const c = player.cell();
    minimap.look(c.x, c.z);
    const torches = lab.level.torches;
    paint.setHaze(lights.update(t, torches, dt)); // the near lights: pool, shadows, flicker, haze
    lab.mist.update(t);
    lab.air.update(t, pxScale);
    paint.render(scene);
    frames++; fpsT += dt;
    if (walking && !hold) quality.tick(dt); // (fights are DOM: they don't count; ?hold keeps full quality)
    if (fpsT >= 0.5) {
      const r = encounters.run, left = encounters.spots.filter((sp) => !sp.cleared).length;
      hud.status.textContent = `${Math.round(frames / fpsT)} fps${quality.level() ? ` (quality -${quality.level()})` : ''} · depth ${lab.depth}: ${cfg.tiers[lab.tier].name} (floor ${lab.floor.seed}) · HP ${Math.max(0, r.hp)}/${r.maxHp} · potions ${r.potions} · ${left} left`;
      frames = 0; fpsT = 0;
    }
    if (walking && mapOn) minimap.draw(player, torches.filter((s) => !s.bakedOnly), cfg.cell, encounters.cleared());
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  lab.newFloor = newFloor;
  return lab; // (for tests and tinkering in the console)
}

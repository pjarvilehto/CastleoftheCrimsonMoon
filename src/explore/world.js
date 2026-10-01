// explore/world.js — the 3D dungeon itself (0.150, out of lab.js): the
// renderer, camera, light pool, paint pass and frame-rate ladder, and a
// floor built from a mapgen floor (its depth tier's look, themed and
// furnished rooms, mist, baked AO and light field, the air, the stairs'
// glow). Shared by the Dungeon Lab (lab.js: walk it yourself) and the
// game's 3D corridors (corridorView.js: the knight walks between rooms).
// createWorld({ canvas, cfg, hold }) -> { build(floor, depth), frame(t, dt, opts), resize(), ... }

import * as THREE from 'three';
import { parseMap, seeded } from './grid.js';
import { buildDungeon } from './build.js';
import { createPaintPass } from './post.js';
import { createMist } from './mist.js';
import { createStairs } from './stairs.js';
import { createLights, shadowAll } from './lights.js';
import { bakeLightField, patchAll } from './lightField.js';
import { bakeAO } from './aoBake.js';
import { createAtmosphere } from './atmosphere.js';
import { themeRooms } from './themes.js';
import { createQuality } from './quality.js';

export function createWorld({ canvas, cfg, hold = false }) {
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
  const lights = createLights(scene, camera, renderer, cfg); // (0.145: the pool, shadows, flicker)
  const paint = createPaintPass(renderer, camera, cfg);
  const stairs = createStairs(scene, cfg);

  const W = { renderer, scene, camera, paint, lights, stairs, cfg, floor: null, grid: null, level: null, mist: null, air: null, rooms: null, tier: 0, depth: 1, pxScale: 500 };

  // a floor (mapgen.js) at a depth: its tier's stone, fog and shadows, its
  // themed rooms, built and lit
  W.build = (floor, depth) => {
    if (W.level) { scene.remove(W.level.group, W.mist.group, W.air.group); W.level.dispose(); W.mist.dispose(); W.air.dispose(); }
    const seed = floor.seed;
    W.floor = floor; W.depth = depth;
    W.grid = parseMap(floor.rows);
    W.tier = Math.min(depth, cfg.tiers.length) - 1; // (0.142: one look per depth)
    const T = cfg.tiers[W.tier];
    scene.background.set(T.fog); scene.fog.color.set(T.fog);
    hemi.color.set(T.sky); hemi.groundColor.set(T.ground);
    paint.setShadow(T.shadow);
    paint.setGrade(T.grade ?? cfg.post.grade); // (0.147: the tier's colour grade)
    W.rooms = themeRooms(floor, depth, cfg, seeded(seed * 7 + depth)); // (0.146: each room its theme)
    W.level = buildDungeon(W.grid, cfg, { rooms: W.rooms, shrine: floor.shrine, stairs: floor.stairs, tier: W.tier });
    stairs.place(floor, cfg.tiers[Math.min(depth + 1, cfg.tiers.length) - 1].glow); // the next depth's colour
    W.grid.posts = W.level.posts;
    W.grid.boxes = W.level.boxes;
    W.mist = createMist(W.grid, cfg, T.mist, seeded(seed * 31));
    bakeAO(W.level.group, W.grid, cfg); // (0.147: the props' contact shadows)
    shadowAll(W.level.group);
    bakeLightField(W.grid, W.level.torches, cfg, stoneTint(T.palette.stone)); // (0.146; 0.147 + one bounce)
    patchAll(W.level.group);
    W.air = createAtmosphere(W.level.emitters, cfg, seeded(seed * 13)); // (0.147: dust, embers, smoke)
    scene.add(W.level.group, W.mist.group, W.air.group);
    lights.reset();
  };

  // the colour light takes on bouncing off a tier's stone (its mean tone,
  // brightest channel at 1, half way to white)
  function stoneTint(st) {
    const c = new THREE.Color().setHSL((st[0] + st[1] / 2) / 360, (st[2] + st[3] / 2) / 100, 0.5);
    const m = Math.max(c.r, c.g, c.b);
    return new THREE.Color(1, 1, 1).lerp(new THREE.Color(c.r / m, c.g / m, c.b / m), 0.5);
  }

  let scale = 1; // the quality ladder's resolution step
  const quality = createQuality(cfg, { lights, paint, setScale: (k) => { scale = k; W.resize(); } });
  W.quality = quality;
  W.resize = () => {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    const pr = Math.min(devicePixelRatio || 1, cfg.render.maxPixelRatio) * scale;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    paint.setSize(Math.round(w * pr), Math.round(h * pr));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    W.pxScale = (h * pr) / (2 * Math.tan((camera.fov * Math.PI) / 360)); // particles: pixels per metre at a metre
  };
  addEventListener('resize', W.resize);
  W.resize();

  // one frame: the near lights (pool, shadows, flicker, haze), mist, air,
  // the stairs' glow; then the picture, unless something covers it, and
  // the quality ladder's watch (`tick`: frames that count; ?hold: never)
  W.frame = (t, dt, { render = true, tick = true } = {}) => {
    stairs.update(t);
    paint.setHaze(lights.update(t, W.level.torches, dt));
    W.mist.update(t);
    W.air.update(t, W.pxScale);
    if (render) paint.render(scene);
    if (render && tick && !hold) quality.tick(dt);
  };
  return W;
}

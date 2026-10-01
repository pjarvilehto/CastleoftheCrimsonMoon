// explore/corridorView.js — the game's 3D corridors (0.150, a ?debug test,
// ui/corridors.js): between the game's rooms the knight walks a 3D floor on
// his own. Each stretch of bossEvery rooms is one very linear floor
// (runFloor.js). Walking to a room: the dungeon fades in over the game's
// painting, the knight follows the trail (walkPath.js) into the room and
// turns to what waits there (its strongest enemy, standing as a
// billboard); walkTo() then hands back the room's look (its theme's
// painting, explore.json backdrop.paintings) and the game fades the
// painting and the fight in as reveal() fades the dungeon out. Past the
// boss: the stairs, down into the dark, and the next stretch's floor. It
// only draws — the run (rooms, fights, loot) stays the game's.
// createCorridorView(cfg, { bossEvery })
//   -> { walkTo(run, room, { onCovered }) -> Promise<{ background, theme }>, reveal() -> Promise, skip(), close() }

import * as THREE from 'three';
import { createWorld } from './world.js';
import { planStretch } from './runFloor.js';
import { route, smoothWalk } from './walkPath.js';
import { createBillboard } from './billboard.js';
import { patchMaterial } from './lightField.js';
import { leaderOf, inRect } from './encounters.js';
import { DIRS } from './grid.js';

const smooth = (k) => k * k * (3 - 2 * k);
const shortWay = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;

export function createCorridorView(cfg, { bossEvery }) {
  const R = cfg.run, B = cfg.billboard, C = cfg.cell, LL = cfg.light.lair;
  const canvas = document.createElement('canvas');
  canvas.id = 'corridor-view'; // over the painted backgrounds, under the windows (#app)
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', display: 'block', zIndex: '1', pointerEvents: 'none', opacity: '0', visibility: 'hidden' });
  document.body.append(canvas);
  const world = createWorld({ canvas, cfg });
  const { scene, camera, paint, stairs, renderer } = world;
  const figures = new THREE.Group();
  const lair = new THREE.PointLight(LL.color, 0, LL.distance, LL.decay);
  scene.add(figures, lair);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: B.shadow, depthWrite: false });
  const shadowGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);

  let plan = null, stretch = -1, standing = []; // standing: { billboard, shadow, number, vanishing }
  const knight = { x: 0, z: 0, y: cfg.eyeHeight, yaw: 0, pitch: 0, stride: 0, bob: 0 };
  let shown = 0, want = 0, step = null, fast = false, running = false, held = false, lift = false, arrived = false;
  let t = 0, last = null, onCovered = null, hidden = null;

  // one animation at a time: fn(dt) -> true when done
  const animate = (fn) => new Promise((resolve) => { step = { fn, resolve }; });

  function loop(now) {
    if (!running) return;
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000); // (a long stall is not a teleport)
    last = now; t += dt;
    shown = Math.max(0, Math.min(1, shown + (want ? dt / R.fadeInSecs : -dt / R.fadeOutSecs)));
    canvas.style.opacity = String(smooth(shown));
    if (shown >= 1 && onCovered) { onCovered(); onCovered = null; }
    if (step && step.fn(dt * (fast ? R.skipSpeed : 1))) { const s = step; step = null; s.resolve(); }
    if (lift) { // a new floor rising out of the dark
      paint.uniforms.fade.value = Math.max(0, paint.uniforms.fade.value - dt / R.blackSecs);
      lift = paint.uniforms.fade.value > 0;
    }
    camera.position.set(knight.x, knight.y + Math.sin(knight.stride) * R.bob * knight.bob, knight.z);
    camera.rotation.set(knight.pitch, knight.yaw + Math.PI, 0, 'YXZ'); // (player.js: yaw 0 looks toward +z)
    for (const f of standing) f.billboard.update(camera, t, dt);
    const foe = standing.find((f) => !f.vanishing);
    lair.intensity = foe ? LL.intensity * (1 + 0.08 * Math.sin(t * 2.3)) : 0;
    if (foe) {
      const p = foe.billboard.mesh.position, to = new THREE.Vector3(camera.position.x - p.x, 0, camera.position.z - p.z).normalize().multiplyScalar(LL.ahead);
      lair.position.set(p.x + to.x, LL.height, p.z + to.z);
    }
    if (!held) world.frame(t, dt, { tick: shown >= 1 });
    if (!want && shown === 0 && !step) { stop(); hidden?.(); hidden = null; return; }
    requestAnimationFrame(loop);
  }
  function start() {
    if (running) return;
    running = true; last = null;
    canvas.style.visibility = 'visible';
    world.resize();
    requestAnimationFrame(loop);
  }
  function stop() { running = false; canvas.style.visibility = 'hidden'; }

  // along the trail to the first cell that is `goal`, at a walk that eases
  // in and out; the knight looks a little ahead, so he turns into corners
  function walk(goal) {
    const from = { x: Math.floor(knight.x / C), z: Math.floor(knight.z / C) };
    const cells = route(plan.floor.trail, from, goal);
    if (!cells || cells.length < 2) return Promise.resolve();
    const path = smoothWalk(cells, C, R.round);
    if (arrived) { knight.yaw = path.heading(0, R.lookAhead); arrived = false; } // (a new floor: already facing the way on)
    let s = 0;
    return animate((dt) => {
      const pace = R.walkSpeed * Math.max(0.25, Math.min(1, (s + 0.3) / R.ease, (path.length - s + 0.15) / R.ease));
      s = Math.min(path.length, s + pace * dt);
      const p = path.at(s);
      knight.x = p.x; knight.z = p.z;
      knight.stride += ((pace * dt) / R.stride) * Math.PI;
      knight.bob = Math.min(1, pace / R.walkSpeed);
      const h = path.heading(s, R.lookAhead);
      if (h !== null) knight.yaw += shortWay(h - knight.yaw) * Math.min(1, dt * R.turnRate);
      knight.pitch *= 1 - Math.min(1, dt * R.turnRate);
      if (s >= path.length) knight.bob = 0;
      return s >= path.length;
    });
  }
  function turnTo(yaw) {
    const y0 = knight.yaw, d = shortWay(yaw - y0), p0 = knight.pitch;
    let k = 0;
    return animate((dt) => {
      k = Math.min(1, k + dt / R.turnSecs);
      const e = smooth(k);
      knight.yaw = y0 + d * e; knight.pitch = p0 * (1 - e);
      return k >= 1;
    });
  }
  // down the stairs past the boss, into the dark (stairs.js walkDown)
  function descend() {
    const from = { x: knight.x, z: knight.z };
    let k = 0;
    return animate((dt) => {
      k = Math.min(1, k + dt / cfg.stairs.walkSecs);
      const w = stairs.walkDown(k, from);
      Object.assign(knight, { x: w.x, z: w.z, y: w.y, pitch: w.pitch });
      knight.yaw += shortWay(w.yaw - knight.yaw) * Math.min(1, dt * R.turnRate);
      paint.uniforms.fade.value = w.fade;
      return k >= 1;
    });
  }

  // a stretch's floor, the knight at its start
  async function newFloor(run, s) {
    plan = planStretch(s, run.shrineRooms[s], bossEvery, cfg, 1 + Math.floor(Math.random() * 1e9));
    stretch = s;
    clearFigures();
    world.build(plan.floor, s + 1);
    const st = plan.floor.start, [dx, dz] = DIRS[st.facing];
    Object.assign(knight, { x: (st.x + 0.5) * C, z: (st.z + 0.5) * C, y: cfg.eyeHeight, yaw: Math.atan2(dx, dz), pitch: 0, bob: 0 });
    arrived = true;
    await renderer.compileAsync?.(scene, camera).catch(() => {}); // (no stall mid-fade where the browser can compile aside)
  }

  // the enemy waiting in the room: its strongest, standing at the centre
  function standFigure(room, target) {
    if (room.kind === 'shrine' || !room.enemies?.length) return;
    const lead = leaderOf(room), size = { ...(B.sizes[lead.id] ?? B.sizes.default) };
    if (room.isBoss) size.height *= B.bossScale;
    const at = { x: (target.centre.x + 0.5) * C, z: (target.centre.z + 0.5) * C };
    const billboard = createBillboard(lead.id, size, at, B.tear, B.glow);
    patchMaterial(billboard.mesh.material); // (lit by the room's baked light too)
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(at.x, 0.012, at.z);
    shadow.scale.setScalar(size.height * 0.28);
    figures.add(billboard.mesh, shadow);
    standing.push({ billboard, shadow, number: room.number, vanishing: false });
  }
  function clearFigures() {
    for (const f of standing) f.billboard.dispose();
    standing = [];
    figures.clear();
  }

  // Space, Enter or a click hurries the knight along
  const hurry = (e) => { if (e.type !== 'keydown' || e.code === 'Space' || e.code === 'Enter') fast = true; };

  async function walkTo(run, room, opts = {}) {
    fast = false; onCovered = opts.onCovered ?? null;
    addEventListener('keydown', hurry); addEventListener('pointerdown', hurry);
    try {
      const s = Math.floor((room.number - 1) / bossEvery);
      // the room just won: its enemy fades away as the dungeon comes back
      for (const f of standing) {
        if (f.number < room.number && !f.vanishing) { f.vanishing = true; f.billboard.vanish(R.vanishSecs, () => { f.shadow.visible = false; }); }
      }
      if (plan && s !== stretch) { // past the boss: down the stairs first
        start(); want = 1;
        await walk((x, z) => x === plan.floor.stairs.x && z === plan.floor.stairs.z);
        await descend();
        held = true; // (the screen is black: build behind it)
        await newFloor(run, s);
        held = false; lift = true;
      } else if (s !== stretch) {
        await newFloor(run, s);
      }
      const target = plan.rooms.get(room.number);
      standFigure(room, target);
      start(); want = 1;
      await walk((x, z) => inRect(target.rect, x, z));
      const c = { x: (target.centre.x + 0.5) * C, z: (target.centre.z + 0.5) * C };
      await turnTo(Math.atan2(c.x - knight.x, c.z - knight.z));
      const theme = world.rooms.find((r) => r.x === target.rect.x && r.z === target.rect.z)?.theme ?? null;
      return { theme, background: cfg.backdrop.paintings[theme] ?? null };
    } finally {
      removeEventListener('keydown', hurry); removeEventListener('pointerdown', hurry);
    }
  }

  // the room's painting takes over: the dungeon fades out and rests
  function reveal() {
    want = 0;
    onCovered = null; // (never covered: the painting below keeps running)
    return new Promise((resolve) => { if (!running) resolve(); else hidden = resolve; });
  }

  // the run is over (home, or dead): nothing left standing, no floor
  function close() {
    want = 0; shown = 0; step = null; onCovered = null; lift = false; held = false;
    stop();
    canvas.style.opacity = '0';
    paint.uniforms.fade.value = 0;
    hidden?.(); hidden = null;
    clearFigures();
    plan = null; stretch = -1;
  }

  return { walkTo, reveal, close, skip: () => { fast = true; }, world, get knight() { return knight; }, get plan() { return plan; } };
}

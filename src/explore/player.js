// explore/player.js — walking the dungeon (0.139). Smooth first-person
// movement on the grid map: WASD or the arrow keys (left/right arrows
// turn, A/D strafe), Shift to run, mouselook while the pointer is locked
// (a click on the view locks it, Esc frees it). Velocity eases toward the
// wanted speed, collision slides along walls (grid.js collide), and the
// head bobs a little with distance walked.

import { collide } from './grid.js';

const KEYS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'],
  left: ['KeyA'], right: ['KeyD'], turnLeft: ['ArrowLeft', 'KeyQ'], turnRight: ['ArrowRight', 'KeyE'],
  run: ['ShiftLeft', 'ShiftRight'],
};
// yaw 0 looks toward +z (south); forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw)
const FACING = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };

export function createPlayer(cfg, camera, dom) {
  const m = cfg.move, C = cfg.cell;
  let grid = null;
  const s = { x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, stride: 0, locked: false };
  // onto a floor: stand in the start cell's middle, facing start.facing
  const place = (g, start) => {
    grid = g;
    Object.assign(s, { x: (start.x + 0.5) * C, z: (start.z + 0.5) * C, yaw: FACING[start.facing], pitch: 0, vx: 0, vz: 0 });
  };
  const down = new Set();
  const held = (name) => KEYS[name].some((k) => down.has(k));

  const onKey = (e) => {
    if (e.type === 'keydown') down.add(e.code); else down.delete(e.code);
    if (Object.values(KEYS).some((ks) => ks.includes(e.code))) e.preventDefault();
  };
  const onMouse = (e) => {
    if (!s.locked) return;
    s.yaw -= e.movementX * m.mouseSens;
    s.pitch = Math.max(-m.pitchLimit, Math.min(m.pitchLimit, s.pitch - e.movementY * m.mouseSens));
  };
  const onLock = () => { s.locked = document.pointerLockElement === dom; if (!s.locked) down.clear(); };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  addEventListener('blur', () => down.clear()); // no stuck keys after alt-tab
  document.addEventListener('mousemove', onMouse);
  document.addEventListener('pointerlockchange', onLock);
  const lock = () => { dom.requestPointerLock?.()?.catch?.(() => {}); }; // (refused = stay unlocked)
  dom.addEventListener('click', () => { if (!s.locked) lock(); });

  function update(dt) {
    if (held('turnLeft')) s.yaw += m.turnSpeed * dt;
    if (held('turnRight')) s.yaw -= m.turnSpeed * dt;
    // wanted velocity in the world from the keys, relative to where we face
    const f = (held('forward') ? 1 : 0) - (held('back') ? 1 : 0);
    const r = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    const len = Math.hypot(f, r) || 1;
    const speed = m.speed * (held('run') ? m.runMult : 1);
    const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
    const wx = ((f * sin) - (r * cos)) / len * speed * (f || r ? 1 : 0);
    const wz = ((f * cos) + (r * sin)) / len * speed * (f || r ? 1 : 0);
    const k = 1 - Math.exp(-m.accel * dt); // ease toward the wanted velocity
    s.vx += (wx - s.vx) * k;
    s.vz += (wz - s.vz) * k;
    const px = s.x, pz = s.z;
    const c = collide(grid, (s.x + s.vx * dt) / C, (s.z + s.vz * dt) / C, m.radius / C);
    s.x = c.x * C; s.z = c.z * C;
    // the velocity is what actually happened: walking into a wall bleeds
    // off the blocked part, so sliding along it stays smooth
    if (dt > 0) { s.vx = (s.x - px) / dt; s.vz = (s.z - pz) / dt; }
    s.stride += Math.hypot(s.x - px, s.z - pz);
    const bob = Math.sin((s.stride / m.bobStride) * Math.PI * 2) * m.bobAmp * Math.min(1, Math.hypot(s.vx, s.vz) / m.speed);
    camera.position.set(s.x, cfg.eyeHeight + bob, s.z);
    camera.rotation.set(s.pitch, s.yaw + Math.PI, 0, 'YXZ'); // three's camera looks down -z; yaw 0 = +z
  }

  return {
    update,
    place,
    state: s,
    cell: () => ({ x: Math.floor(s.x / C), z: Math.floor(s.z / C) }),
    facing: () => s.yaw,
    lock,
  };
}


// explore/encounterLayer.js — the floor's enemies and the hand-off to combat
// (0.141). Every encounter room has one enemy standing at its centre (a
// billboard of the strongest enemy in the room's group, with a shadow at
// its feet). Stepping into the room: the knight stops and turns to face
// it, the dungeon dims, and the game's fight plays over it (fight.js). A
// win: the enemy fades into the dark and the room is clear; the boss's
// fall opens the way down (onDescend). A loss: Rise Again (onDeath).
// One run object carries HP, potions and loot through the whole visit.

import * as THREE from 'three';
import { createRun } from '../run/runState.js';
import { play } from '../audio/music.js';
import { el } from '../core/dom.js';
import { createBillboard } from './billboard.js';
import { planFloor, roomFor, leaderOf, inRect } from './encounters.js';
import { startFight } from './fight.js';

const TURN_SECS = 0.7;

export function createEncounters({ scene, camera, player, cfg, appRoot, paint, bossEvery, onDescend, onDeath }) {
  const B = cfg.billboard, C = cfg.cell;
  let spots = [], mode = 'walk', turn = null, dim = 0, run = createRun();
  const group = new THREE.Group();
  scene.add(group);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: B.shadow, depthWrite: false });
  const shadowGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  // lair lights: a dim red glow before the nearest enemies still standing
  // (a fixed count, like the torch pool), so a dark figure reads from afar
  const LL = cfg.light.lair;
  const lairs = Array.from({ length: LL.pool }, () => {
    const l = new THREE.PointLight(LL.color, 0, LL.distance, LL.decay);
    scene.add(l);
    return l;
  });
  const toCam = new THREE.Vector3();

  function setFloor(floor, depth) {
    for (const s of spots) s.billboard.dispose();
    group.clear();
    spots = planFloor(floor, depth, bossEvery).map((spot) => {
      const room = roomFor(spot), lead = leaderOf(room);
      const size = { ...(B.sizes[lead.id] ?? B.sizes.default) };
      if (spot.boss) size.height *= B.bossScale;
      const at = { x: (spot.x + 0.5) * C, z: (spot.z + 0.5) * C };
      const billboard = createBillboard(lead.id, size, at, B.tear, B.glow);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.position.set(at.x, 0.012, at.z);
      shadow.scale.setScalar(size.height * 0.28);
      group.add(billboard.mesh, shadow);
      return { ...spot, room, lead, billboard, shadow, cleared: false };
    });
    mode = 'walk';
    play('shrine');
  }

  // into a room with its enemy still standing: turn to face it, then fight
  function begin(spot) {
    mode = 'turning';
    document.exitPointerLock?.();
    const s = player.state;
    s.vx = s.vz = 0;
    const target = Math.atan2(spot.billboard.mesh.position.x - s.x, spot.billboard.mesh.position.z - s.z);
    const d = ((target - s.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; // the short way round
    turn = { spot, t: 0, yaw0: s.yaw, dYaw: d, pitch0: s.pitch };
    play(spot.boss ? 'boss' : 'combat');
  }

  function fight(spot) {
    mode = 'fight';
    run.hp = Math.min(run.hp, run.maxHp);
    startFight(appRoot, run, spot.room, {
      onDone: (won) => {
        appRoot.innerHTML = '';
        if (!won) { mode = 'over'; run = createRun(); onDeath(); return; }
        spot.cleared = true;
        spot.billboard.vanish(1.2, () => { spot.shadow.visible = false; });
        if (spot.boss) return descendPrompt();
        mode = 'walk';
        play('shrine');
      },
    });
  }

  // the boss is down: the stair opens (a button over the dimmed view)
  function descendPrompt() {
    mode = 'descend';
    appRoot.append(el('div', { class: 'combat-proceed lab-descend' },
      el('button', { class: 'primary active', key: 'd', proceed: true, onclick: () => { appRoot.innerHTML = ''; onDescend(); } }, 'Descend')));
  }

  function update(t, dt) {
    for (const s of spots) s.billboard.update(camera, t, dt);
    const standing = spots.filter((s) => !s.cleared)
      .sort((a, b) => a.billboard.mesh.position.distanceToSquared(camera.position) - b.billboard.mesh.position.distanceToSquared(camera.position));
    lairs.forEach((l, i) => {
      const s = standing[i];
      if (!s) { l.intensity = 0; return; }
      const p = s.billboard.mesh.position;
      toCam.set(camera.position.x - p.x, 0, camera.position.z - p.z).normalize().multiplyScalar(LL.ahead);
      l.position.set(p.x + toCam.x, LL.height, p.z + toCam.z);
      l.intensity = LL.intensity * (1 + 0.08 * Math.sin(t * 2.3 + i));
    });
    if (mode === 'walk') {
      const c = player.cell();
      const spot = spots.find((s) => !s.cleared && inRect(s.rect, c.x, c.z));
      if (spot) begin(spot);
    }
    if (mode === 'turning') {
      turn.t += dt;
      const k = Math.min(1, turn.t / TURN_SECS), e = k * k * (3 - 2 * k); // smoothstep
      player.state.yaw = turn.yaw0 + turn.dYaw * e;
      player.state.pitch = turn.pitch0 * (1 - e);
      player.update(0); // (places the camera; no movement at dt 0)
      if (k >= 1) fight(turn.spot);
    }
    // the dungeon dims behind a fight
    const want = mode === 'walk' ? 0 : 1;
    dim += (want - dim) * Math.min(1, dt * 4);
    paint.uniforms.dim.value = dim * cfg.paint.fightDim;
  }

  return {
    setFloor,
    update,
    walking: () => mode === 'walk',
    get run() { return run; },
    get spots() { return spots; },
    cleared: () => new Set(spots.filter((s) => s.cleared).map((s) => `${s.x},${s.z}`)),
  };
}

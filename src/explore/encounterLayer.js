// explore/encounterLayer.js — what the knight meets on a floor (0.141), and
// the choices between fights (0.144). Every encounter room has one enemy
// standing across the way (a billboard of the strongest enemy in the
// group, with a shadow at its feet): stepping into the room turns the
// knight to face it, dims the dungeon and plays the game's fight over it
// (fight.js); a win clears the room. The shrine room opens the game's
// shrine (one boon for coins or blood, or walk on). Past the boss, the
// stairs: walking down them leads to the next floor (onDescend). Between
// fights the knight may Return to the Great Hall instead (returnHome: the
// visit's tally). A loss: Rise Again (onDeath).
// One run object carries HP, potions, boons and loot through the visit.

import * as THREE from 'three';
import { createRun } from '../run/runState.js';
import { play } from '../audio/music.js';
import { el } from '../core/dom.js';
import { logLine } from '../ui/hud.js';
import { createBuffBar } from '../ui/buffs.js';
import { renderShrineRoom } from '../ui/shrineUI.js';
import { createBillboard } from './billboard.js';
import { planFloor, roomFor, leaderOf, inRect } from './encounters.js';
import { startFight } from './fight.js';
import { patchMaterial } from './lightField.js';

const TURN_SECS = 0.7;

export function createEncounters({ scene, camera, player, cfg, appRoot, paint, bossEvery, onDescend, onDeath, onRestart }) {
  const B = cfg.billboard, C = cfg.cell;
  let spots = [], floor = null, depth = 1, mode = 'walk', turn = null, dim = 0, run = createRun();
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
  const shrineLog = el('div', { id: 'combat-log' });

  function setFloor(f, d) {
    for (const s of spots) s.billboard?.dispose();
    group.clear();
    floor = f; depth = d;
    spots = planFloor(f, d, bossEvery).map((spot) => {
      const room = roomFor(spot);
      if (spot.kind === 'shrine') return { ...spot, room, cleared: false };
      const lead = leaderOf(room);
      const size = { ...(B.sizes[lead.id] ?? B.sizes.default) };
      if (spot.kind === 'boss') size.height *= B.bossScale;
      const at = { x: (spot.x + 0.5) * C, z: (spot.z + 0.5) * C };
      const billboard = createBillboard(lead.id, size, at, B.tear, B.glow);
      patchMaterial(billboard.mesh.material); // (lit by the room's baked light too)
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.position.set(at.x, 0.012, at.z);
      shadow.scale.setScalar(size.height * 0.28);
      group.add(billboard.mesh, shadow);
      return { ...spot, room, lead, billboard, shadow, cleared: false };
    });
    appRoot.innerHTML = '';
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
    play(spot.kind === 'boss' ? 'boss' : 'combat');
  }

  function fight(spot) {
    mode = 'fight';
    startFight(appRoot, run, spot.room, {
      onDone: (won) => {
        appRoot.innerHTML = '';
        if (!won) { mode = 'over'; run = createRun(); onDeath(); return; }
        spot.cleared = true;
        spot.billboard.vanish(1.2, () => { spot.shadow.visible = false; });
        mode = 'walk';
        play('shrine');
      },
    });
  }

  // the shrine room: the game's shrine, over the dimmed view
  function shrine(spot) {
    mode = 'shrine';
    document.exitPointerLock?.();
    player.state.vx = player.state.vz = 0;
    run.roomNumber = spot.number; // (boon prices follow the depth)
    const buffBar = createBuffBar();
    const render = () => renderShrineRoom(appRoot, run, spot.room, {
      title: ['The Shrine'], logEl: shrineLog, buffBar, coins: run.coins, xp: run.xp,
      onDeeper: () => { spot.cleared = true; appRoot.innerHTML = ''; mode = 'walk'; },
      onRetreat: () => { spot.cleared = true; mode = 'walk'; returnHome(); },
      refresh: render,
    });
    logLine(shrineLog, 'Candles gutter on an old altar.', 'move');
    render();
  }

  // Return (between fights): leave the dungeon with what was won
  function returnHome() {
    if (mode !== 'walk') return;
    mode = 'returned';
    document.exitPointerLock?.();
    const cleared = spots.filter((s) => s.cleared && s.kind !== 'shrine').length;
    appRoot.innerHTML = '';
    appRoot.append(el('div', { class: 'panel lab-return' },
      el('h1', {}, 'Back to the Great Hall'),
      el('div', { class: 'subtitle' }, `You climb out of depth ${depth} with ${run.hp}/${run.maxHp} HP.`),
      el('p', {}, `Rooms cleared: ${cleared} · Kills: ${run.kills} · Coins: ${run.coins} · XP: ${run.xp} · Potions left: ${run.potions}`),
      el('p', { class: 'lab-note' }, 'Dungeon Lab: nothing is banked — your save is untouched.'),
      el('div', { class: 'btn-row' },
        el('button', { class: 'primary active', key: 'g', proceed: true, onclick: () => { location.href = '?debug'; } }, 'To the Great Hall'),
        el('button', { key: 'd', onclick: () => { run = createRun(); onRestart(); } }, 'Descend Again'))));
  }

  function update(t, dt) {
    for (const s of spots) s.billboard?.update(camera, t, dt);
    const standing = spots.filter((s) => s.billboard && !s.cleared)
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
      if (spot) (spot.kind === 'shrine' ? shrine(spot) : begin(spot));
      else if (floor.stairs && c.x === floor.stairs.x && c.z === floor.stairs.z && spots.find((s) => s.kind === 'boss')?.cleared) {
        mode = 'descend';
        onDescend(); // (the lab walks the knight down and builds the next floor)
      }
    }
    if (mode === 'turning') {
      turn.t += dt;
      const k = Math.min(1, turn.t / TURN_SECS), e = k * k * (3 - 2 * k); // smoothstep
      player.state.yaw = turn.yaw0 + turn.dYaw * e;
      player.state.pitch = turn.pitch0 * (1 - e);
      player.update(0); // (places the camera; no movement at dt 0)
      if (k >= 1) fight(turn.spot);
    }
    // the dungeon dims behind a fight, the shrine, the way home
    const want = mode === 'walk' || mode === 'descend' ? 0 : 1;
    dim += (want - dim) * Math.min(1, dt * 4);
    paint.uniforms.dim.value = dim * cfg.paint.fightDim;
  }

  return {
    setFloor,
    update,
    returnHome,
    walking: () => mode === 'walk',
    get mode() { return mode; },
    get run() { return run; },
    get spots() { return spots; },
    cleared: () => new Set(spots.filter((s) => s.cleared).map((s) => `${s.x},${s.z}`)),
  };
}

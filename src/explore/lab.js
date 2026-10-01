// explore/lab.js — the Dungeon Lab (0.139): the 3D dungeon prototype, run on
// its own page (dungeon-lab/, opened from the ?debug column) while the look
// and feel are worked out. Loads assets/data/explore.json, generates a
// floor (mapgen.js, 0.140; ?seed=N picks one, N makes the next), builds
// it (build.js), walks it (player.js), paints it (post.js) and peoples it
// (encounterLayer.js, 0.141: the game's own fights, over the dimmed
// view; the boss's fall leads down a floor). The page shares the game's
// data, stylesheet, hotkeys and sound (its <base> is the site root). 0.148:
// the fights play over the game's painted rooms (backdrop.js), faded in
// over the dungeon. 0.150: the world itself (renderer, lights, paint pass,
// building a floor) is world.js, shared with the game's 3D corridors.

import { generateFloor } from './mapgen.js';
import { createPlayer } from './player.js';
import { createMinimap } from './minimap.js';
import { createEncounters } from './encounterLayer.js';
import { createBackdrop } from './backdrop.js';
import { createWorld } from './world.js';
import { el } from '../core/dom.js';
import { loadData, DATA } from '../shared/data.js';
import { initHotkeys } from '../core/hotkeys.js';
import { initMusic } from '../audio/music.js';
import { initSfx } from '../audio/sfx.js';

export async function startLab({ canvas, hud }) {
  await loadData();
  const cfg = await (await fetch('assets/data/explore.json', { cache: 'no-cache' })).json();
  initHotkeys(); initSfx(); initMusic();

  const q = new URLSearchParams(location.search), num = (k) => (Number.isInteger(Number(q.get(k))) && Number(q.get(k)) > 0 ? Number(q.get(k)) : null);
  const hold = q.has('hold');
  const world = createWorld({ canvas, cfg, hold }); // (0.150: world.js — renderer, lights, paint, the floor)
  const { renderer, scene, camera, paint, stairs } = world;

  const player = createPlayer(cfg, camera, canvas);
  const minimap = createMinimap(hud.minimap, cfg.gen.reveal);
  const backdrop = createBackdrop(cfg, hud.backdrop); // (0.148: the painted room behind a fight)
  const encounters = createEncounters({
    scene, camera, player, cfg, paint, backdrop, appRoot: hud.app, bossEvery: DATA.difficulty.bossEvery,
    onDescend: () => { descent = { t: 0, from: { x: player.state.x, z: player.state.z } }; },
    onDeath: () => newFloor(lab.floor.seed, 1),
    onRestart: () => newFloor(lab.floor.seed + 1, 1),
  });
  let descent = null; // { t, from } while walking down the stairs
  // Return (0.144): between fights, back to the Great Hall (R, or click)
  const returnBtn = el('button', { class: 'lab-return-btn', key: 'r', onclick: () => encounters.returnHome() }, 'Return to the Great Hall');
  document.body.append(returnBtn);

  // the floor: generate, build, put the knight at the start
  const lab = { renderer, scene, camera, player, cfg, encounters, backdrop, world, floor: null, depth: 1,
    get grid() { return world.grid; }, get level() { return world.level; }, get rooms() { return world.rooms; }, get tier() { return world.tier; } };
  function newFloor(seed, depth = lab.depth) {
    lab.depth = depth;
    lab.floor = generateFloor(seed, cfg.gen);
    world.build(lab.floor, depth);
    player.place(world.grid, lab.floor.start);
    minimap.setFloor(lab.floor, world.grid);
    encounters.setFloor(lab.floor, depth, world.rooms);
    try { history.replaceState(null, '', `dungeon-lab/?seed=${seed}&depth=${depth}`); } catch { /* (file://) */ }
  }
  newFloor(num('seed') ?? cfg.gen.seed, num('depth') ?? 1);

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
    const shown = walking && backdrop.level < 0.5; // (the map and the way home wait for the painting to go)
    returnBtn.classList.toggle('hidden', !shown || !!descent);
    hud.intro.classList.toggle('hidden', !shown || document.pointerLockElement === canvas);
    hud.minimap.classList.toggle('hidden', !shown || !mapOn);
    const c = player.cell();
    minimap.look(c.x, c.z);
    const torches = lab.level.torches;
    backdrop.update(dt);
    // (behind a painting the dungeon rests; fights are DOM: they don't count for the quality ladder)
    world.frame(t, dt, { render: !backdrop.covered(), tick: walking && backdrop.level === 0 });
    frames++; fpsT += dt;
    if (fpsT >= 0.5) {
      const r = encounters.run, left = encounters.spots.filter((sp) => !sp.cleared).length;
      hud.status.textContent = `${Math.round(frames / fpsT)} fps${world.quality.level() ? ` (quality -${world.quality.level()})` : ''} · depth ${lab.depth}: ${cfg.tiers[lab.tier].name} (floor ${lab.floor.seed}) · HP ${Math.max(0, r.hp)}/${r.maxHp} · potions ${r.potions} · ${left} left`;
      frames = 0; fpsT = 0;
    }
    if (walking && mapOn) minimap.draw(player, torches.filter((s) => !s.bakedOnly), cfg.cell, encounters.cleared());
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  lab.newFloor = newFloor;
  return lab; // (for tests and tinkering in the console)
}

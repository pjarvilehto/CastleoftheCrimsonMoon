// tools/test/explore.test.mjs — the 3D dungeon prototype (0.139, dungeon-lab/ +
// src/explore/). The three.js parts need a browser; here: the map and its
// collision (pure, grid.js), the data file, and the lab page's wiring.

import { ok, readFileSync, readdirSync, statSync } from './harness.mjs';
import { parseMap, isOpen, corridorAxis, collide, seeded, DIRS } from '../../src/explore/grid.js';
import { generateFloor } from '../../src/explore/mapgen.js';

const exists = (f) => { try { return statSync(f).isFile(); } catch { return false; } };

// T98: 0.139 — the map grid and collision
{
  const g = parseMap(['#####', '#S..#', '#.#.#', '#####']);
  ok('explore grid: size, start, open/wall cells, outside = wall', g.w === 5 && g.h === 4 && g.start.x === 1 && g.start.z === 1
    && isOpen(g, 2, 1) && !isOpen(g, 2, 2) && !isOpen(g, -1, 1) && !isOpen(g, 9, 1));
  const c = parseMap(['#######', '#.....#', '###.###', '###.###', '#######']);
  ok('explore grid: straight corridor pieces know their axis', corridorAxis(c, 2, 1) === 'ew' && corridorAxis(c, 3, 3) === null
    && corridorAxis(parseMap(['###', '#.#', '#.#', '#.#', '###']), 1, 2) === 'ns' && corridorAxis(c, 3, 1) === null);

  const r = 0.14;
  const hit = collide(g, 1.5, 1.05, r); // pushed into the north wall
  ok('collide: a wall stops the body one radius from its face', Math.abs(hit.z - (1 + r)) < 1e-9 && hit.x === 1.5, JSON.stringify(hit));
  const slide = collide(g, 2.2, 0.98, r); // moving diagonally into the wall keeps the along-wall part
  ok('collide: walking into a wall slides along it', Math.abs(slide.x - 2.2) < 1e-9 && Math.abs(slide.z - (1 + r)) < 1e-9);
  const free = collide(g, 2.5, 1.5, r);
  ok('collide: open floor is left alone', free.x === 2.5 && free.z === 1.5);
  const corner = collide(parseMap(['###', '#..', '#..']), 1.02, 1.02, r); // into an inner corner
  ok('collide: an inner corner holds the body off both walls', corner.x >= 1 + r - 1e-9 && corner.z >= 1 + r - 1e-9, JSON.stringify(corner));
  const pinch = parseMap(['####', '#.##', '##.#', '####']); // two cells touching only at a corner
  let px = 1.5, pz = 1.5;
  for (let i = 0; i < 100; i++) ({ x: px, z: pz } = collide(pinch, px + 0.02, pz + 0.02, r)); // walk at the pinch
  ok('collide: no squeezing through a diagonal pinch', Math.floor(px) === 1 && Math.floor(pz) === 1, `${px}, ${pz}`);
  // a long random walk through the real map never ends inside or too near a wall
  const cfg = JSON.parse(readFileSync('assets/data/explore.json', 'utf8'));
  const m = parseMap(generateFloor(cfg.gen.seed, cfg.gen).rows), rr = cfg.move.radius / cfg.cell, rnd = seeded(7);
  let x = m.start.x + 0.5, z = m.start.z + 0.5, bad = null;
  for (let i = 0; i < 20000 && !bad; i++) {
    const a = rnd() * Math.PI * 2, step = rnd() * 0.2; // up to 0.2 cells a frame (6 m/s at 10 fps)
    ({ x, z } = collide(m, x + Math.cos(a) * step, z + Math.sin(a) * step, rr));
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const gx = Math.floor(x) + dx, gz = Math.floor(z) + dz;
      if (isOpen(m, gx, gz)) continue;
      const nx = Math.max(gx, Math.min(x, gx + 1)), nz = Math.max(gz, Math.min(z, gz + 1));
      if (Math.hypot(x - nx, z - nz) < rr - 1e-6) bad = { i, x, z, gx, gz };
    }
  }
  ok('collide: 20000 random steps through a generated floor never enter a wall', !bad, JSON.stringify(bad));
  const s1 = seeded(1307), s2 = seeded(1307);
  ok('seeded random repeats and stays in [0, 1)', [...Array(50)].every(() => { const v = s1(); return v === s2() && v >= 0 && v < 1; }));
}

// T99: 0.139 — explore.json and the lab page; 0.140 — the floor generator
{
  const cfg = JSON.parse(readFileSync('assets/data/explore.json', 'utf8'));
  // every floor of 120 seeds: walled in, connected, its rooms and parts in order
  const reach = (g, from) => {
    const d = new Map([[`${from.x},${from.z}`, 0]]), todo = [from];
    for (let i = 0; i < todo.length; i++) {
      const { x, z } = todo[i];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${z + dz}`;
        if (isOpen(g, x + dx, z + dz) && !d.has(k)) { d.set(k, d.get(`${x},${z}`) + 1); todo.push({ x: x + dx, z: z + dz }); }
      }
    }
    return d;
  };
  const bad = [];
  for (let seed = 1; seed <= 120 && bad.length < 3; seed++) {
    const f = generateFloor(seed, cfg.gen), g = parseMap(f.rows), why = [];
    const border = [...Array(g.w).keys()].every((x) => !isOpen(g, x, 0) && !isOpen(g, x, g.h - 1))
      && [...Array(g.h).keys()].every((z) => !isOpen(g, 0, z) && !isOpen(g, g.w - 1, z));
    if (!border || g.w !== cfg.gen.width || g.h !== cfg.gen.height || !f.rows.every((r) => r.length === g.w)) why.push('shape');
    const d = reach(g, f.start);
    if (d.size !== g.open.reduce((n, v) => n + v, 0)) why.push('unreachable cells');
    const count = (c) => f.rows.join('').split(c).length - 1;
    if (count('S') !== 1 || count('B') !== 1 || count('H') !== 1 || count('E') !== cfg.gen.encounters || f.encounters.length !== cfg.gen.encounters) why.push('marks');
    const dist = (p) => d.get(`${p.x},${p.z}`);
    if (![...f.encounters, f.shrine].every((p) => dist(p) < dist(f.boss))) why.push('boss not deepest');
    if (f.boss.room.w !== cfg.gen.bossSize || f.boss.room.h !== cfg.gen.bossSize) why.push('boss room');
    const [dx, dz] = DIRS[f.start.facing];
    if (!isOpen(g, f.start.x + dx, f.start.z + dz)) why.push('facing a wall');
    if (why.length) bad.push(`seed ${seed}: ${why.join(', ')}`);
  }
  ok('floor generator: 120 seeds — walled in, all connected, one start / shrine / boss, every encounter, the boss deepest', bad.length === 0, bad.join('; '));
  const a = generateFloor(42, cfg.gen), b = generateFloor(42, cfg.gen), c = generateFloor(43, cfg.gen);
  ok('floor generator: the same seed, the same floor; the next seed, another', a.rows.join() === b.rows.join() && a.rows.join() !== c.rows.join());
  const spurs = (f) => { const g = parseMap(f.rows); let n = 0; for (let z = 0; z < g.h; z++) for (let x = 0; x < g.w; x++) if (isOpen(g, x, z) && Object.values(DIRS).filter(([dx, dz]) => isOpen(g, x + dx, z + dz)).length === 1) n++; return n; };
  ok('floor generator: floors have dead ends to poke into', [1, 2, 3, 4, 5].every((s) => spurs(generateFloor(s, cfg.gen)) >= 2));
  const nums = ['cell', 'wallHeight', 'eyeHeight', 'move.speed', 'move.runMult', 'move.accel', 'move.turnSpeed', 'move.mouseSens',
    'move.pitchLimit', 'move.radius', 'move.bobAmp', 'move.bobStride', 'light.party.intensity', 'light.party.distance', 'light.party.decay',
    'light.torch.intensity', 'light.torch.distance', 'light.torch.decay', 'light.torch.height', 'light.pool', 'light.flicker',
    'light.ambient.intensity', 'fog.density', 'render.maxPixelRatio', 'render.samples', 'render.exposure', 'paint.edge', 'paint.edgeWidth',
    'paint.bands', 'paint.bandMix', 'paint.desat', 'paint.inkBelow', 'paint.grain', 'paint.vignette', 'decor.beamEvery', 'decor.torchSpacing', 'decor.seed',
    ...['width', 'height', 'rooms', 'roomMin', 'roomMax', 'bossSize', 'roomGap', 'encounters', 'loops', 'deadEnds', 'deadEndMax', 'seed', 'reveal'].map((k) => `gen.${k}`)];
  const colors = ['light.party.color', 'light.torch.color', 'light.ambient.sky', 'light.ambient.ground', 'fog.color', 'paint.shadow', 'paint.highlight', 'paint.ink'];
  const at = (path) => path.split('.').reduce((o, k) => o?.[k], cfg);
  const missing = [...nums.filter((n) => !Number.isFinite(at(n))), ...colors.filter((c) => !/^#[0-9a-f]{6}$/i.test(at(c) ?? ''))];
  ok('explore.json: every tuning number and colour the lab reads is there', missing.length === 0, missing.join(', '));
  ok('explore.json: the body fits a cell, the eye under the ceiling', cfg.move.radius * 2 < cfg.cell && cfg.eyeHeight < cfg.wallHeight);

  const page = readFileSync('dungeon-lab/index.html', 'utf8');
  const mods = [...page.matchAll(/'\.\.\/(src\/explore\/\w+\.js)'/g)].map((m) => m[1]);
  const vendor = page.match(/\.\.\/(vendor\/three-[\d.]+\/three\.module\.min\.js)/)?.[1];
  const core = vendor && readFileSync(vendor, 'utf8').match(/from\s*["']\.\/(three\.core\.min\.js)["']/)?.[1];
  ok('dungeon lab: every module it maps exists, three.js is vendored with its licence', mods.length >= 8 && mods.every(exists)
    && readdirSync('src/explore').every((f) => mods.includes(`src/explore/${f}`))
    && !!vendor && exists(vendor) && !!core && exists(vendor.replace('three.module.min.js', core)) && exists(vendor.replace('three.module.min.js', 'LICENSE')),
    `${mods.join(', ')} | ${vendor} | ${core}`);
  ok('dungeon lab: versioned module loads, not indexed, a way back to the game', page.includes("'?v=' + encodeURIComponent(version)")
    && page.includes('name="robots" content="noindex"') && page.includes('href="../?debug"'));
  ok('DUNGEON LAB is a ?debug corner button', readFileSync('src/ui/debugToggles.js', 'utf8').includes("'dungeon-lab/'"));
}

// tools/test/explore.test.mjs — the 3D dungeon prototype (0.139, dungeon-lab/ +
// src/explore/). The three.js parts need a browser; here: the map and its
// collision (pure, grid.js), the data file, and the lab page's wiring.

import { ok, sleep, fresh, El, DATA, createRun, readFileSync, readdirSync, statSync } from './harness.mjs';
import { parseMap, isOpen, corridorAxis, collide, seeded, DIRS } from '../../src/explore/grid.js';
import { generateFloor } from '../../src/explore/mapgen.js';
import { planFloor, roomFor, leaderOf, inRect } from '../../src/explore/encounters.js';
import { startFight } from '../../src/explore/fight.js';
import { themeRooms } from '../../src/explore/themes.js';

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
  const tips = [...Array(20).keys()].map((i) => spurs(generateFloor(i + 1, cfg.gen)) - 1); // (the stairs are a dead end too)
  ok('floor generator: a dead end or so to poke into (up to deadEnds a floor)', tips.reduce((a, b) => a + b, 0) >= 8 && tips.every((n) => n >= 0 && n <= cfg.gen.deadEnds), tips.join(' '));
  // 0.144: past the boss, the stairs — one cell, a dead end, the deepest point
  const st = [];
  for (let seed = 1; seed <= 60; seed++) {
    const f = generateFloor(seed, cfg.gen), g = parseMap(f.rows), d = reach(g, f.start), at = (p) => d.get(`${p.x},${p.z}`);
    const ways = Object.values(DIRS).filter(([dx, dz]) => isOpen(g, f.stairs.x + dx, f.stairs.z + dz));
    const [dx, dz] = f.stairs.down;
    if (f.rows[f.stairs.z][f.stairs.x] !== 'X' || ways.length !== 1 || ways[0][0] !== -dx || ways[0][1] !== -dz
      || !(at(f.stairs) > at(f.boss)) || f.rooms.some((r) => inRect(r, f.stairs.x, f.stairs.z))) st.push(`seed ${seed}`);
  }
  ok('floor generator: the stairs lie past the boss — one cell, one way in, going down away from it', st.length === 0, st.join(', '));
  // 0.143: linear — the rooms come in walking order, each a step deeper
  // than the last, and the floor is about half the 0.140 size
  const lin = [];
  for (let seed = 1; seed <= 60; seed++) {
    const f = generateFloor(seed, cfg.gen), g = parseMap(f.rows), d = reach(g, f.start);
    const marks = [['S', f.start], ...f.encounters.map((e) => ['E', e]), ['H', f.shrine], ['B', f.boss]]
      .map(([c, p]) => [c, d.get(`${p.x},${p.z}`)]).sort((a, b) => a[1] - b[1]);
    const seq = marks.map((m) => m[0]).join(''), half = Math.ceil(cfg.gen.encounters / 2);
    const encDs = f.encounters.map((p) => d.get(`${p.x},${p.z}`));
    if (seq !== `S${'E'.repeat(half)}H${'E'.repeat(cfg.gen.encounters - half)}B` || !encDs.every((v, i) => i === 0 || v > encDs[i - 1])) lin.push(`seed ${seed}: ${seq}`);
  }
  ok('floor generator: one chain — start, encounters, shrine halfway, more encounters, boss, each deeper than the last', lin.length === 0, lin.slice(0, 3).join('; '));
  ok('floor generator: about half the area of the first generator (33 x 29)', cfg.gen.width * cfg.gen.height <= 0.6 * 33 * 29);
  const nums = ['cell', 'wallHeight', 'eyeHeight', 'move.speed', 'move.runMult', 'move.accel', 'move.turnSpeed', 'move.mouseSens',
    'move.pitchLimit', 'move.radius', 'move.bobAmp', 'move.bobStride', 'light.party.intensity', 'light.party.distance', 'light.party.decay',
    'light.torch.intensity', 'light.torch.distance', 'light.torch.decay', 'light.torch.height', 'light.pool', 'light.flicker',
    'light.ambient.intensity', 'fog.density', 'render.maxPixelRatio', 'render.samples', 'render.exposure', 'paint.edge', 'paint.edgeWidth',
    'paint.bands', 'paint.bandMix', 'paint.desat', 'paint.inkBelow', 'paint.grain', 'paint.vignette', 'decor.beamEvery', 'decor.torchSpacing', 'decor.seed',
    ...['width', 'height', 'roomMin', 'roomMax', 'bossSize', 'roomGap', 'linkMin', 'linkMax', 'straightness', 'encounters', 'deadEnds', 'deadEndMax', 'seed', 'reveal'].map((k) => `gen.${k}`)];
  const colors = ['light.party.color', 'light.torch.color', 'light.ambient.sky', 'light.ambient.ground', 'fog.color', 'paint.shadow', 'paint.highlight', 'paint.ink'];
  const at = (path) => path.split('.').reduce((o, k) => o?.[k], cfg);
  const missing = [...nums.filter((n) => !Number.isFinite(at(n))), ...colors.filter((c) => !/^#[0-9a-f]{6}$/i.test(at(c) ?? ''))];
  ok('explore.json: every tuning number and colour the lab reads is there', missing.length === 0, missing.join(', '));
  ok('explore.json: the body fits a cell, the eye under the ceiling', cfg.move.radius * 2 < cfg.cell && cfg.eyeHeight < cfg.wallHeight);

  const page = readFileSync('dungeon-lab/index.html', 'utf8');
  const build = JSON.parse(readFileSync('assets/data/build.json', 'utf8'));
  const vendor = page.match(/'(vendor\/three-[\d.]+\/three\.module\.min\.js)'/)?.[1];
  const core = vendor && readFileSync(vendor, 'utf8').match(/from\s*["']\.\/(three\.core\.min\.js)["']/)?.[1];
  ok('dungeon lab: three.js is vendored with its licence; every lab module is in the build list', !!vendor && exists(vendor) && !!core
    && exists(vendor.replace('three.module.min.js', core)) && exists(vendor.replace('three.module.min.js', 'LICENSE'))
    && readdirSync('src/explore').every((f) => build.modules.includes(`src/explore/${f}`)), `${vendor} | ${core}`);
  ok('dungeon lab: the site root as base, every module versioned from build.json, the game stylesheet, not indexed, a way back',
    page.includes('<base href="../">') && page.includes('boot(b.version, b.modules)') && page.includes("'?v=' + encodeURIComponent(version)")
    && page.includes("'styles.css' + q") && page.includes('name="robots" content="noindex"') && page.includes('href="?debug"') && page.includes('<main id="app">'));
  ok('DUNGEON LAB is a ?debug corner button', readFileSync('src/ui/debugToggles.js', 'utf8').includes("'dungeon-lab/'"));
  const sizes = cfg.billboard.sizes;
  ok('explore.json: every enemy has a billboard size', Object.keys(DATA.enemies).every((id) => sizes[id]?.height > 0) && sizes.default.height > 0
    && ['tear', 'shadow', 'glow', 'bossScale'].every((k) => Number.isFinite(cfg.billboard[k]))
    && ['intensity', 'distance', 'decay', 'height', 'ahead', 'pool'].every((k) => Number.isFinite(cfg.light.lair[k])) && Number.isFinite(cfg.paint.fightDim));
}

// T100: 0.141 — a floor's encounters are the game's rooms, and a fight
// over the dungeon view hands back to it
{
  fresh();
  const cfg = JSON.parse(readFileSync('assets/data/explore.json', 'utf8'));
  const every = DATA.difficulty.bossEvery;
  ok('a floor holds one boss stretch: encounters + the boss = bossEvery rooms', cfg.gen.encounters === every - 1);
  const f = generateFloor(5, cfg.gen);
  const p1 = planFloor(f, 1, every), p3 = planFloor(f, 3, every);
  ok('encounters: depth 1 = rooms 1..7 nearest first, the shrine priced as room 5, the boss room 8; depth 3 = rooms 17..24',
    p1.map((s) => s.number).join() === '1,2,3,4,5,6,7,5,8' && p1.at(-1).kind === 'boss' && p1[0].kind === 'fight' && p1.at(-2).kind === 'shrine'
    && p3[0].number === 17 && p3.at(-1).number === 24
    && p1.every((s) => inRect(s.rect, s.x, s.z)));
  const r1 = roomFor(p1[0]), rb = roomFor(p1.at(-1)), rs = roomFor(p1.at(-2));
  ok('the shrine spot is a game shrine room', rs.kind === 'shrine' && rs.enemies.length === 0);
  ok('encounter rooms come from the game (combat at their depth, the boss room a boss)', r1.kind === 'combat' && r1.number === 1 && r1.enemies.length > 0
    && rb.isBoss && rb.enemies[0].id === 'vampire_lord' && leaderOf(rb).id === 'vampire_lord'
    && leaderOf(r1).maxHp === Math.max(...r1.enemies.map((e) => e.maxHp)));

  // a fight played out on the DOM shim: attack until it ends, then Onward
  const root = new El('main'), run = createRun();
  run.stats.dmg = 100000;
  let done = null;
  startFight(root, run, roomFor(p1[0]), { onDone: (won) => { done = won; } });
  const btn = (re) => root.all((e) => e.tagName === 'button' && re.test(e.textContent) && e.attrs.disabled === undefined)[0];
  for (let i = 0; i < 40 && done === null; i++) {
    const proceed = btn(/^(Onward|Rise Again)/);
    if (proceed) { proceed.click(); break; }
    btn(/^Attack$/)?.click();
    await sleep(3000);
  }
  ok('fight: the knight clears the room, Onward hands back (a win), the run keeps its spoils', done === true && run.kills > 0 && run.coins > 0, String(done));
}

// T101: 0.141 — the lab plays with a copy of the knight: nothing in
// src/explore may settle a run, save the profile or send play stats
{
  const src = readdirSync('src/explore').map((f) => readFileSync(`src/explore/${f}`, 'utf8')).join('\n');
  const game = readdirSync('src', { recursive: true }).filter((f) => String(f).endsWith('.js') && !String(f).startsWith('explore'))
    .map((f) => readFileSync(`src/${f}`, 'utf8')).join('\n');
  ok('the Dungeon Lab never touches the save or the play stats; the game never imports it',
    !/settleRun|saveProfile|shareStats|recordBenchmark|markVictorySeen|storage\.js|telemetry\.js/.test(src) && !/from '[./]*explore\//.test(game));
}

// T102: 0.142 — the look pass: pillars block the way, and every new knob
// (room height, props, mist, the depth tiers' palettes) is in explore.json
{
  const g = parseMap(['#####', '#...#', '#...#', '#...#', '#####']);
  g.posts = [{ x: 2.5, z: 2.5, r: 0.2 }];
  const p = collide(g, 2.55, 2.5, 0.14);
  ok('collide: a pillar (post) holds the body off by both radii', Math.abs(Math.hypot(p.x - 2.5, p.z - 2.5) - 0.34) < 1e-9, JSON.stringify(p));
  let x = 1.5, z = 2.5;
  for (let i = 0; i < 60; i++) ({ x, z } = collide(g, x + 0.03, z, 0.14)); // walk east into it
  ok('collide: walking into a pillar stops short of it (or slides round it)', Math.hypot(x - 2.5, z - 2.5) >= 0.34 - 1e-9);

  const cfg = JSON.parse(readFileSync('assets/data/explore.json', 'utf8'));
  const hex = (v) => /^#[0-9a-f]{6}$/i.test(v ?? '');
  const nums = [...['haloSize', 'haloOpacity', 'rubble', 'puddles', 'chainsPerRoom', 'altarLight'].map((k) => cfg.decor[k]),
    ...['perCell', 'size', 'height', 'opacity', 'drift'].map((k) => cfg.mist[k])];
  const tierBad = cfg.tiers.flatMap((t, i) => {
    const P = t.palette, bad = [];
    if (!t.name || !['fog', 'sky', 'ground', 'mist', 'shadow'].every((k) => hex(t[k]))) bad.push(`tier ${i} colours`);
    if (!['stone', 'floor', 'ceiling'].every((k) => Array.isArray(P[k]) && P[k].length === 6 && P[k].every(Number.isFinite))) bad.push(`tier ${i} tones`);
    if (!(P.growth === null || (P.growth.length === 2 && P.growth.every(Number.isFinite))) || !hex(P.dark) || !hex(P.water)) bad.push(`tier ${i} palette`);
    return bad;
  });
  const stairNums = ['depth', 'steps', 'light', 'lightDistance', 'pulse', 'glowSize', 'glowOpacity', 'walkSecs'].map((k) => cfg.stairs[k]);
  ok('explore.json: props, mist, stairs and a palette (and stair glow) per depth tier', nums.every(Number.isFinite)
    && stairNums.every(Number.isFinite) && cfg.stairs.depth < cfg.wallHeight + 0.5 && cfg.tiers.every((t) => hex(t.glow))
    && cfg.tiers.length >= 3 && tierBad.length === 0, tierBad.join(', '));
}

// T103: 0.145 / 0.146 — light and themed rooms: every room has a theme
// (start, shrine and boss their own), furniture only off the way through
// (centre row and column, and every cell a corridor runs through), and
// every knob the lighting, the rooms and the corridors read is there
{
  const cfg = JSON.parse(readFileSync('assets/data/explore.json', 'utf8'));
  const g = parseMap(['#######', '#.....#', '#.....#', '#######']);
  g.boxes = [{ x0: 2, z0: 1, x1: 3, z1: 2 }];
  let x = 1.5, z = 1.5;
  for (let i = 0; i < 40; i++) ({ x, z } = collide(g, x + 0.05, z, 0.14));
  ok('collide: furniture (boxes) stops the body one radius off', Math.abs(x - (2 - 0.14)) < 1e-9, String(x));
  const bad = [], seen = new Set();
  for (let seed = 1; seed <= 40; seed++) for (let depth = 1; depth <= 3; depth++) {
    const f = generateFloor(seed, cfg.gen), rooms = themeRooms(f, depth, cfg, seeded(seed * 7 + depth)), trail = new Set(f.trail);
    rooms.forEach((r) => seen.add(r.theme));
    const at = (p) => rooms.find((r) => inRect(r, p.x, p.z));
    if (rooms[0].theme !== 'antechamber' || at(f.shrine).theme !== 'sanctum' || at(f.boss).theme !== 'throne') bad.push(`seed ${seed}/${depth}: fixed themes`);
    for (const r of rooms) {
      const T = cfg.themes[r.theme];
      if (!T || r.height !== T.height || r.doors.length < 1) bad.push(`seed ${seed}/${depth}: ${r.theme} shape`);
      if (r.free.some((c) => c.x === r.centre.x || c.z === r.centre.z || trail.has(`${c.x},${c.z}`))) bad.push(`seed ${seed}/${depth}: ${r.theme} furniture on the way`);
      if (r.walls.some((w) => !inRect(r, w.x, w.z))) bad.push(`seed ${seed}/${depth}: wall face outside`);
    }
    if (!f.trail.includes(`${f.boss.x},${f.boss.z}`) || !f.encounters.every((e) => trail.has(`${e.x},${e.z}`))) bad.push(`seed ${seed}/${depth}: trail misses a room`);
  }
  ok('themed rooms: start / shrine / boss themed, furniture never on the way through, every room a doorway', bad.length === 0, bad.slice(0, 4).join('; '));
  ok('themed rooms: across 40 floors every theme turns up', Object.keys(cfg.themes).every((t) => seen.has(t)), [...seen].join(','));
  const themeBad = Object.entries(cfg.themes).filter(([, t]) => !(t.height >= cfg.wallHeight) || (t.vault && !(t.rise > 0))).map(([n]) => n);
  const weightBad = cfg.tiers.filter((t) => !Object.keys(t.themes).length || Object.keys(t.themes).some((n) => !cfg.themes[n] || ['antechamber', 'sanctum', 'throne'].includes(n)));
  const knobs = [...Object.values(cfg.sources), ...Object.values(cfg.corridor), ...Object.values(cfg.quality), cfg.shadows.count, cfg.shadows.mapSize, cfg.shadows.bias, cfg.shadows.everyFrames, cfg.paint.haze, cfg.paint.hazeReach];
  ok('explore.json: themes (heights, vaults), tier theme weights, light sources, corridor chances, shadows, haze, quality ladder', themeBad.length === 0 && weightBad.length === 0
    && knobs.every(Number.isFinite) && cfg.shadows.count <= cfg.light.pool, themeBad.join(','));
}

// T104: 0.146 — every light lights from afar: the baked light field's
// knobs, the pool's distance fade, and each room theme's bounce fill
{
  const cfg = JSON.parse(readFileSync('assets/data/explore.json', 'utf8'));
  const F = cfg.field, D = F.dynamic;
  ok('explore.json: the light field (texels, height, reach, strength) and the near lights\' fade (near < far, share, swap, ramp)',
    [F.texelsPerCell, F.height, F.reach, F.soften, F.strength, D.near, D.far, D.share, D.swap, D.rampSecs].every(Number.isFinite)
    && D.near < D.far && D.swap > 0 && D.swap < 1 && F.texelsPerCell >= 2);
  ok('every room theme has a bounce fill', Object.values(cfg.themes).every((t) => t.fill > 0));
  const lab = readFileSync('src/explore/lab.js', 'utf8'), layer = readFileSync('src/explore/encounterLayer.js', 'utf8');
  ok('the lab bakes the field for each floor and every lit surface reads it (the enemies too)',
    /bakeLightField\(lab\.grid, lab\.level\.torches, cfg\)/.test(lab) && lab.includes('patchAll(lab.level.group)') && layer.includes('patchMaterial(billboard.mesh.material)'));
}

// tools/test/backgrounds.test.mjs — 3D backgrounds: depth maps, tuning sliders, camera math.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, sleep, t, fresh, registry, El, DATA, show, handleKey, setBackground, transitionTo, createRun, generateRoom,
  scaleEnemy, createCombat, playerAttack, shrineOffers, canAffordOffer, acceptOffer, dungeonScene, hubScene, titleScene,
  resetProfile, getProfile, loadData, readFileSync, readdirSync, statSync } from './harness.mjs';

fresh();

// T45: 0.083 — 3D backgrounds: every background ships a depth map; the
// camera starts at the rest pose (= the flat CSS image); the overscan
// skirt covers the screen at the sway extremes for every depth and common
// aspect ratios (no black edges); the math mirrors CSS "cover".
{
  const bg3d = await import('../../src/core/bg3d.js');
  const b = DATA.backgrounds;
  const all = [...new Set([b.title, b.hub, b.boss, b.death, b.shrine, ...b.rooms])];
  const missing = all.filter((f) => { try { return !statSync(bg3d.depthUrl(f)).isFile(); } catch { return true; } });
  ok('every background has a depth map', missing.length === 0, missing.join(','));
  const png = readFileSync(bg3d.depthUrl(b.title));
  ok('depth maps are 8-bit grayscale PNGs', png.readUInt32BE(16) === 512 && png[24] === 8 && png[25] === 0);
  // Staged preload (0.098): boot = what the title + hub paint; the rest
  // (rooms, boss/shrine/death, portraits) loads after the title shows.
  const pre = await import('../../src/shared/preload.js');
  const { depthUrl } = await import('../../src/core/bg3d.js');
  const bgs = [...new Set([DATA.backgrounds.title, DATA.backgrounds.hub, DATA.backgrounds.boss, DATA.backgrounds.death, DATA.backgrounds.shrine, ...DATA.backgrounds.rooms])];
  const boot = pre.bootUrls(), later = pre.restUrls(), staged = new Set([...boot, ...later]);
  ok('boot preloads only the title + hub art (and their depth maps)', boot.length <= 4 && boot.includes(`assets/bg/${DATA.backgrounds.title}`) && boot.includes(depthUrl(DATA.backgrounds.hub)));
  ok('boot + background stage cover every background, depth map and portrait',
    bgs.every((f) => staged.has(`assets/bg/${f}`) && staged.has(depthUrl(f))) && ["player", ...Object.keys(DATA.enemies)].every((id) => staged.has(`assets/chars/${id}.webp`))
    && boot.every((u) => !later.includes(u)));
  await pre.preloadRest();
  const rp = pre.restProgress();
  ok('background stage completes and reports progress', rp.ready && rp.done === rp.total && rp.total === later.length);

  const cs = (w, h) => bg3d.coverScale(w, h, 2048, 1152).map((x) => Math.round(x * 1000) / 1000).join(',');
  ok('cover mapping matches CSS cover', cs(1920, 1080) === '1,1' && cs(1024, 768) === '0.75,1' && cs(2560, 1080) === '1,0.75');
  const o0 = bg3d.orbit(0, bg3d.tuning(''));
  ok('sway starts at the rest pose', o0.yaw === 0 && o0.pitch === 0);
  const d = { w: 2, h: 2, data: new Uint8Array([0, 255, 255, 255]) };
  ok('bilinear depth sampling', bg3d.sampleDepth(d, 0, 0) === 0 && bg3d.sampleDepth(d, 1, 1) === 1
    && Math.abs(bg3d.sampleDepth(d, 0.5, 0.5) - 0.75) < 1e-9 && bg3d.sampleDepth(d, -3, 9) === 1);

  // Shader mirror + coverage math live in core/bg3dMath.js (one copy).
  const bm = await import('../../src/core/bg3dMath.js');
  const cfg = bg3d.tuning('');
  const fov = (cfg.fovDeg * Math.PI) / 180;
  const [rx, ry] = bm.projectVertex(bm.mvp(0, 0, fov, 16 / 9), 0.25, 0.75, 0.9, 16 / 9, cfg);
  ok('rest pose: depth does not move pixels', Math.abs(rx - -0.5) < 1e-6 && Math.abs(ry - -0.5) < 1e-6);
  const worst = Math.min(...[4 / 3, 16 / 9, 21 / 9].map((a) => bm.edgeMargin(cfg, a, cfg.overscan)));
  ok('overscan skirt covers the screen at sway extremes', worst > 0, `worst margin ${worst.toFixed(4)} NDC`);
  ok('coverage check detects a too-small skirt', bm.edgeMargin(cfg, 16 / 9, 0) < 0);

  const main = readFileSync('src/main.js', 'utf8');
  ok('bg debug toggles only under ?debug', main.includes('...(debugMode ? bgDebugToggles() : [])')
    && main.includes("'HIDE FOREGROUND: OFF'") && main.includes("['3d', 'flat', 'depth']"));
  const body = globalThis.document.body;
  globalThis.document.body = { classList: { contains: (c) => c === 'fg-hidden' } };
  let clicked = 0;
  const { el: mkEl } = await import('../../src/core/scene.js');
  const btn = mkEl('button', { key: 'q', onclick: () => clicked++ }, 'Q');
  registry.app.append(btn);
  ok('hotkeys off while the foreground is hidden', handleKey('q') === false && clicked === 0);
  globalThis.document.body = body;
  ok('hotkeys back when shown', handleKey('q') === true && clicked === 1);
  btn.remove();
  ok('3D backgrounds no-op without WebGL', bg3d.initBg3d() === false && bg3d.isBg3dActive() === false);
}

// T46: 0.084 — ?debug BG TUNING: live values override the data, Save keeps
// them in localStorage, Reset clears; the skirt grows automatically for
// whatever sway/depth the sliders allow (up to their maximums).
{
  const bg3d = await import('../../src/core/bg3d.js');
  const bm = await import('../../src/core/bg3dMath.js');
  const base = bg3d.tuning('');
  ok('tunables: depth, speed, sway x/y, focus', bg3d.TUNABLE.join(',') === 'depthScale,speed,yawDeg,pitchDeg,pivot'
    && base.speed === (DATA.backgrounds.parallax.speed ?? 1)); // shipped value comes from the data
  bg3d.setLiveTuning({ depthScale: 0.9, speed: 2 });
  ok('live values override the shipped ones', bg3d.tuning('').depthScale === 0.9 && bg3d.liveTuning().speed === 2
    && bg3d.tuning('').yawDeg === base.yawDeg);
  const json = bg3d.saveLiveTuning();
  const saved = JSON.parse(localStorage.getItem('castle-bg-tuning'));
  ok('save stores + returns the values', saved.depthScale === 0.9 && saved.speed === 2 && JSON.parse(json).pivot === base.pivot);
  bg3d.resetLiveTuning();
  ok('reset restores shipped values and clears storage', bg3d.tuning('').depthScale === base.depthScale && localStorage.getItem('castle-bg-tuning') === null);
  const extreme = { ...base, depthScale: 1.2, yawDeg: 5, pitchDeg: 3, pivot: 0 }; // the sliders' maximums
  ok('near-plane floor matches the shader', readFileSync('src/core/bg3dGL.js', 'utf8').includes('max(0.4, 1.0 + uDepthScale')
    && readFileSync('src/core/bg3dMath.js', 'utf8').includes('Math.max(0.4, 1 + c.depthScale'));
  const fov = (base.fovDeg * Math.PI) / 180;
  ok('no geometry behind the camera at max sliders', bm.projectVertex(bm.mvp(0, 0, fov, 16 / 9), 0.5, 0.5, 1, 16 / 9, extreme).every(Number.isFinite));
  const cover = Math.min(...[4 / 3, 16 / 9, 21 / 9].map((a) => bm.edgeMargin(extreme, a, bm.requiredOverscan(extreme, a))));
  ok('auto skirt covers the screen at max slider settings', cover > 0, cover.toFixed(4));
  const tuner = readFileSync('src/ui/bgTuner.js', 'utf8');
  ok('tuner: 5 sliders + Save Depth Settings + Reset', (tuner.match(/^\s+\['\w+', '[\w ]+', /gm) || []).length === 5
    && tuner.includes("'Save Depth Settings'") && tuner.includes("'Reset'") && tuner.includes('navigator.clipboard.writeText'));
  ok('tuner only under ?debug', readFileSync('src/main.js', 'utf8').includes('bgTunerToggle()]'));
  ok('clip-enemies experiment fully removed (0.090)', !readFileSync('src/main.js', 'utf8').includes('clip')
    && !readFileSync('styles.css', 'utf8').includes('clip-enemies'));
}

// T52: 0.090 — Feast Hall depth fix (grounded map under a new filename),
// denser mesh, clip experiment gone; Great Hall spend hints + potion glow;
// randomized particle origins.
{
  const bg3d = await import('../../src/core/bg3d.js');
  ok('feast hall uses the regenerated depth map', bg3d.depthUrl('castle_great_hall.jpg') === 'assets/bg/depth/castle_great_hall_v2.png'
    && bg3d.depthUrl('castle_library.jpg') === 'assets/bg/depth/castle_library.png');
  ok('mesh dense enough for thin objects (256x144, under the 16-bit index limit)', bg3d.tuning('').grid.join('x') === '256x144' && 257 * 145 < 65536);
  ok('generator has the grounding pass', readFileSync('tools/gen-depth.py', 'utf8').includes('def ground(') && readFileSync('tools/gen-depth.py', 'utf8').includes('--ground'));
  const hub = await import('../../src/ui/scenes/hubScene.js');
  resetProfile();
  const p = getProfile();
  p.xp = 0; p.coins = 0;
  ok('nothing to spend: no green', !hub.canSpendXp(p) && !hub.canSpendCoins(p));
  p.xp = 1000; p.coins = DATA.difficulty.potions.price;
  ok('XP/coins green when something is affordable', hub.canSpendXp(p) && hub.canSpendCoins(p));
  ok('potion glow below 30% of the satchel', hub.potionsLow({ potions: 1, potionCap: 4 }) && !hub.potionsLow({ potions: 2, potionCap: 4 })
    && hub.potionsLow({ potions: 2, potionCap: 8 }) && !hub.potionsLow({ potions: 3, potionCap: 8 }));
  p.potions = 1; p.potionCap = 4;
  const root = new El('main');
  hub.hubScene().enter(root);
  const buy = root.all((n) => n.tagName === 'button' && n.attrs['data-key'] === 'u')[0];
  ok('Buy Potion glows when low and affordable', buy && /\bactive\b/.test(buy.className));
  ok('particle bursts start at a random point on the figure', readFileSync('src/ui/fxParts.js', 'utf8').includes('r.width * (0.5 + (Math.random() - 0.5) * 0.5)')
    && readFileSync('src/ui/particles.js', 'utf8').includes('x: x + (r() - 0.5) * 36 * u'));
}

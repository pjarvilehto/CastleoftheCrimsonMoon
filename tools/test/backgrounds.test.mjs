// tools/test/backgrounds.test.mjs — 3D backgrounds: depth maps, tuning sliders, camera math.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, t, sleep, fresh, registry, El, DATA, handleKey, generateRoom, hubScene, resetProfile, getProfile, readFileSync, statSync } from './harness.mjs';

fresh();

// T45: 0.083 — 3D backgrounds: every background ships a depth map; the
// camera starts at the rest pose (= the flat CSS image); the overscan
// skirt covers the screen at the sway extremes for every depth and common
// aspect ratios (no black edges); the math mirrors CSS "cover".
{
  const bg3d = await import('../../src/core/bg3d.js');
  const bm = await import('../../src/core/bg3dMath.js');
  const b = DATA.backgrounds;
  const all = [...new Set([b.title, b.hub, ...b.bosses, b.death, b.shrine, ...b.rooms, ...b.treasure])];
  const missing = all.filter((f) => { try { return !statSync(bg3d.depthUrl(f)).isFile(); } catch { return true; } });
  ok('every background has a depth map', missing.length === 0, missing.join(','));
  const odd = all.filter((f) => { const png = readFileSync(bg3d.depthUrl(f)); return ![512, 1024].includes(png.readUInt32BE(16)) || png[24] !== 8 || png[25] !== 0; });
  ok('every depth map is an 8-bit grayscale PNG, 512 or 1024 wide (0.00223: the title\'s alone was checked)', odd.length === 0, odd.join(','));
  // Staged preload (0.098): boot = what the title + hub paint; the rest
  // (rooms, boss/shrine/death, portraits) loads after the title shows.
  const pre = await import('../../src/shared/preload.js');
  const { depthUrl } = await import('../../src/core/bg3d.js');
  const bgs = [...new Set([DATA.backgrounds.title, DATA.backgrounds.hub, ...DATA.backgrounds.bosses, DATA.backgrounds.death, DATA.backgrounds.shrine, ...DATA.backgrounds.rooms, ...DATA.backgrounds.treasure])];
  const boot = pre.bootUrls(), later = pre.restUrls(), staged = new Set([...boot, ...later]);
  ok('boot preloads only the title + hub art (and their depth maps)', boot.length <= 4 && boot.includes(`assets/bg/${DATA.backgrounds.title}`) && boot.includes(depthUrl(DATA.backgrounds.hub)));
  ok('boot + background stage cover every background, depth map and portrait',
    bgs.every((f) => staged.has(`assets/bg/${f}`) && staged.has(depthUrl(f))) && ["player", ...Object.keys(DATA.enemies)].every((id) => staged.has((DATA.enemies[id] ?? DATA.cards.player).art && `assets/chars/${(DATA.enemies[id] ?? DATA.cards.player).art}`))
    && boot.every((u) => !later.includes(u)));
  await pre.preloadRest();
  const rp = pre.restProgress();
  // 0.153: Descend waits for the essentials only (boss / shrine / death art,
  // portraits) — the room paintings come after, and nobody waits for them
  const need = pre.essentialUrls(), roomArt = pre.roomUrls();
  ok('background stage completes and reports progress (over the essentials)', rp.ready && rp.done === rp.total && rp.total === need.length);
  ok('the stage waits for no room painting; the rooms load after the essentials',
    DATA.backgrounds.rooms.filter((f) => ![DATA.backgrounds.title, DATA.backgrounds.hub, DATA.backgrounds.death, DATA.backgrounds.shrine].includes(f)).every((f) => !need.includes(`assets/bg/${f}`) && roomArt.includes(`assets/bg/${f}`))
    && later.join() === [...need, ...pre.heroLaterUrls(), ...roomArt].join()); // (0.00248: the heroes' other looks sit between)

  const cs = (w, h) => bm.coverScale(w, h, 2048, 1152).map((x) => Math.round(x * 1000) / 1000).join(',');
  ok('cover mapping matches CSS cover', cs(1920, 1080) === '1,1' && cs(1024, 768) === '0.75,1' && cs(2560, 1080) === '1,0.75');
  const o0 = bm.orbit(0, bg3d.tuning(''));
  ok('sway starts at the rest pose', o0.yaw === 0 && o0.pitch === 0);
  const d = { w: 2, h: 2, data: new Uint8Array([0, 255, 255, 255]) };
  ok('bilinear depth sampling', bm.sampleDepth(d, 0, 0) === 0 && bm.sampleDepth(d, 1, 1) === 1
    && Math.abs(bm.sampleDepth(d, 0.5, 0.5) - 0.75) < 1e-9 && bm.sampleDepth(d, -3, 9) === 1);

  // Shader mirror + coverage math live in core/bg3dMath.js (one copy).
  const cfg = bg3d.tuning('');
  const fov = (cfg.fovDeg * Math.PI) / 180;
  const [rx, ry] = bm.projectVertex(bm.mvp(0, 0, fov, 16 / 9), 0.25, 0.75, 0.9, 16 / 9, cfg);
  ok('rest pose: depth does not move pixels', Math.abs(rx - -0.5) < 1e-6 && Math.abs(ry - -0.5) < 1e-6);
  const worst = Math.min(...[4 / 3, 16 / 9, 21 / 9].map((a) => bm.edgeMargin(cfg, a, cfg.overscan)));
  ok('overscan skirt covers the screen at sway extremes', worst > 0, `worst margin ${worst.toFixed(4)} NDC`);
  ok('coverage check detects a too-small skirt', bm.edgeMargin(cfg, 16 / 9, 0) < 0);

  const main = readFileSync('src/main.js', 'utf8');
  ok('bg debug toggles only under DEBUG MODE', main.includes('...dbg.items') && readFileSync('src/ui/debugToggles.js', 'utf8').includes("[menuHead('Debug tools'), invulnerableToggle(), ...debugToggles()]")
    && readFileSync('src/ui/debugToggles.js', 'utf8').includes("onOffToggle('HIDE FOREGROUND'") && readFileSync('src/ui/debugToggles.js', 'utf8').includes("['3d', 'flat', 'depth']"));
  const body = globalThis.document.body;
  globalThis.document.body = { classList: { contains: (c) => c === 'fg-hidden' } };
  let clicked = 0;
  const { el: mkEl } = await import('../../src/core/dom.js');
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
  ok('tunables: depth, speed, sway x/y, focus, fog, fog drift (0.101)', bg3d.TUNABLE.join(',') === 'depthScale,speed,yawDeg,pitchDeg,pivot,fogScale,fogSpeed'
    && base.speed === DATA.backgrounds.parallax.speed); // shipped value comes from the data
  bg3d.setLiveTuning({ depthScale: 0.9, speed: 2 });
  ok('live values override the shipped ones', bg3d.tuning('').depthScale === 0.9 && bg3d.liveTuning().speed === 2
    && bg3d.tuning('').yawDeg === base.yawDeg);
  const json = bg3d.saveLiveTuning();
  const saved = JSON.parse(localStorage.getItem('castle-bg-tuning'));
  ok('save stores + returns the values', saved.depthScale === 0.9 && saved.speed === 2 && JSON.parse(json).pivot === base.pivot);
  bg3d.resetLiveTuning();
  ok('reset restores shipped values and clears storage', bg3d.tuning('').depthScale === base.depthScale && localStorage.getItem('castle-bg-tuning') === null);
  const extreme = { ...base, depthScale: 1.2, yawDeg: 5, pitchDeg: 3, pivot: 0 }; // the sliders' maximums
  ok('near-plane floor matches the shader (and the fog puffs\' occlusion)', readFileSync('src/core/bg3dGL.js', 'utf8').includes('max(0.4, 1.0 + uDepthScale')
    && readFileSync('src/core/bg3dPuffGL.js', 'utf8').includes('max(0.4, 1.0 + uDepthScale * (uPivot - depth))')
    && readFileSync('src/core/bg3dMath.js', 'utf8').includes('Math.max(0.4, 1 + c.depthScale'));
  const fov = (base.fovDeg * Math.PI) / 180;
  ok('no geometry behind the camera at max sliders', bm.projectVertex(bm.mvp(0, 0, fov, 16 / 9), 0.5, 0.5, 1, 16 / 9, extreme).every(Number.isFinite));
  // the room push (0.171): a dolly moves the camera into the picture — a point off centre lands further out, near ones more than far ones
  const off = (dolly, depth) => bm.projectVertex(bm.mvp(0, 0, fov, 16 / 9, dolly), 0.25, 0.5, depth, 16 / 9, base)[0];
  const pushCfg = DATA.backgrounds.parallax.push;
  ok('a camera dolly pushes into the painting: things move outward, near things faster', off(pushCfg.dist, 0.5) < off(0, 0.5) && (off(0, 0.9) - off(pushCfg.dist, 0.9)) > (off(0, 0.1) - off(pushCfg.dist, 0.1))
    && pushCfg.dist > 0 && pushCfg.dist <= 0.3 && pushCfg.inMs > 0 && pushCfg.outMs > 0);
  const b3 = readFileSync('src/core/bg3d.js', 'utf8'), cssP = readFileSync('styles.css', 'utf8');
  // the scene side, run (0.00223: it was asserted on source text): the transition tells the renderer as the windows start to fade, the flat layer takes the push
  const { onTransition, setBackground: setBg, transitionTo: trans } = await import('../../src/core/scene.js');
  let told = null, ran = false;
  onTransition((ms) => { told = ms; });
  setBg('dungeon_a.jpg');
  await sleep(10);
  const layer = [registry.bg0, registry.bg1].find((l) => l.dataset.file === 'dungeon_a.jpg');
  trans(() => { ran = true; setBg('dungeon_b.jpg'); }, 50);
  const early = { told, ran, push: layer.classList.contains('push') };
  await sleep(5000);
  onTransition(null);
  ok('the transition starts the push as the windows fade: the renderer is told first, the flat layer pushes, and is at rest again after',
    early.told === 50 && !early.ran && early.push && ran && [registry.bg0, registry.bg1].every((l) => !l.classList.contains('push') && !l.classList.contains('pushed')));
  ok('the 3D renderer dollies per layer, the flat layer scales (not under reduced motion)',
    b3.includes('dollyOf(L, now, i === layers.length - 1)') && cssP.includes('.bg-layer.push { transform: scale(') && /prefers-reduced-motion: reduce\) \{ \.bg-layer, \.bg-layer\.push/.test(cssP));
  const cover = Math.min(...[4 / 3, 16 / 9, 21 / 9].map((a) => bm.edgeMargin(extreme, a, bm.requiredOverscan(extreme, a))));
  ok('auto skirt covers the screen at max slider settings', cover > 0, cover.toFixed(4));
  const tuner = readFileSync('src/ui/bgTuner.js', 'utf8');
  ok('tuner: 7 sliders + Save Depth Settings + Reset', (tuner.match(/^\s+\['\w+', '[\w ]+', /gm) || []).length === 7
    && tuner.includes("'Save Depth Settings'") && tuner.includes("'Reset'") && tuner.includes('navigator.clipboard.writeText'));
  ok('tuner only under DEBUG MODE', readFileSync('src/ui/debugToggles.js', 'utf8').includes('bgTunerToggle(),') && readFileSync('src/main.js', 'utf8').includes('...dbg.items') && readFileSync('src/ui/debugToggles.js', 'utf8').includes("[menuHead('Debug tools'), invulnerableToggle(), ...debugToggles()]"));
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
  p.xp = 1000; p.coins = DATA.difficulty.potions.priceSteps[0];
  ok('XP/coins green when something is affordable', hub.canSpendXp(p) && hub.canSpendCoins(p));
  p.potions = 1; p.potionCap = 4;
  const root = new El('main');
  hub.hubScene().enter(root);
  const buy = root.all((n) => n.tagName === 'button' && n.attrs['data-key'] === 'u')[0];
  ok('Buy Potion glows when low and affordable', buy && /\bactive\b/.test(buy.className));
  ok('particle bursts start at a random point on the figure', readFileSync('src/ui/fxParts.js', 'utf8').includes('r.width * (0.5 + (Math.random() - 0.5) * 0.5)')
    && readFileSync('src/ui/particleLooks.js', 'utf8').includes('x: h.x + rr(-14, 14) * u'));
}

// T60: 0.099 — depth-embedded fog: the noise tiles seamlessly, the mist
// takes each scene's hue at a readable brightness, every background has an
// amount (long exterior views more than rooms); 0.101: the haze is per
// vertex and the background's pixel shader is one texture read.
{
  const fog = await import('../../src/core/bg3dFog.js');
  const gl = await import('../../src/core/bg3dGL.js');
  const n = fog.fogNoise(64, 3), at = (x, y) => n[y * 64 + x];
  let seam = 0, inside = 0;
  for (let i = 0; i < 64; i++) { seam = Math.max(seam, Math.abs(at(63, i) - at(0, i)), Math.abs(at(i, 63) - at(i, 0))); inside = Math.max(inside, Math.abs(at(32, i) - at(31, i))); }
  ok('fog noise tiles seamlessly (wrap seam no rougher than inside)', seam <= inside + 1 && Math.max(...n) > Math.min(...n) + 100);
  // a dark teal scene: far half teal, near half black
  const w = 8, h = 4, px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const far = i < w * h / 2; px.set(far ? [10, 40, 36, 255] : [0, 0, 0, 255], i * 4); }
  const col = fog.fogColor(px, w, h, (u, v) => (v < 0.5 ? 0.1 : 0.9));
  const lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];
  ok('mist keeps the scene hue at a readable brightness', col[1] > col[0] && col[2] > col[0] && lum > 0.3 && lum < 0.55);
  ok('haze + flash lights per vertex; one texture read per background pixel (0.101)', gl.VS.includes('vHaze = clamp(') && gl.VS.includes('vLit = lightAt(w);')
    && (gl.FS.match(/texture2D\(/g) || []).length === 1 && !gl.FS.includes('lightAt') && !gl.FS.includes('exp('));
  const P = DATA.backgrounds.parallax, amt = (f) => P.overrides?.[f]?.fog ?? P.fog;
  const all = [...new Set([DATA.backgrounds.title, DATA.backgrounds.hub, ...DATA.backgrounds.bosses, DATA.backgrounds.death, DATA.backgrounds.shrine, ...DATA.backgrounds.rooms, ...DATA.backgrounds.treasure])];
  ok('every background has a fog amount', all.every((f) => amt(f) > 0 && amt(f) <= 1.5));
  ok('long exterior views are foggier than rooms', amt('castle_ramparts.jpg') > 2 * amt('castle_great_hall.jpg') && amt('castle_courtyard.jpg') > 2 * amt('castle_alchemy_lab.jpg'));
}

// T61: 0.100 — flash lights: a screen point maps to the scene point that
// projects back onto it; the envelope rises, fades and ends; only the two
// brightest live lights draw (dark slots otherwise); crits, potions and
// revives trigger them; data can switch them off.
{
  const L = await import('../../src/core/bg3dLights.js');
  const bm = await import('../../src/core/bg3dMath.js');
  const gl = await import('../../src/core/bg3dGL.js');
  const W = 1600, H = 900, fov = 40, M = bm.mvp(0, 0, (fov * Math.PI) / 180, W / H);
  const back = [[800, 450], [1200, 300], [100, 850]].every(([x, y]) => {
    const p = L.screenToWorld(x, y, W, H, fov, 0.8);
    const o = [0, 1, 2, 3].map((r) => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
    const sx = ((o[0] / o[3]) + 1) / 2 * W, sy = (1 - o[1] / o[3]) / 2 * H;
    return Math.abs(sx - x) < 0.5 && Math.abs(sy - y) < 0.5 && Math.abs(p[2] + 0.8) < 1e-9;
  });
  ok('a flash sits in the scene right behind its card (screenToWorld inverts the projection)', back);
  const e = (t) => L.envelope(t, { rise: 0.1, fade: 0.3, life: 1 });
  ok('flash envelope: rises, peaks, fades, ends', e(-0.01) === 0 && e(0.05) > 0.4 && e(0.05) < 0.6 && Math.abs(e(0.1) - 1) < 1e-9
    && e(0.4) < e(0.2) && e(0.4) > 0 && e(1.01) === 0);
  const mk = (t0, strength, pos) => ({ t0, pos, color: [1, 0.5, 0], strength, rise: 0.08, fade: 0.5, life: 2 });
  const none = L.activeLights([], 1000);
  ok('no flashes: every light slot dark', none.count === 0 && none.col.every((v) => v === 0) && none.col.length === L.MAX_LIGHTS * 3);
  const three = L.activeLights([mk(900, 0.5, [1, 1, -1]), mk(900, 2, [2, 2, -2]), mk(900, 1, [3, 3, -3]), mk(-5000, 9, [4, 4, -4])], 1000);
  ok('only the brightest live flashes draw', three.count === 2 && three.pos[0] === 2 && three.pos[3] === 3 && three.col[0] > three.col[3] && three.col[2] === 0);
  ok('shader lights the art and the mist by 3D distance', gl.VS.includes(`uniform vec3 uLightPos[${L.MAX_LIGHTS}]`) && gl.VS.includes('vLit = lightAt(w);')
    && gl.FS.includes('uFogColor + vLit * 0.7') && readFileSync('src/core/bg3dPuffGL.js', 'utf8').includes('vLit = lightAt(aPos)'));
  const fx = readFileSync('src/ui/combatFx.js', 'utf8');
  ok('crits, potions and revives light the scene', ["'megacrit' : 'crit'", "bgLight('potion'", "bgLight('revive'"].every((s) => fx.includes(s)));
  const lights = DATA.backgrounds.parallax.lights;
  ok('flash lights are tunable in data (colour, strength, life per kind)', lights && typeof lights.enabled === 'boolean'
    && ['crit', 'potion', 'revive'].every((k) => lights[k]?.color?.length === 3 && lights[k].strength > 0 && lights[k].life > lights[k].fade));
  const rect = { left: 1000, top: 200, width: 300, height: 450 };
  const flash = L.flashAt('crit', rect, W, H, fov, lights, 5);
  ok('a crit flash lands in front of its card, on the card\'s side', flash && flash.t0 === 5 && flash.pos[0] > 0 && flash.color === lights.crit.color);
  ok('lights off (enabled: false) or unknown kind = no flash', L.flashAt('crit', rect, W, H, fov, { ...lights, enabled: false }, 5) === null
    && L.flashAt('nope', rect, W, H, fov, lights, 5) === null && L.flashAt('potion', null, W, H, fov, lights, 5) === null);
}

// T62: 0.101 — volumetric fog puffs: stable per scene, drifting with each
// scene's wind (sideways / toward / away from the camera), wrapping inside
// a box whose edges fade (no popping), drawn back to front as quads on
// their own atlas cell; the sprites fade out inside their cells and are
// lit from above; they render at half resolution and fade into the scene
// in front of them.
{
  const pf = await import('../../src/core/bg3dPuffs.js');
  const P = DATA.backgrounds.parallax.puffs;
  const a = pf.makePuffs(pf.seedOf('castle_courtyard.jpg'), P), b = pf.makePuffs(pf.seedOf('castle_courtyard.jpg'), P);
  const c = pf.makePuffs(pf.seedOf('castle_ramparts.jpg'), P);
  ok('puffs: the same scene always gets the same set, other scenes differ', a.length === P.count && JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c));
  ok('puffs start inside the fog box, hanging low', a.every((p) => Math.abs(p.x) <= P.width && p.d >= P.near && p.d <= P.far && p.y >= P.y[0] && p.y <= P.y[1])
    && a.filter((p) => p.y < (P.y[0] + P.y[1]) / 2).length > a.length / 2);
  const one = [{ ...a[0], x: 0, y: -0.2, d: 1.1, speed: 1 }];
  const calm = { ...P, turbulence: 0, pulse: 0 }; // the wind alone (0.166: the shipped mist also wanders and pulses)
  const at = (t, wind) => pf.puffFrame(one, t, calm, wind)[0];
  ok('sideways wind carries a puff sideways', at(10, [0.02, 0, 0]).pos[0] > at(0, [0.02, 0, 0]).pos[0] + 0.19);
  ok('+z wind brings a puff toward the camera, -z takes it away', at(10, [0, 0, 0.02]).pos[2] > at(0, [0, 0, 0.02]).pos[2] + 0.19
    && at(10, [0, 0, -0.02]).pos[2] < at(0, [0, 0, -0.02]).pos[2] - 0.19);
  const long = [1e3, 1e5, 3.3e6].map((t) => at(t, [0.03, 0.002, 0.02]));
  ok('drifting puffs wrap inside the box (any session length)', long.every((q) => Math.abs(q.pos[0]) <= P.width && -q.pos[2] >= P.near && -q.pos[2] <= P.far));
  const edge = pf.puffFrame([{ ...one[0], x: P.width - 0.001 }, { ...one[0], d: P.near + 0.001 }], 0, calm, [0, 0, 0]);
  ok('puffs fade out at the box edges (wrapping never pops)', edge.length === 0);
  const windy = { ...P, turbulence: 0.12, turbulencePeriod: 10 }, tWrap = P.width / 0.02; // a puff from x = 0 reaches the edge at tWrap
  const trace = Array.from({ length: 61 }, (_, i) => pf.puffFrame(one, tWrap - 0.6 + i * 0.02, windy, [0.02, 0, 0])[0]?.alpha ?? 0);
  const jump = Math.max(...trace.map((v, i) => (i ? Math.abs(v - trace[i - 1]) : 0)));
  ok('with turbulence on, a wrap is still a fade, not a pop (alpha continuous through it)', jump < 0.05, String(jump));
  const fr = pf.puffFrame(a, 12, P, [0.01, 0, 0.01]);
  ok('puffs draw back to front', fr.length > P.count / 2 && fr.every((q, i) => !i || q.pos[2] >= fr[i - 1].pos[2]));
  // 0.164 (the Fog Lab): the shipped values are the old slide; turbulence, pulse and flow are off until tuned
  const ov = DATA.backgrounds.parallax.overrides, every = [...DATA.backgrounds.rooms, ...DATA.backgrounds.bosses, ...DATA.backgrounds.treasure, DATA.backgrounds.title, DATA.backgrounds.hub, DATA.backgrounds.shrine, DATA.backgrounds.death];
  ok('shipped mist is alive (0.166: turbulence, pulse and flow on; every painting has its own fog and wind, the ramparts the windiest)',
    P.turbulence > 0 && P.pulse > 0 && P.flow > 0 && DATA.backgrounds.parallax.fogSpeed >= 3 && every.every((f) => ov[f]?.fogWind?.length === 3 && ov[f].fog > 0)
    && Math.hypot(...ov['castle_ramparts.jpg'].fogWind) >= Math.max(...every.map((f) => Math.hypot(...ov[f].fogWind))));
  const turb = { ...calm, turbulence: 0.1, turbulencePeriod: 10 }, still = pf.puffFrame(one, 2.5, calm, [0, 0, 0])[0], moved = pf.puffFrame(one, 2.5, turb, [0, 0, 0])[0];
  ok('turbulence moves a puff off its wind line, and only a little', Math.abs(moved.pos[0] - still.pos[0]) > 0.01 && Math.abs(moved.pos[0] - still.pos[0]) <= 0.1);
  const pulsed = { ...calm, pulse: 1, pulsePeriod: 10 }, al = [0, 2.5, 5, 7.5].map((t) => pf.puffFrame(one, t, pulsed, [0, 0, 0])[0]?.alpha ?? 0);
  ok('pulse fades a puff in and out over its period', Math.max(...al) > Math.min(...al) + 0.3);
  const pgl = readFileSync('src/core/bg3dPuffGL.js', 'utf8'), ggl = readFileSync('src/core/bg3dGL.js', 'utf8');
  ok('the puff shader churns by flow noise, tints lit and shaded sides, and reads the scene\'s light; the haze is tunable',
    pgl.includes('texture2D(uFlow,') && pgl.includes('mix(uShadeTint, uLitTint, lit)') && pgl.includes('texture2D(uArt, uv, 4.0)') && ggl.includes('uHaze.x * pow(1.0 - aDepth, uHaze.y)'));
  const v = pf.puffVertices([{ pos: [0.1, -0.2, -1], size: 0.5, rot: 0, alpha: 0.7, variant: 3, shade: 1 }]);
  const corner = (k) => [...v.subarray(k * pf.PUFF_FLOATS, (k + 1) * pf.PUFF_FLOATS)];
  ok('a puff is a quad around its centre, on its own atlas cell', Math.abs(corner(0)[0] - (0.1 - 0.25)) < 1e-6 && Math.abs(corner(2)[1] - (-0.2 + 0.25 * pf.TALL)) < 1e-6
    && [0, 1, 2, 3].every((k) => corner(k)[3] >= 0.5 && corner(k)[4] >= 0.5 && corner(k)[6] === Math.fround(0.7))
    && pf.puffIndices(2).join(',') === '0,1,2,0,2,3,4,5,6,4,6,7');
  const S = pf.puffSprites(64), size = 128, d = (x, y) => S[(y * size + x) * 2], l = (x, y) => S[(y * size + x) * 2 + 1];
  let border = 0, outside = 0;
  for (let i = 0; i < size; i++) border = Math.max(border, d(i, 0), d(i, size - 1), d(0, i), d(size - 1, i), d(i, 63), d(i, 64), d(63, i), d(64, i));
  for (let y = 0; y < 64; y++) { const py = ((y + 0.5) / 64) * 2 - 1; if (Math.abs(py) >= pf.TALL) for (let x = 0; x < 64; x++) outside = Math.max(outside, d(x, y)); }
  ok('sprites fade out inside their cells and their quads', border === 0 && outside === 0 && d(32, 32) > 150);
  let top = 0, bottom = 0;
  for (let x = 16; x < 48; x++) { top += l(x, 16); bottom += l(x, 44); }
  ok('sprites are lit from above (baked self-shadow)', top > bottom);
  const src = readFileSync('src/core/bg3dPuffGL.js', 'utf8');
  ok('puffs render at 1/puffDiv of the canvas (half on the desktop, a third on a phone — data, 0.00222), then blend over the scene once',
    src.includes('Math.ceil(w / div)') && src.includes('gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)') && DATA.backgrounds.parallax.puffDiv === 2 && DATA.backgrounds.parallax.phone.puffDiv === 3
    && readFileSync('src/core/bg3d.js', 'utf8').includes('div: L.tune.puffDiv'));
  // the phone power profile (0.00222): parallax.phone over the base on a phone, nothing elsewhere; every phone knob exists at the top level
  const { tuning } = await import('../../src/core/bg3dTuning.js');
  const { deviceBlock } = await import('../../src/shared/platform.js');
  const Pp = DATA.backgrounds.parallax;
  ok('the phone profile: parallax.phone merged over the base on a phone only, every key a real knob',
    tuning('', 'phone').maxDpr === Pp.phone.maxDpr && tuning('', 'phone').motionMaxFps === Pp.phone.motionMaxFps && tuning('', 'desktop').maxDpr === Pp.maxDpr && tuning('').maxDpr === Pp.maxDpr
    && Object.keys(Pp.phone).every((k) => k in Pp) && deviceBlock({ a: 1, phone: { a: 2 } }, 'phone').a === 2 && deviceBlock({ a: 1, phone: { a: 2 } }, 'desktop').a === 1
    && Pp.phone.maxDpr < Pp.maxDpr && Pp.phone.motionMaxFps <= Pp.motionMaxFps && Pp.phone.maxFps <= Pp.maxFps);
  // the ladder's threshold (0.00222): a struggling device is judged against minFps, a fast display against what the throttle can reach
  const { slowAt } = await import('../../src/core/bg3dQuality.js');
  const Q = { minFps: 22, maxFps: 30, quality: { reachShare: 0.9 } };
  ok('slowAt: a device at 15 rAF/s must reach 22 (it used to be judged against 13.5 and never stepped down); a 40 Hz display against 18; a 60 Hz one 22; no rate yet 22',
    slowAt(15, Q) === 22 && slowAt(40, Q) === 18 && slowAt(60, Q) === 22 && slowAt(0, Q) === 22 && slowAt(30, Q) === 22 && Pp.quality.reachShare === 0.9
    && readFileSync('src/core/bg3d.js', 'utf8').includes('return slowAt(rafRate, cfg)'));
  // the vignette is the shaders' (0.00222): both passes multiply it, the CSS layer hides under the live canvas
  const glSrc = readFileSync('src/core/bg3dGL.js', 'utf8');
  ok('the vignette lives in the shaders under the live canvas (both passes), the CSS one only over the flat layers',
    glSrc.includes('gl_FragColor = vec4(c * vignette(), uAlpha)') && src.includes('gl_FragColor.rgb *= vignette()') && readFileSync('styles.css', 'utf8').includes('#bg-stack.gl ~ #vignette { display: none; }')
    && glSrc.includes('0.55 + (min(d, 1.0) - 0.75) / 0.25 * 0.35'));
  // a flash light alone no longer lifts the frame cap (0.00222); the painting arrives decoded off the main thread
  const bgSrc = readFileSync('src/core/bg3d.js', 'utf8');
  ok('a flash alone keeps the rest rate; the painting and depth map come through loadPicture (createImageBitmap) and the fill waits a frame',
    bgSrc.includes('const cap = push || jolts.length || sways.length ? cfg.motionMaxFps : cfg.maxFps') && bgSrc.includes("loadPicture(`assets/bg/${file}`)") && glSrc.includes('createImageBitmap(blob')
    && bgSrc.includes('await new Promise((resolve) => requestAnimationFrame(resolve))') && bgSrc.includes('img.close?.()'));
  ok('puffs fade softly into the scene in front of them (depth map)', src.includes('clamp((surf - d) / uSoft, 0.0, 1.0)') && P.soft > 0);
  const Pb = DATA.backgrounds.parallax, wind = (f) => Pb.overrides?.[f]?.fogWind ?? Pb.fogWind;
  const allBg = [...new Set([DATA.backgrounds.title, DATA.backgrounds.hub, ...DATA.backgrounds.bosses, DATA.backgrounds.death, DATA.backgrounds.shrine, ...DATA.backgrounds.rooms, ...DATA.backgrounds.treasure])];
  ok('every scene has its own wind: some sideways, some toward, some away from the camera', allBg.every((f) => wind(f)?.length === 3 && wind(f).every(Number.isFinite))
    && allBg.some((f) => Math.abs(wind(f)[0]) >= 0.02) && allBg.some((f) => wind(f)[2] > 0.01) && allBg.some((f) => wind(f)[2] < -0.005));
  ok('tuner: fog drift slider', readFileSync('src/ui/bgTuner.js', 'utf8').includes("['fogSpeed', 'Fog drift'"));
}

// T63: 0.101 — frame rate: the canvas has a pixel budget (the art is 2048
// wide), frame-rate windows ignore hidden-tab gaps, and slow devices step
// down resolution, then fog, then go flat.
{
  const q = await import('../../src/core/bg3dQuality.js');
  const [rw, rh] = q.backingSize(1512, 945, 2, 2.1e6);
  ok('pixel budget: a Retina screen renders ~2.1M pixels, not 5.7M', rw * rh <= 2.1e6 * 1.01 && rw > 1512 && Math.abs(rw / rh - 1512 / 945) < 0.01);
  ok('pixel budget: a 1080p screen renders at native size', q.backingSize(1920, 1080, 1, 2.1e6).join('x') === '1920x1080'
    && q.backingSize(1920, 1080, 1, 2.1e6, 0.8).join('x') === '1536x864');
  const run = (fps, ms, gapAt = -1) => {
    let w = null;
    const got = [];
    for (let t = 0; t <= ms; t += 1000 / fps) { w = q.fpsWindow(w, t < gapAt ? t : t + (gapAt >= 0 ? 1000 : 0), 22, DATA.backgrounds.parallax.quality); if (w.fps !== undefined) got.push(w); }
    return got;
  };
  const steady = run(30, 3200), slow = run(15, 3200), gap = run(30, 3200, 1500);
  ok('frame-rate window measures drawn frames', steady.length === 1 && Math.abs(steady[0].fps - 30) < 1 && Math.abs(slow[0].fps - 15) < 1);
  ok('a hidden-tab gap restarts the window instead of reading as slow', gap.length === 0);
  const slow2 = run(15, 6200);
  ok('one slow window is a hitch; the second in a row steps down', steady[0].slow === 0 && slow[0].slow === 1
    && slow2.at(-1).slow === DATA.backgrounds.parallax.quality.slowWindows);
  ok('quality ladder: resolution first, then fog, then flat', q.LADDER[0].scale === 1 && q.LADDER[0].fog
    && q.LADDER.findIndex((s) => s.scale < 1) < q.LADDER.findIndex((s) => !s.fog) && !q.LADDER.at(-1).fog);
  const src = readFileSync('src/core/bg3d.js', 'utf8');
  ok('past the last step: back to the flat backgrounds (nextStep, 0.00223)', q.nextStep(q.LADDER.length) === null && q.nextStep(q.LADDER.length - 1).fog === false && q.nextStep(0).scale === 1
    && src.includes('const step = nextStep(++level)') && src.includes('if (fpsW.slow >= cfg.quality.slowWindows && !degrade()) { endSpan(); return; }') && DATA.backgrounds.parallax.minFps > 0);
}

// 0.156 — no painting twice in a run (while the pool lasts), and the boss
// fights draw from the throne rooms
{
  const rs = await import('../../src/run/runState.js');
  const { generateRoom } = await import('../../src/run/roomGen.js');
  let repeats = 0, offPool = 0;
  const thrones = new Set();
  for (let k = 0; k < 40; k++) {
    const run = rs.createRun(), shown = [];
    const ante = [];
    while (run.roomNumber < DATA.difficulty.finalBossRoom) {
      const room = rs.enterNextRoom(run);
      if (room.kind === 'shrine') continue;
      // the antechambers (0.171) are their own small pool: they repeat only once it's shown out
      if (DATA.backgrounds.antechambers.includes(room.background)) { ante.push(room.background); continue; }
      shown.push(room.background);
      if (room.isBoss) { thrones.add(room.background); if (!DATA.backgrounds.bosses.includes(room.background)) offPool++; }
    }
    if (new Set(shown).size !== shown.length) repeats++;
    if (new Set(ante).size !== Math.min(ante.length, DATA.backgrounds.antechambers.length)) repeats++;
  }
  ok('backgrounds: a whole 24-room run shows no painting twice; bosses fight in the throne rooms (all of them, over many runs)',
    repeats === 0 && offPool === 0 && thrones.size === DATA.backgrounds.bosses.length && DATA.backgrounds.bosses.length >= 4, `${repeats} ${offPool} ${thrones.size}`);
  const tiny = { seenBackgrounds: [] };
  const many = Array.from({ length: DATA.backgrounds.rooms.length + 3 }, (_, i) => generateRoom(i * 8 + 2, tiny).background);
  ok('backgrounds: a pool shown out starts over rather than failing', many.every(Boolean) && new Set(many).size === DATA.backgrounds.rooms.length - DATA.backgrounds.antechambers.length);
}

// 0.182: the treasure paintings (The Treasury included) are only ever treasure rooms
ok('backgrounds: no treasure painting is in the fight pool', DATA.backgrounds.treasure.includes('dungeon_treasury.jpg')
  && DATA.backgrounds.treasure.every((f) => !DATA.backgrounds.rooms.includes(f)));

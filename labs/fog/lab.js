// labs/fog/lab.js — the Fog Lab (0.164): the game's own 3D background
// renderer, every fog knob of backgrounds.json `parallax` as a live slider,
// presets, the flash lights and jolts on demand, and COPY JSON to bring the
// values back into the data. Nothing here is saved into the game's own
// tuning (bg3d's "castle-bg-tuning"): the lab keeps its values under its
// own key, and the game keeps playing the shipped ones.

import { loadData, DATA } from '../../src/shared/data.js';
import { onBackgroundChange, setBackground } from '../../src/core/scene.js';
import { initBg3d, showBackground3d, setLiveTuning, bgLight, bgJolt, bgSway, bgPush, isBg3dActive } from '../../src/core/bg3d.js';

const KEY = 'castle-fog-lab';
const $ = (id) => document.getElementById(id);
const clone = (v) => JSON.parse(JSON.stringify(v));

await loadData();
const base = DATA.backgrounds.parallax; // the shipped values
const B = DATA.backgrounds;
const scenes = [...new Set([B.title, B.hub, ...B.rooms, ...B.bosses, ...B.treasure, B.shrine, B.death])];
const nameOf = (f) => B.roomNames?.[f] ?? (f === B.title ? 'Title' : f === B.hub ? 'The Great Hall' : f === B.shrine ? B.shrineName : f === B.death ? 'The End' : f);
const sceneFog = (f) => ({ fog: base.overrides?.[f]?.fog ?? base.fog, fogWind: [...(base.overrides?.[f]?.fogWind ?? base.fogWind)] });

// ---- the state: one object of everything the sliders drive ----
const shipped = () => ({ fogScale: base.fogScale, fogSpeed: base.fogSpeed, puffs: clone(base.puffs), mist: clone(base.mist), haze: clone(base.haze), push: clone(base.push), scene: {}, ownFog: true,
  light: { warm: 0, lit: 1, cool: 0, shade: 1 } });
let S = shipped();
let file = scenes[0];
try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved?.puffs) { S = { ...shipped(), ...saved }; file = scenes.includes(saved.file) ? saved.file : file; } } catch { /* fresh */ }

// the lit / shaded tints come from four readable sliders
const tints = ({ warm, lit, cool, shade }) => ({
  litTint: [lit * (1 + warm * 0.3), lit * (1 + warm * 0.1), lit * (1 - warm * 0.2)],
  shadeTint: [shade * (1 - cool * 0.18), shade * (1 - cool * 0.06), shade * (1 + cool * 0.25)],
});
function apply() {
  const own = S.ownFog ? sceneFog(file) : (S.scene[file] ?? sceneFog(file));
  setLiveTuning({ fogScale: S.fogScale, fogSpeed: S.fogSpeed, puffs: clone(S.puffs), haze: clone(S.haze), push: clone(S.push),
    mist: { ...S.mist, ...tints(S.light) }, fog: own.fog, fogWind: own.fogWind });
  try { localStorage.setItem(KEY, JSON.stringify({ ...S, file })); } catch { /* private mode */ }
}

// ---- the panel ----
const panel = $('panel');
const status = document.createElement('div'); status.id = 'status';
const get = (path) => path.split('.').reduce((o, k) => o[k], S);
const set = (path, v) => { const ks = path.split('.'), o = ks.slice(0, -1).reduce((o, k) => o[k], S); o[ks.at(-1)] = v; };
const syncs = [];
function slider(path, label, min, max, step, note) {
  const row = document.createElement('label'); row.className = 's'; row.title = note ?? label;
  const name = document.createElement('span'); name.textContent = label;
  const input = document.createElement('input'); Object.assign(input, { type: 'range', min, max, step });
  const val = document.createElement('span'); val.className = 'v';
  const show = () => { input.value = get(path); val.textContent = Number(get(path)).toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0); };
  input.oninput = () => { set(path, Number(input.value)); show(); apply(); };
  syncs.push(show); show();
  row.append(name, input, val);
  return row;
}
// the scene's own fog amount and wind are edited through S.scene[file]
const own = (k, i) => ({ get: () => (S.scene[file] ?? sceneFog(file))[k], set: (v) => { S.scene[file] ??= sceneFog(file); if (i == null) S.scene[file][k] = v; else S.scene[file][k][i] = v; } });
function ownSlider(k, i, label, min, max, step, note) {
  const row = document.createElement('label'); row.className = 's'; row.title = note ?? label;
  const name = document.createElement('span'); name.textContent = label;
  const input = document.createElement('input'); Object.assign(input, { type: 'range', min, max, step });
  const val = document.createElement('span'); val.className = 'v';
  const o = own(k, i), read = () => (i == null ? o.get() : o.get()[i]);
  const show = () => { input.value = read(); val.textContent = Number(read()).toFixed(3); input.disabled = S.ownFog; };
  input.oninput = () => { o.set(Number(input.value)); show(); apply(); };
  syncs.push(show); show();
  row.append(name, input, val);
  return row;
}
function group(title, small, open, ...children) {
  const d = document.createElement('details'); d.open = open;
  const sm = document.createElement('summary'); sm.textContent = title;
  if (small) { const s = document.createElement('small'); s.textContent = small; sm.append(s); }
  d.append(sm, ...children);
  return d;
}
const note = (t) => { const p = document.createElement('p'); p.className = 'note'; p.textContent = t; return p; };
const button = (label, onclick, cls = '') => { const b = document.createElement('button'); b.textContent = label; b.onclick = onclick; if (cls) b.className = cls; return b; };
const row = (...kids) => { const r = document.createElement('div'); r.className = 'row'; r.append(...kids); return r; };

const PRESETS = {
  Shipped: () => ({}),
  'Gentle breeze': () => ({ fogSpeed: 2, puffs: { turbulence: 0.04, turbulencePeriod: 40, breathe: 0.1, bob: 0.02, period: [16, 32], flow: 0.01, flowScale: 1.2, flowAmount: 0.35 } }),
  'Rolling mist': () => ({ fogSpeed: 3, puffs: { turbulence: 0.08, turbulencePeriod: 24, breathe: 0.14, bob: 0.03, rock: [0.1, 0.25], period: [10, 24], pulse: 0.35, pulsePeriod: 30, flow: 0.02, flowScale: 1.6, flowAmount: 0.5 }, mist: { shade: 1.3, nearBright: 0.3 }, light: { warm: 0.5, lit: 1.1, cool: 0.5, shade: 0.9 } }),
  'Churning fog': () => ({ fogSpeed: 4, puffs: { count: 56, turbulence: 0.14, turbulencePeriod: 14, breathe: 0.2, bob: 0.04, rock: [0.15, 0.35], period: [6, 16], pulse: 0.5, pulsePeriod: 18, flow: 0.045, flowScale: 2.2, flowAmount: 0.7, opacity: 0.5 }, mist: { shade: 1.5, sceneLight: 0.5, nearBright: 0.5 }, light: { warm: 0.7, lit: 1.15, cool: 0.7, shade: 0.85 } }),
  Storm: () => ({ fogSpeed: 6, puffs: { count: 70, turbulence: 0.22, turbulencePeriod: 8, breathe: 0.3, bob: 0.06, rock: [0.25, 0.5], period: [4, 10], pulse: 0.6, pulsePeriod: 10, flow: 0.09, flowScale: 3, flowAmount: 0.85, opacity: 0.6, drift: [0.5, 2.2] }, haze: { strength: 0.75 }, mist: { shade: 1.6, sceneLight: 0.8, nearBright: 0.7 }, light: { warm: 0.8, lit: 1.2, cool: 0.9, shade: 0.8 } }),
};
function preset(name) {
  const p = PRESETS[name]();
  S = { ...shipped(), scene: S.scene, ownFog: S.ownFog };
  Object.assign(S, { fogScale: p.fogScale ?? S.fogScale, fogSpeed: p.fogSpeed ?? S.fogSpeed });
  for (const k of ['puffs', 'mist', 'haze', 'light', 'push']) Object.assign(S[k], p[k] ?? {});
  syncs.forEach((f) => f()); apply();
  status.textContent = `Preset: ${name}.`;
}

// the parallax patch to paste into backgrounds.json (only what differs from the shipped values)
function patch() {
  const out = {};
  for (const k of ['fogScale', 'fogSpeed']) if (S[k] !== base[k]) out[k] = S[k];
  for (const k of ['puffs', 'haze', 'push']) { const d = {}; for (const [kk, v] of Object.entries(S[k])) if (JSON.stringify(v) !== JSON.stringify(base[k][kk])) d[kk] = v; if (Object.keys(d).length) out[k] = d; }
  const m = { ...S.mist, ...tints(S.light) }, dm = {};
  for (const [kk, v] of Object.entries(m)) if (JSON.stringify(v) !== JSON.stringify(base.mist[kk])) dm[kk] = Array.isArray(v) ? v.map((x) => Math.round(x * 1000) / 1000) : v;
  if (Object.keys(dm).length) out.mist = dm;
  if (!S.ownFog) { const ov = {}; for (const [f, v] of Object.entries(S.scene)) ov[f] = v; if (Object.keys(ov).length) out.overrides = ov; }
  return JSON.stringify(out, null, 2);
}

const code = document.createElement('textarea'); code.rows = 8; code.readOnly = true;
panel.append(
  row(...Object.keys(PRESETS).map((n) => button(n, () => preset(n)))),
  row(button('Flash', () => flash('crit'), 'fire'), button('Mega', () => flash('megacrit'), 'fire'), button('Potion', () => flash('potion')), button('Jolt', () => bgJolt(1)), button('Sway', () => bgSway(1.5, 1))),
  group('Room change', 'the push through the picture (← → play it as the game does)', true,
    slider('push.dist', 'Push distance', 0, 0.3, 0.01, 'how far the camera dollies into the painting (the focal plane is 1 away)'),
    slider('push.inMs', 'Push in ms', 500, 6000, 100, 'from the windows starting to fade until the next painting is fully in'),
    slider('push.outMs', 'Pull out ms', 500, 6000, 100, 'the next painting settling back to rest'),
    note('The game: windows fade 1 s, then the crossfade (2 s), then the windows return (1 s). ← → here waits that first second before the next painting, like the game.')),
  group('Amount', 'how much mist', true,
    slider('fogScale', 'Fog ×', 0, 2.5, 0.05, 'mist amount, × each painting\'s own'),
    slider('puffs.opacity', 'Puff opacity', 0, 1, 0.02),
    slider('puffs.count', 'Puff count', 0, 120, 1),
    slider('haze.strength', 'Haze strength', 0, 1.2, 0.02, 'the distance haze on the painting'),
    slider('haze.density', 'Haze density', 0, 5, 0.1, 'how fast the air thickens with distance'),
    slider('haze.curve', 'Haze curve', 0.5, 3, 0.05, 'power on the far share: >1 keeps the near clear'),
    slider('haze.high', 'Haze up high', 0, 1, 0.02, 'how much haze survives at the top of the scene'),
    slider('haze.max', 'Haze cap', 0, 1, 0.02)),
  group('Motion', 'the wind and each puff\'s own', true,
    slider('fogSpeed', 'Drift ×', 0, 8, 0.1, 'how fast the mist drifts, × each painting\'s wind'),
    note('Each painting has its own fog amount and wind (overrides). Untick to edit them here; COPY JSON then lists the changed paintings.'),
    ownToggle(),
    ownSlider('fog', null, 'Scene fog', 0, 1.5, 0.02), ownSlider('fogWind', 0, 'Wind x →', -0.08, 0.08, 0.001), ownSlider('fogWind', 1, 'Wind y ↑', -0.03, 0.03, 0.001), ownSlider('fogWind', 2, 'Wind z (to you)', -0.05, 0.05, 0.001),
    slider('puffs.drift.0', 'Drift spread lo', 0.2, 3, 0.05, 'per-puff wind speed: the slowest'), slider('puffs.drift.1', 'Drift spread hi', 0.2, 3, 0.05, 'the fastest'),
    slider('puffs.turbulence', 'Turbulence', 0, 0.3, 0.005, 'how far each puff wanders on its own (world units)'),
    slider('puffs.turbulencePeriod', 'Turb. period s', 4, 90, 1, 'one wander loop'),
    slider('puffs.breathe', 'Breathe', 0, 0.4, 0.01, 'size pulse share'), slider('puffs.bob', 'Bob', 0, 0.08, 0.002, 'vertical bob (world units)'),
    slider('puffs.rock.0', 'Rock lo (rad)', 0, 0.6, 0.01), slider('puffs.rock.1', 'Rock hi (rad)', 0, 0.6, 0.01),
    slider('puffs.period.0', 'Cycle lo s', 3, 60, 1, 'the rock / breathe / bob cycle: the fastest puff'), slider('puffs.period.1', 'Cycle hi s', 3, 60, 1, 'the slowest'),
    slider('puffs.pulse', 'Pulse', 0, 1, 0.02, 'how much each puff fades in and out'), slider('puffs.pulsePeriod', 'Pulse period s', 4, 90, 1),
    slider('puffs.flow', 'Flow', 0, 0.3, 0.005, 'how fast the mist churns inside each puff (noise uv/s)'),
    slider('puffs.flowScale', 'Flow scale', 0.3, 6, 0.1, 'the size of the churning lumps: higher = finer'),
    slider('puffs.flowAmount', 'Flow amount', 0, 1, 0.02, 'how much the churning thins and thickens')),
  group('Shape', 'the puffs and their box', false,
    slider('puffs.size.0', 'Size lo', 0.1, 1.6, 0.02), slider('puffs.size.1', 'Size hi', 0.1, 1.6, 0.02),
    slider('puffs.y.0', 'Height lo', -1, 0.6, 0.02, 'world y: 0 = eye level, below = the floor'), slider('puffs.y.1', 'Height hi', -1, 0.6, 0.02),
    slider('puffs.width', 'Box half-width', 0.5, 3, 0.05),
    slider('puffs.near', 'Near', 0.2, 1.5, 0.02, 'distance range: the focal plane is 1'), slider('puffs.far', 'Far', 0.8, 3, 0.02),
    slider('puffs.nearBand', 'Near fade band', 0.02, 0.8, 0.01), slider('puffs.farBand', 'Far fade band', 0.02, 0.8, 0.01),
    slider('puffs.soft', 'Soft occlusion', 0.02, 0.5, 0.01, 'how gently a puff fades into the scene in front of it'),
    slider('puffs.shadeVar.0', 'Brightness lo', 0.4, 1.4, 0.02), slider('puffs.shadeVar.1', 'Brightness hi', 0.4, 1.6, 0.02),
    slider('puffs.alphaVar.0', 'Opacity lo', 0.1, 1, 0.02), slider('puffs.alphaVar.1', 'Opacity hi', 0.1, 1, 0.02)),
  group('Light', 'how the mist is lit', true,
    slider('mist.shade', 'Self-shadow', 0, 2, 0.05, 'how strongly a puff\'s own lumps shade it (0 = flat)'),
    slider('light.warm', 'Lit side warmth', 0, 1, 0.02, 'a warm tint on the lit (upper) side'), slider('light.lit', 'Lit side level', 0.5, 2, 0.02),
    slider('light.cool', 'Shade coolness', 0, 1, 0.02, 'a cool blue tint on the shaded underside'), slider('light.shade', 'Shade level', 0.3, 1.5, 0.02),
    slider('mist.sceneLight', 'Scene light', 0, 2, 0.05, 'the painting\'s own bright pixels (torches, windows) glow through the mist'),
    slider('mist.nearBright', 'Near brightness', 0, 2, 0.05, 'near puffs brighter than far ones')),
  group('Copy', 'the values, back into the data', true,
    row(button('Copy JSON', copy, ''), button('Reset to shipped', () => preset('Shipped'))),
    note('A parallax patch: only what differs from backgrounds.json. Paste it to Claude (or merge it by hand) to make it the default for everyone.'),
    code, status),
  group('Ideas', 'what would make it better', true, ideas()),
);

function ownToggle() {
  const l = document.createElement('label'); l.className = 'note';
  const c = document.createElement('input'); c.type = 'checkbox'; c.checked = S.ownFog;
  c.onchange = () => { S.ownFog = c.checked; syncs.forEach((f) => f()); apply(); };
  l.append(c, ' use each painting\'s shipped fog amount and wind');
  return l;
}
async function copy() {
  const json = patch(); code.value = json;
  try { await navigator.clipboard.writeText(json); status.textContent = 'Copied.'; } catch { status.textContent = 'Copy the values from the box.'; }
}
function flash(kind) {
  const w = innerWidth, h = innerHeight; // a card-sized rect right of centre, like a crit on an enemy
  bgLight(kind, { left: w * 0.55, top: h * 0.25, width: w * 0.14, height: h * 0.5 });
}
function ideas() {
  const d = document.createElement('div'); d.className = 'ideas';
  d.innerHTML = `
  <p class="note">Why it barely moved: the wind is ~0.01 world units a second across a 2.6-wide box (minutes to cross the screen), every puff slid at that one pace with a ±6% breath over a 24–46 s cycle, and nothing changed inside a puff: a static sprite, lit only by its baked shadow and the combat flashes.</p>
  <p class="note">Built into this build — the sliders above:</p>
  <ol>
    <li class="done"><b>Turbulence</b> — each puff wanders on a loop of its own phase and speed on top of the wind, so the field stops sliding in lockstep.</li>
    <li class="done"><b>Flow</b> — tileable noise scrolls across every puff, thinning and thickening it: the mist churns inside instead of being a stamp.</li>
    <li class="done"><b>Pulse</b> — puffs fade in and out on their own cycles, so the pattern keeps changing without more puffs.</li>
    <li class="done"><b>Faster, bigger cycles</b> — breathing, bobbing and rocking amplitudes and their periods are knobs (they were 6%, 0.012 and 24–46 s).</li>
    <li class="done"><b>Lit and shaded tints</b> — a warm top and a cool underside (real mist is lit from the sky and shaded below), plus the self-shadow strength.</li>
    <li class="done"><b>Scene light</b> — the painting's own bright pixels, read blurred, glow through the mist in front of them: torches, windows and lava light the fog.</li>
    <li class="done"><b>Near brightness</b> and the <b>haze shape</b> (density, curve, how much survives high up).</li>
  </ol>
  <p class="note">Next, if these take us far enough to want more:</p>
  <ol>
    <li><b>Gusts</b> — the wind strength itself breathes on a slow noise (calm, then a push), with turbulence rising in the gust; the simplest big win for "alive".</li>
    <li><b>Two mist layers</b> — a slow, large, thin far layer and a fast, small, denser ground layer with its own wind: depth in the motion, not only in the placement.</li>
    <li><b>Ground fog sheet</b> — a floor plane of scrolling noise under the puffs, fading with height: the "sea of fog" exteriors want.</li>
    <li><b>Light shafts</b> — a few long soft additive billboards from each scene's window or sky side, slowly swaying; needs a per-painting light direction (an override).</li>
    <li><b>Mist that reacts</b> — heavy blows and OVERKILL kick the wind for a second (a wind impulse along the jolt), crits brighten the mist a beat longer.</li>
    <li><b>Scene-coloured mist</b> — tint each puff by the art behind it (the painting's own colour, not one mist colour per scene), with a per-scene colour picker and brightness.</li>
    <li><b>More sprite variety</b> — eight atlas cells with a few wispy streaks among the billows, and two sprite sets (billow / streak) by height.</li>
    <li><b>Count by room</b> — exteriors and halls more puffs, corridors fewer; a per-painting count override.</li>
  </ol>`;
  return d;
}

// ---- the scenes ----
const sel = $('sceneSel');
for (const f of scenes) { const o = document.createElement('option'); o.value = f; o.textContent = nameOf(f); sel.append(o); }
let pending = null;
function show(f, { push = false } = {}) {
  file = f; sel.value = f; $('sceneName').textContent = nameOf(f);
  clearTimeout(pending);
  if (push) { bgPush(); pending = setTimeout(() => setBackground(f), 1000); } // the game's order: the push starts as the windows fade, the painting changes a second later
  else setBackground(f);
  syncs.forEach((g) => g()); apply();
}
sel.onchange = () => show(sel.value);
const step = (d) => show(scenes[(scenes.indexOf(file) + d + scenes.length) % scenes.length], { push: true });
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('hide').onclick = () => panel.classList.toggle('hidden');
addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return;
  if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'h') panel.classList.toggle('hidden'); else if (e.key === 'f') flash('crit'); else if (e.key === 'j') bgJolt(1);
});

// the game's renderer, software GL allowed (a lab), never stepping its quality down
if (initBg3d({ allowSoftware: true })) onBackgroundChange(showBackground3d);
else status.textContent = 'No WebGL here: the flat paintings only — the mist needs the 3D renderer.';
show(file);
$('sceneName').textContent = nameOf(file) + (isBg3dActive() ? '' : ' (no WebGL)');

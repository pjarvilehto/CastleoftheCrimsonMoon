// core/bg3dTuning.js — the 3D backgrounds' settings (0.101: split out of
// bg3d.js): built-in defaults < backgrounds.json `parallax` < its per-file
// `overrides` < this browser's saved ?debug slider values.

import { DATA } from '../shared/data.js';
import { PUFF_DEFAULTS } from './bg3dPuffs.js';
import { LIGHT_DEFAULTS } from './bg3dLights.js';

export const DEFAULTS = {
  enabled: true, depthScale: 0.5, pivot: 0.5, yawDeg: 2.5, pitchDeg: 1.2,
  yawPeriodS: 22, pitchPeriodS: 31, speed: 1, joltDeg: 0.6, swayDeg: 1.6, swayHitShare: 0.15, fovDeg: 40, overscan: 0.09,
  grid: [256, 144], maxFps: 30, fadeMs: 2000,
  maxPixels: 2100000, minFps: 22, // core/bg3dQuality.js (0.101)
  // fog (0.099, core/bg3dFog.js; puffs 0.101, core/bg3dPuffs.js): amount per
  // background (overrides), a global multiplier and drift speed (the ?debug
  // sliders), wind [x, y, z] (+z = toward the camera), fade-in on handover
  fog: 0.36, fogScale: 1, fogSpeed: 1, fogWind: [0.012, 0, 0], fogFadeMs: 2500, puffs: PUFF_DEFAULTS,
  lights: LIGHT_DEFAULTS, // flash lights (0.100, core/bg3dLights.js)
};

// ?debug tuning sliders (ui/bgTuner.js, 0.084) adjust these live; "Save"
// keeps them in this browser's localStorage (they apply here even without
// ?debug). The shipped values for everyone stay in backgrounds.json.
export const TUNABLE = ['depthScale', 'speed', 'yawDeg', 'pitchDeg', 'pivot', 'fogScale', 'fogSpeed'];
const SAVE_KEY = 'castle-bg-tuning';
let live = {};
try { live = JSON.parse(globalThis.localStorage?.getItem(SAVE_KEY) || '{}') || {}; } catch { live = {}; }

export function setLive(partial) { live = { ...live, ...partial }; }

// Keep values in this browser (null: forget them).
export function storeLive(values) {
  try {
    if (values) globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify(values));
    else { live = {}; globalThis.localStorage?.removeItem(SAVE_KEY); }
  } catch { /* private mode */ }
}

export function tuning(file) {
  const p = DATA.backgrounds?.parallax ?? {};
  return { ...DEFAULTS, ...p, ...(p.overrides?.[file] ?? {}), ...live };
}

// Depth map by naming convention, unless backgrounds.json parallax.depthFiles
// names a newer file (a regenerated map gets a NEW name — asset cache rule).
export const depthUrl = (file) =>
  `assets/bg/depth/${DATA.backgrounds?.parallax?.depthFiles?.[file] ?? `${file.replace(/\.[^.]+$/, '')}.png`}`;

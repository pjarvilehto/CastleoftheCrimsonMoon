// core/bg3dTuning.js — the 3D backgrounds' settings (0.101: split out of
// bg3d.js): backgrounds.json `parallax` < its per-file `overrides` < this
// browser's saved ?debug slider values. (0.157: the built-in defaults are
// gone — they were a drifting copy of the data; shared/dataCheck.js checks
// every knob at load.)

import { getJsonPref, setJsonPref, removePref } from '../shared/prefs.js';
import { DATA } from '../shared/data.js';
import { deviceBlock } from '../shared/platform.js';

// ?debug tuning sliders (ui/bgTuner.js, 0.084) adjust these live; "Save"
// keeps them in this browser's localStorage (they apply here even without
// ?debug). The shipped values for everyone stay in backgrounds.json.
export const TUNABLE = ['depthScale', 'speed', 'yawDeg', 'pitchDeg', 'pivot', 'fogScale', 'fogSpeed'];
const SAVE_KEY = 'castle-bg-tuning';
let live = getJsonPref(SAVE_KEY, {});

export function setLive(partial) { live = { ...live, ...partial }; }

// Keep values in this browser (null: forget them).
export function storeLive(values) {
  if (values) setJsonPref(SAVE_KEY, values);
  else { live = {}; removePref(SAVE_KEY); }
}

// device (0.00222): 'phone' takes parallax.phone's knobs over the base (the
// phone power profile, shared/platform.js deviceBlock); the per-file
// overrides and the saved sliders still come on top.
export function tuning(file, device) {
  const p = DATA.backgrounds.parallax;
  return { ...deviceBlock(p, device), ...(p.overrides?.[file] ?? {}), ...live };
}

// Depth map by naming convention, unless backgrounds.json parallax.depthFiles
// names a newer file (a regenerated map gets a NEW name — asset cache rule).
export const depthUrl = (file) =>
  `assets/bg/depth/${DATA.backgrounds.parallax.depthFiles?.[file] ?? `${file.replace(/\.[^.]+$/, '')}.png`}`;

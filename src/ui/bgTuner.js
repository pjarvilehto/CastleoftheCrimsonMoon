// ui/bgTuner.js — ?debug sliders for the 3D backgrounds (0.084). Moves are
// live; "Save Depth Settings" keeps the values in this browser (they apply
// here even without ?debug) and copies them as JSON, ready to be sent over
// and baked into backgrounds.json `parallax` as the default for everyone.

import { el } from '../core/scene.js';
import { panelToggle } from './cornerToggles.js';
import { isBg3dActive, liveTuning, setLiveTuning, saveLiveTuning, resetLiveTuning } from '../core/bg3d.js';

// [key, label, min, max, step, unit]
const SLIDERS = [
  ['depthScale', 'Depth', 0, 1.2, 0.05, ''],
  ['speed', 'Speed', 0.25, 3, 0.05, '×'],
  ['yawDeg', 'Sway X', 0, 5, 0.1, '°'],
  ['pitchDeg', 'Sway Y', 0, 3, 0.1, '°'],
  ['pivot', 'Focus', 0, 1, 0.05, ''],
  ['fogScale', 'Fog', 0, 2, 0.05, '×'],
  ['fogSpeed', 'Fog drift', 0, 4, 0.1, '×'],
];
const HINTS = {
  depthScale: 'how strongly depth separates near from far',
  speed: 'sway speed (1× = 22s side-to-side cycle)',
  yawDeg: 'side-to-side camera swing',
  pitchDeg: 'up-and-down camera swing',
  pivot: 'which depth stays still: 0 = far wall, 1 = nearest things',
  fogScale: 'mist amount, × each background\'s own (0.099)',
  fogSpeed: 'how fast the mist drifts, × each background\'s own wind (0.101)',
};

const fmt = (v, step) => Number(v).toFixed(step < 0.1 ? 2 : 1);

export const bgTunerToggle = () => panelToggle('BG TUNING', 'bg-tune-toggle', buildPanel);

function buildPanel() {
  if (!isBg3dActive()) {
    return el('div', { class: 'bg-tuner' }, el('div', { class: 'bg-tuner-status' }, '3D backgrounds are off in this browser (no WebGL, too slow, or reduced motion).'));
  }
  const status = el('div', { class: 'bg-tuner-status' }, 'Moves apply live. Save keeps them in this browser.');
  const code = el('textarea', { class: 'bg-tuner-code', readonly: true, rows: 3 });
  const inputs = [];
  const rows = SLIDERS.map(([key, label, min, max, step, unit]) => {
    const value = el('span', { class: 'bg-tuner-value' }, fmt(liveTuning()[key], step) + unit);
    const input = el('input', {
      type: 'range', min, max, step, value: liveTuning()[key], title: HINTS[key],
      oninput: (e) => {
        setLiveTuning({ [key]: Number(e.target.value) });
        value.textContent = fmt(e.target.value, step) + unit;
      },
    });
    inputs.push(() => { input.value = liveTuning()[key]; value.textContent = fmt(liveTuning()[key], step) + unit; });
    return el('label', { class: 'bg-tuner-row', title: HINTS[key] },
      el('span', { class: 'bg-tuner-label' }, label), input, value);
  });
  const panel = el('div', { class: 'bg-tuner' },
    el('div', { class: 'bg-tuner-title' }, 'BACKGROUND DEPTH'),
    ...rows,
    el('div', { class: 'bg-tuner-buttons' },
      el('button', {
        class: 'primary',
        onclick: async () => {
          const json = saveLiveTuning();
          code.value = json;
          let copied = false;
          try { await navigator.clipboard.writeText(json); copied = true; } catch { /* no clipboard permission */ }
          status.textContent = copied
            ? 'Saved in this browser and copied: paste it to Claude to make it the default for everyone.'
            : 'Saved in this browser. Copy the values below to make them the default for everyone.';
        },
      }, 'Save Depth Settings'),
      el('button', {
        onclick: () => {
          resetLiveTuning();
          inputs.forEach((sync) => sync()); // back to the shipped values
          code.value = '';
          status.textContent = 'Reset to the shipped settings (and cleared from this browser).';
        },
      }, 'Reset')),
    status,
    code);
  return panel;
}

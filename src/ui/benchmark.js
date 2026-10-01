// ui/benchmark.js — the ?debug BENCHMARK button and its dialogs (0.131).
// The button asks first (it takes ~40 s and plays a scripted fight), then
// switches to the benchmark scene (ui/scenes/benchmarkScene.js); the scene
// hands its result back here to show. Results are saved in the profile
// (profile.bench) and go out with the play stats to the /analytics/
// Performance card, next to the frame rates of real runs.

import { el } from '../core/dom.js';
import { go } from '../core/scene.js';
import { openDialog } from './dialog.js';
import { confirmPrompt } from './confirmPrompt.js';
import { shareStats } from '../meta/telemetry.js';
import { getProfile } from '../meta/profile.js';

export function benchmarkButton() {
  return el('button', { class: 'debug-toggle benchmark-toggle', onclick: askBenchmark }, 'BENCHMARK');
}

export function askBenchmark() {
  confirmPrompt({
    title: 'Benchmark',
    lines: ['About 40 seconds of scripted combat: the room at rest, a long fight, then OVERKILL after OVERKILL.',
      'Keep this window in front and leave the mouse and keyboard alone. Your save and run history are not touched.'],
    yes: ['Start', 's'], no: ['Cancel', 'c'],
    onYes: () => go('benchmark'),
  });
}

const ROWS = [['idle', 'Idle'], ['combat', 'Combat'], ['overkill', 'Overkill']];

export function showBenchmarkResult(r, onClose) {
  shareStats(getProfile()); // the result goes to the stats right away
  const cell = (p, f) => (p ? f(p) : '—');
  const table = el('table', { class: 'bench-table' },
    el('tr', {}, ...['Phase', 'FPS', 'Slow 5%', 'Dropped', 'Worst'].map((h) => el('th', {}, h))),
    ...ROWS.map(([id, label]) => {
      const p = r.phases[id];
      return el('tr', {}, el('td', {}, label), el('td', {}, cell(p, (x) => `${x.fps.toFixed(1)} of ${x.hz} Hz`)),
        el('td', {}, cell(p, (x) => `${x.p95} ms`)), el('td', {}, cell(p, (x) => `${x.drop.toFixed(1)}%`)), el('td', {}, cell(p, (x) => `${x.worst} ms`)));
    }));
  const close = el('button', { class: 'primary active', key: 'c', proceed: true, onclick: () => dlg.close() }, 'Close');
  const dlg = openDialog({
    label: 'Benchmark result', proceed: close, onClose,
    children: [
      el('h2', { class: 'update-title' }, 'Benchmark result'),
      table,
      el('p', { class: 'update-ask bench-note' },
        `${r.vw}×${r.vh} at ${r.dpr}x · background ${r.bg === 'flat' ? 'flat' : r.q > 0 ? `3D (quality step ${r.q})` : '3D'} · build ${r.build}`),
      el('p', { class: 'update-ask bench-note' }, 'Saved. It goes to the play stats with this browser’s runs.'),
      el('div', { class: 'btn-row' }, close),
    ],
    onKey: (k, closeIt) => { if (k === 'c' || k === 'enter' || k === 'escape') closeIt(); },
  });
  return dlg;
}

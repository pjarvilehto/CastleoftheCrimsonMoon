// ui/benchmark.js — the ?debug BENCHMARK button and its dialogs (0.131).
// The button asks first (it takes ~40 s and plays a scripted fight), then
// switches to the benchmark scene (ui/scenes/benchmarkScene.js); the scene
// hands its result back here to show. Results are saved in the profile
// (profile.bench) and go out with the play stats to the /analytics/
// Benchmarks card, next to the frame rates of real runs.
//
// 0.133: every player is asked once. When a player who has no result yet
// enters the Great Hall with a best room of telemetry.json
// benchmarkPromptRoom (10) or more, a dialog explains and offers only
// Continue; the benchmark then returns to the Great Hall. Closing the tab
// instead just means the question comes back next visit.

import { el } from '../core/dom.js';
import { go } from '../core/scene.js';
import { openDialog } from './dialog.js';
import { confirmPrompt } from './confirmPrompt.js';
import { shareStats } from '../meta/telemetry.js';
import { getProfile } from '../meta/profile.js';
import { DATA } from '../shared/data.js';

export function benchmarkButton() {
  return el('button', { class: 'debug-toggle benchmark-toggle', onclick: askBenchmark }, 'BENCHMARK');
}

// The benchmark's script (ui/scenes/benchmarkScene.js plays it): phases,
// each measured on its own. Changing it changes what the numbers mean.
const LINE = ['rat', 'skeleton', 'ghoul', 'wraith', 'crypt_spider']; // blood, bone, fire, spirit, blood
export const PHASES = [
  { id: 'idle', label: 'Idle', secs: 6, bg: 'castle_chapel_interior.jpg', enemies: LINE, act: null },
  { id: 'combat', label: 'Combat', secs: 20, bg: 'castle_chapel_interior.jpg', enemies: LINE, act: 'fight' },
  { id: 'overkill', label: 'Overkill', secs: 10, bg: 'castle_courtyard.jpg', enemies: [...LINE, 'gargoyle'], act: 'smash' },
];

// About how long a benchmark takes: its phases plus the room entrances,
// rounded up to 5 s.
export const benchmarkSeconds = () => Math.ceil((PHASES.reduce((s, p) => s + p.secs, 0) + 4) / 5) * 5;

// Due: no result yet, far enough in, and stats are being collected.
export function benchmarkDue(p) {
  return !!DATA.telemetry?.endpoint && !(p.bench?.length > 0) && p.records.bestRoom >= DATA.telemetry.benchmarkPromptRoom;
}

let asking = false;
export function maybeAskBenchmark() {
  if (asking || !benchmarkDue(getProfile())) return false;
  asking = true;
  const start = el('button', { class: 'primary active', key: 'c', proceed: true, onclick: () => { dlg.close(); go('benchmark', { returnTo: 'hub' }); } }, 'Continue');
  const dlg = openDialog({
    label: 'Benchmark', proceed: start, onClose: () => { asking = false; },
    children: [
      el('h2', { class: 'update-title' }, 'A quick benchmark'),
      el('p', { class: 'update-ask' }, `The game will sometimes ask you to run a benchmark. It takes about ${benchmarkSeconds()} seconds: a short scripted fight plays by itself while the game measures how smoothly it runs on this computer.`),
      el('p', { class: 'update-ask' }, 'Your save and runs are not touched. Thank you for your patience, it helps make the game run well everywhere.'),
      el('p', { class: 'update-ask bench-note' }, 'Please keep this window in front and leave the mouse and keyboard alone until it finishes.'),
      el('div', { class: 'btn-row' }, start),
    ],
    onKey: (k) => { if (k === 'c' || k === 'enter') start.click(); }, // Space: proceed; nothing skips it
  });
  return true;
}

export function askBenchmark() {
  confirmPrompt({
    title: 'Benchmark',
    lines: [`About ${benchmarkSeconds()} seconds of scripted combat: the room at rest, a long fight, then OVERKILL after OVERKILL.`,
      'Keep this window in front and leave the mouse and keyboard alone. Your save and run history are not touched.'],
    yes: ['Start', 's'], no: ['Cancel', 'c'],
    onYes: () => go('benchmark'),
  });
}

const ROWS = [['idle', 'Idle'], ['combat', 'Combat'], ['overkill', 'Overkill']];

export function showBenchmarkResult(r, onClose, thanks = false) {
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
      el('h2', { class: 'update-title' }, thanks ? 'Benchmark complete' : 'Benchmark result'),
      thanks ? el('p', { class: 'update-ask' }, 'Thank you! Back to the Great Hall.') : null,
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

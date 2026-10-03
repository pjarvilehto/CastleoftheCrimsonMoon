// ui/benchmark.js — the ?debug BENCHMARK button and its dialogs (0.131).
// The button asks first (it takes ~40 s and plays a scripted fight), then
// switches to the benchmark scene (ui/scenes/benchmarkScene.js); the scene
// hands its result back here to show. Results are saved in the profile
// (profile.bench) and go out with the play stats to the /analytics/
// Benchmarks card, next to the frame rates of real runs.
//
// 0.133: every player is asked once. When a player who has no result yet
// enters the Great Hall with a best room of telemetry.json
// benchmarkPromptRoom or more (10 then, 6 since 0.00219), a dialog explains and offers only
// Continue; the benchmark then returns to the Great Hall. Closing the tab
// instead just means the question comes back next visit.
// 0.00219: on again for the phone testers, from room 6; a result counts
// only from telemetry.json benchmarkSince on, so raising that knob asks
// everyone for a fresh round (the script's numbers moved with 0.183's
// card effects and the phone layer).

import { el } from '../core/dom.js';
import { go, currentScene, isTransitioning } from '../core/scene.js';
import { openDialog, anyDialogOpen } from './dialog.js';
import { confirmPrompt } from './confirmPrompt.js';
import { shareStats, telemetryEnabled } from '../meta/telemetry.js';
import { getProfile } from '../meta/profile.js';
import { DATA } from '../shared/data.js';
import { compareVersions } from '../shared/version.js';

export function benchmarkButton() {
  return el('button', { class: 'debug-toggle benchmark-toggle', onclick: askBenchmark }, 'BENCHMARK');
}

// The benchmark's script (ui/scenes/benchmarkScene.js plays it): phases,
// each measured on its own. Changing it changes what the numbers mean.
const LINE = ['rat', 'skeleton', 'ghoul', 'wraith', 'crypt_spider']; // blood, bone, fire, spirit, blood
export const PHASES = [
  { id: 'idle', label: 'Idle', secs: 6, bg: 'castle_chapel_interior.jpg', enemies: LINE, act: null },
  { id: 'combat', label: 'Combat', secs: 20, bg: 'castle_chapel_interior.jpg', enemies: LINE, act: 'fight' },
  { id: 'overkill', label: 'Overkill', secs: 10, bg: 'castle_courtyard.jpg', enemies: [...LINE, 'gargoyle'], act: 'overkill' },
];

// About how long a benchmark takes: its phases plus each room's settle
// (the painting's fade, the deal; 0.00222: a phase's clock starts at rest),
// rounded up to 5 s.
export const benchmarkSeconds = () => {
  const M = DATA.cards.motion, settle = PHASES.reduce((s, p) => s + DATA.backgrounds.parallax.fadeMs + M.enterDelayMs + M.enterMs + p.enemies.length * M.enterStaggerMs, 0) / 1000;
  return Math.ceil((PHASES.reduce((s, p) => s + p.secs, 0) + settle) / 5) * 5;
};

// Due: the ask is on (telemetry.json benchmarkPrompt), no result from this
// round yet (a build at or after benchmarkSince), far enough in, and stats
// are being sent from this host (telemetryEnabled: an endpoint and not
// localhost — 0.00223: it asked on localhost, where nothing is sent).
export function benchmarkDue(p) {
  const t = DATA.telemetry;
  const fresh = (p.bench ?? []).some((b) => compareVersions(b?.build, t.benchmarkSince) >= 0);
  return t.benchmarkPrompt === true && telemetryEnabled() && !fresh && p.records.bestRoom >= t.benchmarkPromptRoom;
}

// true = asked; 'wait' = due, but another dialog is up (0.134: it opened on
// top of "Descend Now?", which then stayed up over the benchmark) or a
// transition is running (0.00223: Continue's go() was dropped mid-fade) —
// the Great Hall tries again shortly; false = not due.
let asking = false;
export function maybeAskBenchmark() {
  if (asking || !benchmarkDue(getProfile())) return false;
  if (anyDialogOpen() || isTransitioning()) return 'wait';
  asking = true;
  const start = el('button', { class: 'primary active', key: 'c', proceed: true, onclick: () => { dlg.close(); if (!currentScene()?.inRun) go('benchmark', { returnTo: 'hub' }); } }, 'Continue'); // never out of a run
  const dlg = openDialog({
    label: 'Benchmark', proceed: start, onClose: () => { asking = false; },
    children: [
      el('h2', { class: 'update-title' }, 'A quick benchmark'),
      el('p', { class: 'update-ask' }, `The game will sometimes ask you to run a benchmark. It takes about ${benchmarkSeconds()} seconds: a short scripted fight plays by itself while the game measures how smoothly it runs on this device.`),
      el('p', { class: 'update-ask' }, 'Your save and runs are not touched. Thank you for your patience, it helps make the game run well everywhere.'),
      el('p', { class: 'update-ask bench-note' }, 'Please keep the game in front and leave it alone until it finishes: no taps, keys or clicks.'),
      el('div', { class: 'btn-row' }, start),
    ],
    onKey: (k) => { if (k === 'c' || k === 'enter') start.click(); }, // Space: proceed; nothing skips it
  });
  return true;
}

function askBenchmark() {
  const scene = currentScene();
  if (scene?.inRun && !scene.leaveRun) return; // (the benchmark itself)
  // mid-run (0.00256: it used to do nothing there): the run settles first —
  // never lost unsettled — and the benchmark returns to the Great Hall
  const midRun = !!scene?.inRun;
  confirmPrompt({
    title: 'Benchmark',
    lines: [`About ${benchmarkSeconds()} seconds of scripted combat: the room at rest, a long fight, then OVERKILL after OVERKILL.`,
      'Keep the game in front and leave it alone: no taps, keys or clicks. Your save and run history are not touched.',
      ...(midRun ? ['Your run ends here as a retreat: everything found so far is kept.'] : [])],
    yes: ['Start', 's'], no: ['Cancel', 'c'],
    onYes: () => {
      const returnTo = midRun || currentScene()?.name === 'hub' ? 'hub' : 'title'; // (0.00223: back to where it was pressed)
      const start = () => go('benchmark', { returnTo });
      if (midRun) currentScene()?.leaveRun?.(start); else start();
    },
  });
}

const ROWS = [['idle', 'Idle'], ['combat', 'Combat'], ['overkill', 'Overkill']];

// r.interrupted (0.00219): the game went to the background during the
// benchmark — nothing was measured or saved, and the ask comes back.
export function showBenchmarkResult(r, onClose, thanks = false) {
  if (r.interrupted) {
    const ok = el('button', { class: 'primary active', key: 'c', proceed: true, onclick: () => dlg.close() }, 'Close');
    const dlg = openDialog({
      label: 'Benchmark interrupted', proceed: ok, onClose,
      children: [
        el('h2', { class: 'update-title' }, 'Benchmark interrupted'),
        el('p', { class: 'update-ask' }, 'The game went to the background partway through, so nothing was measured or saved.'),
        el('p', { class: 'update-ask bench-note' }, thanks ? 'The Great Hall will ask again on another visit. Keep the game in front for the whole run.' : 'Run it again and keep the game in front for the whole run.'),
        el('div', { class: 'btn-row' }, ok),
      ],
      onKey: (k, closeIt) => { if (k === 'c' || k === 'enter' || k === 'escape') closeIt(); },
    });
    return dlg;
  }
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

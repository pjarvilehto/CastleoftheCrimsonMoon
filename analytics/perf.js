// analytics/perf.js — the Performance card (0.130): how smoothly the game
// runs for each player. Every run since 0.130 carries a frame-rate summary
// (src/core/perfMonitor.js: fps, p95 frame ms, % dropped frames, worst
// frame, refresh rate, background mode, window size), and the collector
// keeps each player's latest device (GPU, browser, OS, cores). Both come
// from other people's browsers: sanitize first, esc() every string.

import { esc } from './charts.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v, max) => (v === null || v === undefined ? '' : String(v).slice(0, max).replace(/[\u0000-\u001f\u007f]/g, ''));

export function sanitizePerf(p) {
  if (!p || typeof p !== 'object') return null;
  const out = { bg: p.bg === 'flat' ? 'flat' : '3d' };
  for (const k of ['fps', 'p95', 'drop', 'worst', 'hz', 'secs', 'q', 'dpr', 'vw', 'vh']) out[k] = num(p[k]);
  return out.fps > 0 ? out : null;
}

export function sanitizeDevice(d) {
  if (!d || typeof d !== 'object') return null;
  return { gpu: str(d.gpu, 120), browser: str(d.browser, 30), os: str(d.os, 20), screen: str(d.screen, 20), cores: num(d.cores), mem: num(d.mem) };
}

// "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)"
// -> "Apple M2 Pro"; "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 ...)"
// -> "NVIDIA GeForce RTX 3070"
export function gpuShort(gpu = '') {
  const m = /^ANGLE \(([^,]*),\s*([^,]*)/.exec(gpu);
  const name = (m ? m[2] : gpu).replace(/^ANGLE \w+ Renderer:\s*/, '').replace(/\s*(Direct3D|vs_|ps_|OpenGL|\(0x).*$/, '').trim();
  return name || gpu || '—';
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// One row per player with measured runs (in the current filter).
export function perfRows(players, runs) {
  return players.map((pl) => {
    const mine = runs.filter((r) => r.player === pl.key && r.perf);
    if (!mine.length) return null;
    const ps = mine.map((r) => r.perf), last = mine.reduce((a, r) => (r.at > a.at ? r : a)).perf;
    return {
      label: pl.label, device: pl.device ?? null, runs: mine.length,
      fps: median(ps.map((p) => p.fps)), p95: median(ps.map((p) => p.p95)), drop: median(ps.map((p) => p.drop)),
      worst: Math.max(...ps.map((p) => p.worst)), hz: last.hz, bg: last.bg, q: last.q, dpr: last.dpr, vw: last.vw, vh: last.vh,
    };
  }).filter(Boolean);
}

// fps judged against the display: >= 90% of its refresh is smooth.
const grade = (fps, hz) => (fps >= 0.9 * (hz || 60) ? 'perf-good' : fps >= 30 ? 'perf-ok' : 'perf-bad');
const bgText = (r) => (r.bg === 'flat' ? 'flat' : r.q > 0 ? `3D · step ${r.q}` : '3D');

export function perfTable(players, runs) {
  const rows = perfRows(players, runs);
  if (!rows.length) return '<p class="empty">No measured runs yet. Runs record their frame rate from build 0.130 on.</p>';
  return `<p class="help">Medians over each player's measured runs. FPS is green at 90%+ of the screen's refresh rate, amber from 30, red below. Slow 5% = the frame time 95% of frames beat; dropped = frames that missed a refresh.</p>
  <div class="scroll"><table><tr><th>Player</th><th>Runs</th><th>FPS</th><th>Slow 5%</th><th>Dropped</th><th>Worst</th><th>Screen</th><th>Background</th><th>Device</th></tr>${rows.map((r) => {
    const d = r.device;
    const dev = d ? `<span title="${esc(d.gpu)}">${esc(gpuShort(d.gpu))}</span><small>${esc([d.browser, d.os, d.cores ? `${d.cores} cores` : '', d.mem ? `${d.mem} GB` : ''].filter(Boolean).join(' · '))}</small>` : '<small>not reported</small>';
    return `<tr><td>${esc(r.label)}</td><td>${r.runs}</td><td class="${grade(r.fps, r.hz)}">${r.fps.toFixed(1)}<small>of ${r.hz} Hz</small></td>`
      + `<td>${r.p95} ms</td><td>${r.drop.toFixed(1)}%</td><td>${r.worst} ms</td>`
      + `<td>${r.vw}×${r.vh}<small>@${r.dpr}x</small></td><td>${esc(bgText(r))}</td><td>${dev}</td></tr>`;
  }).join('')}</table></div>`;
}

// ---- ?debug BENCHMARK results (0.131): the same scripted fight on every
// machine (src/ui/scenes/benchmarkScene.js), so these compare directly.
const PHASES = [['idle', 'Idle'], ['combat', 'Combat'], ['overkill', 'Overkill']];

export function sanitizeBench(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(-20).map((b) => {
    if (!b || typeof b !== 'object' || !Number.isFinite(Number(b.at))) return null;
    const ph = b.phases ?? {};
    return {
      at: num(b.at), build: str(b.build, 12) || '?', bg: b.bg === 'flat' ? 'flat' : '3d', q: num(b.q), dpr: num(b.dpr), vw: num(b.vw), vh: num(b.vh),
      phases: Object.fromEntries(PHASES.map(([k]) => [k, sanitizePerf({ ...ph[k], bg: b.bg })])),
    };
  }).filter(Boolean);
}

export function benchTable(players) {
  const rows = players.flatMap((pl) => (pl.profile.bench ?? []).map((b) => ({ pl, b }))).sort((x, y) => y.b.at - x.b.at);
  if (!rows.length) return '<p class="empty">No benchmarks yet: in the game with ?debug, press BENCHMARK (about 40 seconds).</p>';
  const phase = (p) => (p ? `<span class="${grade(p.fps, p.hz)}">${p.fps.toFixed(1)}</span><small>${p.p95} ms · ${p.drop.toFixed(1)}% dropped</small>` : '—');
  return `<div class="scroll"><table><tr><th>Player</th><th>When</th>${PHASES.map(([, l]) => `<th>${l}</th>`).join('')}<th>Screen</th><th>Background</th><th>Device</th></tr>${rows.map(({ pl, b }) => {
    const d = pl.device;
    return `<tr><td>${esc(pl.label)}</td><td>${esc(new Date(b.at).toLocaleString())}<small>build ${esc(b.build)}</small></td>`
      + PHASES.map(([k]) => `<td>${phase(b.phases[k])}</td>`).join('')
      + `<td>${b.vw}×${b.vh}<small>@${b.dpr}x</small></td><td>${esc(bgText(b))}</td>`
      + `<td>${d ? `<span title="${esc(d.gpu)}">${esc(gpuShort(d.gpu))}</span><small>${esc([d.browser, d.os].filter(Boolean).join(' · '))}</small>` : '<small>not reported</small>'}</td></tr>`;
  }).join('')}</table></div>`;
}

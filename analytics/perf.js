// analytics/perf.js — the Performance card (0.130): how smoothly the game
// runs for each player. Every run since 0.130 carries a frame-rate summary
// (src/core/perfMonitor.js: fps, p95 frame ms, % dropped frames, worst
// frame, refresh rate, background mode, window size), and the collector
// keeps each player's latest device (GPU, browser, OS, cores). Both come
// from other people's browsers: sanitize first, esc() every string.

import { esc } from './charts.js';
import { compareVersions } from '../src/shared/version.js';
import { RATES } from '../src/shared/refreshRates.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v, max) => (v === null || v === undefined ? '' : String(v).slice(0, max).replace(/[\u0000-\u001f\u007f]/g, ''));

export function sanitizePerf(p) {
  if (!p || typeof p !== 'object') return null;
  const out = { bg: p.bg === 'flat' ? 'flat' : '3d', power: ['saver', 'phone'].includes(p.power) ? p.power : 'full' };
  for (const k of ['fps', 'p95', 'drop', 'worst', 'worstOut', 'stalls', 'hz', 'secs', 'q', 'dpr', 'vw', 'vh']) out[k] = num(p[k]); // (worstOut, stalls: 0.00222)
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

// k = telemetry.json perf (dashboard.js passes data.perf): goodShare, okFps,
// nearShare, hzSince. 0.00222: before hzSince the refresh rate was read
// from the fastest frames, a step high on jittered timestamps (120 Hz Macs
// as 144, 60 Hz iPhones as 90 / 75, every ordinary frame "dropped"); such
// a row's fps within nearShare of a standard rate below its hz is that
// rate, at full rate, and its dropped share — counted against the wrong
// refresh — is not shown.
export const PERF_DEFAULTS = { nearShare: 0.06, paceShare: 0.15, goodShare: 0.9, okFps: 30, hzSince: '0.00222' };
const trusted = (build, k) => compareVersions(build ?? '0', k.hzSince) >= 0;
const misread = (p, build, k) => !!p && !trusted(build, k) && RATES.some((r) => r < p.hz && Math.abs(p.fps - r) <= k.nearShare * r);
// fps judged against the display: >= goodShare of its refresh is smooth (full: an old row read as full rate).
const grade = (fps, hz, k, full = false) => (full || fps >= k.goodShare * (hz || 60) ? 'perf-good' : fps >= k.okFps ? 'perf-ok' : 'perf-bad');
const dropCell = (drop, full, k) => (full ? `<small title="counted against a misread refresh rate (before build ${esc(k.hzSince)})">—</small>` : `${drop.toFixed(1)}%`);
const capped = (hz) => (hz === 30 ? ' · capped at 30' : '');
const moment = (out) => (out === 1 ? 'room change' : out === 0 ? 'in play' : '');

// One row per player with measured runs (in the current filter). The
// medians are over the runs whose refresh rate is trusted when the player
// has any (0.00222), else over all of them, marked misread.
export function perfRows(players, runs, k = PERF_DEFAULTS) {
  return players.map((pl) => {
    const mine = runs.filter((r) => r.player === pl.key && r.perf);
    if (!mine.length) return null;
    const good = mine.filter((r) => trusted(r.build, k)), use = good.length ? good : mine;
    const ps = use.map((r) => r.perf), newest = use.reduce((a, r) => (r.at > a.at ? r : a)), last = newest.perf;
    const worstRun = use.reduce((a, r) => (r.perf.worst > a.perf.worst ? r : a));
    return {
      label: pl.label, device: pl.device ?? null, runs: mine.length,
      fps: median(ps.map((p) => p.fps)), p95: median(ps.map((p) => p.p95)), drop: median(ps.map((p) => p.drop)),
      worst: median(ps.map((p) => p.worst)), worstRun: worstRun.perf.worst, worstOut: worstRun.perf.worstOut, stalls: median(ps.map((p) => p.stalls ?? 0)),
      hz: last.hz, bg: last.bg, q: last.q, power: last.power, dpr: last.dpr, vw: last.vw, vh: last.vh,
      misread: !good.length && misread(last, newest.build, k),
    };
  }).filter(Boolean);
}
// (0.00222: the power mode after the step — the battery saver or the phone profile)
const bgText = (r) => `${r.bg === 'flat' ? 'flat' : r.q > 0 ? `3D · step ${r.q}` : '3D'}${r.power === 'saver' ? ' · saver' : r.power === 'phone' ? ' · phone' : ''}`;

export function perfTable(players, runs, k = PERF_DEFAULTS) {
  const rows = perfRows(players, runs, k);
  if (!rows.length) return '<p class="empty">No measured runs yet. Runs record their frame rate from build 0.130 on.</p>';
  return `<p class="help">Medians over each player's measured runs. FPS is green at ${Math.round(k.goodShare * 100)}%+ of the display's rate (the rate the page was given frames at, read from the busiest frame interval; 30 Hz usually means a battery saver — Low Power Mode, Energy Saver — capped the page), amber from ${k.okFps}, red below. Slow 5% = the frame time 95% of frames beat; dropped = frames that missed a refresh (over 1.5 refresh intervals); stalls = frames of 100 ms or more per run; worst = the median run's longest frame, and the worst run's, with where it fell (a room change or in play). Rows from before build ${esc(k.hzSince)} read the rate from the fastest frames — a step high on jittered timestamps — and show no dropped share; their FPS is graded as full rate when it sits at a standard rate.</p>
  <div class="scroll"><table><tr><th>Player</th><th>Runs</th><th>FPS</th><th>Slow 5%</th><th>Dropped</th><th>Stalls</th><th>Worst</th><th>Worst run</th><th>Screen</th><th>Background</th><th>Device</th></tr>${rows.map((r) => {
    const d = r.device;
    const dev = d ? `<span title="${esc(d.gpu)}">${esc(gpuShort(d.gpu))}</span><small>${esc([d.browser, d.os, d.cores ? `${d.cores} cores` : '', d.mem ? `${d.mem} GB` : ''].filter(Boolean).join(' · '))}</small>` : '<small>not reported</small>';
    return `<tr><td>${esc(r.label)}</td><td>${r.runs}</td><td class="${grade(r.fps, r.hz, k, r.misread)}">${r.fps.toFixed(1)}<small>of ${r.hz} Hz</small></td>`
      + `<td>${r.p95} ms</td><td>${dropCell(r.drop, r.misread, k)}</td><td>${r.stalls}</td><td>${r.worst} ms</td><td>${r.worstRun} ms<small>${esc(moment(r.worstOut))}</small></td>`
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
      at: num(b.at), build: str(b.build, 12) || '?', bg: b.bg === 'flat' ? 'flat' : '3d', power: ['saver', 'phone'].includes(b.power) ? b.power : 'full', q: num(b.q), dpr: num(b.dpr), vw: num(b.vw), vh: num(b.vh),
      phases: Object.fromEntries(PHASES.map(([k]) => [k, sanitizePerf({ ...ph[k], bg: b.bg })])),
    };
  }).filter(Boolean);
}

// since (0.00221): telemetry.json benchmarkSince, the current round — a result
// from an older build gets its own Build column mark and a muted row (the
// script or what it draws changed since, so its numbers do not compare).
export function benchTable(players, since = '', k = PERF_DEFAULTS) {
  const rows = players.flatMap((pl) => (pl.profile.bench ?? []).map((b) => ({ pl, b }))).sort((x, y) => y.b.at - x.b.at);
  if (!rows.length) return '<p class="empty">No benchmarks yet: in the game with ?debug, press BENCHMARK (about 40 seconds).</p>';
  const phase = (p, build) => { const full = misread(p, build, k); return p ? `<span class="${grade(p.fps, p.hz, k, full)}">${p.fps.toFixed(1)}</span><small>${p.p95} ms · ${dropCell(p.drop, full, k)} dropped${capped(p.hz)}</small>` : '—'; };
  const older = (b) => !!since && compareVersions(b.build, since) < 0;
  const round = since ? `<p class="help">Build = the game build the benchmark ran on. The current round is build ${esc(since)}: rows from older builds are muted — the scripted fight or what it draws changed since, so their numbers do not compare with the newer ones.</p>` : '';
  return `${round}<div class="scroll"><table><tr><th>Player</th><th>When</th><th>Build</th>${PHASES.map(([, l]) => `<th>${l}</th>`).join('')}<th>Screen</th><th>Background</th><th>Device</th></tr>${rows.map(({ pl, b }) => {
    const d = pl.device;
    return `<tr${older(b) ? ' class="bench-old"' : ''}><td>${esc(pl.label)}</td><td>${esc(new Date(b.at).toLocaleString())}</td><td>${esc(b.build)}${older(b) ? '<small>older round</small>' : ''}</td>`
      + PHASES.map(([id]) => `<td>${phase(b.phases[id], b.build)}</td>`).join('')
      + `<td>${b.vw}×${b.vh}<small>@${b.dpr}x</small></td><td>${esc(bgText(b))}</td>`
      + `<td>${d ? `<span title="${esc(d.gpu)}">${esc(gpuShort(d.gpu))}</span><small>${esc([d.browser, d.os].filter(Boolean).join(' · '))}</small>` : '<small>not reported</small>'}</td></tr>`;
  }).join('')}</table></div>`;
}

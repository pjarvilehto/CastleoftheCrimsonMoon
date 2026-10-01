// core/perfMonitor.js — real-world frame rate for the play stats (0.130).
// While a dungeon run is on (dungeonScene starts and stops it), a tiny
// requestAnimationFrame loop records every frame's interval into a 1 ms
// histogram (quarter-ms bins); at the run's end summarizeFrames() turns that into a few
// numbers that ride on the run's history record (meta/history.js) to the
// collector and the /analytics/ Performance card. Hidden-tab time and
// long pauses (> PAUSE_MS) don't count. deviceInfo() describes the machine
// (GPU, browser, OS, cores) for the stats upload — never stored in the
// save. Everything is a safe no-op without a browser.

import { isBg3dActive, bgQualityLevel, gpuName } from './bg3d.js';

export const BIN_MS = 0.25; // histogram resolution (fine enough to tell 144 Hz from 165 Hz)
const BINS = 1000;         // 250 ms of bins; longer frames go in the last one
const PAUSE_MS = 1000; // a gap this long is a pause (alt-tab, sleep), not a frame
// Too little to say anything: under MIN_MS measured, or a handful of frames.
// (Time, not a frame count: a struggling device at 8 fps is exactly the run
// worth reporting.)
const MIN_MS = 5000, MIN_FRAMES = 20;

let st = null;

export function startPerf() {
  if (!globalThis.requestAnimationFrame) return;
  st = newRecording();
  const s = st;
  const loop = (now) => {
    if (st !== s) return; // stopped (or restarted)
    const d = now - s.last;
    if (s.last && d > 0 && d < PAUSE_MS && !globalThis.document?.hidden) addFrame(s, d);
    s.last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export const newRecording = () => ({ hist: new Uint32Array(BINS), frames: 0, ms: 0, worst: 0, last: 0 });
export function addFrame(s, d) {
  s.hist[Math.min(BINS - 1, Math.floor(d / BIN_MS))]++;
  s.frames++; s.ms += d;
  if (d > s.worst) s.worst = d;
}

// Ends the recording: the run's perf summary, or null (too short / no browser).
export function stopPerf() {
  const s = st;
  st = null;
  if (!s) return null;
  const sum = summarizeFrames(s);
  if (!sum) return null;
  const w = globalThis.innerWidth || 0, h = globalThis.innerHeight || 0; // the window, CSS px
  return {
    ...sum,
    bg: isBg3dActive() ? '3d' : 'flat',
    q: isBg3dActive() ? bgQualityLevel() : -1, // the 3D background's quality step (core/bg3dQuality.js)
    dpr: Math.round((globalThis.devicePixelRatio || 1) * 100) / 100,
    vw: Math.round(w), vh: Math.round(h),
  };
}

// Pure: { hist, frames, ms, worst } -> { fps, p95, drop, worst, hz, secs }.
//   fps   average frames per second
//   p95   95% of frames took at most this many ms
//   hz    the rate the page was given frames at: the fastest frames'
//         interval, snapped to a standard rate. 30 is real (0.135): battery
//         savers — macOS Low Power Mode, Chrome / Brave Energy Saver — cap
//         pages there, and every frame read as "dropped" against 60. Slower
//         than that, the device can't keep up and 60 is assumed.
//   drop  % of frames that missed a refresh (took > 1.5 refresh intervals)
const RATES = [30, 48, 50, 60, 75, 90, 100, 120, 144, 165, 240];
export function summarizeFrames({ hist, frames, ms, worst }) {
  if (!frames || frames < MIN_FRAMES || !(ms >= MIN_MS)) return null;
  const at = (q) => { // the bin holding the q-th fraction of frames
    let n = 0;
    for (let i = 0; i < hist.length; i++) if ((n += hist[i]) >= q * frames) return i;
    return hist.length - 1;
  };
  const fast = (at(0.1) + 0.5) * BIN_MS; // ms: the fastest 10% of frames (bin centre)
  const hz = fast > 40 ? 60 : RATES.reduce((a, r) => (Math.abs(1000 / r - fast) < Math.abs(1000 / a - fast) ? r : a));
  let late = 0;
  for (let i = Math.ceil(1500 / hz / BIN_MS); i < hist.length; i++) late += hist[i];
  return {
    fps: Math.round((frames * 10000) / ms) / 10,
    p95: Math.ceil((at(0.95) + 1) * BIN_MS), // whole ms, rounded up
    drop: Math.round((late * 1000) / frames) / 10,
    worst: Math.round(worst), // callers decide what is a pause (runs: PAUSE_MS; the benchmark: never, 0.135)
    hz,
    secs: Math.round(ms / 1000),
  };
}

// The machine, for the stats upload: GPU (from WebGL), browser, OS,
// CPU cores, memory (GB, Chromium only). Strings are short and generic.
let device = null;
export function deviceInfo() {
  if (device) return device;
  const nav = globalThis.navigator;
  if (!nav) return null;
  const ua = String(nav.userAgent ?? '');
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const ver = (ua.match(new RegExp(`${browser === 'Edge' ? 'Edg' : browser === 'Safari' ? 'Version' : browser}/(\\d+)`)) ?? [])[1] ?? '';
  const os = /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  device = {
    gpu: gpuName() ?? probeGpu(), browser: `${browser} ${ver}`.trim(), os,
    cores: Number(nav.hardwareConcurrency) || 0, mem: Number(nav.deviceMemory) || 0,
    screen: globalThis.screen ? `${globalThis.screen.width}x${globalThis.screen.height}` : '',
  };
  return device;
}

// No 3D background running: ask a throwaway WebGL context, then free it.
function probeGpu() {
  try {
    const gl = globalThis.document?.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name ? String(name) : null;
  } catch { return null; }
}

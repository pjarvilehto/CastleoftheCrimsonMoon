// core/perfMonitor.js — real-world frame rate for the play stats (0.130).
// While a dungeon run is on (dungeonScene starts and stops it), a tiny
// requestAnimationFrame loop records every frame's interval into a 1 ms
// histogram (quarter-ms bins); at the run's end summarizeFrames() turns that into a few
// numbers that ride on the run's history record (meta/history.js) to the
// collector and the /analytics/ Performance card. Hidden-tab time and
// long pauses (> PAUSE_MS) don't count. deviceInfo() describes the machine
// (GPU, browser, OS, cores) for the stats upload — never stored in the
// save. Everything is a safe no-op without a browser.

import { isBg3dActive, bgQualityLevel, gpuName, powerMode } from './bg3d.js';
import { isPhone } from '../shared/platform.js';
import { isTransitioning } from './scene.js';
import { DATA } from '../shared/data.js';
import { RATES, snapRate } from '../shared/refreshRates.js';

const BIN_MS = 0.25; // histogram resolution (quarter-ms bins: the busiest 2.25 ms places any standard rate)
const BINS = 1000;         // 250 ms of bins; longer frames go in the last one
const PAUSE_MS = 1000; // a gap this long is a pause (alt-tab, sleep), not a frame
// Too little to say anything: under MIN_MS measured, or a handful of frames.
// (Time, not a frame count: a struggling device at 8 fps is exactly the run
// worth reporting.)
const MIN_MS = 5000, MIN_FRAMES = 20;
const STALL_MS = 100; // a frame this long is a stall the player feels (counted per run, 0.00222)

let st = null;

export function startPerf() {
  if (!globalThis.requestAnimationFrame) return;
  st = newRecording();
  const s = st;
  const loop = (now) => {
    if (st !== s) return; // stopped (or restarted)
    const d = now - s.last;
    if (s.last && d > 0 && d < PAUSE_MS && !globalThis.document?.hidden) addFrame(s, d, isTransitioning()); // (0.00222: the worst frame remembers whether the windows were fading — a room change — or the fight was on)
    s.last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export const newRecording = () => ({ hist: new Uint32Array(BINS), frames: 0, ms: 0, worst: 0, worstOut: 0, last: 0 });
// out: the frame fell in a room change (the windows faded out) — kept for the worst one
export function addFrame(s, d, out = false) {
  s.hist[Math.min(BINS - 1, Math.floor(d / BIN_MS))]++;
  s.frames++; s.ms += d;
  if (d > s.worst) { s.worst = d; s.worstOut = out ? 1 : 0; }
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
    power: powerMode(isPhone()), // 'saver' | 'phone' | 'full' (0.00222: the battery saver, the phone profile, or neither)
    dpr: Math.round((globalThis.devicePixelRatio || 1) * 100) / 100,
    vw: Math.round(w), vh: Math.round(h),
  };
}

// Pure: { hist, frames, ms, worst, worstOut } -> { fps, p95, drop, worst,
// worstOut, stalls, hz, secs }.
//   fps   average frames per second
//   p95   95% of frames took at most this many ms
//   hz    the rate the page was given frames at, as a standard rate
//         (0.00222): the busiest 2.25 ms of the histogram — the interval
//         most frames were given; then a faster rate at least
//         perf.paceShare of the frames sit on, at two-thirds of that
//         interval or less (a locked display whose frames mostly took two
//         refreshes: 120 Hz at 70 fps — a lobe's own tail never
//         qualifies); then the average, which cannot beat the display:
//         when it does, the busiest interval was a doubled one and the
//         display is the standard rate the average sits at (within
//         perf.nearShare), else the lowest above it. The fastest 10% of
//         frames used to decide, and jittered timestamps put them a
//         refresh short: 120 Hz Macs read 144, 60 Hz iPhones 90 and 75,
//         every ordinary frame "dropped". 30 is real (0.135): battery
//         savers — macOS Low Power Mode, iOS Low Power Mode, Chrome /
//         Brave Energy Saver — cap pages there. Slower than 25 fps, the
//         device can't keep up and 60 is assumed.
//   drop  % of frames that missed a refresh (took > 1.5 refresh intervals)
//   stalls  frames of STALL_MS or more (what a player feels as a hitch)
//   worstOut  1 when the worst frame fell in a room change, else 0
// BIN_MS, MODE_BINS, PACE_BAND, STALL_MS, the 2/3 ratio, the 1.5-interval
// late rule and RATES define the measurement: a stored record compares
// with another only under one definition, so they live here and change
// with a build (and a new benchmark round), like the benchmark's PHASES.
// nearShare and paceShare are judgments the owner's data keeps moving:
// telemetry.json perf (rule 2).
const MODE_BINS = 9;    // the busiest 2.25 ms: wider than a lobe's catch-up shoulder
const PACE_BAND = 0.04; // "on a rate's pace" = within 4% of its interval
export function summarizeFrames({ hist, frames, ms, worst, worstOut = 0 }, { nearShare, paceShare } = DATA.telemetry.perf) {
  if (!frames || frames < MIN_FRAMES || !(ms >= MIN_MS)) return null;
  const at = (q) => { // the bin holding the q-th fraction of frames
    let n = 0;
    for (let i = 0; i < hist.length; i++) if ((n += hist[i]) >= q * frames) return i;
    return hist.length - 1;
  };
  const fps = (frames * 1000) / ms;
  let peak = 0, peakN = -1; // the busiest MODE_BINS (a tie goes to the slower)
  for (let i = 0, n = 0; i < hist.length; i++) { n += hist[i] - (i >= MODE_BINS ? hist[i - MODE_BINS] : 0); if (n >= peakN) { peakN = n; peak = i; } }
  const mode = (peak - (MODE_BINS - 1) / 2 + 0.5) * BIN_MS;
  let hz = mode > 40 ? 60 : snapRate(mode);
  const onPace = (r) => { // the share of frames within PACE_BAND of r's interval
    const t = 1000 / r; let n = 0;
    for (let i = Math.floor((t * (1 - PACE_BAND)) / BIN_MS), e = Math.floor((t * (1 + PACE_BAND)) / BIN_MS); i <= e; i++) n += hist[i];
    return n / frames;
  };
  const faster = RATES.filter((r) => r > hz && 1000 / r <= (mode * 2) / 3 && onPace(r) >= paceShare).pop();
  if (faster) hz = faster;
  if (fps > hz * (1 + nearShare)) hz = RATES.find((r) => Math.abs(fps - r) <= nearShare * r) ?? RATES.find((r) => r >= fps) ?? RATES[RATES.length - 1];
  let late = 0, stalls = 0;
  for (let i = Math.ceil(1500 / hz / BIN_MS); i < hist.length; i++) late += hist[i];
  for (let i = Math.ceil(STALL_MS / BIN_MS); i < hist.length; i++) stalls += hist[i];
  return {
    fps: Math.round(fps * 10) / 10,
    p95: Math.ceil((at(0.95) + 1) * BIN_MS), // whole ms, rounded up
    drop: Math.round((late * 1000) / frames) / 10,
    worst: Math.round(worst), // callers decide what is a pause (runs: PAUSE_MS; the benchmark: never, 0.135)
    worstOut: worstOut ? 1 : 0,
    stalls,
    hz,
    secs: Math.round(ms / 1000),
  };
}

// The machine, for the stats upload: GPU (from WebGL), browser, OS,
// CPU cores, memory (GB, Chromium only). Strings are short and generic.
let device = null;
// The OS for the device line. iPadOS Safari calls itself a Macintosh and
// gives nothing else away but its touch points (0.00205: it read as macOS
// on the stats page, and the collector keeps only this field for it).
export function osOf(ua, touch = false) {
  if (/iPhone|iPod/.test(ua)) return 'iOS';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'iPadOS';
  if (/Android/.test(ua)) return 'Android';
  return /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
}

export function deviceInfo() {
  if (device) return device;
  const nav = globalThis.navigator;
  if (!nav) return null;
  const ua = String(nav.userAgent ?? '');
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const ver = (ua.match(new RegExp(`${browser === 'Edge' ? 'Edg' : browser === 'Safari' ? 'Version' : browser}/(\\d+)`)) ?? [])[1] ?? '';
  const os = osOf(ua, (nav.maxTouchPoints ?? 0) > 1);
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

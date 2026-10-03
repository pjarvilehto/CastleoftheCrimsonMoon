// meta/perfReport.js — the device report (0.00225): what a later speed
// optimization needs that the run summary does not say. Built at a run's
// end and after a benchmark, kept here until the next stats upload takes
// it (telemetry.js statsPayload); the collector keeps the newest few per
// player and the /analytics/ page copies them out as JSON. Never stored in
// the save. Per phase: the frame summary, the frame-time histogram, the
// main thread's time per subsystem (core/perfSpans.js span), every stall
// with what was happening, the browser's long tasks; plus the device, the
// renderer's state, the card light's and the particles' knobs, and the last
// runs' summaries. telemetry.json report = how many runs and stalls.

import { DATA } from '../shared/data.js';
import { deviceInfo, summarizeFrames, histogramOf, spansOf, lastRecording } from '../core/perfMonitor.js';
import { rendererState } from '../core/bg3d.js';
import { cardFxState } from '../ui/cardFx.js';
import { particleState } from '../ui/particles.js';
import { reducedMotion } from '../shared/motion.js';
import { isPhone } from '../shared/platform.js';

export const REPORT_VERSION = 1;

// One recording (a run, a benchmark phase) as the report carries it.
export function phaseReport(rec) {
  if (!rec) return null;
  return {
    ...(summarizeFrames(rec) ?? { frames: rec.frames, secs: Math.round(rec.ms / 1000) }),
    hist: histogramOf(rec), split: spansOf(rec), stalls: rec.stalls ?? [], longTasks: rec.longTasks ?? 0, longMs: Math.round(rec.longMs ?? 0),
  };
}

function deviceFacts() {
  const nav = globalThis.navigator;
  return {
    ...(deviceInfo() ?? {}),
    dpr: Math.round((globalThis.devicePixelRatio || 1) * 100) / 100, vw: Math.round(globalThis.innerWidth || 0), vh: Math.round(globalThis.innerHeight || 0),
    touch: (nav?.maxTouchPoints ?? 0) > 0, phone: isPhone(), reducedMotion: reducedMotion(), lang: String(nav?.language ?? ''),
    standalone: !!(globalThis.matchMedia?.('(display-mode: standalone)')?.matches || nav?.standalone), // the home-screen app, not a browser tab
  };
}

export function buildReport(kind, phases, profile) {
  const R = DATA.telemetry.report;
  return {
    v: REPORT_VERSION, kind, at: Date.now(), build: DATA.build?.version ?? '?',
    device: deviceFacts(), renderer: rendererState(), cards: cardFxState(), particles: particleState(),
    phases,
    runs: (profile?.history ?? []).slice(-R.runs).map((r) => ({ at: r.at, build: r.build, room: r.room, outcome: r.outcome, perf: r.perf ?? null })),
  };
}

// The run's report, from the recording stopPerf() ended (null when nothing was recorded).
export function runReport(profile) {
  const rec = lastRecording();
  return rec ? buildReport('run', { run: phaseReport(rec) }, profile) : null;
}

let latest = null;
export function keepReport(r) { if (r) latest = r; }
export function takeReport() { const r = latest; latest = null; return r; }

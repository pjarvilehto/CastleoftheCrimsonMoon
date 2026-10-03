// core/perfSpans.js — the device report's main-thread timers (0.00225;
// perfMonitor.js owns the recording, this file has no imports so the
// renderer, the card light, the particles and the playback can time
// themselves without an import cycle). beginRecording(rec) names the
// recording spans, stalls and long tasks land in; span(name) times a piece
// of frame work into it; markActivity(kind) is what a stall was doing.

let current = null;   // the recording spans, stalls and long tasks land in (perfMonitor.js newRecording)
let longObs = null;
const activity = { kind: null, t: -Infinity }; // the last effect played (combatFx.playFx), for a stall's label
const ACTIVITY_MS = 600; // an effect this recent is what a stall was doing
const noop = () => {};

// The recording the subsystems' spans go to (startPerf's own; the
// benchmark's phases begin theirs by hand).
export function beginRecording(rec) {
  current = rec;
  if (!longObs && typeof globalThis.PerformanceObserver === 'function') {
    try {
      longObs = new PerformanceObserver((list) => { if (!current) return; for (const e of list.getEntries()) { current.longTasks++; current.longMs += e.duration; } });
      longObs.observe({ type: 'longtask', buffered: false });
    } catch { longObs = null; } // (Safari has no long tasks)
  }
}
export function endRecording() { current = null; }
// Time a piece of frame work: const end = span('bg'); ...; end()
export function span(name) {
  const r = current;
  if (!r) return noop;
  const t = performance.now();
  return () => {
    const d = performance.now() - t;
    const s = r.spans[name] ??= { ms: 0, n: 0, max: 0 };
    s.ms += d; s.n++; if (d > s.max) s.max = d;
  };
}
export function markActivity(kind) { activity.kind = kind; activity.t = performance.now(); }
export const activityNow = () => (performance.now() - activity.t < ACTIVITY_MS ? activity.kind : 'play');


// core/bg3dQuality.js — keeping the 3D background smooth (0.101). The art
// is 2048 px wide, so the canvas renders at most `maxPixels` (a 4K / Retina
// backing store only burned fill rate), and a frame-rate monitor runs the
// whole session, stepping down whenever a device can't keep up: lower
// resolution first (hard to see on painted art), then no fog, then the
// flat CSS backgrounds. It never steps back up (no see-sawing). No DOM or
// WebGL here — the smoke suite tests it in Node.

export const LADDER = [
  { scale: 1, fog: true },
  { scale: 0.8, fog: true },
  { scale: 0.64, fog: true },
  { scale: 0.64, fog: false },
]; // one step past the end: back to the flat backgrounds

// Backing-store size for a canvas of cssW x cssH CSS px: device pixels,
// but at most maxPixels in total, times the ladder's scale.
export function backingSize(cssW, cssH, dpr, maxPixels, scale = 1) {
  const s = Math.min(dpr || 1, Math.sqrt(maxPixels / Math.max(1, cssW * cssH))) * scale;
  return [Math.max(1, Math.round(cssW * s)), Math.max(1, Math.round(cssH * s))];
}

// Frame-rate windows over drawn frames. A gap longer than gapMs (a hidden
// tab, a loading hitch) restarts the window instead of counting as slow.
// Returns the next state: `fps` when a window completes, and `slow` = how
// many windows in a row came in under minFps (step down at SLOW_WINDOWS —
// one bad window is a hitch, two are the device).
export const SLOW_WINDOWS = 2;
export function fpsWindow(w, now, minFps, { windowMs = 3000, gapMs = 400 } = {}) {
  if (!w || now - w.last > gapMs) return { since: now, last: now, frames: 0, slow: 0 };
  const frames = w.frames + 1;
  if (now - w.since < windowMs) return { since: w.since, last: now, frames, slow: w.slow };
  const fps = (frames * 1000) / (now - w.since);
  return { since: now, last: now, frames: 0, fps, slow: fps < minFps ? w.slow + 1 : 0 };
}

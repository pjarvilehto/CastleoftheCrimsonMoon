// audio/musicLoop.js — seamless music (0.107). The generated beds are ~20s
// pieces that each fade to near-silence and back in, so `src.loop` on the
// file dipped into silence every ~20s. Instead the bed's sections
// (audioMath.findSections: the pieces minus their fades) play as a chain —
// 1, 2, 3, 1, 2, ... — each crossfading (equal power) into the next, every
// segment scheduled ahead on the audio clock (no timers: a busy or hidden
// tab can't open a gap).

import { fadeCurve } from './audioMath.js';

// Plays from context time `when` into `dest` until stop(). sections:
// [{ start, end }] in the buffer (s); crossfade: overlap (s). ahead:
// segments kept scheduled beyond the playing one (1 live; more for
// offline rendering).
//
// linear: equal-gain crossfades — for beds rendered as exact loops with
// their first `crossfade` seconds appended (0.113): the overlap then plays
// the same audio twice, in phase, and the beat keeps its place.
export function createLoop(ctx, buffer, dest, sections, when, { crossfade = 1.2, ahead = 1, linear = false } = {}) {
  const list = (Array.isArray(sections) ? sections : [sections]).filter((s) => s.end - s.start >= 0.5);
  const fadeIn = fadeCurve(32, false, linear), fadeOut = fadeCurve(32, true, linear);
  const live = new Set();
  let next = when, n = 0, stopped = false;

  function segment(at, first, pts) {
    const seg = pts.end - pts.start;
    const x = Math.min(crossfade, seg / 4);
    const g = ctx.createGain();
    g.connect(dest);
    // the first segment starts at full level: the track fade handles entry
    if (first) g.gain.setValueAtTime(1, at);
    else {
      g.gain.setValueAtTime(0, at);
      g.gain.setValueCurveAtTime(fadeIn, at, x);
    }
    g.gain.setValueCurveAtTime(fadeOut, at + seg - x, x);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(g);
    src.start(at, pts.start, seg);
    live.add(src);
    src.onended = () => {
      live.delete(src);
      try { g.disconnect(); } catch { /* gone */ }
      pump();
    };
  }

  function pump() {
    while (!stopped && live.size < ahead + 1) {
      const pts = list[n % list.length];
      const seg = pts.end - pts.start;
      segment(next, n === 0, pts);
      next += seg - Math.min(crossfade, seg / 4);
      n++;
    }
  }

  pump();
  return {
    stop(at = 0) {
      stopped = true;
      for (const s of live) { try { s.stop(at); } catch { /* already stopped */ } }
    },
    sections: list,
  };
}

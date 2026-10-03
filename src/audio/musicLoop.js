// audio/musicLoop.js — seamless music (0.107; exact loops only since
// 0.118). Each bed (tools/gen-music.py) is an exact loop of loopS seconds
// with its own first tailS seconds appended. Copy n plays [0, loopS+tailS)
// starting at when + n*loopS: the next copy starts as this one reaches its
// tail, and the two crossfade (equal gain) over identical audio — no dip,
// no +3 dB bump, and the beat keeps its place. Every copy is scheduled
// ahead on the audio clock (no timers: a busy or hidden tab can't open a
// gap); any MP3 decoder delay is hidden inside the crossfade.

import { fadeCurve } from './audioMath.js';

// Plays from context time `when` into `dest` until stop().
// ahead: copies kept scheduled beyond the playing one (1 live; more for
// offline rendering).
export function createLoop(ctx, buffer, dest, { loopS, tailS, crossfade }, when, { ahead = 1 } = {}) {
  const power = crossfade === 'power'; // (a generated bed's tail is its own continuation, not a copy of its start: audioMath.fadeCurve)
  const fadeIn = fadeCurve(32, false, power), fadeOut = fadeCurve(32, true, power);
  const seg = loopS + tailS;
  const live = new Set();
  let next = when, n = 0, stopped = false;

  function copy(at, first) {
    const g = ctx.createGain();
    g.connect(dest);
    // the first copy starts at full level: the track fade handles entry
    if (first) g.gain.setValueAtTime(1, at);
    else {
      g.gain.setValueAtTime(0, at);
      g.gain.setValueCurveAtTime(fadeIn, at, tailS);
    }
    g.gain.setValueCurveAtTime(fadeOut, at + loopS, tailS);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(g);
    src.start(at, 0, seg);
    live.add(src);
    src.onended = () => {
      live.delete(src);
      try { g.disconnect(); } catch { /* gone */ }
      pump();
    };
  }

  function pump() {
    while (!stopped && live.size < ahead + 1) {
      copy(next, n === 0);
      next += loopS;
      n++;
    }
  }

  pump();
  return {
    stop(at = 0) {
      stopped = true;
      for (const s of live) { try { s.stop(at); } catch { /* already stopped */ } }
    },
  };
}

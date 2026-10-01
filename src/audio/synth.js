// audio/synth.js — sweeteners generated on the fly (0.107), layered over the
// recorded clips for the big moments, so they need no new audio files:
//   ring — a short metallic "shing" (three inharmonic partials) on crits;
//          pitched down and louder on MEGA CRITS
//   boom — a deep falling thump (sine sweep + filtered noise) on OVERKILL
// Each plays into `out` at context time t and returns { dur, sources }.

export const SYNTH = { ring: true, boom: true };

let noise = null; // 0.4s of white noise, made once
function noiseBuffer(ctx) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.4), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function envelope(ctx, out, t, attack, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  return g;
}

function ring(ctx, out, t, rate) {
  const dur = 0.55;
  const env = envelope(ctx, out, t, 0.004, dur);
  const sources = [[1, 0.5], [1.5, 0.3], [2.76, 0.2]].map(([mult, level]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1480 * rate * mult;
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g);
    g.connect(env);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  });
  return { dur, sources };
}

function boom(ctx, out, t, rate) {
  const dur = 1.1;
  const env = envelope(ctx, out, t, 0.01, dur);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(110 * rate, t);
  o.frequency.exponentialRampToValueAtTime(36 * rate, t + 0.7);
  o.connect(env);
  o.start(t);
  o.stop(t + dur + 0.05);
  // the thump's attack: a burst of low-passed noise
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  const ng = envelope(ctx, out, t, 0.004, 0.3);
  n.connect(lp);
  lp.connect(ng);
  n.start(t);
  n.stop(t + 0.4);
  return { dur, sources: [o, n] };
}

export function playSynth(ctx, name, out, t, rate = 1) {
  return name === 'boom' ? boom(ctx, out, t, rate) : ring(ctx, out, t, rate);
}

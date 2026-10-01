// audio/synth.js — sweeteners generated on the fly (0.107), layered over the
// recorded clips for the big moments, so they need no new audio files:
//   ring — a short metallic "shing" (three inharmonic partials) on crits;
//          pitched down and louder on MEGA CRITS
//   boom — a deep falling thump (sine sweep + filtered noise) on OVERKILL
//   whoosh — moving to the next room (0.108): a band of noise sweeping up
//          and back down while it travels left to right, with a low gust
//   tick / thud / slice / clank — strike articulations (0.110), layered at
//          random under the attack and hurt clips so no two hits sound the
//          same: a blade's metallic tick, a body thud, the air cut by the
//          swing, plate armour taking a blow. Each also varies itself.
// Each plays into `out` at context time t and returns { dur, sources }.

export const SYNTH = { ring: true, boom: true, whoosh: true, tick: true, thud: true, slice: true, clank: true };
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

let noise = null; // 1.2s of white noise, made once
function noiseBuffer(ctx) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 1.2), ctx.sampleRate);
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

function whoosh(ctx, out, t, rate) {
  const dur = 0.95 / rate;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(260 * rate, t);
  bp.frequency.exponentialRampToValueAtTime(2600 * rate, t + dur * 0.48);
  bp.frequency.exponentialRampToValueAtTime(420 * rate, t + dur);
  const g = ctx.createGain(); // swells in, falls away
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + dur * 0.42);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(bp);
  bp.connect(g);
  let tail = g;
  if (ctx.createStereoPanner) { // travels left -> right: deeper into the castle
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.6, t);
    p.pan.linearRampToValueAtTime(0.6, t + dur);
    g.connect(p);
    tail = p;
  }
  tail.connect(out);
  const gust = ctx.createBufferSource(); // the low air under it
  gust.buffer = noiseBuffer(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 180;
  const gg = envelope(ctx, out, t, dur * 0.4, dur);
  gust.connect(lp);
  lp.connect(gg);
  n.start(t);
  n.stop(t + dur + 0.05);
  gust.start(t);
  gust.stop(t + dur + 0.05);
  return { dur, sources: [n, gust] };
}

// A few inharmonic partials, struck: blade ticks and armour clanks.
function partials(ctx, out, t, base, ratios, decay, levels) {
  const dur = decay * 5;
  const sources = ratios.map((r, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = base * r;
    const g = envelope(ctx, out, t, 0.0015, decay * (5 - i));
    const lvl = ctx.createGain();
    lvl.gain.value = levels[i] ?? 0.3;
    o.connect(lvl);
    lvl.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  });
  return { dur, sources };
}

function noiseHit(ctx, out, t, type, freq, q, decay) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  n.playbackRate.value = rand(0.8, 1.25); // a different stretch of the noise each time
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = envelope(ctx, out, t, 0.002, decay);
  n.connect(f);
  f.connect(g);
  n.start(t, rand(0, 0.6));
  n.stop(t + decay + 0.05);
  return n;
}

function tick(ctx, out, t, rate) {
  const base = rand(2600, 4200) * rate;
  const p = partials(ctx, out, t, base, [1, 1.47, 2.09], rand(0.012, 0.03), [0.5, 0.3, 0.2]);
  p.sources.push(noiseHit(ctx, out, t, 'highpass', 5000, 0.7, 0.012));
  return p;
}

function thud(ctx, out, t, rate) {
  const dur = 0.2;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(rand(120, 170) * rate, t);
  o.frequency.exponentialRampToValueAtTime(rand(50, 70) * rate, t + 0.12);
  o.connect(envelope(ctx, out, t, 0.002, rand(0.09, 0.15)));
  o.start(t);
  o.stop(t + dur + 0.05);
  return { dur, sources: [o, noiseHit(ctx, out, t, 'lowpass', rand(300, 600), 0.7, rand(0.03, 0.06))] };
}

function slice(ctx, out, t, rate) {
  const dur = rand(0.09, 0.16);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(rand(4500, 7000) * rate, t);
  bp.frequency.exponentialRampToValueAtTime(rand(1500, 2500) * rate, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(bp);
  bp.connect(g);
  g.connect(out);
  n.start(t, rand(0, 0.6));
  n.stop(t + dur + 0.05);
  return { dur, sources: [n] };
}

function clank(ctx, out, t, rate) {
  const base = rand(650, 1300) * rate;
  const p = partials(ctx, out, t, base, [1, 1.73, 2.41, 3.1], rand(0.04, 0.07), [0.45, 0.3, 0.2, 0.12]);
  p.sources.push(noiseHit(ctx, out, t, 'bandpass', base * 2, 1.5, 0.03));
  return p;
}

const PLAYERS = { whoosh, tick, thud, slice, clank };

export function playSynth(ctx, name, out, t, rate = 1) {
  if (PLAYERS[name]) return PLAYERS[name](ctx, out, t, rate);
  return name === 'boom' ? boom(ctx, out, t, rate) : ring(ctx, out, t, rate);
}

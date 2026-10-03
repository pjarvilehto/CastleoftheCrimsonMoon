// audio/synth.js — sweeteners generated on the fly (0.107), layered over the
// recorded clips for the big moments, so they need no new audio files:
//   ring — a short metallic "shing" (three inharmonic partials) on crits;
//          pitched down and louder on MEGA CRITS
//   boom — a deep falling thump (sine sweep + filtered noise) on OVERKILL
//   tick / thud / slice / clank — strike articulations (0.110), layered at
//          random under the attack and hurt clips so no two hits sound the
//          same: a blade's metallic tick, a body thud, the air cut by the
//          swing, plate armour taking a blow. Each also varies itself.
// Each plays into `out` at context time t and returns { dur, sources }.
// Each is a `synth: true` entry in audio.json clips (0.118).

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

// A few inharmonic partials, struck: blade ticks and armour clanks.
function partials(ctx, out, t, base, ratios, decay, levels) {
  const dur = decay * 5;
  const sources = ratios.map((r, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = base * r;
    const g = envelope(ctx, out, t, 0.0015, decay * (5 - i));
    const lvl = ctx.createGain();
    lvl.gain.value = levels[i];
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

// ---- the classes' voices (0.00270, the developer's ask: each class its own
// attack and get-hit sounds) — layered by audio.json variation under the
// per-class strike and hurt clips (atk_<id> / heavy_<id> / hurt_<id>, the
// developer's two recordings pitched per class), and played on their own
// for the class events (combatQueue.js EV_SFX: the hex a chime, the blight
// a hiss...). A sound-generation key would replace the base recordings
// (tools/gen-sfx.mjs); these layers stay as the class's colour. ----
// an LFO on a param: a sine at `hz` swinging it by `depth`
function lfo(ctx, param, t, hz, depth, until) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = hz; g.gain.value = depth;
  o.connect(g); g.connect(param);
  o.start(t); o.stop(until);
  return o;
}
// swing — a heavy swing: band-passed noise sweeping down with a swell (the Barbarian's Cleave, the Fireball's rush)
function swing(ctx, out, t, rate) {
  const dur = rand(0.24, 0.32);
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(rand(1400, 2200) * rate, t);
  bp.frequency.exponentialRampToValueAtTime(rand(220, 360) * rate, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(bp); bp.connect(g); g.connect(out);
  n.start(t, rand(0, 0.6)); n.stop(t + dur + 0.05);
  return { dur, sources: [n] };
}
// crackle — fire: a low roar bed and a scatter of sharp pops (the Wizard's Fireball)
function crackle(ctx, out, t, rate) {
  const dur = 0.45;
  const bed = ctx.createBufferSource(); bed.buffer = noiseBuffer(ctx);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 * rate; lp.Q.value = 0.8;
  bed.connect(lp); lp.connect(envelope(ctx, out, t, 0.03, dur));
  bed.start(t, rand(0, 0.5)); bed.stop(t + dur + 0.05);
  const sources = [bed];
  const pops = 4 + Math.floor(rand(0, 3));
  for (let i = 0; i < pops; i++) sources.push(noiseHit(ctx, out, t + rand(0.01, 0.32), 'highpass', rand(2200, 5200) * rate, 1.2, rand(0.012, 0.03)));
  return { dur, sources };
}
// zap — arcane: a fast falling buzz with a sine core (the Wizard's blows, a charge back)
function zap(ctx, out, t, rate) {
  const dur = rand(0.12, 0.18);
  const sources = [['sawtooth', 1, 0.35], ['sine', 0.5, 0.6]].map(([type, mult, level]) => {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(rand(1600, 2400) * rate * mult, t);
    o.frequency.exponentialRampToValueAtTime(rand(240, 360) * rate * mult, t + dur);
    const lvl = ctx.createGain(); lvl.gain.value = level;
    o.connect(lvl); lvl.connect(envelope(ctx, out, t, 0.004, dur));
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  });
  return { dur, sources };
}
// wail — a grave voice: two detuned low sines, a vibrato, rising then sinking, with breath (the Necromancer, the thrall; pitched low, the Druid's growl)
function wail(ctx, out, t, rate) {
  const dur = rand(0.5, 0.65), base = rand(150, 200) * rate;
  const env = envelope(ctx, out, t, 0.06, dur);
  const sources = [1, 1.012].map((d) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(base * d, t);
    o.frequency.exponentialRampToValueAtTime(base * d * 1.35, t + dur * 0.35);
    o.frequency.exponentialRampToValueAtTime(base * d * 0.7, t + dur);
    const lvl = ctx.createGain(); lvl.gain.value = 0.4;
    o.connect(lvl); lvl.connect(env);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  });
  sources.push(lfo(ctx, sources[0].frequency, t, 6.5, base * 0.04, t + dur + 0.05));
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700 * rate; bp.Q.value = 1.1;
  const ng = ctx.createGain(); ng.gain.value = 0.25;
  n.connect(bp); bp.connect(ng); ng.connect(env);
  n.start(t, rand(0, 0.5)); n.stop(t + dur + 0.05);
  sources.push(n);
  return { dur, sources };
}
// rake — three quick claws across, each a touch lower (the Druid's feral blows)
function rake(ctx, out, t, rate) {
  const gap = rand(0.038, 0.05), f0 = rand(2600, 3600) * rate;
  const sources = [0, 1, 2].map((i) => noiseHit(ctx, out, t + i * gap, 'bandpass', f0 * (1 - i * 0.12), 2.4, rand(0.035, 0.05)));
  return { dur: gap * 2 + 0.08, sources };
}
// chime — a small inharmonic bell (the Hexhunter's Hex, the Plague Sister's rites)
function chime(ctx, out, t, rate) {
  return partials(ctx, out, t, rand(1000, 1300) * rate, [1, 2.0, 2.76, 4.07], rand(0.11, 0.16), [0.45, 0.25, 0.2, 0.1]);
}
// hiss — censer smoke: a soft high noise swelling and settling, with the chain's rattle (the Plague Sister)
function hiss(ctx, out, t, rate) {
  const dur = rand(0.3, 0.42);
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200 * rate; hp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(hp); hp.connect(g); g.connect(out);
  n.start(t, rand(0, 0.6)); n.stop(t + dur + 0.05);
  const sources = [n];
  for (let i = 0; i < 3; i++) sources.push(...partials(ctx, out, t + rand(0, 0.2), rand(2400, 3400) * rate, [1, 1.53], 0.012, [0.12, 0.06]).sources);
  return { dur, sources };
}
// grunt — the hero struck: a short voiced burst (a buzz falling in pitch through two vowel formants) and a breath; the rate is the voice (lower for the Barbarian, higher for the women)
function grunt(ctx, out, t, rate) {
  const dur = rand(0.14, 0.2), f = rand(130, 160) * rate;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f * 1.25, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.8, t + dur);
  const env = envelope(ctx, out, t, 0.012, dur);
  const sources = [o];
  for (const [freq, q, level] of [[620, 4, 0.5], [1150, 5, 0.3]]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * rate; bp.Q.value = q;
    const lvl = ctx.createGain(); lvl.gain.value = level;
    o.connect(bp); bp.connect(lvl); lvl.connect(env);
  }
  o.start(t); o.stop(t + dur + 0.05);
  sources.push(noiseHit(ctx, out, t, 'bandpass', 1800 * rate, 0.9, rand(0.04, 0.07)));
  return { dur, sources };
}

const PLAYERS = { ring, boom, tick, thud, slice, clank, swing, crackle, zap, wail, rake, chime, hiss, grunt };

export function playSynth(ctx, name, out, t, rate = 1) {
  return PLAYERS[name] ? PLAYERS[name](ctx, out, t, rate) : null; // null: no such generated sound
}

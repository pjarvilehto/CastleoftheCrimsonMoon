// tools/test/fakeAudio.mjs — a recording Web Audio stand-in (0.118), so the
// smoke suite can drive the real audio engine (sfx.js, music.js,
// musicLoop.js, mixer.js) instead of grepping its source. Like browsers,
// an AudioParam refuses non-finite values: the error is thrown AND logged
// in ctx.errors (the engine swallows audio errors, the tests must not).
//
// installFakeAudio() -> { ctx(), gesture(type), restore() }: installs
// globalThis.AudioContext, captures the window listeners the engine
// registers (by event type; removeEventListener is real, so a once-only
// listener leaves — 0.00223: every first-gesture callback used to fire
// twice, and a touch's pointerup / touchend were dropped), and stubs fetch
// for audio files. gesture('touchend') fires that type's listeners.

export class FakeParam {
  constructor(ctx, v = 0) { this.ctx = ctx; this.v = v; this.events = []; }
  check(...vals) {
    for (const x of vals) {
      if (!Number.isFinite(x)) {
        const e = new TypeError(`Failed to set AudioParam: non-finite value ${x}`);
        this.ctx.errors.push(e.message);
        throw e;
      }
    }
  }
  get value() { return this.v; }
  set value(x) { this.check(x); this.v = x; this.events.push(['value', x]); }
  setValueAtTime(x, t) { this.check(x, t); this.v = x; this.events.push(['set', x, t]); }
  linearRampToValueAtTime(x, t) { this.check(x, t); this.events.push(['linear', x, t]); }
  exponentialRampToValueAtTime(x, t) {
    this.check(x, t);
    if (x === 0) { this.ctx.errors.push('exponential ramp to 0'); throw new RangeError('exponential ramp to 0'); }
    this.events.push(['exp', x, t]);
  }
  setTargetAtTime(x, t, k) { this.check(x, t, k); this.events.push(['target', x, t, k]); }
  setValueCurveAtTime(curve, t, d) { this.check(...curve, t, d); this.events.push(['curve', Array.from(curve), t, d]); }
  cancelScheduledValues(t) { this.check(t); }
  cancelAndHoldAtTime(t) { this.check(t); }
}

class FakeNode {
  constructor(ctx, kind, params = {}) {
    this.ctx = ctx; this.kind = kind; this.outs = [];
    for (const [k, v] of Object.entries(params)) this[k] = new FakeParam(ctx, v);
    ctx.nodes.push(this);
  }
  connect(n) { this.outs.push(n); return n; }
  disconnect() { this.outs = []; }
}

class FakeSource extends FakeNode {
  start(at = 0, offset = 0, dur) { this.ctx.check(at, offset, dur ?? 0); this.started = [at, offset, dur]; this.ctx.started.push(this); }
  stop(at = 0) { this.stopped = at; }
}

export class FakeAudioContext {
  constructor() {
    this.currentTime = 0; this.sampleRate = 48000; this.state = 'running';
    this.errors = []; this.nodes = []; this.started = [];
    this.destination = { kind: 'destination' };
    FakeAudioContext.last = this;
  }
  check(...vals) { for (const x of vals) if (!Number.isFinite(x)) { this.errors.push(`non-finite ${x}`); throw new TypeError('non-finite'); } }
  createGain() { return new FakeNode(this, 'gain', { gain: 1 }); }
  createStereoPanner() { return new FakeNode(this, 'panner', { pan: 0 }); }
  createBiquadFilter() { return new FakeNode(this, 'biquad', { frequency: 350, Q: 1, gain: 0 }); }
  createDynamicsCompressor() { return new FakeNode(this, 'compressor', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 }); }
  createOscillator() { return new FakeSource(this, 'osc', { frequency: 440, detune: 0 }); }
  createBufferSource() { const s = new FakeSource(this, 'buffer', { playbackRate: 1 }); s.buffer = null; return s; }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c) => data[c] };
  }
  // every decoded file: 62.05 s of silence (a 60 s loop + 2 s tail + padding);
  // `bytes` = the compressed size it was decoded from, so a test that gives
  // each file its own size can tell the buffers apart (0.00297: which whoosh a transition picked)
  async decodeAudioData(bytes) {
    const b = this.createBuffer(2, Math.round(62.05 * 48000), 48000);
    b.bytes = bytes?.byteLength ?? 0;
    return b;
  }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
}

export function installFakeAudio() {
  const saved = { AudioContext: globalThis.AudioContext, add: globalThis.addEventListener, remove: globalThis.removeEventListener, fetch: globalThis.fetch };
  const gestures = []; // { type, fn }
  globalThis.AudioContext = FakeAudioContext;
  globalThis.addEventListener = (type, fn) => { gestures.push({ type, fn }); };
  globalThis.removeEventListener = (type, fn) => { const i = gestures.findIndex((g) => g.type === type && g.fn === fn); if (i >= 0) gestures.splice(i, 1); };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).includes('assets/audio/')
    ? { ok: true, arrayBuffer: async () => new ArrayBuffer(16) }
    : realFetch(url));
  return {
    ctx: () => FakeAudioContext.last,
    gesture: (type = 'pointerdown') => { for (const g of gestures.filter((g) => g.type === type)) g.fn(); }, // (a copy: the mixer registers its resume listeners during the first gesture)
    restore: () => {
      globalThis.AudioContext = saved.AudioContext; globalThis.fetch = saved.fetch;
      globalThis.addEventListener = saved.add; globalThis.removeEventListener = saved.remove;
    },
  };
}

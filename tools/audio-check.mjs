#!/usr/bin/env node
// tools/audio-check.mjs — measure the audio the way the game plays it
// (0.118). Until now these numbers came from throwaway scripts; this makes
// them reproducible. Decodes in real Chromium (its MP3 decoder, the one
// players hear) via Playwright:
//
//   1. every sound clip's loudest 50 ms (dBFS) vs its audio.json
//      clips.<name>.measuredDb — the number its gainDb trim was set from;
//   2. every music bed played through the game's own loop
//      (src/audio/musicLoop.js) for 2.5 loops: does each restart match
//      plain continuation (restart error), does the level jump at the
//      restart, and its level as played (median / 90th percentile of 0.5 s
//      windows, after its gainDb trim).
//
// Usage:  node tools/audio-check.mjs
// Needs Playwright + a Chromium:  npm install --no-save playwright
// (PLAYWRIGHT_PATH / CHROMIUM name them, as for tools/layout-check.mjs; the
// cloud container's /opt paths are the defaults, 0.00223). Exit code 1 if a clip drifted
// more than 2 dB (the 0.107 trims used slightly different windows; death
// and swoosh re-measure +1.5) from its measuredDb, a restart is worse than -20 dB or
// a restart jumps more than 1 dB.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp3': 'audio/mpeg' };

const PW = process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
let chromium;
try {
  ({ chromium } = await import(existsSync(PW) ? PW : 'playwright'));
} catch {
  console.error('Playwright not found: npm install --no-save playwright (or PLAYWRIGHT_PATH=/path/to/playwright/index.mjs)');
  process.exit(2);
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const page = await browser.newPage();
await page.goto(`${base}/assets/data/audio.json`);
const result = await page.evaluate(async () => {
  const { createLoop } = await import('/src/audio/musicLoop.js');
  const A = await (await fetch('/assets/data/audio.json')).json();
  const SR = 44100;
  const decode = async (url) => new OfflineAudioContext(2, 1, SR).decodeAudioData(await (await fetch('/' + url)).arrayBuffer());
  const db = (v) => 20 * Math.log10(v + 1e-12);
  const windows = (L, R, w) => {
    const out = [];
    for (let i = 0; i + w <= L.length; i += w) {
      let s = 0;
      for (let k = i; k < i + w; k++) s += (L[k] * L[k] + R[k] * R[k]) / 2;
      out.push(10 * Math.log10(s / w + 1e-12));
    }
    return out;
  };
  const clips = {};
  for (const [name, c] of Object.entries(A.clips)) {
    if (!c.file) continue;
    const b = await decode(c.file);
    const R = b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0);
    clips[name] = { measured: c.measuredDb, now: Math.max(...windows(b.getChannelData(0), R, Math.round(0.05 * b.sampleRate))) };
  }
  const music = {};
  for (const [name, t] of Object.entries(A.music.tracks)) {
    const buf = await decode(t.file);
    const ch = buf.getChannelData(0);
    const total = Math.round((t.loopS * 2.5) * SR);
    const ctx = new OfflineAudioContext(2, total, SR);
    const g = ctx.createGain();
    g.gain.value = 10 ** (t.gainDb / 20);
    g.connect(ctx.destination);
    createLoop(ctx, buf, g, t, 0, { ahead: 4 });
    const out = await ctx.startRendering();
    const L = out.getChannelData(0), Rr = out.getChannelData(1);
    const loop = Math.round(t.loopS * SR), gain = 10 ** (t.gainDb / 20);
    // The reference: the bed as recorded, no restart. Before loopS + tailS
    // that is the file itself (its appended tail is the loop's start played
    // straight on); after it, the start again. Not the file's first frame:
    // MP3 decoders fade the first ~26 ms in — the tail is the faithful copy,
    // and hiding that transient is part of what the crossfade is for.
    const tailEnd = loop + Math.round(t.tailS * SR);
    const ref = (k) => ch[k < tailEnd ? k : k - loop] * gain;
    let err = 0, sig = 0;
    for (let i = loop; i < tailEnd + Math.round(0.5 * SR); i++) {
      const r = ref(i);
      err += (L[i] - r) ** 2; sig += r * r;
    }
    let jump = 0;
    const w = Math.round(0.05 * SR);
    const rms = (a, s) => { let x = 0; for (let k = s; k < s + w; k++) x += a[k] * a[k]; return Math.sqrt(x / w); };
    const plain = (s) => { let x = 0; for (let k = s; k < s + w; k++) { const v = ref(k); x += v * v; } return Math.sqrt(x / w); };
    for (let s = loop - Math.round(0.5 * SR); s < loop + Math.round((t.tailS + 0.5) * SR); s += w) jump = Math.max(jump, Math.abs(db(rms(L, s)) - db(plain(s))));
    // A generated bed (0.00277, crossfade 'power') crossfades its own
    // continuation into its start: different music, so "restart = plain
    // continuation" does not apply. Its seam is judged by level instead:
    // the quietest 0.5 s inside the crossfade against the quieter of the
    // second before it and the second after it (a dip = a seam you hear).
    let seamDipDb = null;
    if (t.crossfade === 'power') {
      const lv = (a, s, n) => { let x = 0; for (let k = s; k < s + n; k++) x += a[k] * a[k]; return db(Math.sqrt(x / n)); };
      const half = Math.round(0.5 * SR), sec = SR, tl = Math.round(t.tailS * SR);
      let low = Infinity;
      for (let s = loop; s + half <= loop + tl; s += Math.round(0.1 * SR)) low = Math.min(low, lv(L, s, half));
      seamDipDb = low - Math.min(lv(L, loop - sec, sec), lv(L, loop + tl, sec));
    }
    const v = windows(L, Rr, SR / 2).sort((a, b) => a - b);
    music[name] = { restartErrDb: 10 * Math.log10(err / sig), jumpDb: jump, seamDipDb, medianDb: v[v.length >> 1], p90Db: v[Math.floor(v.length * 0.9)] };
  }
  return { clips, music };
});
await browser.close();
server.close();

let bad = 0;
const f = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
console.log('| clip | measuredDb | now | drift |\n|---|---|---|---|');
for (const [n, c] of Object.entries(result.clips)) {
  const d = c.now - c.measured;
  if (Math.abs(d) > 2) bad++;
  console.log(`| ${n} | ${f(c.measured)} | ${f(c.now)} | ${f(d)}${Math.abs(d) > 2 ? ' DRIFT' : ''} |`);
}
console.log('\n| bed | restart error dB | level jump dB | median dB | p90 dB |\n|---|---|---|---|---|');
for (const [n, m] of Object.entries(result.music)) {
  if (m.seamDipDb !== null) { // (a generated bed: its seam's dip, not the exact-loop measures)
    const flag = !(m.seamDipDb > -4);
    if (flag) bad++;
    console.log(`| ${n} | generated: seam dip ${f(m.seamDipDb)} dB | — | ${m.medianDb.toFixed(1)} | ${m.p90Db.toFixed(1)} |${flag ? ' CHECK' : ''}`);
    continue;
  }
  const flag = m.restartErrDb > -20 || m.jumpDb > 1;
  if (flag) bad++;
  console.log(`| ${n} | ${m.restartErrDb.toFixed(1)} | ${m.jumpDb.toFixed(2)} | ${m.medianDb.toFixed(1)} | ${m.p90Db.toFixed(1)} |${flag ? ' CHECK' : ''}`);
}
process.exit(bad ? 1 : 0);

// Every ElevenLabs call the tools make goes through here (0.00283; the
// voice-over and the sound tools each carried their own copy — and the
// music tool its own until 0.00299): the key from the environment, never
// printed; one POST that returns the bytes or throws the status with the
// start of the body, with a wait-and-retry on a 429 (busy, or over the
// subscription's two requests at a time) and an output-format fallback
// (192 kbps needs a Creator plan; 128 is every plan's); and measureDb,
// the loudest 50 ms of a file as the sound registry's measuredDb.
//
//   tools/gen-vo.mjs     text-to-speech   (docs/narration-script.md -> assets/audio/vo)
//   tools/gen-sfx.mjs    sound-generation (docs/sfx-prompts.md -> assets/audio/sfx)
//   tools/gen-score.mjs  music            (docs/music-prompts.md -> assets/audio/candidates)
//
// Behind the proxy: NODE_USE_ENV_PROXY=1.

import { spawnSync } from 'node:child_process';

export const API = 'https://api.elevenlabs.io/v1';

// The key, or a throw naming the variable (the tools check before the
// first render so a dry run never needs it).
export function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  return key;
}
export const hasKey = () => Boolean(process.env.ELEVENLABS_API_KEY);

// A 429 (heavy traffic, or the concurrency limit) waits and tries again:
// 10, 20, 40, 60, 60 s; a quota error does not.
export const RETRY_WAITS_S = [10, 20, 40, 60, 60];
/** Does the answer say the output format is above the plan? (the 192 kbps ask falls back to 128) */
const formatRefused = (text) => /output_format|subscription|tier/i.test(text);

// POST a JSON body to a path under /v1 (a query string may follow); the
// answer's bytes as a Buffer. A non-2xx answer throws `HTTP <status>: <body>`.
//   formats: output formats to ask for in turn (`?output_format=`), the next
//            one tried when the answer refuses the format (gen-score: 192 kbps,
//            then 128);
//   retries: how many times a 429 is retried (RETRY_WAITS_S apart; 0 = never).
// fetchFn / key / sleepFn / log are for the tests.
export async function post(path, body, { fetchFn = fetch, key = apiKey(), formats = null, retries = 0, sleepFn = (s) => new Promise((r) => setTimeout(r, s * 1000)), log = console.log } = {}) {
  const fmts = formats?.length ? formats : [null];
  for (let attempt = 0; ; attempt++) {
    for (let i = 0; i < fmts.length; i++) {
      const url = fmts[i] ? `${API}/${path}${path.includes('?') ? '&' : '?'}output_format=${fmts[i]}` : `${API}/${path}`;
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      const text = (await res.text()).slice(0, 300);
      if (i < fmts.length - 1 && formatRefused(text)) continue;
      if (res.status === 429 && attempt < retries) {
        const s = RETRY_WAITS_S[Math.min(attempt, RETRY_WAITS_S.length - 1)];
        log(`  ElevenLabs busy (${text.match(/"(?:code|status)":"(\w+)"/)?.[1] ?? '429'}): again in ${s} s`); // (the API names the reason as detail.status; an older shape had code)
        await sleepFn(s);
        break; // (the formats start over)
      }
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
  }
}

// The loudest 50 ms of a file in dB (RMS, full scale = 0), as the sound
// registry's measuredDb; null without ffmpeg. The browser's reading
// (tools/audio-check.mjs) is the one the registry trusts for a hissy
// clip (0.00271: this 16 kHz measure under-reads one by up to 4 dB).
export function measureDb(path) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout?.length) return null;
  const s = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 2));
  const w = 800; // 50 ms at 16 kHz
  let best = -Infinity;
  for (let i = 0; i + w <= s.length; i += w) {
    let acc = 0;
    for (let j = i; j < i + w; j++) acc += s[j] * s[j];
    const rms = Math.sqrt(acc / w) / 32768;
    if (rms > 0) best = Math.max(best, 20 * Math.log10(rms));
  }
  return Number.isFinite(best) ? Math.round(best * 10) / 10 : null;
}

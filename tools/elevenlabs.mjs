// Every ElevenLabs call the tools make goes through here (0.00278; the
// voice-over and the sound tools each carried their own copy): the key
// from the environment, never printed; one POST that returns the bytes
// or throws the status with the start of the body; and measureDb, the
// loudest 50 ms of a file as the sound registry's measuredDb.
//
//   tools/gen-vo.mjs   text-to-speech  (docs/narration-script.md -> assets/audio/vo)
//   tools/gen-sfx.mjs  sound-generation (docs/sfx-prompts.md -> assets/audio/sfx)
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

// POST a JSON body to a path under /v1 (a query string may follow); the
// answer's bytes as a Buffer. A non-2xx answer throws `HTTP <status>: <body>`.
export async function post(path, body, { fetchFn = fetch, key = apiKey() } = {}) {
  const res = await fetchFn(`${API}/${path}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
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

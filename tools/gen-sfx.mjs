#!/usr/bin/env node
// Render the classes' and the foes' sounds (docs/sfx-prompts.md) with ElevenLabs' sound
// generation. Needs ELEVENLABS_API_KEY with the sound_generation
// permission (the voice-over's key is text-to-speech only: the developer
// adds the permission under API keys).
//
//   node tools/gen-sfx.mjs                  # every clip not yet rendered
//   node tools/gen-sfx.mjs --dry-run        # list what would be rendered
//   node tools/gen-sfx.mjs --only atk_wizard,hurt_wizard
//   node tools/gen-sfx.mjs --redo heavy_druid   # a fresh take of a rendered clip (a new file: _v2)
//   node tools/gen-sfx.mjs --influence 0.5  # prompt influence 0-1 (0.3 default: the model's own idea of it)
//
// Output: assets/audio/sfx/<clip>_v<k>.mp3 — a new name each time (rule
// 7: edge caches) — measured with ffmpeg (the loudest 50 ms, as
// gen-vo.mjs measures a take) and written into assets/data/audio.json
// clips.<clip>.file / measuredDb (its gainDb trim stays — set it from the
// audio-check table after a listen: that table's `now` column is the
// browser's reading, and 0.00272 took it over ffmpeg's for every rendered
// clip (the 16 kHz measure under-reads a hissy clip by up to 4 dB); its rate and variation layers stay:
// the layers are the class's colour over any recording). Behind the
// proxy: NODE_USE_ENV_PROXY=1.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureDb } from './gen-vo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'sfx-prompts.md');
const OUT = join(ROOT, 'assets', 'audio', 'sfx');
const WEB = 'assets/audio/sfx';
const REGISTRY = join(ROOT, 'assets', 'data', 'audio.json');
const API = 'https://api.elevenlabs.io/v1/sound-generation';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const only = opt('--only', '').split(',').filter(Boolean);
const redo = opt('--redo', '').split(',').filter(Boolean);
const influence = Number(opt('--influence', '0.3'));

// the doc's table: | clip | seconds | prompt |
export function readPrompts(md = readFileSync(DOC, 'utf8')) {
  return md.split('\n').map((l) => l.split('|').map((c) => c.trim())).filter((c) => c.length >= 5 && /^(atk|heavy|hurt|eatk|ehurt)_/.test(c[1]))
    .map((c) => ({ clip: c[1], seconds: Number(c[2]), prompt: c[3] }));
}
// the next free file name for a clip (never overwrite, rule 7)
export function nextFile(clip, exists = (f) => existsSync(join(OUT, f))) {
  for (let k = 1; ; k++) { const f = `${clip}_v${k}.mp3`; if (!exists(f)) return f; }
}

async function render(prompt, seconds) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt, duration_seconds: seconds, prompt_influence: influence }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

const main = async () => {
  const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const todo = readPrompts().filter((p) => (!only.length || only.includes(p.clip)) && (redo.includes(p.clip) || !reg.clips[p.clip]?.file?.startsWith(`${WEB}/`)));
  if (!todo.length) { console.log('nothing to render (every clip has a recording; --redo <clip> for a fresh take)'); return; }
  if (flag('--dry-run')) { for (const p of todo) console.log(`${p.clip}  ${p.seconds}s  ${p.prompt}`); return; }
  if (!process.env.ELEVENLABS_API_KEY) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  let failed = 0;
  for (const p of todo) {
    const file = nextFile(p.clip);
    try {
      const bytes = await render(p.prompt, p.seconds);
      writeFileSync(join(OUT, file), bytes);
      const measuredDb = measureDb(join(OUT, file));
      const c = reg.clips[p.clip] ?? (reg.clips[p.clip] = { gainDb: 0 });
      c.file = `${WEB}/${file}`;
      if (measuredDb != null) c.measuredDb = measuredDb;
      console.log(`${p.clip} -> ${file} (${(bytes.length / 1024).toFixed(0)} KB, loudest 50 ms ${measuredDb == null ? 'UNMEASURED (ffmpeg?)' : `${measuredDb.toFixed(1)} dB`})`);
    } catch (e) { failed++; console.error(`${p.clip}: ${e.message}`); }
    writeFileSync(REGISTRY, `${JSON.stringify(reg, null, 2)}\n`);
  }
  console.log(`${todo.length - failed} rendered${failed ? `, ${failed} FAILED` : ''}; then: node tools/audio-check.mjs, set gainDb per clip, ship.`);
  if (failed) process.exitCode = 1;
};
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });

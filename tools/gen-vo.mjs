#!/usr/bin/env node
// Render the narration script (docs/narration-script.md) as voice-over clips
// with ElevenLabs. Needs ELEVENLABS_API_KEY in the environment.
//
//   node tools/gen-vo.mjs                 # every take not yet on disk
//   node tools/gen-vo.mjs --dry-run       # list what would be rendered
//   node tools/gen-vo.mjs --only overkill,death   # a subset of IDs
//   node tools/gen-vo.mjs --manifest     # rebuild manifest.json, no rendering
//
// Output: assets/vo/vo_<id>_<take>.mp3 (44.1 kHz, 128 kbps mono) and
// assets/vo/manifest.json (id -> takes, text, file). Existing files are
// never overwritten (edge caches: new content, new filename) — delete a
// file to re-render it. Before sending, stage directions in *(...)* are
// stripped, emphasis marks (*Ha!*) become plain text, an exclamation mark
// becomes a full stop (the narrator never shouts) and a leading ellipsis
// goes (the model voices it as a filler "uh…").

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'docs', 'narration-script.md');
const OUT = join(ROOT, 'assets', 'vo');

// The voice the owner picked from the samples (Old Wizard, ElevenLabs
// Voice Library). The first batch rendered at stability 0.4 / style 0.2;
// the short one-word takes came out shouty, so renders since use these.
export const VOICE = {
  voiceId: 'JoYo65swyP8hH6fVMeTO',
  name: 'Old Wizard',
  modelId: 'eleven_multilingual_v2',
  outputFormat: 'mp3_44100_128',
  settings: { stability: 0.5, similarity_boost: 0.75, style: 0.1, speed: 0.9, use_speaker_boost: true },
};

const CONCURRENCY = 2;

/** Parse the script's tables into [{ id, takes: [{ take, text, raw }] }]. */
export function parseScript(md) {
  const lines = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*`([a-z0-9_]+)`\s*\|(.*?)\|[^|]*\|[^|]*\|\s*$/);
    if (!m) continue;
    const id = m[1];
    const cell = m[2].trim();
    const takes = [];
    const numbered = [...cell.matchAll(/(\d+)\.\s*"([^"]+)"/g)];
    if (numbered.length) {
      for (const [, n, raw] of numbered) takes.push({ take: Number(n), raw, text: cleanTake(raw) });
    } else {
      const single = cell.match(/^"([^"]+)"$/);
      if (!single) throw new Error(`Cannot read takes for ${id}: ${cell}`);
      takes.push({ take: 1, raw: single[1], text: cleanTake(single[1]) });
    }
    lines.push({ id, takes });
  }
  return lines;
}

/** Drop *(stage directions)*, keep *emphasis* as plain words, calm "!" to ".", drop a leading "…". */
export function cleanTake(raw) {
  return raw.replace(/\*\([^)]*\)\*\s*/g, '').replace(/\*/g, '').replace(/!/g, '.')
    .replace(/^[…\s]+/, '').replace(/\s+/g, ' ').trim();
}

export function fileFor(id, take) { return `vo_${id}_${take}.mp3`; }

async function render(text, seed) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE.voiceId}?output_format=${VOICE.outputFormat}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: VOICE.modelId, voice_settings: VOICE.settings, seed }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** A stable seed per take so a re-render of one file comes out alike. */
function seedFor(id, take) {
  let h = 2166136261;
  for (const c of `${id}/${take}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % 4294967295;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const manifestOnly = args.includes('--manifest');
  const onlyArg = args.find((a) => a.startsWith('--only'));
  const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : null;

  const script = parseScript(readFileSync(SCRIPT, 'utf8'));
  const jobs = [];
  for (const { id, takes } of script) {
    if (only && !only.includes(id)) continue;
    for (const t of takes) {
      const file = fileFor(id, t.take);
      jobs.push({ id, ...t, file, exists: existsSync(join(OUT, file)) });
    }
  }
  const todo = manifestOnly ? [] : jobs.filter((j) => !j.exists);
  const chars = todo.reduce((n, j) => n + j.text.length, 0);
  console.log(`${script.length} IDs, ${jobs.length} takes, ${todo.length} to render (${chars} characters)`);
  for (const j of todo) if (j.text !== j.raw) console.log(`  note ${j.file}: "${j.raw}" -> "${j.text}"`);
  if (dry) { for (const j of todo) console.log(`  ${j.file}  "${j.text}"`); return; }
  if (todo.length && !process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is not set');

  mkdirSync(OUT, { recursive: true });
  let i = 0; let failed = 0;
  const worker = async () => {
    while (i < todo.length) {
      const j = todo[i++];
      try {
        const buf = await render(j.text, seedFor(j.id, j.take));
        writeFileSync(join(OUT, j.file), buf);
        console.log(`  ok ${j.file} (${(buf.length / 1024).toFixed(0)} KB) "${j.text}"`);
      } catch (e) {
        failed++;
        console.error(`  FAIL ${j.file}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const manifest = { voice: VOICE, lines: {} };
  for (const j of jobs) {
    if (!existsSync(join(OUT, j.file))) continue;
    (manifest.lines[j.id] ??= []).push({ take: j.take, file: j.file, text: j.text });
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest: ${Object.keys(manifest.lines).length} IDs, ${Object.values(manifest.lines).flat().length} files${failed ? `, ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

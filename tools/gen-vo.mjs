#!/usr/bin/env node
// Render the narration script (docs/narration-script.md) as voice-over clips
// with ElevenLabs. Needs ELEVENLABS_API_KEY in the environment.
//
//   node tools/gen-vo.mjs                 # every take not yet on disk
//   node tools/gen-vo.mjs --dry-run       # list what would be rendered
//   node tools/gen-vo.mjs --only overkill,death   # a subset of IDs
//   node tools/gen-vo.mjs --manifest     # rebuild narration.json, no rendering
//   node tools/gen-vo.mjs --only retreat --stability 0.7 --style 0   # steadier re-render
//   node tools/gen-vo.mjs --rerender vo-rerender.json   # the VO Lab's verdicts (vo-lab/):
//        approves takes, re-renders the disapproved ones nudged by their
//        "volatility" / "shouty" toggles (stability / style + speed)
//
// Output: assets/audio/vo/vo_<id>_<take>.mp3 (44.1 kHz, 128 kbps mono) and
// assets/data/narration.json (the game's registry: per line its takes —
// file, text, measuredDb = the loudest 50 ms, so audio/narrator.js can
// level every take; measured with ffmpeg when it is installed). Existing
// files are never overwritten (edge caches: new content, new filename) —
// delete a file to re-render it. Each take records the settings it was
// rendered with and whether the owner approved it (the VO Lab). Before sending, stage directions in *(...)* are
// stripped, emphasis marks (*Ha!*) become plain text, an exclamation mark
// becomes a full stop (the narrator never shouts) and a leading ellipsis
// goes (the model voices it as a filler "uh…").

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'docs', 'narration-script.md');
const OUT = join(ROOT, 'assets', 'audio', 'vo');
const REGISTRY = join(ROOT, 'assets', 'data', 'narration.json');
const WEB = 'assets/audio/vo'; // as the game fetches it

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
    const m = line.match(/^\|\s*`([a-z0-9_]+)`\s*\|(.*?)\|([^|]*)\|([^|]*)\|\s*$/);
    if (!m) continue;
    const id = m[1];
    const cell = m[2].trim();
    const when = m[3].trim(), often = m[4].trim();
    const takes = [];
    const numbered = [...cell.matchAll(/(\d+)\.\s*"([^"]+)"/g)];
    if (numbered.length) {
      for (const [, n, raw] of numbered) takes.push({ take: Number(n), raw, text: cleanTake(raw) });
    } else {
      const single = cell.match(/^"([^"]+)"$/);
      if (!single) throw new Error(`Cannot read takes for ${id}: ${cell}`);
      takes.push({ take: 1, raw: single[1], text: cleanTake(single[1]) });
    }
    lines.push({ id, when, often, takes });
  }
  return lines;
}

/** Drop *(stage directions)*, keep *emphasis* as plain words, calm "!" to ".", drop a leading "…". */
export function cleanTake(raw) {
  return raw.replace(/\*\([^)]*\)\*\s*/g, '').replace(/\*/g, '').replace(/!/g, '.')
    .replace(/^[…\s]+/, '').replace(/\s+/g, ' ').trim();
}

export function fileFor(id, take) { return `vo_${id}_${take}.mp3`; }

// The loudest 50 ms of a file in dB (RMS, full scale = 0), as the sound
// registry's measuredDb; null without ffmpeg.
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

export async function render(text, seed, settings = VOICE.settings) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE.voiceId}?output_format=${VOICE.outputFormat}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: VOICE.modelId, voice_settings: settings, seed }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

// The VO Lab's nudges: volatility is the voice swinging (stability),
// shouty its push (style, and a touch of speed). -1 = less, +1 = more.
export const NUDGE = { volatility: { stability: -0.2 }, shouty: { style: 0.1, speed: 0.05 } };
export function nudged(base, { volatility = 0, shouty = 0 } = {}) {
  const clamp = (v, lo, hi) => Math.round(Math.max(lo, Math.min(hi, v)) * 100) / 100;
  return {
    ...base,
    stability: clamp(base.stability + volatility * NUDGE.volatility.stability, 0, 1),
    style: clamp(base.style + shouty * NUDGE.shouty.style, 0, 1),
    speed: clamp((base.speed ?? 1) + shouty * NUDGE.shouty.speed, 0.7, 1.2),
  };
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
  const num = (flag) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : undefined; };
  const settings = { ...VOICE.settings };
  for (const k of ['stability', 'style', 'speed']) if (num(`--${k}`) !== undefined) settings[k] = num(`--${k}`);
  const onlyArg = args.find((a) => a.startsWith('--only'));
  const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',') : null;

  const script = parseScript(readFileSync(SCRIPT, 'utf8'));
  const old = existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : {};
  const prev = Object.fromEntries(Object.values(old.lines ?? {}).flat().map((t) => [t.file, t]));
  // --rerender: the lab's verdicts — approvals to record, takes to redo
  const reqArg = args.indexOf('--rerender');
  const req = reqArg >= 0 ? JSON.parse(readFileSync(args[reqArg + 1], 'utf8')) : null;
  const redo = Object.fromEntries((req?.rerender ?? []).map((r) => [r.file, r]));
  const approved = new Set(req?.approved ?? []);
  const jobs = [];
  for (const { id, takes } of script) {
    if (only && !only.includes(id)) continue;
    for (const t of takes) {
      const file = fileFor(id, t.take);
      const web = `${WEB}/${file}`;
      const r = redo[web];
      // a redo: its own settings, nudged from what it had, and a new seed
      const own = r ? nudged({ ...VOICE.settings, ...(prev[web]?.settings ?? {}) }, r) : null;
      jobs.push({ id, ...t, file, web, exists: existsSync(join(OUT, file)) && !r, settings: own, seed: r ? (Date.now() % 1000000) + jobs.length : undefined });
    }
  }
  const todo = manifestOnly ? [] : jobs.filter((j) => !j.exists);
  for (const j of todo) if (j.settings) console.log(`  redo ${j.file}: ${JSON.stringify(j.settings)}`);
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
        const used = j.settings ?? settings;
        const buf = await render(j.text, j.seed ?? seedFor(j.id, j.take), used);
        writeFileSync(join(OUT, j.file), buf);
        j.rendered = used;
        console.log(`  ok ${j.file} (${(buf.length / 1024).toFixed(0)} KB) "${j.text}"`);
      } catch (e) {
        failed++;
        console.error(`  FAIL ${j.file}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // The registry: every line's takes on disk, each measured (a take already
  // listed keeps its measurement), with the settings it was rendered at and
  // its approval; per line the script's when / how often.
  const reg = {
    _doc: 'Generated by tools/gen-vo.mjs from docs/narration-script.md: the Old Wizard voice-over. meta: per line id the script\'s When and How often. lines: per line id its takes: file, text as sent, measuredDb = the loudest 50 ms (RMS dB; audio/narrator.js levels every take to audio.json narration.targetDb), settings it was rendered at, approved (the VO Lab, vo-lab/), rendered = when a take was re-rendered (its URL carries it, so caches never serve the old one). When and how often a line plays in the game is audio.json narration.lines.',
    voice: VOICE,
    meta: Object.fromEntries(script.map((l) => [l.id, { when: l.when, often: l.often }])),
    lines: {},
  };
  let unmeasured = 0;
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  for (const j of jobs) {
    if (!existsSync(join(OUT, j.file))) continue;
    const file = j.web;
    const was = prev[file] ?? {};
    const measuredDb = (j.rendered || !Number.isFinite(was.measuredDb) ? measureDb(join(OUT, j.file)) : null) ?? was.measuredDb ?? null;
    if (measuredDb == null) unmeasured++;
    const entry = { take: j.take, file, text: j.text, measuredDb, settings: j.rendered ?? was.settings ?? settings };
    if (was.rendered) entry.rendered = was.rendered;
    if (j.rendered && redo[file]) { entry.approved = false; entry.rendered = stamp; } // a redo waits for the lab's verdict, stamped (the lab and the game fetch it afresh)
    else if (approved.has(file) || was.approved) entry.approved = true;
    else if (was.approved === false) entry.approved = false; // still awaiting the lab's verdict
    (reg.lines[j.id] ??= []).push(entry);
  }
  writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
  const n = Object.values(reg.lines).flat().length;
  console.log(`${REGISTRY.replace(ROOT + '/', '')}: ${Object.keys(reg.lines).length} IDs, ${n} takes${unmeasured ? `, ${unmeasured} UNMEASURED (ffmpeg missing?)` : ''}${failed ? `, ${failed} FAILED` : ''}`);
  if (unmeasured) process.exitCode = 1;
  if (failed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

#!/usr/bin/env node
// Generated scores for the five music beds (0.00273, the music thread's
// bake-off). The briefs live in docs/music-prompts.md (a style block, a
// common avoid list, per bed a line, global styles and timed sections);
// every candidate is kept (assets/audio/candidates/<bed>_c<n>.mp3, 192 kbps,
// never overwritten) and recorded in assets/data/music-art.json with its
// model, seed, prompt or plan, length and integrated loudness (LUFS, so the
// Music Lab plays every take at one level). Generating and measuring touch
// the lab's files alone; --import is the one step that changes what the
// game plays (audio.json music.tracks and the bed's file).
//
//   node tools/gen-score.mjs --dry-run                  # what would be sent, to which model
//   node tools/gen-score.mjs --bakeoff                  # title + combat on every model (BAKEOFF), two takes each
//   node tools/gen-score.mjs --only shrine --model eleven --n 3   # one bed, one model, three takes
//   node tools/gen-score.mjs --only boss --model lyria --image   # Lyria with the bed's painting as its picture
//   node tools/gen-score.mjs --hint "more organ"        # a direction added to the bed's line
//   node tools/gen-score.mjs --rerender music-rerender.json   # the Music Lab's verdicts (labs/music/): records the
//                                                       # approvals and rejections (+ notes), generates the re-rolls
//                                                       # ({ id, model, n, hint, image })
//   node tools/gen-score.mjs --measure                  # measure the shipped beds' loudness for the lab and stop: a bed
//                                                       # not measured yet, or whose file changed (every generating run
//                                                       # does the same measure before it starts; the switch alone makes
//                                                       # a run with nothing to generate)
//   node tools/gen-score.mjs ... --concurrency 2        # takes in flight at once across the models (DEFAULTS.concurrency 3;
//                                                       # ElevenLabs is held to DEFAULTS.elevenConcurrency 2 within it)
//   node tools/gen-score.mjs --import combat_c2 [--start 21-25] [--end 70-86] [--tail 3] [--min-loop 60] [--dry-run]
//                                                       # a take into the game (0.00280): the loop seam found
//                                                       # (tools/music-seam.mjs: the START and END that sound most
//                                                       # alike, before the piece's fade; --start / --end pin the
//                                                       # ranges in seconds), cut from START to END + the tail at
//                                                       # 128 kbps as assets/audio/music-<bed>-v<k>.mp3 (a new name,
//                                                       # rule 7), levelled to the bed it replaces (gainDb), written
//                                                       # into audio.json music.tracks; the old bed's file removed
//
// The models: ElevenLabs Music by its own API (a composition plan: global
// styles, an avoid list, a section per timestamp; ELEVENLABS_API_KEY), Lyria
// 3 Pro and Stable Audio 2.5 on Replicate (REPLICATE_API_TOKEN or
// REPLICATE_KEY). Needs ffmpeg (transcode + EBU R128 loudness). Run with
// NODE_USE_ENV_PROXY=1 behind a proxy.

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { token, predict } from './replicate.mjs';
import { post } from './elevenlabs.mjs';
import { decode, features, findSeam, alignEnd } from './music-seam.mjs';
import { seedFor as seedOf, cli } from './util.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'music-prompts.md');
const OUT = join(ROOT, 'assets', 'audio', 'candidates');
const REGISTRY = join(ROOT, 'assets', 'data', 'music-art.json');
const AUDIO = join(ROOT, 'assets', 'data', 'audio.json');
const WEB = 'assets/audio/candidates';

export const DEFAULTS = { n: 2, concurrency: 3, bitrate: '192k', elevenConcurrency: 2, tailS: 3, gameBitrate: '128k', minLoop: 60 }; // (ElevenLabs: two requests at a time per subscription)
/** The bake-off: two beds, every model; Lyria's second take scores the bed's painting. */
export const BAKEOFF = { beds: ['title', 'combat'], models: ['eleven', 'lyria', 'stable'] };

/** The doc: { style, avoid: [], beds: [{ id, name, seconds, painting, line, global: [], avoid: [], sections: [{ from, to, name, styles }] }] }. */
export function parseScore(md) {
  const block = md.match(/## Style block[\s\S]*?```\n([\s\S]*?)```/);
  if (!block) throw new Error('music-prompts.md: no style block');
  const list = (s = '') => s.split(',').map((x) => x.trim()).filter(Boolean);
  const avoid = list(md.match(/^Avoid \(every bed\): `([^`]+)`/m)?.[1]);
  const secs = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  const beds = [];
  for (const part of md.split(/^### /m).slice(1)) {
    const head = part.match(/^(\w+) — (.+)$/m);
    if (!head) continue;
    const field = (k) => part.match(new RegExp(`^${k}: (.+)$`, 'm'))?.[1].trim();
    const sections = [...part.matchAll(/^- (\d+:\d\d)-(\d+:\d\d) ([^:]+): (.+)$/gm)].map((m) => ({ from: secs(m[1]), to: secs(m[2]), name: m[3].trim(), styles: list(m[4]) }));
    beds.push({ id: head[1], name: head[2].trim(), seconds: Number(field('Seconds')), painting: field('Painting'), line: field('Line'), global: list(field('Global')), avoid: list(field('Avoid')), sections });
  }
  if (!beds.length) throw new Error('music-prompts.md: no beds');
  return { style: block[1].trim(), avoid, beds };
}
const stamp = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const avoidOf = (doc, bed) => [...new Set([...doc.avoid, ...bed.avoid])];

/** ElevenLabs' composition plan: the bed's styles global, a section per timestamp (the hint joins the global styles). */
export function planFor(doc, bed, hint = '') {
  return {
    positive_global_styles: ['dark cinematic orchestral', 'gothic fantasy game score', 'instrumental', 'D minor', 'long stone-hall reverb', ...bed.global, ...(hint ? [hint] : [])],
    negative_global_styles: avoidOf(doc, bed),
    sections: bed.sections.map((s) => ({ section_name: s.name, positive_local_styles: s.styles, negative_local_styles: [], duration_ms: (s.to - s.from) * 1000, lines: [] })),
  };
}
/** Lyria's prompt: the style block, the line, the styles, the sections as timestamps; with a picture, a lead naming it. */
export function lyriaPrompt(doc, bed, hint = '', image = false) {
  const lead = image ? 'The attached painting is the scene this music plays under: score it. ' : '';
  return `${lead}${doc.style} ${bed.line}${hint ? ` ${hint}.` : ''} Instrumentation and mood: ${bed.global.join(', ')}. Avoid: ${avoidOf(doc, bed).join(', ')}. Length ${stamp(bed.seconds)}. Structure: ${bed.sections.map((s) => `[${stamp(s.from)} - ${stamp(s.to)}] ${s.name}: ${s.styles.join(', ')}.`).join(' ')}`;
}
/** Stable Audio's prompt: no structure (it ignores it), the style, the line, the styles. */
export function stablePrompt(doc, bed, hint = '') {
  return `${doc.style} ${bed.line}${hint ? ` ${hint}.` : ''} ${bed.global.join(', ')}.`;
}

export const MODELS = {
  eleven: { label: 'ElevenLabs Music', model: 'elevenlabs/music_v1' },
  lyria: { label: 'Lyria 3 Pro', model: 'google/lyria-3-pro' },
  stable: { label: 'Stable Audio 2.5', model: 'stability-ai/stable-audio-2.5' },
};
export const seedFor = (id, n) => seedOf('score', id, n); // (tools/util.mjs since 0.00299; the same seeds)
/** What a job sends: { model, request } — pure, for --dry-run and the tests. */
export function requestFor(doc, bed, job) {
  const seed = seedFor(bed.id, job.n);
  if (job.model === 'eleven') return { seed: null, plan: planFor(doc, bed, job.hint), body: { composition_plan: planFor(doc, bed, job.hint), model_id: 'music_v1' } };
  if (job.model === 'lyria') return { seed, prompt: lyriaPrompt(doc, bed, job.hint, job.image), input: { prompt: lyriaPrompt(doc, bed, job.hint, job.image), seed } };
  if (job.model === 'stable') return { seed, prompt: stablePrompt(doc, bed, job.hint), input: { prompt: stablePrompt(doc, bed, job.hint), duration: Math.min(190, bed.seconds), seed, steps: 8 } };
  throw new Error(`unknown model ${job.model} (${Object.keys(MODELS)})`);
}

const loadRegistry = () => (existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : { beds: {} });
function saveRegistry(reg) {
  writeFileSync(REGISTRY, JSON.stringify({ _doc: 'Generated by tools/gen-score.mjs: per music bed the candidates generated (assets/audio/candidates/<bed>_c<n>.mp3), their model, seed, prompt or composition plan, length and integrated loudness (lufs), the shipped bed\'s loudness (current), and the Music Lab\'s verdicts.', beds: reg.beds }, null, 2) + '\n');
}
const entryFor = (reg, bed) => { const e = (reg.beds[bed.id] ??= { name: bed.name, candidates: [] }); e.name = bed.name; e.painting = bed.painting; e.line = bed.line; return e; };
const nextN = (entry) => entry.candidates.reduce((m, k) => Math.max(m, k.n), 0) + 1;
/** The lab's verdicts into the registry (pure): { approved: [{ id, file }], rejected: [{ id, file, note }] }. */
export function applyVerdicts(reg, req) {
  const all = Object.values(reg.beds).flatMap((e) => e.candidates);
  for (const a of req.approved ?? []) { const k = all.find((x) => x.file === a.file); if (k) { k.verdict = 'ok'; if (a.note) k.note = a.note; else delete k.note; } }
  for (const r of req.rejected ?? []) { const k = all.find((x) => x.file === r.file); if (k) { k.verdict = 'no'; if (r.note) k.note = r.note; else delete k.note; } }
  return { approved: (req.approved ?? []).length, rejected: (req.rejected ?? []).length };
}

// ---- audio: transcode and measure (ffmpeg) ----
/** Integrated loudness (EBU R128, LUFS) and length of a file. */
export function measure(path) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' });
  const lufs = Number(r.stderr?.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim());
  if (!Number.isFinite(lufs) || !Number.isFinite(seconds)) throw new Error(`could not measure ${path}`);
  return { lufs: Math.round(lufs * 10) / 10, seconds: Math.round(seconds * 10) / 10 };
}
function toMp3(src, dest) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', '-i', src, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', DEFAULTS.bitrate, dest], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr.slice(-300)}`);
}

// ---- the providers ----
// ElevenLabs: at most elevenConcurrency requests in flight (the subscription's
// two at a time); the POST itself — the 192 -> 128 kbps format fallback and
// the 429 wait-and-retry — is tools/elevenlabs.mjs post's since 0.00299.
let elevenBusy = 0;
const elevenWait = [];
async function eleven(body) {
  while (elevenBusy >= DEFAULTS.elevenConcurrency) await new Promise((r) => elevenWait.push(r));
  elevenBusy++;
  try { return await post('music', body, { formats: ['mp3_44100_192', 'mp3_44100_128'], retries: 5 }); } finally { elevenBusy--; elevenWait.shift()?.(); }
}
/** The painting as a data URI (the game's 2048x1152 JPEG, ~370 KB: sent as it is, no resize — no sharp needed). */
function inlinePainting(file) {
  return `data:image/jpeg;base64,${readFileSync(join(ROOT, 'assets', 'bg', file)).toString('base64')}`;
}
async function generate(doc, bed, job) {
  const req = requestFor(doc, bed, job);
  if (job.model === 'eleven') return { bytes: await eleven(req.body), req };
  const input = { ...req.input };
  if (job.image) input.images = [inlinePainting(bed.painting)];
  const out = await predict(MODELS[job.model].model, input);
  return { bytes: out.bytes, req, version: out.version, predictTime: out.metrics?.predict_time };
}

// ---- the import: a take into the game ----
/** Where to look for the seam: START in the first 40%, END from the middle to just before the piece's fade (its level 6 dB under the median, smoothed over 2 s). */
export function autoRanges({ db, hopS }, tailS = DEFAULTS.tailS, window = 4) {
  const n = db.length, dur = n * hopS, k = Math.max(1, Math.round(2 / hopS));
  const smooth = Array.from({ length: n }, (_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { s += 10 ** (db[j] / 10); c++; } return 10 * Math.log10(s / c); });
  const median = [...smooth].sort((a, b) => a - b)[Math.floor(n / 2)];
  let fade = n - 1;
  while (fade > n / 2 && smooth[fade] < median - 6) fade--;
  const endMax = Math.min(fade * hopS - window, dur - tailS - window); // (the window compared after END must not reach the fade: inside it, a loud end's level read like a quiet start's)
  return { startRange: [0, dur * 0.4], endRange: [dur * 0.5, endMax] };
}
/** The level the new bed plays at: the old bed's gainDb, moved by the loudness difference, so the mix stays as it was. */
export const gainFor = (oldGain, oldLufs, newLufs) => Math.round((oldGain + oldLufs - newLufs) * 10) / 10;
/** audio.json with one music track's block replaced in place (the file keeps its own layout; pure). */
export function setTrack(text, id, t) {
  const at = text.indexOf('"tracks": {');
  const open = text.indexOf(`"${id}": {`, at), close = text.indexOf('}', open);
  if (at < 0 || open < 0 || close < 0) throw new Error(`audio.json: no music.tracks.${id}`);
  const indent = text.slice(text.lastIndexOf('\n', open) + 1, open);
  const body = ['file', 'loopS', 'tailS', 'crossfade', 'gainDb'].filter((k) => t[k] !== undefined).map((k) => `${indent}  "${k}": ${JSON.stringify(t[k])}`).join(',\n');
  return `${text.slice(0, open)}"${id}": {\n${body}\n${indent}}${text.slice(close + 1)}`;
}
const parseRange = (v) => (v ? v.split('-').map(Number) : null);
function importBed(reg, doc, ref, { start, end, tail = DEFAULTS.tailS, minLoop = DEFAULTS.minLoop, dry = false } = {}) {
  const [id, cn] = ref.split('_c');
  const bed = doc.beds.find((b) => b.id === id), e = reg.beds[id];
  const k = cn ? e?.candidates.find((c) => c.n === Number(cn)) : [...(e?.candidates ?? [])].reverse().find((c) => c.verdict === 'ok');
  if (!bed || !k) throw new Error(`--import ${ref}: no such take${cn ? '' : ' (and no approved take for the bed)'}`);
  const tracksText = readFileSync(AUDIO, 'utf8'), audio = JSON.parse(tracksText), old = audio.music.tracks[id];
  if (!old) throw new Error(`audio.json has no music.tracks.${id}: add its block first (file, loopS, tailS, gainDb — the import levels the take to the bed it replaces)`); // (0.00299: it used to fail with a TypeError after the seam search and the cut)
  const src = join(ROOT, k.file);
  const x = decode(src), f = features(x);
  const auto = autoRanges(f, tail);
  const ranges = { startRange: start ?? auto.startRange, endRange: end ?? auto.endRange };
  const seam = findSeam(f, { ...ranges, minLoop, tailS: tail });
  const endS = alignEnd(x, seam.start, seam.end);
  const SR44 = 44100, a = Math.round(seam.start * SR44), b = Math.round(endS * SR44), loopS = Math.round(((b - a) / SR44) * 1e4) / 1e4;
  console.log(`${id}_c${k.n}: seam ${stamp(Math.round(seam.start))} → ${stamp(Math.round(endS))} (${seam.start.toFixed(2)} → ${endS.toFixed(2)} s), loop ${loopS} s + ${tail} s tail · alike ${seam.sim.toFixed(3)}, ${seam.dDb.toFixed(1)} dB apart · searched start ${ranges.startRange.map((v) => v.toFixed(0)).join('-')} s, end ${ranges.endRange.map((v) => v.toFixed(0)).join('-')} s`);
  if (dry) return null;
  let v = 3;
  while (existsSync(join(ROOT, 'assets', 'audio', `music-${id}-v${v}.mp3`))) v++;
  const file = `assets/audio/music-${id}-v${v}.mp3`;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', src, '-af', `atrim=start_sample=${a}:end_sample=${b + Math.round((tail + 0.25) * SR44)},asetpts=PTS-STARTPTS`, '-ac', '2', '-ar', String(SR44), '-c:a', 'libmp3lame', '-b:a', DEFAULTS.gameBitrate, join(ROOT, file)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg cut: ${r.stderr.slice(-300)}`); // (+0.25 s past the tail: a decoder may trim the last frames, and the loop plays [0, loopS + tailS) only)
  const m = measure(join(ROOT, file));
  const oldLufs = e.current?.file === old.file ? e.current.lufs : measure(join(ROOT, old.file)).lufs;
  const track = { file, loopS, tailS: tail, crossfade: 'power', gainDb: gainFor(old.gainDb, oldLufs, m.lufs) }; // (power: the tail is the music's continuation, not a copy of the start)
  writeFileSync(AUDIO, setTrack(tracksText, id, track));
  const refs = JSON.stringify(JSON.parse(readFileSync(AUDIO, 'utf8')));
  if (old.file && old.file !== file && !refs.includes(`"${old.file}"`)) { unlinkSync(join(ROOT, old.file)); console.log(`removed ${old.file} (nothing names it now)`); }
  for (const other of e.candidates) if (other !== k && other.imported) { other.replaced = { ...other.imported, by: `${id}_c${k.n}` }; delete other.imported; } // (0.00289: one take is the bed; the one it replaced keeps its record)
  k.imported = { file, start: Math.round(seam.start * 1000) / 1000, end: Math.round(endS * 1000) / 1000, loopS, tailS: tail, gainDb: track.gainDb, lufs: m.lufs, at: new Date().toISOString() };
  console.log(`→ ${file}: ${m.seconds} s, ${m.lufs} LUFS (the old bed ${oldLufs} at ${old.gainDb} dB) → gainDb ${track.gainDb}`);
  return track;
}

// ---- the run ----
async function pool(jobs, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) await fn(jobs[i++]); }));
}
function measureCurrent(reg, doc) {
  const tracks = JSON.parse(readFileSync(AUDIO, 'utf8')).music.tracks;
  for (const bed of doc.beds) {
    const t = tracks[bed.id];
    if (!t) continue;
    const e = entryFor(reg, bed);
    if (e.current?.file === t.file && Number.isFinite(e.current.lufs)) continue;
    e.current = { file: t.file, loopS: t.loopS, ...measure(join(ROOT, t.file)) };
    console.log(`current ${bed.id}: ${e.current.lufs} LUFS, ${e.current.seconds} s`);
  }
}

async function main() {
  const { flag: has, opt: val } = cli(); // (tools/util.mjs, 0.00299)
  const doc = parseScore(readFileSync(DOC, 'utf8'));
  const bedOf = (id) => doc.beds.find((b) => b.id === id) ?? (() => { throw new Error(`no bed "${id}" in docs/music-prompts.md`); })();
  const reg = loadRegistry();

  if (has('--import')) {
    if (has('--rerender')) { const v = applyVerdicts(reg, JSON.parse(readFileSync(val('--rerender'), 'utf8'))); console.log(`verdicts: ${v.approved} approved, ${v.rejected} rejected`); }
    for (const ref of val('--import').split(',')) importBed(reg, doc, ref, { start: parseRange(val('--start')), end: parseRange(val('--end')), tail: Number(val('--tail') ?? DEFAULTS.tailS), minLoop: Number(val('--min-loop') ?? DEFAULTS.minLoop), dry: has('--dry-run') });
    if (!has('--dry-run')) { measureCurrent(reg, doc); saveRegistry(reg); }
    return;
  }
  let wanted = []; // [{ id, model, n (count), hint, image }]
  if (has('--rerender')) {
    const req = JSON.parse(readFileSync(val('--rerender'), 'utf8'));
    const v = applyVerdicts(reg, req);
    console.log(`verdicts: ${v.approved} approved, ${v.rejected} rejected`);
    wanted = (req.reroll ?? []).map((r) => ({ id: r.id, model: r.model, count: r.n ?? 1, hint: r.hint ?? '', image: !!r.image }));
  } else if (has('--bakeoff') || has('--only') || has('--model')) {
    const beds = val('--only')?.split(',') ?? (has('--bakeoff') ? BAKEOFF.beds : doc.beds.map((b) => b.id));
    const models = val('--model')?.split(',') ?? BAKEOFF.models;
    const count = Number(val('--n') ?? DEFAULTS.n);
    for (const id of beds) for (const model of models) {
      if (model === 'lyria' && has('--bakeoff') && !has('--image')) { // the bake-off's Lyria: one take on text alone, one scoring the painting
        wanted.push({ id, model, count: Math.ceil(count / 2), hint: val('--hint') ?? '', image: false }, { id, model, count: Math.floor(count / 2), hint: val('--hint') ?? '', image: true });
      } else wanted.push({ id, model, count, hint: val('--hint') ?? '', image: has('--image') });
    }
  }
  // number the takes now, in order (the runs finish in any order)
  const jobs = [];
  const taken = {};
  for (const w of wanted) {
    const bed = bedOf(w.id), e = entryFor(reg, bed);
    if (!MODELS[w.model]) throw new Error(`unknown model ${w.model} (${Object.keys(MODELS)})`);
    for (let i = 0; i < w.count; i++) {
      taken[w.id] = Math.max(taken[w.id] ?? 0, nextN(e) - 1) + 1;
      jobs.push({ bed, model: w.model, n: taken[w.id], hint: w.hint, image: w.image && w.model === 'lyria' });
    }
  }

  if (has('--dry-run')) {
    for (const j of jobs) { const r = requestFor(doc, j.bed, j); console.log(`\n${j.bed.id}_c${j.n} · ${MODELS[j.model].label}${j.image ? ` + ${j.bed.painting}` : ''}`); console.log(r.plan ? JSON.stringify(r.plan, null, 1) : r.prompt); }
    console.log(`\n${jobs.length} takes`);
    return;
  }
  if (jobs.some((j) => j.model !== 'eleven') && !token()) throw new Error('REPLICATE_API_TOKEN (or REPLICATE_KEY) is not set');
  mkdirSync(OUT, { recursive: true });
  measureCurrent(reg, doc);
  saveRegistry(reg);
  if (!jobs.length && !has('--rerender') && !has('--measure')) { console.log('nothing to do: --bakeoff, --only <bed>, --model <m>, --rerender <json> or --measure'); return; }
  let done = 0, failed = 0;
  await pool(jobs, Number(val('--concurrency') ?? DEFAULTS.concurrency), async (j) => {
    const name = `${j.bed.id}_c${j.n}`, t0 = Date.now();
    try {
      const out = await generate(doc, j.bed, j);
      const raw = join(tmpdir(), `${name}.raw`), dest = join(OUT, `${name}.mp3`);
      if (existsSync(dest)) throw new Error(`${dest} exists (never overwritten)`);
      writeFileSync(raw, out.bytes);
      toMp3(raw, dest);
      unlinkSync(raw);
      const m = measure(dest);
      const e = entryFor(reg, j.bed);
      e.candidates.push({ n: j.n, file: `${WEB}/${name}.mp3`, model: MODELS[j.model].model, label: MODELS[j.model].label, ...(j.image ? { image: j.bed.painting } : {}), ...(j.hint ? { hint: j.hint } : {}), seed: out.req.seed, ...(out.req.plan ? { plan: out.req.plan } : { prompt: out.req.prompt }), ...(out.version ? { version: out.version } : {}), asked: j.bed.seconds, ...m, at: new Date().toISOString() });
      e.candidates.sort((a, b) => a.n - b.n);
      saveRegistry(reg);
      done++;
      console.log(`✓ ${name} · ${MODELS[j.model].label}${j.image ? ' + painting' : ''} · ${m.seconds} s · ${m.lufs} LUFS · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } catch (err) {
      failed++;
      console.error(`✗ ${name} · ${MODELS[j.model].label}: ${err.message}`);
    }
  });
  console.log(`${done} takes made${failed ? `, ${failed} failed` : ''} → ${WEB}/, assets/data/music-art.json; listen in labs/music/`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });

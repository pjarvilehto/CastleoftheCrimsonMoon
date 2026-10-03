#!/usr/bin/env node
// tools/render-sfx.mjs — apply the SFX Lab's review (0.00301). The lab
// (labs/sfx/) hands back sfx-review.json:
//
//   { approved: [clip, ...],
//     edits: [{ clip, gainDb, pitch, speed, note, approved }, ...] }
//
//   node tools/render-sfx.mjs --apply sfx-review.json [--dry-run]
//
// Approvals mark the clip `approved: true` in assets/data/audio.json (the
// lab shows them, nothing in the game reads them). An edit's gainDb is a
// dB offset on the clip's trim; pitch (semitones) and speed (%, the pitch
// kept) re-render a FILE clip with ffmpeg — asetrate for the pitch, atempo
// for the tempo — into a new file (rule 7: assets/audio/sfx/<stem>_v<k+1>.mp3;
// a file still at assets/audio/sfx-<x>.mp3 moves into sfx/ as <x>_v2.mp3),
// measured again (measuredDb and peakMs, tools/elevenlabs.mjs measurePeak)
// with the trim set so the clip lands where it did plus the offset; the
// old file is removed (the orphan check wants it gone). A generated
// (synth) clip takes the offset alone; its pitch or speed is printed as a
// note for the hand (its rate or its synth definition). The browser's
// own reading (tools/audio-check.mjs) is the measuredDb to trust after.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measurePeak } from './elevenlabs.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const REGISTRY = join(ROOT, 'assets', 'data', 'audio.json');
const SR = 44100;

// The ffmpeg filter for a pitch of `pitch` semitones and a speed of `speed`
// percent with the pitch kept: asetrate shifts pitch AND tempo by p, so
// atempo brings the tempo to s / p (chained inside its 0.5–2 range).
export function pitchSpeedFilter(pitch, speed, sr = SR) {
  const p = 2 ** (pitch / 12), s = speed / 100;
  const parts = [];
  if (Math.abs(p - 1) > 1e-6) parts.push(`asetrate=${Math.round(sr * p)}`, `aresample=${sr}`);
  let tempo = s / p;
  while (Math.abs(tempo - 1) > 1e-6) {
    const step = Math.min(2, Math.max(0.5, tempo));
    parts.push(`atempo=${step.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`);
    tempo /= step;
    if (step !== 2 && step !== 0.5) break;
  }
  return parts.join(',');
}

// The new file's name beside the old one: sfx/<stem>_v<k> -> _v<k+1>; the
// old root files (assets/audio/sfx-<x>.mp3) move into sfx/ as <x>_v2.mp3.
export function nextFile(file, exists = (f) => existsSync(join(ROOT, f))) {
  let stem, k;
  const m = file.match(/^assets\/audio\/sfx\/(.+)_v(\d+)\.mp3$/);
  if (m) { stem = m[1]; k = Number(m[2]) + 1; } else { const r = file.match(/^assets\/audio\/sfx-(.+)\.mp3$/); stem = r ? r[1] : file.split('/').pop().replace(/\.\w+$/, ''); k = 2; }
  for (; ; k++) { const f = `assets/audio/sfx/${stem}_v${k}.mp3`; if (!exists(f)) return f; }
}

// The trim that keeps the clip's level (measuredDb + gainDb) plus the offset, on a new measure.
export const newGain = (clip, offset, measured) => Math.round((clip.measuredDb + clip.gainDb + offset - measured) * 10) / 10;

// A clip's block rewritten in place in audio.json's text (the file keeps its layout elsewhere).
export function setClip(text, name, patch) {
  const at = text.indexOf('"clips": {');
  const open = text.indexOf(`\n    "${name}": {`, at);
  if (at < 0 || open < 0) throw new Error(`audio.json: no clips.${name}`);
  const start = open + 1, close = text.indexOf('\n    }', start) + 6;
  const block = JSON.parse(text.slice(start + `    "${name}": `.length, close));
  const next = { ...block, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  const body = JSON.stringify(next, null, 2).split('\n').map((l, i) => (i ? `    ${l}` : l)).join('\n');
  return `${text.slice(0, start)}    "${name}": ${body}${text.slice(close)}`;
}

function render(src, dst, filter) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', join(ROOT, src), '-af', filter, '-ar', String(SR), '-ac', '2', '-b:a', '128k', join(ROOT, dst)]);
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
}

// Apply a review to the registry text. render / measure injectable (tests).
export function applyReview(text, review, { dry = false, render: doRender = render, measure = (f) => measurePeak(join(ROOT, f)), remove = (f) => unlinkSync(join(ROOT, f)), log = console.log } = {}) {
  const reg = JSON.parse(text);
  const used = (file) => Object.values(reg.clips).filter((c) => c.file === file).length;
  let out = text;
  for (const name of review.approved ?? []) {
    if (!reg.clips[name]) { log(`${name}: not a clip, skipped`); continue; }
    log(`${name}: approved`);
    if (!dry) out = setClip(out, name, { approved: true });
  }
  for (const e of review.edits ?? []) {
    const c = reg.clips[e.clip];
    if (!c) { log(`${e.clip}: not a clip, skipped`); continue; }
    const offset = Number(e.gainDb) || 0, pitch = Number(e.pitch) || 0, speed = Number(e.speed) || 100;
    const patch = {};
    if (e.approved) patch.approved = true;
    if (e.note) log(`${e.clip}: note — ${e.note}`);
    if (!c.file) {
      if (offset) patch.gainDb = Math.round((c.gainDb + offset) * 10) / 10;
      if (pitch || speed !== 100) log(`${e.clip}: a generated sound — pitch ${pitch} st / speed ${speed}% are for the hand (its rate in audio.json, or audio/synth.js)`);
      log(`${e.clip}: trim ${c.gainDb} -> ${patch.gainDb ?? c.gainDb}${e.approved ? ', approved' : ''}`);
    } else if (!pitch && speed === 100) {
      if (offset) patch.gainDb = Math.round((c.gainDb + offset) * 10) / 10;
      log(`${e.clip}: trim ${c.gainDb} -> ${patch.gainDb ?? c.gainDb} (level ${(c.measuredDb + (patch.gainDb ?? c.gainDb)).toFixed(1)} dB)${e.approved ? ', approved' : ''}`);
    } else {
      const file = nextFile(c.file), filter = pitchSpeedFilter(pitch, speed);
      log(`${e.clip}: render ${c.file} -> ${file} (${filter})${dry ? ' [dry run]' : ''}`);
      if (!dry) {
        doRender(c.file, file, filter);
        const m = measure(file);
        if (!m) throw new Error(`${file}: could not measure`);
        patch.file = file;
        patch.measuredDb = m.db;
        patch.gainDb = newGain(c, offset, m.db);
        if (c.peakMs !== undefined) patch.peakMs = m.ms;
        if (used(c.file) === 1) remove(c.file);
        log(`  measured ${m.db} dB at ${m.ms} ms; trim ${patch.gainDb} (level ${(m.db + patch.gainDb).toFixed(1)} dB)${c.peakMs !== undefined ? `, peak ${c.peakMs} -> ${m.ms} ms` : ''}${e.approved ? ', approved' : ''}`);
      }
    }
    if (!dry && Object.keys(patch).length) out = setClip(out, e.clip, patch);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--apply');
  if (i < 0 || !args[i + 1]) { console.error('usage: node tools/render-sfx.mjs --apply sfx-review.json [--dry-run]'); process.exit(2); }
  const review = JSON.parse(readFileSync(args[i + 1], 'utf8'));
  const dry = args.includes('--dry-run');
  const text = readFileSync(REGISTRY, 'utf8');
  const out = applyReview(text, review, { dry });
  if (!dry && out !== text) { writeFileSync(REGISTRY, out); console.log('audio.json written — run the suite and ship (tools/audio-check.mjs for the browser\'s reading of the new files)'); }
  else if (!dry) console.log('nothing to change');
}

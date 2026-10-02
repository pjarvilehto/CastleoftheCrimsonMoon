#!/usr/bin/env node
// Redraw the character portraits in the room paintings' style with FLUX
// Kontext on Replicate (0.184). Needs REPLICATE_API_TOKEN in the environment
// (REPLICATE_KEY is read too). Follows tools/gen-vo.mjs: the prompts live in
// docs/portrait-prompts.md (the style block + one line per character), the
// output is a registry the Art Lab (labs/art/) reads, nothing is ever
// overwritten, and the lab's verdicts come back as JSON.
//
//   node tools/gen-art.mjs --dry-run                      # what would be sent, and to which model
//   node tools/gen-art.mjs --only player,rat,vampire_lord # the pilot: 4 candidates each (--n 3)
//   node tools/gen-art.mjs --style castle_courtyard.jpg   # a painting as the style reference instead of the
//                                                         # character's own sheet (assets/style/<id>.png, when
//                                                         # there is one; else the ossuary); any picture by path
//   node tools/gen-art.mjs --model max                    # Kontext Max instead of Pro
//   node tools/gen-art.mjs --inputs files                 # upload the pictures (Files API) instead of inlining them
//   node tools/gen-art.mjs --rerender art-rerender.json   # the Art Lab's verdicts: records approvals,
//                                                         # rejections (+ notes), generates the re-rolls
//   node tools/gen-art.mjs --recut rat_c2 --tolerance 40 --shadow 90   # cut a candidate out again with
//                                                         # another key (--shadow 0 keeps a ground shadow,
//                                                         # --paper 0 keeps light greys reachable from the edge,
//                                                         # --holes 0 keeps enclosed patches of the paper's tone)
//   node tools/gen-art.mjs --clean rat_c4                 # a new candidate: the same picture with the ground
//                                                         # shadow, panel and signature painted out by Kontext
//   node tools/gen-art.mjs --import [--only rat] [--pick rat=2]   # the approved candidate (or the pick)
//                                                         # into the game under a NEW filename (rat_v2.webp)
//   node tools/gen-art.mjs --manifest                     # rebuild art.json from what is on disk
//
// Each candidate: the model's picture as sent back (assets/chars/candidates/
// <id>_c<n>_raw.jpg: JPEG q92, a 1.6MB PNG each would weigh the repo down) and the cut-out (<id>_c<n>.webp, RGBA): the flat grey
// background keyed out from the border (tools/cutout.mjs), the figure
// trimmed and scaled onto the current portrait's canvas at the current
// figure's height, so it reads the same size on the card. The registry
// (assets/data/art.json) records per candidate the model, version, seed,
// prompt, style painting, cut settings and the lab's verdict.
//
// In a container whose outbound traffic goes through a proxy, run with
// NODE_USE_ENV_PROXY=1 (Node's fetch ignores HTTPS_PROXY otherwise).
//
// Models (api.replicate.com, checked 2026-10): flux-kontext-apps/
// multi-image-kontext-pro and -max take two pictures (input_image_1 = the
// portrait, input_image_2 = the painting) and a prompt; the plain
// black-forest-labs/flux-kontext-pro takes one. Pricing is not in the API;
// from memory Kontext Pro is about $0.04 and Max about $0.08 a picture
// (check replicate.com/pricing).

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyOut, applyAlpha, bbox, placeOn, dropStray, fillHoles, SHADOW, PAPER } from './cutout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'portrait-prompts.md');
const CHARS = join(ROOT, 'assets', 'chars');
const OUT = join(CHARS, 'candidates');
const REGISTRY = join(ROOT, 'assets', 'data', 'art.json');
const WEB = 'assets/chars/candidates'; // as the lab fetches it
const API = 'https://api.replicate.com/v1';

export const MODELS = {
  pro: { model: 'flux-kontext-apps/multi-image-kontext-pro', priceUsd: 0.04 },
  max: { model: 'flux-kontext-apps/multi-image-kontext-max', priceUsd: 0.08 },
};
export const DEFAULTS = { n: 4, style: 'dungeon_ossuary.jpg', model: 'pro', aspect: '2:3', tolerance: 30, concurrency: 3 };
// The style reference for a character, when nothing is asked (--style, a
// re-roll's style): its own finished sheet in the target style if the owner
// put one in assets/style/<id>.png (0.191: seven of them — a sheet steers
// Kontext far better than a room painting: flat grey, no shadow), else the
// painting in DEFAULTS.style.
export const STYLE_DIR = 'assets/style';
// A character without a sheet borrows the nearest one (a hooded skull for the
// Vampire Lord, a beast for the beasts, armour for the brutes, bone for the stone).
export const STYLE_NEAREST = { vampire_lord: 'wraith', bat: 'rat', crypt_spider: 'rat', hollow_hound: 'rat', golem: 'blood_knight', gargoyle: 'skeleton' };
export const styleFor = (id, root = ROOT) => {
  for (const s of [id, STYLE_NEAREST[id]]) if (s && existsSync(join(root, STYLE_DIR, `${s}.png`))) return `${STYLE_DIR}/${s}.png`;
  return DEFAULTS.style;
};
// The clean-up pass (--clean, the lab's CLEAN): the same picture through the
// one-picture Kontext with the background's faults painted out — the ground
// shadow the model adds despite the prompt (dark ones survive the key), a
// panel or vignette, its signature. The figure itself is to stay as it is.
export const CLEAN = {
  model: 'black-forest-labs/flux-kontext-pro', priceUsd: 0.04,
  prompt: 'Remove the ground shadow under the figure, any vignette, inner panel, border, paper texture and any signature or text. Make the background one flat, uniform light grey (#c8c8c8) from edge to edge. Keep the character exactly as it is, unchanged in every line, colour and detail.',
};
const token = () => process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_KEY;

/** The doc: { style, chars: [{ id, name, file, line }] } (the style block's [FACING] is filled per character). */
export function parsePrompts(md) {
  const block = md.match(/## Style block[\s\S]*?```\n([\s\S]*?)```/);
  if (!block) throw new Error('docs/portrait-prompts.md: no style block');
  const chars = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*`([a-z_]+)\.webp`\s*\|\s*`(CHARACTER:[^`]+)`\s*\|\s*$/);
    if (m) chars.push({ name: m[1].replace(/\s*\(boss\)$/, ''), id: m[2], file: `${m[2]}.webp`, line: m[3].trim() });
  }
  if (!chars.length) throw new Error('docs/portrait-prompts.md: no character lines');
  return { style: block[1].trim(), chars };
}
export const facing = (id) => (id === 'player' ? 'facing right' : 'facing left');
/** The prompt sent for a character: the style block (facing filled in), its line, the facing once more (Kontext mirrors a figure readily; the lab's Flip catches the rest), a re-roll hint. */
export function promptFor(doc, c, hint = '') {
  const side = facing(c.id).split(' ')[1];
  return `${doc.style.replace('[FACING]', facing(c.id))}\n\n${c.line}\nFACING: the figure faces ${side}, its head and eyes turned toward the ${side} edge of the picture.${hint ? `\n\n${hint.trim()}` : ''}`;
}

/** A stable seed per candidate; a re-roll gets a fresh one. */
function seedFor(id, n) {
  let h = 2166136261;
  for (const ch of `${id}/${n}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % 2147483647;
}

// ---- Replicate ----
const headers = () => ({ Authorization: `Bearer ${token()}` });
// The inputs go inline as data URIs by default (--inputs data): the model's
// own fetch of a picture uploaded to the Files API timed out on a third of
// the pilot's tries. Kontext works at ~1MP, so the painting goes as a
// 1024-wide JPEG and a portrait over 1024px tall is scaled down; both stay
// well under the data URI limit. --inputs files uploads them instead.
async function inline(path) {
  const S = await sharp();
  const img = S(path), meta = await img.metadata();
  const buf = path.endsWith('.jpg') ? await img.resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    : meta.height > 1024 || !path.endsWith('.webp') ? await img.resize({ height: 1024, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toBuffer() : readFileSync(path);
  return `data:${path.endsWith('.jpg') ? 'image/jpeg' : 'image/webp'};base64,${buf.toString('base64')}`;
}
async function upload(path) {
  const form = new FormData();
  const type = path.endsWith('.jpg') ? 'image/jpeg' : path.endsWith('.png') ? 'image/png' : 'image/webp';
  form.append('content', new Blob([readFileSync(path)], { type }), path.split('/').pop());
  const res = await fetch(`${API}/files`, { method: 'POST', headers: headers(), body: form });
  if (!res.ok) throw new Error(`upload ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).urls.get;
}
async function predict(model, input) {
  const res = await fetch(`${API}/models/${model}/predictions`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'wait=60' }, body: JSON.stringify({ input }) });
  if (!res.ok) throw new Error(`predict: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  let p = await res.json();
  while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
    await new Promise((r) => setTimeout(r, 2500));
    const poll = await fetch(p.urls.get, { headers: headers() });
    if (!poll.ok) throw new Error(`poll: HTTP ${poll.status}`);
    p = await poll.json();
  }
  if (p.status !== 'succeeded') throw new Error(`${p.status}: ${p.error ?? '?'}`);
  const url = Array.isArray(p.output) ? p.output[0] : p.output;
  const img = await fetch(url);
  if (!img.ok) throw new Error(`download: HTTP ${img.status}`);
  return { bytes: Buffer.from(await img.arrayBuffer()), version: p.version, id: p.id, metrics: p.metrics };
}

// ---- pictures (sharp, loaded only when a picture is touched) ----
const sharp = async () => (await import('sharp')).default;
/** The current portrait's canvas and figure box: { w, h, box }. */
export async function portraitFrame(file) {
  const S = await sharp();
  const { data, info } = await S(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  for (let p = 0; p < alpha.length; p++) alpha[p] = data[p * 4 + 3];
  return { w: info.width, h: info.height, box: bbox(alpha, info.width, info.height) };
}
/** rawPath -> cutPath: keyed out, trimmed, scaled onto the reference portrait's canvas. Returns the cut record. */
export async function cutAndFit(rawPath, refPath, cutPath, { tolerance = DEFAULTS.tolerance, shadow = SHADOW.tolerance, paper = true, holes = true, flip = false } = {}) {
  const S = await sharp();
  const { data, info } = await S(rawPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { alpha, bg } = keyOut(data, info.width, info.height, { tolerance, paper: paper ? PAPER : null, shadow: shadow > 0 ? { ...SHADOW, tolerance: shadow } : null });
  const filled = holes ? fillHoles(data, alpha, info.width, info.height, bg) : 0;
  const stray = dropStray(alpha, info.width, info.height);
  const box = applyAlpha(data, alpha, info.width, info.height);
  if (!box) throw new Error(`${rawPath}: nothing left after the key (tolerance ${tolerance})`);
  const old = await portraitFrame(refPath);
  const at = placeOn(box, old);
  let fig = S(Buffer.from(data.buffer, data.byteOffset, data.length), { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 }).resize(at.w, at.h);
  if (flip) fig = fig.flop();
  const figBuf = await fig.png().toBuffer();
  await S({ create: { width: old.w, height: old.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: figBuf, left: at.left, top: at.top }]).webp({ quality: 90, alphaQuality: 100 }).toFile(cutPath);
  return { tolerance, shadow, paper, holes, bg, box, filled, stray, flip, canvas: [old.w, old.h], figure: [at.w, at.h] };
}

// ---- the registry ----
export const candidateFile = (id, n) => `${id}_c${n}`;
function loadRegistry() { return existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : { chars: {} }; }
function saveRegistry(reg) {
  reg._doc = 'Generated by tools/gen-art.mjs from docs/portrait-prompts.md: the portraits redrawn in the room paintings\' style (FLUX Kontext on Replicate). chars: per character its reference portrait (the doc\'s file) and candidates: file = the cut-out (RGBA, on the reference portrait\'s canvas), raw = the model\'s picture, model / version / seed / style / prompt as sent, cut = how it was keyed out, verdict = the Art Lab\'s (labs/art/) approve ("ok") or reject ("no") with its note, flip = mirrored on import, imported = the game file it became. The game reads the portraits from enemies.json art / cards.json player.art, never from here.';
  reg.generated = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  writeFileSync(REGISTRY, JSON.stringify({ _doc: reg._doc, generated: reg.generated, chars: reg.chars }, null, 2) + '\n');
}
function charEntry(reg, c) { return (reg.chars[c.id] ??= { name: c.name, file: c.file, candidates: [] }); }
function nextN(entry) { return entry.candidates.reduce((m, k) => Math.max(m, k.n), 0) + 1; }

// ---- main ----
async function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
  const doc = parsePrompts(readFileSync(DOC, 'utf8'));
  const reg = loadRegistry();
  const only = val('--only') ? val('--only').split(',') : null;
  const chars = doc.chars.filter((c) => !only || only.includes(c.id));
  if (only && chars.length !== only.length) throw new Error(`unknown character in --only (known: ${doc.chars.map((c) => c.id).join(', ')})`);
  const model = MODELS[val('--model', DEFAULTS.model)];
  if (!model) throw new Error('--model pro | max');
  const tolerance = Number(val('--tolerance', DEFAULTS.tolerance)), shadow = Number(val('--shadow', SHADOW.tolerance)), paper = val('--paper', '1') !== '0', holes = val('--holes', '1') !== '0';
  const cutOpts = { tolerance, shadow, paper, holes };
  mkdirSync(OUT, { recursive: true });

  if (has('--manifest')) { // what is on disk, keeping every record that still has its file
    for (const c of doc.chars) {
      const e = charEntry(reg, c);
      e.candidates = e.candidates.filter((k) => existsSync(join(ROOT, k.file)));
      for (const f of readdirSync(OUT).filter((f) => f.startsWith(`${c.id}_c`) && f.endsWith('.webp'))) {
        const n = Number(f.match(/_c(\d+)\.webp$/)?.[1]);
        if (n && !e.candidates.some((k) => k.n === n)) e.candidates.push({ n, file: `${WEB}/${f}`, raw: `${WEB}/${candidateFile(c.id, n)}_raw.jpg` });
      }
      e.candidates.sort((a, b) => a.n - b.n);
    }
    saveRegistry(reg); console.log(`${REGISTRY.replace(ROOT + '/', '')}: ${Object.values(reg.chars).reduce((s, e) => s + e.candidates.length, 0)} candidates`); return;
  }

  if (has('--recut')) { // the same picture(s), another key ("all" = every candidate of the --only characters)
    const [, id, n] = val('--recut').match(/^([a-z_]+)_c(\d+)$/) ?? [];
    const c = doc.chars.find((x) => x.id === id), one = c && charEntry(reg, c).candidates.find((x) => x.n === Number(n));
    if (!one && val('--recut') !== 'all') throw new Error(`--recut: no candidate ${val('--recut')} (or "all")`);
    const list = one ? [[c, one]] : chars.flatMap((ch) => charEntry(reg, ch).candidates.map((k) => [ch, k]));
    for (const [ch, k] of list) { k.cut = await cutAndFit(join(ROOT, k.raw), join(CHARS, ch.file), join(ROOT, k.file), { ...cutOpts, flip: has('--flip') }); console.log(`  recut ${k.file}: figure ${k.cut.figure.join('x')}, ${k.cut.filled} holes, ${k.cut.stray} stray`); }
    saveRegistry(reg); return;
  }

  if (has('--import')) { // the approved candidate (or the pick) into the game, under a new filename
    const picks = Object.fromEntries(args.filter((a, i) => args[i - 1] === '--pick').map((p) => p.split('=')));
    const enemies = JSON.parse(readFileSync(join(ROOT, 'assets/data/enemies.json'), 'utf8'));
    const cards = JSON.parse(readFileSync(join(ROOT, 'assets/data/cards.json'), 'utf8'));
    let done = 0;
    for (const c of chars) {
      const e = charEntry(reg, c);
      const k = picks[c.id] ? e.candidates.find((x) => x.n === Number(picks[c.id])) : [...e.candidates].reverse().find((x) => x.verdict === 'ok');
      if (!k) { if (picks[c.id]) throw new Error(`--pick ${c.id}=${picks[c.id]}: no such candidate`); continue; }
      let v = 2; while (existsSync(join(CHARS, `${c.id}_v${v}.webp`))) v++; // never overwrite: the next free version
      const file = `${c.id}_v${v}.webp`;
      const S = await sharp();
      let img = S(join(ROOT, k.file));
      if (k.flip || has('--flip')) img = img.flop();
      await img.webp({ quality: 90, alphaQuality: 100 }).toFile(join(CHARS, file));
      k.imported = file;
      if (c.id === 'player') cards.player.art = file; else enemies[c.id].art = file;
      console.log(`  ${c.id}: candidate ${k.n} -> assets/chars/${file}${k.flip ? ' (flipped)' : ''}${k.from ? ` (a clean of c${k.from})` : ' (not a clean pass: a ground shadow may be in it — --clean first if so)'}`);
      done++;
    }
    writeFileSync(join(ROOT, 'assets/data/enemies.json'), JSON.stringify(enemies, null, 2) + '\n');
    writeFileSync(join(ROOT, 'assets/data/cards.json'), JSON.stringify(cards, null, 2) + '\n');
    saveRegistry(reg);
    console.log(`${done} portrait${done === 1 ? '' : 's'} imported (enemies.json art / cards.json player.art point at the new files; the old art stays on disk)`);
    return;
  }

  // The jobs: --n new candidates per character, or the lab's re-rolls
  const req = has('--rerender') ? JSON.parse(readFileSync(val('--rerender'), 'utf8')) : null;
  const jobs = [];
  if (req) {
    for (const a of req.approved ?? []) { const k = Object.values(reg.chars).flatMap((e) => e.candidates).find((x) => x.file === a.file); if (k) { k.verdict = 'ok'; k.flip = !!a.flip; delete k.note; } }
    for (const r of req.rejected ?? []) { const k = Object.values(reg.chars).flatMap((e) => e.candidates).find((x) => x.file === r.file); if (k) { k.verdict = 'no'; if (r.note) k.note = r.note; else delete k.note; } }
    for (const r of req.reroll ?? []) {
      const c = doc.chars.find((x) => x.id === r.id);
      if (!c) throw new Error(`reroll: unknown character ${r.id}`);
      const e = charEntry(reg, c), n0 = nextN(e);
      if (r.clean) { jobs.push({ c, n: n0, from: e.candidates.find((k) => k.n === r.clean) ?? (() => { throw new Error(`clean: no candidate ${r.id}_c${r.clean}`); })(), seed: Date.now() % 2147483647 }); continue; }
      for (let i = 0; i < (r.n ?? DEFAULTS.n); i++) jobs.push({ c, n: n0 + i, style: r.style || val('--style', styleFor(c.id)), hint: r.hint ?? '', seed: (Date.now() + i * 7919) % 2147483647 });
    }
    saveRegistry(reg);
    console.log(`verdicts: ${(req.approved ?? []).length} approved, ${(req.rejected ?? []).length} rejected`);
  } else if (has('--clean')) {
    const [, id, n] = val('--clean').match(/^([a-z_]+)_c(\d+)$/) ?? [];
    const c = doc.chars.find((x) => x.id === id), from = c && charEntry(reg, c).candidates.find((x) => x.n === Number(n));
    if (!from) throw new Error(`--clean: no candidate ${val('--clean')}`);
    jobs.push({ c, n: nextN(charEntry(reg, c)), from, seed: seedFor(c.id, 1000 + from.n) });
  } else {
    const n = Number(val('--n', DEFAULTS.n));
    for (const c of chars) { const n0 = nextN(charEntry(reg, c)); for (let i = 0; i < n; i++) jobs.push({ c, n: n0 + i, style: val('--style', styleFor(c.id)), hint: val('--hint', ''), seed: seedFor(c.id, n0 + i) }); }
  }
  for (const j of jobs) {
    if (j.from) { j.prompt = CLEAN.prompt; j.style = j.from.style; continue; }
    j.stylePath = existsSync(join(ROOT, 'assets/bg', j.style)) ? join(ROOT, 'assets/bg', j.style) : existsSync(join(ROOT, j.style)) ? join(ROOT, j.style) : null;
    if (!j.stylePath) throw new Error(`no such style picture: assets/bg/${j.style} or ${j.style}`);
    j.prompt = promptFor(doc, j.c, j.hint);
  }
  const cost = jobs.reduce((s, j) => s + (j.from ? CLEAN.priceUsd : model.priceUsd), 0);
  console.log(`${jobs.length} candidate${jobs.length === 1 ? '' : 's'} to generate with ${[...new Set(jobs.map((j) => (j.from ? CLEAN.model : model.model)))].join(' + ')} (about $${cost.toFixed(2)} at ~$${model.priceUsd} each, from memory)`);
  for (const j of jobs) console.log(`  ${candidateFile(j.c.id, j.n)}  ${j.from ? `clean of c${j.from.n}` : `style ${j.style}`}  seed ${j.seed}${j.hint ? `  hint "${j.hint}"` : ''}`);
  if (has('--dry-run')) { if (jobs.length) console.log(`\n--- the prompt for ${jobs[0].c.id} ---\n${jobs[0].prompt}\n---`); return; }
  if (!jobs.length) return;
  if (!token()) throw new Error('REPLICATE_API_TOKEN is not set');

  // one upload (or one inline encoding) per picture, shared by the jobs
  const uploads = {};
  const uploaded = (path) => (uploads[path] ??= (val('--inputs', 'data') === 'files' ? upload(path) : inline(path)));
  let i = 0, failed = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const j = jobs[i++];
      const name = candidateFile(j.c.id, j.n);
      try {
        const t0 = Date.now();
        const use = j.from ? CLEAN.model : model.model;
        const input = j.from
          ? { prompt: j.prompt, input_image: await uploaded(join(ROOT, j.from.raw)), aspect_ratio: 'match_input_image', output_format: 'png', safety_tolerance: 2, seed: j.seed }
          : { prompt: j.prompt, input_image_1: await uploaded(join(CHARS, j.c.file)), input_image_2: await uploaded(j.stylePath), aspect_ratio: DEFAULTS.aspect, output_format: 'png', safety_tolerance: 2, seed: j.seed };
        // the model's own fetch of a just-uploaded picture times out now and then (the pilot: 3 of 13 first tries): one more go
        const out = await predict(use, input).catch(async (e) => { if (!/timed out/i.test(e.message)) throw e; console.log(`  retry ${name}: ${e.message}`); await new Promise((r) => setTimeout(r, 4000)); return predict(use, input); });
        const rawPath = join(OUT, `${name}_raw.jpg`), cutPath = join(OUT, `${name}.webp`);
        await (await sharp())(out.bytes).jpeg({ quality: 92 }).toFile(rawPath);
        const cut = await cutAndFit(rawPath, join(CHARS, j.c.file), cutPath, cutOpts);
        const entry = charEntry(reg, j.c);
        entry.candidates.push({ n: j.n, file: `${WEB}/${name}.webp`, raw: `${WEB}/${name}_raw.jpg`, model: use, version: out.version, seed: j.seed, style: j.style, hint: j.hint || undefined, from: j.from?.n, prompt: j.prompt, created: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), cut });
        entry.candidates.sort((a, b) => a.n - b.n);
        saveRegistry(reg); // after every picture: a crash loses nothing
        console.log(`  ok ${name} (${(out.bytes.length / 1024).toFixed(0)} KB raw, ${((Date.now() - t0) / 1000).toFixed(0)} s, figure ${cut.figure.join('x')} on ${cut.canvas.join('x')})`);
      } catch (e) {
        failed++;
        console.error(`  FAIL ${name}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DEFAULTS.concurrency, jobs.length) }, worker));
  console.log(`${REGISTRY.replace(ROOT + '/', '')}: ${Object.values(reg.chars).reduce((s, e) => s + e.candidates.length, 0)} candidates${failed ? `, ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

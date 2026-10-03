#!/usr/bin/env node
// Paint new room backgrounds in the paintings' own style on Replicate
// (0.00236). Follows tools/gen-art.mjs: the prompts live in
// docs/room-prompts.md (the style block + one line per room), every
// candidate is kept (assets/bg/candidates/<id>_c<n>.jpg at the model's own
// size, never overwritten) and recorded in assets/data/rooms-art.json with
// its model, version, seed, references and prompt.
//
//   node tools/gen-bg.mjs --dry-run                       # what would be sent, and to which models
//   node tools/gen-bg.mjs --bakeoff                       # every room in the doc on every model (BAKEOFF), text alone
//   node tools/gen-bg.mjs --only clock_tower --model bananapro --n 3   # one room, one model, three seeds
//   node tools/gen-bg.mjs --refs                          # two of the game's paintings attached as references (REFS by
//   node tools/gen-bg.mjs --refs castle_great_hall.jpg,dungeon_kitchen.jpg   # the room's hue family, or these two)
//   node tools/gen-bg.mjs --hint "more chains"            # a direction appended to the room's line
//   node tools/gen-bg.mjs --id torch_corridor --name "The Torchlit Passage" --prompt "..." --bakeoff
//                                                         # a prompt sent exactly as written (the guide's own, 0.00238)
//   node tools/gen-bg.mjs --rerender rooms-rerender.json  # the Background Lab's verdicts (labs/backgrounds/): records the
//                                                         # approvals and rejections (+ notes), paints the re-rolls — fresh ones
//                                                         # ({ id, n, hint, model }) or from a candidate with a direction
//                                                         # ("Regenerate with notes": { id, basedOn: n, hint, n, model })
//   node tools/gen-bg.mjs --prune [--only id]             # a room with an approved candidate loses its other candidates
//   node tools/gen-bg.mjs --import clock_tower [--list rooms|treasure|bosses|entrance|antechambers]
//                                                         # the room's approved candidate (or --import clock_tower_c2) as
//                                                         # the 2048x1152 JPEG the game loads (assets/bg/<id>.jpg), its name
//                                                         # in backgrounds.json roomNames and the list;
//                                                         # then python3 tools/gen-depth.py <model.onnx> assets/bg/<id>.jpg
//   node tools/gen-bg.mjs --sheet out.jpg [--only id]     # a contact sheet of the candidates, a row per room
//   node tools/gen-bg.mjs --only clock_tower --model lora # the rooms' LoRA (tools/train-lora.mjs --set rooms): from the
//                                                         # room's line alone, no reference paintings, 1 MP (upscaled at import)
//
// The prompt is the recipe the paintings were made with (docs/room-prompts.md
// and the developer's docs/image-prompting-guide.md, 0.00237): the room's line,
// the guide's mood (a boss arena's composition for an arena), the style
// block word for word, as text alone; --refs attaches two of the game's paintings through gen-art's
// MODELS adapters (the prompt then names them). GPT Image paints 3:2 and
// is cropped to 16:9 at import. Prices from memory, the API has none.
// Run with NODE_USE_ENV_PROXY=1 behind a proxy.

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, loraVersion } from './gen-art.mjs';
import { token, predict, predictVersion } from './replicate.mjs';
import { LORAS, ROOM_CAPTION } from './train-lora.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'room-prompts.md');
const BG = join(ROOT, 'assets', 'bg');
const OUT = join(BG, 'candidates');
const REGISTRY = join(ROOT, 'assets', 'data', 'rooms-art.json');
const BACKGROUNDS = join(ROOT, 'assets', 'data', 'backgrounds.json');
const WEB = 'assets/bg/candidates';

export const DEFAULTS = { n: 2, model: 'seedream', aspect: '16:9', concurrency: 3 }; // Seedream 4: the developer's pick (0.00242) from the verbatim round
/** The guide's mood / composition modifiers: a room, or a boss arena (the Kind column). */
export const MOOD = 'gloomy and moody, deep shadows, oppressive atmosphere';
export const ARENA = 'video game boss arena background art, wide symmetrical battle stage composition with open floor space in the center';
/** Text-to-image models of their own (no pictures in): FLUX 1.1 Pro and Imagen 4 join the editors for a text-only run. */
export const TEXT_MODELS = {
  flux11: { model: 'black-forest-labs/flux-1.1-pro', priceUsd: 0.04, build: (x) => ({ prompt: x.prompt, aspect_ratio: x.aspect, output_format: 'png', safety_tolerance: 2, prompt_upsampling: false, seed: x.seed }) },
  imagen: { model: 'google/imagen-4', priceUsd: 0.04, build: (x) => ({ prompt: x.prompt, aspect_ratio: x.aspect, output_format: 'png', safety_filter_level: 'block_only_high' }) },
};
/** The bake-off's models: the editors that paint from text alone when no picture goes in, plus the text-only models (Kontext needs a picture). */
export const BAKEOFF = ['banana', 'bananapro', 'seedream', 'gpt', 'flux2', 'flux11', 'imagen'];
export const modelDef = (m) => MODELS[m] ?? TEXT_MODELS[m];
/** Two reference paintings per hue family: the closest in colour among the game's own. */
export const REFS = {
  amber: ['castle_great_hall.jpg', 'dungeon_torch_corridor.jpg'],
  red: ['dungeon_cathedral_nave.jpg', 'throne_ember_warlord.jpg'],
  cold: ['castle_ramparts.jpg', 'dungeon_royal_bedroom.jpg'],
  teal: ['dungeon_cistern.jpg', 'corridor_flooded_hall.jpg'],
  violet: ['dungeon_arcane_library.jpg', 'treasure_cursed_reliquary.jpg'],
  bone: ['dungeon_ossuary.jpg', 'corridor_bone_passage.jpg'],
  green: ['dungeon_sewer_passage.jpg', 'treasure_smugglers_cache.jpg'],
  ice: ['treasure_frozen_tribute.jpg', 'dungeon_observatory.jpg'],
};
export const GAME = { w: 2048, h: 1152, quality: 86 };

/** The doc: { style, rooms: [{ id, name, hue, line }] }. */
export function parseRooms(md) {
  const block = md.match(/## Style block[\s\S]*?```\n([\s\S]*?)```/);
  if (!block) throw new Error('room-prompts.md: no style block');
  const rooms = [];
  for (const m of md.matchAll(/^\| (\w+) \| ([^|]+) \| (\w+) \| (room|arena) \| (.+?) \|$/gm)) {
    if (m[1] === 'Id') continue;
    rooms.push({ id: m[1], name: m[2].trim(), hue: m[3], kind: m[4], line: m[5].trim() });
  }
  if (!rooms.length) throw new Error('room-prompts.md: no rooms');
  return { style: block[1].trim(), rooms };
}
/** The rooms' LoRA prompt: the training caption's words, the room's line, no pictures. */
export function loraPrompt(room, hint = '') {
  return `${LORAS.rooms.trigger} style, ${ROOM_CAPTION}: ${room.name}. ${room.line}${hint ? ` ${hint}` : ''}`;
}
export const ROOM_LORA = { model: 'black-forest-labs/flux-dev-lora', priceUsd: 0.03, trigger: LORAS.rooms.trigger };
/** The recipe: the line (+ a hint), the mood, the style block last and verbatim; with references, a lead naming them. */
export function promptFor(doc, room, hint = '', refs = null, list = true) {
  const lead = !refs ? '' : list ? 'In exactly the style of the first image and the second image (two paintings of the same set), a new room: ' : 'In exactly the style of the two input images (two paintings of the same set), a new room: ';
  if (room.verbatim) return `${lead}${room.line}`; // --prompt: the text as written, nothing added
  return `${lead}${room.line}${hint ? `, ${hint}` : ''}, ${room.kind === 'arena' ? ARENA : MOOD}, ${doc.style}`;
}
/** --refs alone = the hue family's two paintings; --refs a.jpg,b.jpg = those; no --refs = none (text alone). */
export const refsFor = (room, over) => (over === true || over === '' ? REFS[room.hue] ?? REFS.cold : over ? over.split(',') : null);
function seedFor(id, n) {
  let h = 2166136261;
  for (const ch of `bg/${id}/${n}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % 2147483647;
}

const sharp = async () => (await import('sharp')).default;
async function inline(path) {
  const S = await sharp();
  const buf = await S(path).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}
const loadRegistry = () => (existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : { rooms: {} });
function saveRegistry(reg) {
  writeFileSync(REGISTRY, JSON.stringify({ _doc: 'Generated by tools/gen-bg.mjs: per room the candidates painted (assets/bg/candidates/<id>_c<n>.jpg at the model\'s own size), their model, version, seed, reference paintings and prompt, and the verdicts.', rooms: reg.rooms }, null, 2) + '\n');
}
const entryFor = (reg, room) => { const e = (reg.rooms[room.id] ??= { name: room.name, hue: room.hue, candidates: [] }); e.line = room.line; e.kind = room.kind ?? 'room'; if (room.verbatim) e.verbatim = true; return e; };
/** A room as the registry remembers it (a --prompt room keeps its whole prompt as the line). */
const roomOf = (reg, doc, id) => doc.rooms.find((r) => r.id === id) ?? (reg.rooms[id] ? { id, name: reg.rooms[id].name, hue: reg.rooms[id].hue, kind: reg.rooms[id].kind ?? 'room', line: reg.rooms[id].line, verbatim: !!reg.rooms[id].verbatim } : null);
/** The lab's verdicts into the registry (pure; the re-rolls are returned as jobs to plan): { approved: [{ id, file }], rejected: [{ id, file, note }], reroll: [...] }. */
export function applyVerdicts(reg, req) {
  const all = Object.values(reg.rooms).flatMap((e) => e.candidates);
  for (const a of req.approved ?? []) { const k = all.find((x) => x.file === a.file); if (k) { k.verdict = 'ok'; delete k.note; } }
  for (const r of req.rejected ?? []) { const k = all.find((x) => x.file === r.file); if (k) { k.verdict = 'no'; if (r.note) k.note = r.note; else delete k.note; } }
  return { approved: (req.approved ?? []).length, rejected: (req.rejected ?? []).length };
}
/** The prompt for a redraw from a candidate (the lab's Regenerate with notes): the picture attached, the room's own words and the direction. */
export function basedOnPrompt(doc, room, hint = '', list = true) {
  const lead = list ? 'The first image is a painting of this room: keep its composition, palette and style and paint it again' : 'The input image is a painting of this room: keep its composition, palette and style and paint it again';
  return `${lead}${hint ? `, ${hint}` : ''}. ${promptFor(doc, room)}`;
}
const nextN = (entry) => entry.candidates.reduce((m, k) => Math.max(m, k.n), 0) + 1;

/** The game's painting from a candidate: cover-cropped to 2048x1152 (a 3:2 picture loses a strip top and bottom), JPEG q86. */
export async function toGame(src, dest) {
  const S = await sharp();
  const meta = await S(src).metadata();
  await S(src).resize(GAME.w, GAME.h, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).jpeg({ quality: GAME.quality, mozjpeg: true }).toFile(dest);
  return { from: `${meta.width}x${meta.height}`, upscaled: meta.width < GAME.w };
}

async function sheet(reg, out, only) {
  const S = await sharp();
  const TW = 400, TH = 225, PAD = 10, CAP = 26;
  const rooms = Object.entries(reg.rooms).filter(([id]) => !only || only.includes(id));
  const cols = Math.max(...rooms.map(([, e]) => e.candidates.length), 1);
  const W = cols * (TW + PAD) + PAD, H = rooms.length * (TH + CAP + PAD) + PAD;
  const comp = [], texts = [];
  rooms.forEach(([id, e], r) => {
    e.candidates.forEach((c, k) => {
      const x = PAD + k * (TW + PAD), y = PAD + r * (TH + CAP + PAD);
      comp.push({ input: join(ROOT, c.file), left: x, top: y + CAP, resize: true });
      texts.push(`<text x="${x + 3}" y="${y + 18}" font-family="sans-serif" font-size="15" fill="#eee">${id} c${c.n} · ${c.model.replace(/^.*\//, '').replace(/:.*$/, '')}${c.refs?.length ? ' +refs' : ''} · ${c.w}x${c.h}${c.verdict ? ` · ${c.verdict}` : ''}</text>`);
    });
  });
  for (const c of comp) c.input = await S(c.input).resize(TW, TH, { fit: 'cover' }).png().toBuffer();
  comp.push({ input: Buffer.from(`<svg width="${W}" height="${H}">${texts.join('')}</svg>`), left: 0, top: 0 });
  await S({ create: { width: W, height: H, channels: 3, background: '#222' } }).composite(comp).jpeg({ quality: 85 }).toFile(out);
  console.log(`sheet: ${out} (${W}x${H})`);
}

async function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
  const doc = parseRooms(readFileSync(DOC, 'utf8'));
  const only = val('--only', '')?.split(',').filter(Boolean);
  const reg = loadRegistry();
  if (has('--sheet')) return sheet(reg, val('--sheet'), only?.length ? only : null);
  if (has('--prune')) { // a room with an approved candidate keeps only its approved ones
    let gone = 0;
    for (const [id, e] of Object.entries(reg.rooms)) {
      if (only?.length && !only.includes(id)) continue;
      if (!e.candidates.some((k) => k.verdict === 'ok')) continue;
      for (const k of e.candidates.filter((k) => k.verdict !== 'ok')) { try { unlinkSync(join(ROOT, k.file)); } catch { /* gone already */ } gone++; }
      e.candidates = e.candidates.filter((k) => k.verdict === 'ok');
      console.log(`  ${id}: kept ${e.candidates.map((k) => `c${k.n}`).join(', ')}`);
    }
    saveRegistry(reg);
    console.log(`${gone} candidates pruned`);
    return;
  }
  if (has('--import')) {
    const arg = val('--import');
    const [, id, n] = arg.match(/^(.+)_c(\d+)$/) ?? [null, arg, null];
    const e = reg.rooms[id];
    const c = n ? e?.candidates.find((k) => k.n === +n) : [...(e?.candidates ?? [])].reverse().find((k) => k.verdict === 'ok');
    if (!c) throw new Error(n ? `no candidate ${arg}` : `${id}: no approved candidate (the Background Lab's Approve, then --rerender)`);
    const dest = join(BG, `${id}.jpg`);
    if (existsSync(dest)) throw new Error(`${dest} exists: a painting is never replaced in place (rule 7); pick another id`);
    const r = await toGame(join(ROOT, c.file), dest);
    const bg = JSON.parse(readFileSync(BACKGROUNDS, 'utf8'));
    const list = val('--list', 'rooms');
    bg.roomNames[`${id}.jpg`] = e.name;
    if (!bg[list]) throw new Error(`backgrounds.json has no list ${list}`);
    if (!bg[list].includes(`${id}.jpg`)) bg[list].push(`${id}.jpg`);
    if (list !== 'rooms' && ['entrance', 'antechambers'].includes(list) && !bg.rooms.includes(`${id}.jpg`)) bg.rooms.push(`${id}.jpg`);
    // every painting carries its own fog (0.166; the suite checks): an interior's usual mist to start with, tuned in the Fog Lab
    bg.parallax.overrides[`${id}.jpg`] ??= { fog: 0.45, fogWind: [0.006, 0.001, -0.004] };
    writeFileSync(BACKGROUNDS, JSON.stringify(bg, null, 2) + '\n');
    c.imported = `assets/bg/${id}.jpg`;
    saveRegistry(reg);
    console.log(`imported ${id}_c${c.n} (${c.model}, ${r.from}${r.upscaled ? ', upscaled' : ''}) -> assets/bg/${id}.jpg, "${e.name}" in ${list}\nnow: python3 tools/gen-depth.py /tmp/da2_vits.onnx assets/bg/${id}.jpg (the suite fails without the depth map)`);
    return;
  }
  const rooms = has('--prompt') ? [{ id: val('--id', 'prompt'), name: val('--name', val('--id', 'prompt')), hue: 'verbatim', kind: 'room', line: val('--prompt'), verbatim: true }]
    : doc.rooms.filter((r) => !only?.length || only.includes(r.id));
  const models = has('--bakeoff') ? BAKEOFF : [val('--model', DEFAULTS.model)];
  const n = Number(val('--n', DEFAULTS.n));
  const hint = val('--hint', '');
  const jobs = [];
  const planJob = (room, model, hintFor = hint, basedOn = null) => {
    if (model === 'lora') return { room, model, refs: [], prompt: loraPrompt(room, hintFor) };
    if (!modelDef(model)) throw new Error(`no model ${model} (lora, ${[...Object.keys(MODELS), ...Object.keys(TEXT_MODELS)].join(', ')})`);
    if (basedOn) { // the candidate as the picture in, the room's own words and the direction
      if (TEXT_MODELS[model]) throw new Error(`${model} takes no pictures: Regenerate needs an editor (seedream, banana, bananapro, gpt, flux2)`);
      return { room, model, refs: [], basedOn, prompt: basedOnPrompt(doc, room, hintFor, !!modelDef(model).list) };
    }
    const refsArg = has('--refs') ? (args[args.indexOf('--refs') + 1] ?? '').includes('.jpg') ? val('--refs') : true : null;
    const refs = refsFor(room, refsArg);
    if (refs && TEXT_MODELS[model]) throw new Error(`${model} takes no pictures`);
    if (!refs && ['pro', 'max'].includes(model)) throw new Error(`${model} needs pictures: --refs`);
    return { room, model, refs: refs ?? [], prompt: promptFor(doc, room, hintFor, refs, !!modelDef(model).list) };
  };
  if (has('--rerender')) {
    const req = JSON.parse(readFileSync(val('--rerender'), 'utf8'));
    const v = applyVerdicts(reg, req);
    saveRegistry(reg);
    console.log(`verdicts: ${v.approved} approved, ${v.rejected} rejected`);
    for (const r of req.reroll ?? []) {
      const room = roomOf(reg, doc, r.id);
      if (!room) throw new Error(`reroll: unknown room ${r.id}`);
      const basedOn = r.basedOn ? reg.rooms[r.id]?.candidates.find((k) => k.n === r.basedOn) ?? (() => { throw new Error(`basedOn: no candidate ${r.id}_c${r.basedOn}`); })() : null;
      for (let k = 0; k < (r.n ?? DEFAULTS.n); k++) jobs.push(planJob(room, r.model ?? DEFAULTS.model, r.hint ?? '', basedOn));
    }
  } else {
    for (const room of rooms) for (const model of models) for (let k = 0; k < n; k++) jobs.push(planJob(room, model));
  }
  const defOf = (m) => (m === 'lora' ? ROOM_LORA : modelDef(m));
  const cost = jobs.reduce((s, j) => s + defOf(j.model).priceUsd, 0);
  console.log(`${jobs.length} pictures (${rooms.map((r) => r.id).join(', ')} x ${models.join(', ')} x ${n}${jobs[0]?.refs.length ? ', with references' : ', text alone'}; about $${cost.toFixed(2)}, from memory)`);
  if (has('--dry-run')) { for (const j of jobs) console.log(`  ${j.room.id} on ${defOf(j.model).model} with ${j.basedOn ? `c${j.basedOn.n}` : j.refs.join(' + ') || 'no pictures'}\n    ${j.prompt.replace(/\n/g, '\n    ')}`); return; }
  if (!token()) throw new Error('REPLICATE_API_TOKEN is not set');
  mkdirSync(OUT, { recursive: true });
  const S = await sharp();
  const pictures = {};
  const picture = (f) => (pictures[f] ??= inline(join(BG, f)));
  let next = 0;
  const reserved = {}; // the number is claimed as the job is taken: three workers used to read the same next number (0.00236)
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const e = entryFor(reg, j.room);
      const num = Math.max(nextN(e), (reserved[j.room.id] ?? 0) + 1);
      reserved[j.room.id] = num;
      const name = `${j.room.id}_c${num}`;
      const seed = seedFor(j.room.id, num);
      const def = defOf(j.model);
      const input = j.model === 'lora'
        ? { prompt: j.prompt, aspect_ratio: DEFAULTS.aspect, output_format: 'png', num_inference_steps: 28, guidance: 3, megapixels: '1', seed }
        : j.basedOn ? def.build({ prompt: j.prompt, portrait: await inline(join(ROOT, j.basedOn.file)), style: null, aspect: DEFAULTS.aspect, seed })
        : def.build({ prompt: j.prompt, portrait: j.refs[0] ? await picture(j.refs[0]) : null, style: j.refs[1] ? await picture(j.refs[1]) : null, aspect: DEFAULTS.aspect, seed });
      // the rooms' LoRA runs as the trained model's own version (a private model's weights are not fetchable by the generic runner)
      const run = () => (j.model === 'lora' ? predictVersion(loraVersion('rooms') ?? (() => { throw new Error('no trained rooms LoRA in lora.json: node tools/train-lora.mjs --set rooms'); })(), input) : predict(def.model, input));
      try {
        // one more go after a time-out or a model that failed to produce a picture (not after a safety flag: that needs other words)
        const out = await run().catch(async (err) => { if (!/timed out|Failed to generate/i.test(err.message)) throw err; await new Promise((r) => setTimeout(r, 4000)); return run(); });
        const file = join(OUT, `${name}.jpg`);
        const meta = await S(out.bytes).metadata();
        await S(out.bytes).jpeg({ quality: 92 }).toFile(file);
        e.candidates.push({ n: num, file: `${WEB}/${name}.jpg`, model: j.model === 'lora' ? `${LORAS.rooms.destination}:${loraVersion('rooms')}` : def.model, version: out.version, seed, refs: j.refs, basedOn: j.basedOn?.n, hint: (j.basedOn || has('--rerender') ? j.prompt.match(/paint it again, (.+?)\. /)?.[1] : hint) || undefined, prompt: j.prompt, w: meta.width, h: meta.height, created: new Date().toISOString().replace(/\.\d+Z$/, 'Z') });
        saveRegistry(reg);
        console.log(`  ${name} (${j.model}, ${meta.width}x${meta.height}, ${((out.metrics?.predict_time ?? 0)).toFixed(0)} s)`);
      } catch (err) { console.log(`  ${name} (${j.model}) FAILED: ${err.message}`); }
    }
  };
  await Promise.all(Array.from({ length: DEFAULTS.concurrency }, worker));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

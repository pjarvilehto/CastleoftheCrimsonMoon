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
//   node tools/gen-art.mjs --refs family|sheets           # image 2 = the colour family's best original (STYLE_REF) or the
//                                                         # owner's inked sheet instead of the character's own portrait
//   node tools/gen-art.mjs --style castle_courtyard.jpg   # any picture by path or painting as the reference
//   node tools/gen-art.mjs --model max                    # Kontext Max instead of Pro; also banana, bananapro (Google
//                                                         # Nano Banana / Pro), seedream (ByteDance Seedream 4), gpt (OpenAI
//                                                         # GPT Image 1.5), flux2 (FLUX 2 Pro) — the same two pictures and prompt
//   node tools/gen-art.mjs --inputs files                 # upload the pictures (Files API) instead of inlining them
//   node tools/gen-art.mjs --only gargoyle --from-sheet skeleton   # drawn from its line on a style sheet, its old
//                                                         # art left out (the one-picture Kontext replaces the figure)
//   node tools/gen-art.mjs --model lora --only gargoyle   # the style LoRA (tools/train-lora.mjs): drawn from the
//                                                         # character line alone, no source portrait
//   node tools/gen-art.mjs --model lora --new mimic --line "CHARACTER: a treasure chest with fangs..." --name "Mimic"
//                                                         # a character the game does not have yet (a default canvas)
//   node tools/gen-art.mjs --rerender art-rerender.json   # the Art Lab's verdicts: records approvals,
//                                                         # rejections (+ notes), generates the re-rolls — from the
//                                                         # current portrait, or from a candidate with a direction
//                                                         # ("Regenerate with notes": { id, basedOn: n, hint, n, model })
//   node tools/gen-art.mjs --recut all [--only rat]       # cut the candidates out again (the matting model; --matte key =
//                                                         # the colour key, offline, with the knobs below)
//   node tools/gen-art.mjs --recut rat_c2 --matte key --tolerance 40 --shadow 90   # one candidate with
//                                                         # another key (--shadow 0 keeps a ground shadow,
//                                                         # --paper 0 keeps light greys reachable from the edge,
//                                                         # --holes 0 keeps enclosed patches of the paper's tone)
//   node tools/gen-art.mjs --clean rat_c4                 # a new candidate: the same picture with the ground
//                                                         # shadow, panel and signature painted out by Kontext
//   node tools/gen-art.mjs --import [--only rat] [--pick rat=2]   # the approved candidate (or the pick)
//                                                         # into the game under a NEW filename (rat_v2.webp)
//   node tools/gen-art.mjs --prune [--only rat]           # a character with an approved candidate loses its
//                                                         # other candidates (files and records); the rest untouched
//   node tools/gen-art.mjs --prune --keep-models banana,bananapro [--only rat] [--clear-verdicts]
//                                                         # keep only those models' candidates (a change of direction);
//                                                         # --clear-verdicts forgets the approvals and rejections too
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

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyOut, applyAlpha, bbox, placeOn, dropStray, fillHoles, SHADOW, PAPER } from './cutout.mjs';
import { API, token, headers, upload, predict, predictVersion, latestVersion } from './replicate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'portrait-prompts.md');
const CHARS = join(ROOT, 'assets', 'chars');
const OUT = join(CHARS, 'candidates');
const REGISTRY = join(ROOT, 'assets', 'data', 'art.json');
const WEB = 'assets/chars/candidates'; // as the lab fetches it

// Every editor takes the two pictures (the portrait, the style reference) and the
// prompt; `build` maps them onto the model's own inputs (api.replicate.com,
// checked 2026-10; prices from memory, the API has none). The multi-image
// Kontext apps name them input_image_1 / _2; the others take a list, and the
// prompt then says "the first image" / "the second image".
export const MODELS = {
  pro: { model: 'flux-kontext-apps/multi-image-kontext-pro', priceUsd: 0.04, build: (x) => ({ prompt: x.prompt, input_image_1: x.portrait, input_image_2: x.style, aspect_ratio: x.aspect, output_format: 'png', safety_tolerance: 2, seed: x.seed }) },
  max: { model: 'flux-kontext-apps/multi-image-kontext-max', priceUsd: 0.08, build: (x) => ({ prompt: x.prompt, input_image_1: x.portrait, input_image_2: x.style, aspect_ratio: x.aspect, output_format: 'png', safety_tolerance: 2, seed: x.seed }) },
  banana: { model: 'google/nano-banana', priceUsd: 0.04, list: true, build: (x) => ({ prompt: x.prompt, image_input: [x.portrait, x.style].filter(Boolean), aspect_ratio: x.aspect, output_format: 'png' }) },
  bananapro: { model: 'google/nano-banana-pro', priceUsd: 0.15, list: true, build: (x) => ({ prompt: x.prompt, image_input: [x.portrait, x.style].filter(Boolean), aspect_ratio: x.aspect, resolution: '2K', output_format: 'png', safety_filter_level: 'block_only_high' }) },
  seedream: { model: 'bytedance/seedream-4', priceUsd: 0.03, list: true, build: (x) => ({ prompt: x.prompt, image_input: [x.portrait, x.style].filter(Boolean), aspect_ratio: x.aspect, size: '2K', enhance_prompt: false, sequential_image_generation: 'disabled' }) },
  gpt: { model: 'openai/gpt-image-1.5', priceUsd: 0.15, list: true, build: (x) => ({ prompt: x.prompt, input_images: [x.portrait, x.style].filter(Boolean), aspect_ratio: ['1:1', '3:2', '2:3'].includes(x.aspect) ? x.aspect : '3:2', quality: 'high', input_fidelity: 'high', background: 'opaque', moderation: 'low', output_format: 'png' }) },
  flux2: { model: 'black-forest-labs/flux-2-pro', priceUsd: 0.05, list: true, build: (x) => ({ prompt: x.prompt, input_images: [x.portrait, x.style].filter(Boolean), aspect_ratio: x.aspect, resolution: '2 MP', output_format: 'png', safety_tolerance: 2, seed: x.seed }) },
  // the style LoRA (tools/train-lora.mjs): text to image, no source portrait — a NEW character (--new) or a fresh take on one
  // the trained model itself is run (its version from assets/data/lora.json): the generic flux-dev-lora runner fetches
  // a model's weights from replicate.com/<model>/_weights, which a PRIVATE model refuses (0.00235)
  lora: { model: 'black-forest-labs/flux-dev-lora', priceUsd: 0.03, weights: 'pjarvilehto/crimson-moon-style', trigger: 'CRMSNMOON', set: 'chars' },
};
/** The LoRA's prompt: the trigger, the sheet framing (as the training captions had it), the facing, the character line. */
/** The character captions' preamble, shared by the training (train-lora.mjs) and the LoRA prompt. */
export const CHAR_CAPTION = 'a photoreal dark-fantasy character render on a plain flat mid-grey background, full body, three-quarter view';
/** The latest succeeded training's version for a LoRA set ('chars' / 'rooms') from assets/data/lora.json, or null. */
export function loraVersion(set = 'chars', root = ROOT) {
  const f = join(root, 'assets', 'data', 'lora.json');
  if (!existsSync(f)) return null;
  const t = JSON.parse(readFileSync(f, 'utf8')).trainings.filter((x) => (x.set_name ?? 'chars') === set && x.status === 'succeeded' && x.version).pop();
  return t ? t.version.split(':').pop() : null;
}
export function loraPrompt(c, hint = '') {
  // the same words the training captions carry (tools/train-lora.mjs CHAR_CAPTION): a LoRA answers best to the caption it learned under (0.00235)
  return `${MODELS.lora.trigger} style, ${CHAR_CAPTION}, ${facing(c.id)}: ${c.line.replace(/^CHARACTER:\s*/, '')}${hint ? ` ${hint.trim()}` : ''}`;
}
/** A character not in the doc (--new mimic --line "CHARACTER: ..."): no current portrait, so its cut-out goes on a default canvas. */
export const NEW_CANVAS = { w: 600, h: 1050, box: { x0: 30, y0: 30, x1: 570, y1: 1020 } };
export const DEFAULTS = { n: 4, style: 'dungeon_ossuary.jpg', model: 'pro', aspect: '2:3', tolerance: 30, concurrency: 3 };
// --from-sheet <id>: a character drawn without its old art (the gargoyle's is no
// reference) — the one-picture Kontext gets a style sheet and replaces its figure.
export const FROM_SHEET = { model: 'black-forest-labs/flux-kontext-pro', priceUsd: 0.04 };
export function fromSheetPrompt(doc, c, hint = '') {
  const style = doc.style.replace('[FACING]', facing(c.id)).split('\n\n').slice(1).join('\n\n'); // the block without its "image 1 / image 2" opening
  return `Replace the character in this picture with a different one, drawn in exactly the same style, on the same plain flat grey background: ${c.line.replace(/^CHARACTER:\s*/, '')}\n\n${style}${hint ? `\n\n${hint.trim()}` : ''}`;
}
// The style reference for a character, when nothing is asked (--style, a
// re-roll's style): its own finished sheet in the target style if the owner
// put one in assets/style/<id>.png (0.191: seven of them — a sheet steers
// Kontext far better than a room painting: flat grey, no shadow), else the
// painting in DEFAULTS.style.
export const STYLE_DIR = 'assets/style';
// The style reference (image 2) since the painterly direction (0.00201): the
// character's OWN original by default (--refs own) — its rendering is the
// destination, and another character's picture bleeds its design in (the
// Cinderborn grew the Blood Knight's armour from a "family" reference);
// --refs family = the best original of the colour family (for --from-sheet,
// where the character has no usable original); --refs sheets = the owner's
// inked sheets (a detour that cost the glows).
export const STYLE_REF = {
  fire: { ref: 'blood_knight.webp', ids: ['ghoul', 'hollow_hound', 'crypt_spider', 'blood_knight', 'golem', 'cultist'] },
  cold: { ref: 'skeleton.webp', ids: ['skeleton', 'wraith', 'bat', 'gargoyle'] },
};
export function originalRef(id) {
  for (const f of Object.values(STYLE_REF)) if (f.ids.includes(id)) return f.ref;
  return null; // the character's own current portrait
}
// The boss's canvas is wide (0.196: its card is twice as wide): the figure is not capped by the old canvas width.
export const WIDE = { vampire_lord: 1100 };
// A character without a sheet borrows the nearest one (a hooded skull for the
// Vampire Lord, a beast for the beasts, armour for the brutes, bone for the stone).
export const STYLE_NEAREST = { vampire_lord: 'wraith', crypt_spider: 'rat', hollow_hound: 'rat', golem: 'blood_knight', gargoyle: 'skeleton' }; // (not the Shrieker: the rat's sheet made it a rodent, 0.192; the painting keeps its identity)
export const styleFor = (id, root = ROOT, refs = 'own') => {
  if (refs === 'own') return null; // the character's own portrait
  if (refs === 'family') { const r = originalRef(id); return r ? `assets/chars/${r}` : null; }
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

/** The doc: { style, chars: [{ id, name, file, line }] } (the style block's [FACING] is filled per character). The File column is the character's current portrait as the data names it (enemies.json art / cards.json player.art), which gives the id (0.193: the Shrieker's file is cave_shrieker.webp, its id stays bat). */
export function parsePrompts(md, ids = idsByFile()) {
  const block = md.match(/## Style block[\s\S]*?```\n([\s\S]*?)```/);
  if (!block) throw new Error('docs/portrait-prompts.md: no style block');
  const chars = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*`([a-z_]+\.webp)`\s*\|\s*`(CHARACTER:[^`]+)`\s*\|\s*$/);
    if (!m) continue;
    const id = ids[m[2]];
    if (!id) throw new Error(`docs/portrait-prompts.md: ${m[2]} is no character's portrait in the data`);
    chars.push({ name: m[1].replace(/\s*\(boss\)$/, ''), id, file: m[2], line: m[3].trim() });
  }
  if (!chars.length) throw new Error('docs/portrait-prompts.md: no character lines');
  return { style: block[1].trim(), chars };
}
/** portrait file -> character id, from the data (enemies.json art, cards.json player.art). */
export function idsByFile(root = ROOT) {
  const enemies = JSON.parse(readFileSync(join(root, 'assets/data/enemies.json'), 'utf8')), cards = JSON.parse(readFileSync(join(root, 'assets/data/cards.json'), 'utf8'));
  return { [cards.player.art]: 'player', ...Object.fromEntries(Object.entries(enemies).map(([id, e]) => [e.art, id])) };
}
export const facing = (id) => (id === 'player' ? 'facing right' : 'facing left');
// A boss's composition replaces the shared paragraph (which asks for feet; the first instruction wins):
// close and wide, as the original Vampire Lord that "feels big" is.
export const BOSS_COMPOSITION = 'COMPOSITION: one character only, a wide picture: the figure from the waist up fills the height of the frame, looming over the viewer, the weapon sweeping across the full width and out of the frame. Three-quarter view, [FACING]. Plain flat mid-grey background (#8a8a8a), completely empty: no floor, no scenery, no frame, no text, no watermark, and no glow or bloom spilling beyond the figure\'s silhouette.';
export const isBoss = (id) => id in WIDE;
/** The prompt sent for a character: the style block (facing filled in; a boss's own composition), its line, the facing once more (Kontext mirrors a figure readily; the lab's Flip catches the rest), a re-roll hint. */
export function promptFor(doc, c, hint = '') {
  const side = facing(c.id).split(' ')[1];
  const style = isBoss(c.id) ? doc.style.replace(/COMPOSITION:[\s\S]*?(?=\n\n[A-Z]+:)/, BOSS_COMPOSITION) : doc.style;
  return `${style.replace(/\[FACING\]/g, facing(c.id))}\n\n${c.line}\nFACING: the figure faces ${side}, its head and eyes turned toward the ${side} edge of the picture.${hint ? `\n\n${hint.trim()}` : ''}`;
}

/** A stable seed per candidate; a re-roll gets a fresh one. */
function seedFor(id, n) {
  let h = 2166136261;
  for (const ch of `${id}/${n}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % 2147483647;
}

// ---- Replicate ----
// The inputs go inline as data URIs by default (--inputs data): the model's
// own fetch of a picture uploaded to the Files API timed out on a third of
// the pilot's tries. Kontext works at ~1MP, so the painting goes as a
// 1024-wide JPEG and a portrait over 1024px tall is scaled down; both stay
// well under the data URI limit. --inputs files uploads them instead.
async function inline(path) {
  const S = await sharp();
  const img = S(path), meta = await img.metadata();
  // a portrait with alpha goes flattened onto the mid-grey the prompt asks for (the model then sees the flat background it is to paint)
  const buf = path.endsWith('.jpg') ? await img.resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    : meta.hasAlpha ? await img.flatten({ background: '#8a8a8a' }).resize({ height: 1024, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer()
    : meta.height > 1024 || !path.endsWith('.webp') ? await img.resize({ height: 1024, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toBuffer() : readFileSync(path);
  return `data:${path.endsWith('.jpg') ? 'image/jpeg' : 'image/webp'};base64,${buf.toString('base64')}`;
}

// ---- pictures (sharp, loaded only when a picture is touched) ----
const sharp = async () => (await import('sharp')).default;
// The matte (0.00201): a matting model cuts the figure out — the colour key
// (tools/cutout.mjs) ate grey-blue stone legs, glossy blade edges and glow
// halos once the figures turned photoreal (no outlines, greys near the
// background's tone). 851-labs/background-remover keeps them all, ~1 s and a
// fraction of a cent a picture. --matte key = the colour key (offline).
export const MATTE = { model: '851-labs/background-remover', priceUsd: 0.001 };
const versions = {};
async function matteAlpha(rawPath) {
  const S = await sharp();
  versions[MATTE.model] ??= await latestVersion(MATTE.model);
  const image = `data:image/jpeg;base64,${(await S(rawPath).jpeg({ quality: 92 }).toBuffer()).toString('base64')}`;
  const png = (await predictVersion(versions[MATTE.model], { image, format: 'png', threshold: 0 })).bytes;
  const { data, info } = await S(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}
/** The current portrait's canvas and figure box: { w, h, box }. */
export async function portraitFrame(file) {
  const S = await sharp();
  const { data, info } = await S(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  for (let p = 0; p < alpha.length; p++) alpha[p] = data[p * 4 + 3];
  return { w: info.width, h: info.height, box: bbox(alpha, info.width, info.height) };
}
/** rawPath -> cutPath: keyed out, trimmed, scaled onto the reference portrait's canvas. Returns the cut record. */
export async function cutAndFit(rawPath, refPath, cutPath, { matte = 'api', tolerance = DEFAULTS.tolerance, shadow = SHADOW.tolerance, paper = true, holes = true, flip = false, wide = 0 } = {}) {
  const S = await sharp();
  let data, info, bg = null, filled = 0, stray = 0, box;
  if (matte === 'api') { // the matting model's alpha (the figure's own edges, glows included)
    ({ data, info } = await matteAlpha(rawPath));
    const alpha = new Uint8Array(info.width * info.height);
    for (let p = 0; p < alpha.length; p++) alpha[p] = data[p * 4 + 3];
    stray = dropStray(alpha, info.width, info.height);
    box = applyAlpha(data, alpha, info.width, info.height);
  } else { // the colour key
    ({ data, info } = await S(rawPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
    const keyed = keyOut(data, info.width, info.height, { tolerance, paper: paper ? PAPER : null, shadow: shadow > 0 ? { ...SHADOW, tolerance: shadow } : null });
    bg = keyed.bg;
    filled = holes ? fillHoles(data, keyed.alpha, info.width, info.height, bg) : 0;
    stray = dropStray(keyed.alpha, info.width, info.height);
    box = applyAlpha(data, keyed.alpha, info.width, info.height);
  }
  if (!box) throw new Error(`${rawPath}: nothing left after the key (tolerance ${tolerance})`);
  const old = refPath ? await portraitFrame(refPath) : NEW_CANVAS;
  if (wide > old.w) { old.w = wide; old.box = { ...(old.box ?? { y0: 0, y1: old.h }), x0: 0, x1: wide }; } // the boss: a wide canvas, the figure centred on it
  const at = placeOn(box, old);
  let fig = S(Buffer.from(data.buffer, data.byteOffset, data.length), { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 }).resize(at.w, at.h);
  if (flip) fig = fig.flop();
  const figBuf = await fig.png().toBuffer();
  await S({ create: { width: old.w, height: old.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: figBuf, left: at.left, top: at.top }]).webp({ quality: 90, alphaQuality: 100 }).toFile(cutPath);
  return { matte: matte === 'api' ? MATTE.model : 'key', tolerance, shadow, paper, holes, bg, box, filled, stray, flip, canvas: [old.w, old.h], figure: [at.w, at.h] };
}

// ---- the registry ----
export const candidateFile = (id, n) => `${id}_c${n}`;
function loadRegistry() { return existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : { chars: {} }; }
function saveRegistry(reg) {
  reg._doc = 'Generated by tools/gen-art.mjs from docs/portrait-prompts.md: the portraits redrawn in the room paintings\' style (FLUX Kontext on Replicate). chars: per character its reference portrait (the doc\'s file) and candidates: file = the cut-out (RGBA, on the reference portrait\'s canvas), raw = the model\'s picture, model / version / seed / style / prompt as sent, cut = how it was keyed out, verdict = the Art Lab\'s (labs/art/) approve ("ok") or reject ("no") with its note, flip = mirrored on import, imported = the game file it became. The game reads the portraits from enemies.json art / cards.json player.art, never from here.';
  reg.generated = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  writeFileSync(REGISTRY, JSON.stringify({ _doc: reg._doc, generated: reg.generated, chars: reg.chars }, null, 2) + '\n');
}
function charEntry(reg, c) { const e = (reg.chars[c.id] ??= { name: c.name, file: c.file, candidates: [] }); if (c.isNew) { e.line = c.line; e.isNew = true; } return e; }
function nextN(entry) { return entry.candidates.reduce((m, k) => Math.max(m, k.n), 0) + 1; }

// ---- main ----
async function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
  const doc = parsePrompts(readFileSync(DOC, 'utf8'));
  const reg = loadRegistry();
  if (val('--new')) { // a character the game does not have yet: its line from the command line (or the registry, from an earlier run)
    const id = val('--new'), was = reg.chars[id];
    if (!/^[a-z_]+$/.test(id)) throw new Error('--new: an id of lowercase letters and underscores');
    const text = val('--line') ?? was?.line;
    if (!text) throw new Error(`--new ${id}: --line "CHARACTER: ..." (none recorded yet)`);
    doc.chars.push({ id, name: val('--name') ?? was?.name ?? id, file: null, line: text.startsWith('CHARACTER:') ? text : `CHARACTER: ${text}`, isNew: true });
  }
  const only = val('--only') ? val('--only').split(',') : val('--new') ? [val('--new')] : null;
  const chars = doc.chars.filter((c) => !only || only.includes(c.id));
  if (only && chars.length !== only.length) throw new Error(`unknown character in --only (known: ${doc.chars.map((c) => c.id).join(', ')})`);
  const model = MODELS[val('--model', DEFAULTS.model)];
  const refs = val('--refs', 'own');
  if (!['own', 'family', 'sheets'].includes(refs)) throw new Error('--refs own | family | sheets');
  if (!model) throw new Error(`--model ${Object.keys(MODELS).join(' | ')}`);
  const tolerance = Number(val('--tolerance', DEFAULTS.tolerance)), shadow = Number(val('--shadow', SHADOW.tolerance)), paper = val('--paper', '1') !== '0', holes = val('--holes', '1') !== '0';
  const matte = val('--matte', 'api');
  if (!['api', 'key'].includes(matte)) throw new Error('--matte api | key');
  const cutOpts = { matte, tolerance, shadow, paper, holes };
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

  if (has('--prune')) { // the approved candidate stays, the character's others go (a character without one keeps all);
    // with --keep-models: only those models' candidates stay (verdicts cleared with --clear-verdicts)
    const keepModels = val('--keep-models') ? val('--keep-models').split(',').map((k) => { if (!MODELS[k]) throw new Error(`--keep-models: no model ${k}`); return MODELS[k].model; }) : null;
    let gone = 0, kept = 0;
    for (const c of chars) {
      const e = charEntry(reg, c);
      if (!keepModels && !e.candidates.some((k) => k.verdict === 'ok')) continue;
      const stays = (k) => (keepModels ? keepModels.includes(k.model) : k.verdict === 'ok');
      for (const k of e.candidates) {
        if (stays(k)) { kept++; if (has('--clear-verdicts')) { delete k.verdict; delete k.note; delete k.flip; } continue; }
        for (const f of [k.file, k.raw]) if (existsSync(join(ROOT, f))) unlinkSync(join(ROOT, f));
        gone++;
      }
      e.candidates = e.candidates.filter(stays);
      console.log(`  ${c.id}: kept ${e.candidates.length ? `c${e.candidates.map((k) => k.n).join(', c')}` : 'none'}`);
    }
    saveRegistry(reg); console.log(`${gone} candidates pruned, ${kept} kept`); return;
  }

  if (has('--recut')) { // the same picture(s), another key ("all" = every candidate of the --only characters)
    const [, id, n] = val('--recut').match(/^([a-z_]+)_c(\d+)$/) ?? [];
    const c = doc.chars.find((x) => x.id === id), one = c && charEntry(reg, c).candidates.find((x) => x.n === Number(n));
    if (!one && val('--recut') !== 'all') throw new Error(`--recut: no candidate ${val('--recut')} (or "all")`);
    const list = one ? [[c, one]] : chars.flatMap((ch) => charEntry(reg, ch).candidates.map((k) => [ch, k]));
    let i = 0, failed = 0;
    const worker = async () => { while (i < list.length) { const [ch, k] = list[i++]; try { k.cut = await cutAndFit(join(ROOT, k.raw), ch.file ? join(CHARS, ch.file) : null, join(ROOT, k.file), { ...cutOpts, flip: has('--flip'), wide: WIDE[ch.id] ?? 0 }); console.log(`  recut ${k.file}: figure ${k.cut.figure.join('x')}, ${k.cut.stray} stray`); } catch (e) { failed++; console.error(`  FAIL ${k.file}: ${e.message}`); } } };
    await Promise.all(Array.from({ length: matte === 'api' ? 4 : 1 }, worker));
    saveRegistry(reg); console.log(`${list.length - failed} recut${failed ? `, ${failed} FAILED` : ''}`); if (failed) process.exit(1); return;
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
      if (c.id === 'player') cards.player.art = file;
      else if (enemies[c.id]) enemies[c.id].art = file;
      else console.log(`  (${c.id} is not in enemies.json yet: add the enemy with "art": "${file}" when it joins the game)`);
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
      const basedOn = r.basedOn ? e.candidates.find((k) => k.n === r.basedOn) ?? (() => { throw new Error(`basedOn: no candidate ${r.id}_c${r.basedOn}`); })() : null;
      const useModel = r.model ? MODELS[r.model] ?? (() => { throw new Error(`reroll: no model ${r.model}`); })() : model;
      for (let i = 0; i < (r.n ?? DEFAULTS.n); i++) jobs.push({ c, n: n0 + i, model: useModel, basedOn, style: r.style || val('--style', styleFor(c.id, ROOT, refs) ?? (c.file ? `assets/chars/${c.file}` : DEFAULTS.style)), hint: r.hint ?? '', seed: (Date.now() + i * 7919) % 2147483647 });
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
    for (const c of chars) { const n0 = nextN(charEntry(reg, c)); for (let i = 0; i < n; i++) jobs.push({ c, n: n0 + i, style: val('--style', styleFor(c.id, ROOT, refs) ?? (c.file ? `assets/chars/${c.file}` : DEFAULTS.style)), hint: val('--hint', ''), seed: seedFor(c.id, n0 + i) }); }
  }
  for (const j of jobs) {
    j.model ??= model;
    if (j.from) { j.prompt = CLEAN.prompt; j.style = j.from.style; continue; }
    if (j.model === MODELS.lora) { j.style = MODELS.lora.weights; j.prompt = loraPrompt(j.c, j.hint); continue; } // text to image: no pictures go in
    if (val('--from-sheet')) {
      const base = doc.chars.find((x) => x.id === val('--from-sheet'));
      j.style = refs === 'sheets' || !base?.file ? `${STYLE_DIR}/${val('--from-sheet')}.png` : `assets/chars/${base.file}`;
      j.sheet = join(ROOT, j.style);
      if (!existsSync(j.sheet)) throw new Error(`--from-sheet: no ${j.style}`);
      j.prompt = fromSheetPrompt(doc, j.c, j.hint); continue;
    }
    if (j.basedOn) { // the candidate is the design (image 1), the current portrait the rendering reference (image 2), the note the direction
      j.portraitPath = join(ROOT, j.basedOn.raw);
      j.stylePath = j.c.file ? join(CHARS, j.c.file) : join(ROOT, j.basedOn.raw);
      j.style = j.c.file ? `assets/chars/${j.c.file}` : j.basedOn.raw;
      j.prompt = promptFor(doc, j.c, j.hint ? `DIRECTION for this redraw: ${j.hint}` : ''); continue;
    }
    if (j.c.isNew) throw new Error(`--new ${j.c.id} has no portrait to redraw: use --model lora`);
    j.stylePath = existsSync(join(ROOT, 'assets/bg', j.style)) ? join(ROOT, 'assets/bg', j.style) : existsSync(join(ROOT, j.style)) ? join(ROOT, j.style) : null;
    if (!j.stylePath) throw new Error(`no such style picture: assets/bg/${j.style} or ${j.style}`);
    j.prompt = promptFor(doc, j.c, j.hint);
  }
  const modelOf = (j) => (j.from ? CLEAN : j.sheet && !j.model.list ? FROM_SHEET : j.model);
  const cost = jobs.reduce((s, j) => s + modelOf(j).priceUsd, 0);
  console.log(`${jobs.length} candidate${jobs.length === 1 ? '' : 's'} to generate with ${[...new Set(jobs.map((j) => modelOf(j).model))].join(' + ')} (about $${cost.toFixed(2)}, from memory)`);
  for (const j of jobs) console.log(`  ${candidateFile(j.c.id, j.n)}  ${j.from ? `clean of c${j.from.n}` : j.sheet ? `from the sheet ${j.style}` : j.basedOn ? `based on c${j.basedOn.n}, style ${j.style}` : `style ${j.style}`}${j.model !== model ? `  ${j.model.model}` : ''}  seed ${j.seed}${j.hint ? `  hint "${j.hint}"` : ''}`);
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
        const use = modelOf(j).model;
        const input = j.from
          ? { prompt: j.prompt, input_image: await uploaded(join(ROOT, j.from.raw)), aspect_ratio: 'match_input_image', output_format: 'png', safety_tolerance: 2, seed: j.seed }
          : j.sheet
            ? (j.model.list ? j.model.build({ prompt: j.prompt, portrait: await uploaded(j.sheet), style: null, aspect: DEFAULTS.aspect, seed: j.seed })
              : { prompt: j.prompt, input_image: await uploaded(j.sheet), aspect_ratio: DEFAULTS.aspect, output_format: 'png', safety_tolerance: 2, seed: j.seed })
          : j.model === MODELS.lora
            ? { prompt: j.prompt, aspect_ratio: DEFAULTS.aspect, output_format: 'png', num_inference_steps: 28, guidance: 3, megapixels: '1', seed: j.seed }
            : j.model.build({ prompt: j.model.list ? j.prompt.replace(/\bimage 1\b/g, 'the first image').replace(/\bimage 2\b/g, 'the second image') : j.prompt,
              portrait: await uploaded(j.portraitPath ?? join(CHARS, j.c.file)), style: await uploaded(j.stylePath), aspect: WIDE[j.c.id] ? '4:3' : DEFAULTS.aspect, seed: j.seed });
        // the model's own fetch of a just-uploaded picture times out now and then (the pilot: 3 of 13 first tries): one more go
        const run = () => (j.model === MODELS.lora ? predictVersion(loraVersion(MODELS.lora.set) ?? (() => { throw new Error('no trained LoRA in lora.json: node tools/train-lora.mjs'); })(), input) : predict(use, input));
        const out = await run().catch(async (e) => { if (!/timed out/i.test(e.message)) throw e; console.log(`  retry ${name}: ${e.message}`); await new Promise((r) => setTimeout(r, 4000)); return run(); });
        const rawPath = join(OUT, `${name}_raw.jpg`), cutPath = join(OUT, `${name}.webp`);
        await (await sharp())(out.bytes).jpeg({ quality: 92 }).toFile(rawPath);
        const cut = await cutAndFit(rawPath, j.c.file ? join(CHARS, j.c.file) : null, cutPath, { ...cutOpts, wide: WIDE[j.c.id] ?? 0 });
        const entry = charEntry(reg, j.c);
        entry.candidates.push({ n: j.n, file: `${WEB}/${name}.webp`, raw: `${WEB}/${name}_raw.jpg`, model: use, version: out.version, seed: j.seed, style: j.style, hint: j.hint || undefined, from: j.from?.n, basedOn: j.basedOn?.n, prompt: j.prompt, created: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), cut });
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

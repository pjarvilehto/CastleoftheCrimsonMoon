#!/usr/bin/env node
// Paint the gear's pictures on Replicate (0.00259). The prompts live in
// docs/item-prompts.md (the style block + one line per item); every
// candidate is kept (assets/items/candidates/<id>_c<n>.webp, 512 px, never
// overwritten — lab-only, no player fetches it) and recorded in
// assets/data/items-art.json with its model and line; --import makes the
// picture the game loads.
//
//   node tools/gen-items.mjs --dry-run                     # what would be sent
//   node tools/gen-items.mjs                               # every item that has no candidate yet
//   node tools/gen-items.mjs --only moonbrand,crimson_plate [--n 2] [--hint "brighter runes"] [--model banana]
//   node tools/gen-items.mjs --add moonbrand=pic.png       # a picture painted elsewhere, recorded as a candidate
//   node tools/gen-items.mjs --import [moonbrand|moonbrand_c2 ...]
//                                                          # the item's latest candidate (or that one) as the
//                                                          # 256 px WebP the game loads (assets/items/<id>_v<k>.webp,
//                                                          # a new name each time — rule 7) and items.json `art`;
//                                                          # no names = every item whose art is not its latest candidate
//   node tools/gen-items.mjs --sheet out.png [--only ids]  # a contact sheet of the latest candidates (needs Playwright)
//
// Nano Banana Pro is the default (docs/item-prompts.md says why). Prices
// from memory, the API has none. Run with NODE_USE_ENV_PROXY=1 behind a proxy.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { token, predict } from './replicate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'item-prompts.md');
const OUT = join(ROOT, 'assets', 'items', 'candidates');
const REGISTRY = join(ROOT, 'assets', 'data', 'items-art.json');
const ITEMS = join(ROOT, 'assets', 'data', 'items.json');
const GAME_PX = 256, CANDIDATE_PX = 512;

export const MODELS = {
  bananapro: { model: 'google/nano-banana-pro', priceUsd: 0.15, build: (prompt) => ({ prompt, aspect_ratio: '1:1', resolution: '1K', output_format: 'png', safety_filter_level: 'block_only_high' }) },
  banana: { model: 'google/nano-banana', priceUsd: 0.04, build: (prompt) => ({ prompt, aspect_ratio: '1:1', output_format: 'png' }) },
  seedream: { model: 'bytedance/seedream-4', priceUsd: 0.03, build: (prompt) => ({ prompt, aspect_ratio: '1:1', size: '1K', enhance_prompt: false, sequential_image_generation: 'disabled' }) },
};
export const DEFAULTS = { model: 'bananapro', n: 1, concurrency: 4 };

/** The doc: the style block and the item lines. */
export function readDoc(text = readFileSync(DOC, 'utf8')) {
  const style = text.match(/```style\n([\s\S]*?)\n```/)?.[1].trim();
  const lines = Object.fromEntries([...text.matchAll(/^\| (\w+) \| (.+?) \|$/gm)].filter((m) => m[1] !== 'id').map((m) => [m[1], m[2]]));
  return { style, lines };
}
export const promptOf = (style, line, hint) => `${style}\n\nThe object: ${line}${hint ? `\nDirection: ${hint}` : ''}`;

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const loadReg = () => (existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : { items: {} });
const saveReg = (r) => writeFileSync(REGISTRY, `${JSON.stringify(r, null, 2)}\n`);
const sharp = () => createRequire(import.meta.url)('sharp');
const latest = (reg, id) => (reg.items[id] ?? []).at(-1);

async function keep(reg, id, bytes, rec) {
  mkdirSync(OUT, { recursive: true });
  const n = (reg.items[id] ?? []).reduce((m, c) => Math.max(m, c.n), 0) + 1;
  const file = `${id}_c${n}.webp`;
  await sharp()(bytes).resize(CANDIDATE_PX, CANDIDATE_PX).webp({ quality: 86 }).toFile(join(OUT, file));
  (reg.items[id] ??= []).push({ n, file, ...rec, at: new Date().toISOString().slice(0, 19) + 'Z' });
  saveReg(reg);
  return file;
}

/** items.json gains (or changes) one `"art"` line in the item's block — the file's own layout stays. */
export function setArt(text, id, file) {
  const start = text.indexOf(`\n  "${id}": {`);
  if (start < 0) throw new Error(`items.json has no ${id}`);
  const end = text.indexOf('\n  }', start);
  const block = text.slice(start, end);
  const next = /\n {4}"art": "[^"]*"/.test(block)
    ? block.replace(/\n {4}"art": "[^"]*"/, `\n    "art": "${file}"`)
    : block.replace(/(\n {4}"tier": \d+)(,?)/, (m, a, comma) => `${a},\n    "art": "${file}"${comma}`);
  return text.slice(0, start) + next + text.slice(end);
}

async function paint() {
  const { style, lines } = readDoc();
  const reg = loadReg();
  const model = MODELS[arg('--model', DEFAULTS.model)];
  if (!model) throw new Error(`--model: one of ${Object.keys(MODELS).join(', ')}`);
  const only = arg('--only', null)?.split(',');
  const ids = only ?? Object.keys(lines).filter((id) => !reg.items[id]?.length);
  const missing = ids.filter((id) => !lines[id]);
  if (missing.length) throw new Error(`no line in docs/item-prompts.md for ${missing.join(', ')}`);
  const n = Number(arg('--n', DEFAULTS.n)), hint = arg('--hint', null);
  const jobs = ids.flatMap((id) => Array.from({ length: n }, () => id));
  console.log(`${jobs.length} picture(s) on ${model.model}, ~$${(jobs.length * model.priceUsd).toFixed(2)}`);
  if (flag('--dry-run')) { for (const id of ids) console.log(`\n${id}:\n${promptOf(style, lines[id], hint)}`); return; }
  if (!token()) throw new Error('REPLICATE_API_TOKEN (or REPLICATE_KEY) is not set');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < jobs.length; i += DEFAULTS.concurrency) {
    await Promise.all(jobs.slice(i, i + DEFAULTS.concurrency).map(async (id) => {
      const prompt = promptOf(style, lines[id], hint);
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const { bytes, version } = await predict(model.model, model.build(prompt));
          console.log(id, '->', await keep(reg, id, bytes, { model: model.model, version, line: lines[id], hint: hint ?? undefined }));
          return;
        } catch (e) {
          if (/429/.test(e.message)) { await sleep(16000); continue; } // (the rate limit: ~15 s)
          console.log(id, 'FAILED', e.message.slice(0, 200)); return;
        }
      }
    }));
  }
}

async function addPicture() {
  const reg = loadReg();
  const { lines } = readDoc();
  for (const pair of arg('--add', '').split(',')) {
    const [id, path] = pair.split('=');
    if (!lines[id]) throw new Error(`no line for ${id}`);
    console.log(id, '->', await keep(reg, id, readFileSync(path), { model: arg('--model', 'google/nano-banana-pro'), line: lines[id], note: 'added from a file' }));
  }
}

async function importArt() {
  const reg = loadReg();
  let text = readFileSync(ITEMS, 'utf8');
  const items = JSON.parse(text);
  const names = args.slice(args.indexOf('--import') + 1).filter((a) => !a.startsWith('--'));
  const picks = names.length ? names : Object.keys(items).filter((id) => latest(reg, id) && (!latest(reg, id).imported || latest(reg, id).imported !== items[id].art));
  mkdirSync(join(ROOT, 'assets', 'items'), { recursive: true });
  for (const pick of picks) {
    const m = pick.match(/^(\w+?)(?:_c(\d+))?$/);
    const id = m[1], cand = m[2] ? reg.items[id]?.find((c) => c.n === Number(m[2])) : latest(reg, id);
    if (!items[id] || !cand) throw new Error(`no candidate for ${pick}`);
    let k = 1;
    while (existsSync(join(ROOT, 'assets', 'items', `${id}_v${k}.webp`))) k++; // (rule 7: never replace a file players may have cached)
    const file = `${id}_v${k}.webp`;
    await sharp()(join(OUT, cand.file)).resize(GAME_PX, GAME_PX).webp({ quality: 84 }).toFile(join(ROOT, 'assets', 'items', file));
    text = setArt(text, id, file);
    cand.imported = file;
    console.log(id, '<-', cand.file, '=', `assets/items/${file}`);
  }
  writeFileSync(ITEMS, text);
  saveReg(reg);
}

async function sheet() {
  const reg = loadReg();
  const only = arg('--only', null)?.split(',');
  const ids = Object.keys(reg.items).filter((id) => !only || only.includes(id));
  const PW = process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
  const { chromium } = await import(PW);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 400 } });
  const tiles = ids.map((id) => `<figure><img src="data:image/webp;base64,${readFileSync(join(OUT, latest(reg, id).file)).toString('base64')}"><figcaption>${latest(reg, id).file}</figcaption></figure>`).join('');
  await page.setContent(`<style>body{margin:0;padding:12px;background:#120c09;display:flex;flex-wrap:wrap;gap:10px;font:12px sans-serif;color:#c9b88a}figure{margin:0;text-align:center}img{width:180px;height:180px;display:block}</style>${tiles}`);
  await page.screenshot({ path: arg('--sheet'), fullPage: true });
  await browser.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = flag('--import') ? importArt : flag('--sheet') ? sheet : flag('--add') ? addPicture : paint;
  run().catch((e) => { console.error(e.message); process.exit(1); });
}

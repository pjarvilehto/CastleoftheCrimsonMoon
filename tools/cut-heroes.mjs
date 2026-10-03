#!/usr/bin/env node
// tools/cut-heroes.mjs — the hero figures (0.00248): every sheet in
// assets/style/heroes/ (the developer's, 1024x1536 on flat grey; one per
// look, named <id>_<look>.webp) keyed out of its grey by tools/cutout.mjs
// (the flood fill from the border, paper tones, hole filling; no shadow
// pass — these sheets carry none) into assets/heroes/<id>_<look>.webp,
// trimmed to the figure with a 6 px pad. Prints each look's `fh` (the
// figure's height over the sheet's — heroes.json carries it so the heroes
// read in scale with one another on the screen) as the JSON lines for
// heroes.json. Never overwrites a figure that exists (rule 7: a redrawn
// sheet lands under a new name) unless --force.
//   node tools/cut-heroes.mjs [--only wizard] [--force]
// A new upload: the PNGs to assets/style/heroes/<id>_<look>.webp (q92 —
// node -e with sharp, or this tool's --import <dir>, which converts
// hero_<id>_<look>.png files there), then run this and paste the lines.

import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { keyOut, fillHoles, dropStray, applyAlpha, PAPER } from './cutout.mjs';

const args = process.argv.slice(2);
const arg = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const only = arg('--only'), force = args.includes('--force'), importDir = arg('--import');
const SHEETS = 'assets/style/heroes', OUT = 'assets/heroes';
const sharp = (await import('sharp')).default;
mkdirSync(OUT, { recursive: true });

if (importDir) {
  for (const f of readdirSync(importDir).filter((f) => /^hero_[a-z]+_.+\.png$/.test(f)).sort()) {
    const stem = f.replace(/^hero_/, '').replace(/\.png$/, '');
    const to = `${SHEETS}/${stem}.webp`;
    if (existsSync(to) && !force) { console.log(`${to}: exists, kept`); continue; }
    await sharp(`${importDir}/${f}`).webp({ quality: 92 }).toFile(to);
    console.log(`${f} -> ${to}`);
  }
}

const sheets = readdirSync(SHEETS).filter((f) => /\.(webp|png)$/.test(f) && /_/.test(f) && (!only || f.startsWith(`${only}_`))).sort(byLook);
const lines = {};
for (const f of sheets) {
  const stem = f.replace(/\.(webp|png)$/, ''), id = stem.split('_')[0], to = `${OUT}/${stem}.webp`;
  const src = `${SHEETS}/${f}`;
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { alpha, bg } = keyOut(data, info.width, info.height, { tolerance: 30, paper: PAPER, shadow: null });
  const filled = fillHoles(data, alpha, info.width, info.height, bg);
  const stray = dropStray(alpha, info.width, info.height);
  const box = applyAlpha(data, alpha, info.width, info.height);
  if (!box) { console.error(`${f}: nothing left after the key`); continue; }
  const pad = 6, x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad), x1 = Math.min(info.width, box.x1 + pad), y1 = Math.min(info.height, box.y1 + pad);
  const fh = +((y1 - y0) / info.height).toFixed(3);
  if (existsSync(to) && !force) console.log(`${to}: exists, kept (--force to redo)`);
  else {
    await sharp(Buffer.from(data.buffer, data.byteOffset, data.length), { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).webp({ quality: 90, alphaQuality: 100 }).toFile(to);
    console.log(`${f} -> ${to}  box ${[x0, y0, x1, y1].join(',')}  bg ${bg.join(',')}  holes ${filled}  stray ${stray}`);
  }
  (lines[id] ??= []).push({ art: `${stem}.webp`, fh });
}
console.log('\nheroes.json looks:');
for (const [id, looks] of Object.entries(lines)) console.log(`  ${id}: ${JSON.stringify(looks)}`);

// v1..vN before alt_v1..alt_vN, numbers in order
function byLook(a, b) {
  const k = (f) => { const m = f.match(/_(alt_)?v(\d+)/); return [f.split('_')[0], m?.[1] ? 1 : 0, Number(m?.[2] ?? 0)]; };
  const [ia, aa, na] = k(a), [ib, ab, nb] = k(b);
  return ia.localeCompare(ib) || aa - ab || na - nb;
}

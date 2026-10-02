// tools/test/art.test.mjs — the redrawn portraits (0.184): the prompts doc,
// tools/gen-art.mjs (parsing, the prompt per character), the cut-out
// (tools/cutout.mjs on a synthetic picture), the portrait paths as data
// (shared/portraits.js) and the Art Lab (labs/art/).
// Run via tools/smoke-test.mjs.

import { ok, fresh, DATA, readFileSync } from './harness.mjs';
import { existsSync } from 'node:fs';

fresh();

// The doc and the generator: 13 characters, every one a portrait on disk, the facing rule
{
  const { parsePrompts, promptFor, facing, MODELS, DEFAULTS, CLEAN, candidateFile, styleFor } = await import('../gen-art.mjs');
  ok('the style reference: the character\'s own sheet in assets/style/, else the nearest character\'s, else the ossuary', styleFor('rat') === 'assets/style/rat.png' && existsSync('assets/style/rat.png') && styleFor('vampire_lord') === 'assets/style/wraith.png' && styleFor('gargoyle') === 'assets/style/skeleton.png' && styleFor('bat') === DEFAULTS.style && styleFor('nobody') === DEFAULTS.style
    && ['player', 'rat', 'cultist', 'ghoul', 'wraith', 'skeleton', 'blood_knight'].every((id) => existsSync(`assets/style/${id}.png`)));
  const doc = parsePrompts(readFileSync('docs/portrait-prompts.md', 'utf8'));
  const ids = ['player', ...Object.keys(DATA.enemies)].sort();
  ok('the prompts doc has a line for the knight and every enemy, each with its portrait on disk, the id from the data (the Shrieker\'s file is cave_shrieker.webp)',
    doc.chars.map((c) => c.id).sort().join() === ids.join() && doc.chars.every((c) => existsSync(`assets/chars/${c.file}`) && c.line.startsWith('CHARACTER:')) && doc.chars.find((c) => c.id === 'bat').file === 'cave_shrieker.webp', doc.chars.map((c) => c.id).join());
  ok('the style block fills in the facing: enemies face left, the knight right', doc.style.includes('[FACING]')
    && promptFor(doc, doc.chars.find((c) => c.id === 'rat')).includes('Three-quarter view, facing left.') && promptFor(doc, doc.chars.find((c) => c.id === 'player')).includes('Three-quarter view, facing right.')
    && facing('vampire_lord') === 'facing left');
  const p = promptFor(doc, doc.chars.find((c) => c.id === 'rat'), 'simple big shapes');
  ok('a prompt = the style block, the character line, the facing once more, then a re-roll hint', p.startsWith('Redraw the character from image 1') && p.includes('\n\nCHARACTER: a huge hunched black sewer rat') && p.includes('\nFACING: the figure faces left,') && p.endsWith('\n\nsimple big shapes') && !p.includes('[FACING]'));
  ok('the clean pass: the one-picture Kontext paints the ground shadow, panel and signature out and keeps the figure', CLEAN.model === 'black-forest-labs/flux-kontext-pro' && /ground shadow/.test(CLEAN.prompt) && /Keep the character exactly as it is/.test(CLEAN.prompt)
    && readFileSync('tools/gen-art.mjs', 'utf8').includes("input_image: await uploaded(join(ROOT, j.from.raw)), aspect_ratio: 'match_input_image'"));
  ok('the models take two pictures (the portrait and the painting); candidates are numbered, never overwritten',
    MODELS.pro.model === 'flux-kontext-apps/multi-image-kontext-pro' && MODELS.max.model.endsWith('-max') && DEFAULTS.n === 4 && DEFAULTS.aspect === '2:3' && candidateFile('rat', 3) === 'rat_c3'
    && readFileSync('tools/gen-art.mjs', 'utf8').includes("input_image_1: await uploaded(join(CHARS, j.c.file)), input_image_2: await uploaded(j.stylePath)") && readFileSync('tools/gen-art.mjs', 'utf8').includes('while (existsSync(join(CHARS, `${c.id}_v${v}.webp`))) v++'));
}

// The cut-out: the background keyed from the border, grey INSIDE the figure kept (off the paper's tone), a lighter paper panel gone (the hole between the legs is of that tone), a dark shadow bar
// kept (it is as dark as the figure: the clean pass is for that), the enclosed hole of paper between the legs cleared, a stray
// mark in the bottom band dropped, the figure's box, the placement on the old canvas
{
  const { sampleBackground, keyOut, applyAlpha, bbox, placeOn, fillHoles, dropStray } = await import('../cutout.mjs');
  const w = 60, h = 80, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const body = x >= 20 && x < 40 && y >= 10 && y < 60, legs = y >= 60 && y < 70 && ((x >= 20 && x < 26) || (x >= 34 && x < 40)), shadowBar = y >= 70 && y < 73 && x >= 18 && x < 42;
      const patch = x >= 25 && x < 35 && y >= 30 && y < 40, panel = x >= 8 && x < 52 && y >= 4 && y < 76, mark = y >= 76 && y < 79 && x >= 50 && x < 55;
      const c = patch ? [150, 150, 150] : body || legs || mark ? [40, 30, 20] : shadowBar ? [70, 60, 45] : panel ? [222, 220, 216] : [198 + (x % 3), 201, 202];
      d.set([...c, 255], i);
    }
  }
  const bg = sampleBackground(d, w, h);
  const { alpha } = keyOut(d, w, h, { tolerance: 30 });
  ok('cut-out: the background colour is sampled from the border', Math.abs(bg[0] - 199) <= 1 && bg[1] === 201 && bg[2] === 202, bg.join());
  ok('cut-out: the figure stays, the grey patch inside it and the dark shadow bar too; the border and the lighter panel go',
    alpha[35 * w + 30] === 255 && alpha[65 * w + 22] === 255 && alpha[71 * w + 30] === 255 && alpha[2 * w + 2] === 0 && alpha[20 * w + 10] === 0 && alpha[74 * w + 30] === 0);
  const enclosed = alpha[65 * w + 30] === 255, holes = fillHoles(d, alpha, w, h, bg), strayBefore = alpha[77 * w + 52] === 255, stray = dropStray(alpha, w, h);
  ok('cut-out: the paper between the legs is enclosed until fillHoles clears it; the mark in the bottom corner is a stray',
    enclosed && holes === 1 && alpha[65 * w + 30] === 0 && alpha[35 * w + 30] === 255 && strayBefore && stray === 1 && alpha[77 * w + 52] === 0, `${enclosed} ${holes} ${strayBefore} ${stray}`);
  const box = applyAlpha(d, alpha, w, h);
  ok('cut-out: the figure\'s box is tight (the shadow bar under the feet included)', JSON.stringify(box) === JSON.stringify({ x0: 18, y0: 10, x1: 42, y1: 73 }) && bbox(new Uint8Array(w * h), w, h) === null && d[(2 * w + 2) * 4 + 3] === 0, JSON.stringify(box));
  const at = placeOn({ x0: 20, y0: 10, x1: 40, y1: 70 }, { w: 100, h: 200, box: { x0: 20, y0: 40, x1: 80, y1: 180 } });
  ok('placement: scaled to the old figure\'s height, feet on its baseline, centred on it', at.h === 140 && at.w === Math.round(20 * (140 / 60)) && at.top === 40 && at.left === Math.round(50 - at.w / 2), JSON.stringify(at));
  const wide = placeOn({ x0: 0, y0: 0, x1: 100, y1: 10 }, { w: 100, h: 200, box: { x0: 0, y0: 0, x1: 100, y1: 200 } });
  ok('placement: a wide figure is capped by the canvas width', wide.w === 100 && wide.h === 10 && wide.top === 190);
}

// The portrait file is data (enemies.json art, cards.json player.art), checked at load; the code reads it through shared/portraits.js
{
  const { portraitUrl, portraitFile } = await import('../../src/shared/portraits.js');
  const { checkData } = await import('../../src/shared/dataCheck.js');
  ok('every portrait path comes from the data, and the files exist', ['player', ...Object.keys(DATA.enemies)].every((id) => /^[a-z_]+(_v\d+)?\.webp$/.test(portraitFile(id)) && existsSync(portraitUrl(id))));
  const broken = structuredClone(DATA); delete broken.enemies.rat.art; broken.cards.player.art = '';
  const probs = checkData(broken);
  ok('the data check reports a missing portrait file', probs.some((p) => p.includes('rat.art')) && probs.some((p) => p.includes('player.art')), probs.join('; '));
  ok('battleLine and preload read the portrait path from the data, not a hardcoded assets/chars/<id>.webp',
    readFileSync('src/ui/battleLine.js', 'utf8').includes("import { portraitUrl as ART } from '../shared/portraits.js'") && !readFileSync('src/ui/battleLine.js', 'utf8').includes('`assets/chars/${id}.webp`')
    && readFileSync('src/shared/preload.js', 'utf8').includes('chars.map(portraitUrl)'));
}

// The Art Lab: on the game's real units, the registry, verdicts -> --rerender
{
  const lab = readFileSync('labs/art/index.html', 'utf8'), js = readFileSync('labs/art/lab.js', 'utf8');
  ok('art lab: not indexed, resolves from the site root, the game\'s real units over a painting',
    lab.includes('name="robots" content="noindex"') && lab.includes('<base href="../../">') && lab.includes('data-lab="labs/art/lab.js"')
    && js.includes("from '../../src/ui/battleLine.js'") && js.includes('fetch(`assets/data/art.json${buildQuery()}`') && js.includes('assets/bg/${S.painting}'));
  ok('art lab: compare / line-up / fight views, approve / reject with a note, flip, re-rolls, the JSON for the generator',
    ['compare', 'lineup', 'fight'].every((v) => js.includes(`function ${v}()`)) && js.includes("verdict(k, 'ok')") && js.includes("verdict(k, 'no')") && js.includes("'flipped'")
    && js.includes('out.approved.push({ id, file: k.file, flip: !!v.flip })') && js.includes('out.rejected.push({ id, file: k.file, note:') && js.includes('out.reroll.push({ id, n:') && js.includes('out.reroll.push({ id: q.id, clean: q.n })')
    && readFileSync('tools/gen-art.mjs', 'utf8').includes("has('--rerender')"));
  // 0.194: --prune keeps only the approved candidate of a character that has one; a character without one keeps all
  const reg = existsSync('assets/data/art.json') ? JSON.parse(readFileSync('assets/data/art.json', 'utf8')) : { chars: {} };
  const approvedChars = Object.values(reg.chars).filter((e) => e.candidates.some((k) => k.verdict === 'ok'));
  ok('art.json: a character with an approved candidate carries no other (pruned)', readFileSync('tools/gen-art.mjs', 'utf8').includes("has('--prune')")
    && approvedChars.every((e) => e.candidates.every((k) => k.verdict === 'ok')), approvedChars.map((e) => `${e.file}: ${e.candidates.length}`).join(', '));
  if (existsSync('assets/data/art.json')) {
    const reg = JSON.parse(readFileSync('assets/data/art.json', 'utf8'));
    const all = Object.values(reg.chars).flatMap((e) => e.candidates);
    ok('art.json: every candidate\'s cut-out and raw picture are on disk, with its seed and prompt', all.every((k) => existsSync(k.file) && existsSync(k.raw) && Number.isInteger(k.seed) && k.prompt && k.cut), `${all.length} candidates`);
  }
}

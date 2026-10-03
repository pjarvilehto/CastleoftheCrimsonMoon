#!/usr/bin/env node
// Train the game's style LoRA on Replicate (0.00201): the room paintings and
// the character sheets, so black-forest-labs/flux-dev-lora can draw a NEW
// character or room from a text line alone, in the house style (the mimic
// chest, more bosses, more room kinds — the backlog's art gaps). Needs
// REPLICATE_API_TOKEN (REPLICATE_KEY is read too); in a proxied container
// NODE_USE_ENV_PROXY=1.
//
//   node tools/train-lora.mjs --dry-run           # the training set and its captions, no upload
//   node tools/train-lora.mjs                     # build the set, upload it, start the training, wait, record it
//   node tools/train-lora.mjs --steps 1500 --rank 16 --rooms --sheets   # knobs; --rooms adds the room paintings,
//                                                 # --sheets the owner's inked sheets (both off: a different style)
//   node tools/train-lora.mjs --status            # the last training's state (assets/data/lora.json)
//   node tools/train-lora.mjs --cancel            # cancel the last training (billed to the minute it stops)
//
// The set (assets/data/lora.json records what went in): the APPROVED
// candidates' raw pictures (the owner's picks in the Art Lab, art.json
// verdict ok — the direction that stuck, 0.00201: the originals' own
// photoreal rendering), captioned from docs/portrait-prompts.md's character
// line, each with the trigger word. Never a candidate the owner has not
// approved. The room paintings (--rooms) and the owner's inked sheets
// (--sheets) are another style and stay out unless asked. Captions are
// written, not auto-generated: the trainer's captioner would describe a
// picture in its own words and the style would drift toward them.
//
// Trainer: ostris/flux-dev-lora-trainer (FLUX.1-dev, ai-toolkit) into the
// private model pjarvilehto/crimson-moon-style; from memory an H100 minute
// is about $0.09 (the API has no prices), so ~1200 steps ≈ $2-4. Inference:
// tools/gen-art.mjs --model lora (black-forest-labs/flux-dev-lora with
// lora_weights = the model, the trigger word in the prompt).

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePrompts } from './gen-art.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.replicate.com/v1';
const REGISTRY = join(ROOT, 'assets', 'data', 'lora.json');
export const LORA = {
  trainer: 'ostris/flux-dev-lora-trainer',
  destination: 'pjarvilehto/crimson-moon-style',
  trigger: 'CRMSNMOON',
  steps: 1200, rank: 16, resolution: '768,1024', learningRate: 0.0004,
};
const token = () => process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_KEY;
const headers = () => ({ Authorization: `Bearer ${token()}` });

/** The training set: [{ name, src, caption, kind }] — rooms and characters, captions written from the data. */
export function trainingSet({ rooms = false, sheets = false } = {}) {
  const bg = JSON.parse(readFileSync(join(ROOT, 'assets/data/backgrounds.json'), 'utf8'));
  const doc = parsePrompts(readFileSync(join(ROOT, 'docs/portrait-prompts.md'), 'utf8'));
  const art = existsSync(join(ROOT, 'assets/data/art.json')) ? JSON.parse(readFileSync(join(ROOT, 'assets/data/art.json'), 'utf8')) : { chars: {} };
  const set = [];
  const T = LORA.trigger;
  if (rooms) {
    for (const f of readdirSync(join(ROOT, 'assets/bg')).filter((f) => f.endsWith('.jpg')).sort()) {
      const name = bg.roomNames?.[f] ?? f.replace(/\.jpg$/, '').replace(/_/g, ' ');
      set.push({ name: `room_${f.replace(/\.jpg$/, '')}`, src: join(ROOT, 'assets/bg', f), kind: 'room', caption: `${T} style, a painting of ${name}, a gothic castle scene, heavy black ink shapes, muted palette, matte` });
    }
  }
  // the character line without its facing and the ACCENT / BOSS notes' labels (the words stay: the colour is part of the look)
  const line = (id) => (doc.chars.find((c) => c.id === id)?.line ?? 'CHARACTER: a gothic character').replace(/^CHARACTER:\s*/, '').replace(/\s*Facing (left|right)\.?/i, '').replace(/\s*(ACCENT|BOSS):\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (sheets) {
    for (const f of existsSync(join(ROOT, 'assets/style')) ? readdirSync(join(ROOT, 'assets/style')).filter((f) => f.endsWith('.png')).sort() : []) {
      const id = f.replace(/\.png$/, '');
      set.push({ name: `sheet_${id}`, src: join(ROOT, 'assets/style', f), kind: 'character', caption: `${T} style, an inked character sheet on a plain flat grey background, full body, three-quarter view: ${line(id)}` });
    }
  }
  for (const [id, e] of Object.entries(art.chars)) {
    for (const k of e.candidates.filter((k) => k.verdict === 'ok' && existsSync(join(ROOT, k.raw)))) {
      set.push({ name: `approved_${id}_c${k.n}`, src: join(ROOT, k.raw), kind: 'character', caption: `${T} style, a photoreal dark-fantasy character render on a plain flat mid-grey background, full body, three-quarter view: ${line(id)}` });
    }
  }
  return set;
}

/** Writes the set (pictures scaled to `maxSide`, a .txt caption each) into `dir` and zips it. Returns the zip path. */
export async function buildZip(set, dir, maxSide = 1024) {
  const S = (await import('sharp')).default;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  for (const item of set) {
    await S(item.src).flatten({ background: '#8a8a8a' }).resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toFile(join(dir, `${item.name}.jpg`));
    writeFileSync(join(dir, `${item.name}.txt`), item.caption + '\n');
  }
  const zip = `${dir}.zip`;
  rmSync(zip, { force: true });
  const r = spawnSync('python3', ['-c', `import zipfile,os,sys\nd,z=sys.argv[1],sys.argv[2]\nwith zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as f:\n  [f.write(os.path.join(d,n),n) for n in sorted(os.listdir(d))]`, dir, zip]);
  if (r.status !== 0) throw new Error(`zip failed: ${r.stderr}`);
  return zip;
}

async function upload(path) {
  const form = new FormData();
  form.append('content', new Blob([readFileSync(path)], { type: 'application/zip' }), path.split('/').pop());
  const res = await fetch(`${API}/files`, { method: 'POST', headers: headers(), body: form });
  if (!res.ok) throw new Error(`upload: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).urls.get;
}
async function latestVersion(model) {
  const res = await fetch(`${API}/models/${model}`, { headers: headers() });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status}`);
  return (await res.json()).latest_version.id;
}
async function getTraining(id) {
  const res = await fetch(`${API}/trainings/${id}`, { headers: headers() });
  if (!res.ok) throw new Error(`training ${id}: HTTP ${res.status}`);
  return res.json();
}
const loadReg = () => (existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : { trainings: [] });
const saveReg = (reg) => writeFileSync(REGISTRY, JSON.stringify({ _doc: 'Generated by tools/train-lora.mjs: the style LoRA trainings on Replicate — per training its id, the destination model and version, the set (names and captions), the knobs, its state and timing. tools/gen-art.mjs --model lora draws with the latest succeeded one (lora_weights = destination).', ...reg }, null, 2) + '\n');

async function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
  const reg = loadReg();
  if (has('--cancel')) {
    const last = reg.trainings[reg.trainings.length - 1];
    if (!last) { console.log('no training yet'); return; }
    const res = await fetch(`${API}/trainings/${last.id}/cancel`, { method: 'POST', headers: headers() });
    if (!res.ok) throw new Error(`cancel ${last.id}: HTTP ${res.status}`);
    last.status = (await res.json()).status;
    saveReg(reg);
    console.log(`${last.id}: ${last.status}`);
    return;
  }
  if (has('--status')) {
    const last = reg.trainings[reg.trainings.length - 1];
    if (!last) { console.log('no training yet'); return; }
    const t = await getTraining(last.id);
    last.status = t.status; last.version = t.output?.version ?? last.version; last.metrics = t.metrics;
    saveReg(reg);
    console.log(`${last.id}: ${t.status}${t.output?.version ? ` → ${t.output.version}` : ''}${t.metrics?.predict_time ? ` (${(t.metrics.predict_time / 60).toFixed(0)} min)` : ''}`);
    if (t.status === 'failed') console.log((t.logs ?? '').split('\n').slice(-20).join('\n'));
    return;
  }
  const set = trainingSet({ rooms: has('--rooms'), sheets: has('--sheets') });
  const knobs = { steps: Number(val('--steps', LORA.steps)), rank: Number(val('--rank', LORA.rank)), resolution: val('--resolution', LORA.resolution), learningRate: Number(val('--lr', LORA.learningRate)) };
  const n = { room: set.filter((s) => s.kind === 'room').length, character: set.filter((s) => s.kind === 'character').length };
  console.log(`${set.length} pictures (${n.room} rooms, ${n.character} characters), trigger ${LORA.trigger}, ${JSON.stringify(knobs)} → ${LORA.destination}`);
  if (has('--dry-run')) { for (const s of set) console.log(`  ${s.name}: ${s.caption}`); return; }
  if (!token()) throw new Error('REPLICATE_API_TOKEN is not set');
  const dir = join(process.env.TMPDIR ?? '/tmp', 'crimson-lora-set');
  const zip = await buildZip(set, dir);
  console.log(`  set zipped: ${zip} (${(readFileSync(zip).length / 1048576).toFixed(1)} MB)`);
  const url = await upload(zip);
  const version = await latestVersion(LORA.trainer);
  const body = { destination: LORA.destination, input: { input_images: url, trigger_word: LORA.trigger, steps: knobs.steps, lora_rank: knobs.rank, resolution: knobs.resolution, learning_rate: knobs.learningRate, autocaption: false, optimizer: 'adamw8bit', batch_size: 1 } };
  const res = await fetch(`${API}/models/${LORA.trainer}/versions/${version}/trainings`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`training: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);
  const t = await res.json();
  console.log(`  training ${t.id} ${t.status}`);
  reg.trainings.push({ id: t.id, started: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), trainer: `${LORA.trainer}:${version}`, destination: LORA.destination, trigger: LORA.trigger, knobs, set: set.map((s) => ({ name: s.name, kind: s.kind, caption: s.caption })), status: t.status });
  saveReg(reg);
  if (has('--no-wait')) return;
  let last = t;
  while (!['succeeded', 'failed', 'canceled'].includes(last.status)) {
    await new Promise((r) => setTimeout(r, 30000));
    last = await getTraining(t.id);
    const line = (last.logs ?? '').trim().split('\n').pop() ?? '';
    process.stdout.write(`  ${last.status} ${line.slice(-80)}\n`);
  }
  const rec = reg.trainings[reg.trainings.length - 1];
  rec.status = last.status; rec.version = last.output?.version; rec.metrics = last.metrics; rec.finished = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  saveReg(reg);
  console.log(`${last.status}${last.output?.version ? `: ${last.output.version}` : ''}`);
  if (last.status !== 'succeeded') { console.log((last.logs ?? '').split('\n').slice(-30).join('\n')); process.exit(1); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

#!/usr/bin/env node
// tools/bump.mjs — set the build number AND the module manifest in
// assets/data/build.json. Run for every player-facing build:
//   node tools/bump.mjs 0.083 --note "Bosses summon skeletons" --note "..."
//
// --note lines (0.094) go into build.json `changelog` under that version:
// the in-game update prompt (ui/updatePrompt.js) shows players the notes
// of every build since theirs. Short, player-facing, one change per note.
// build.json keeps the newest CHANGELOG_KEEP versions (it's fetched on
// every boot and poll); assets/data/changelog.json keeps them all (0.113,
// the CHANGELIST corner button — ui/changelog.js — loads it on demand).
//
// Why the manifest (0.082): GitHub Pages lets browsers reuse files for
// ~10 minutes, so right after a deploy a player could get the NEW
// build.json with OLD cached CSS/JS (a half-updated game). index.html
// fetches build.json uncached and loads styles.css + every module under
// ?v=<version> via an import map built from this list — a new version
// means every URL is new, so all files update together. The smoke suite
// fails if the list drifts from src/ (e.g. a new module not added here).

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FILE = join(ROOT, 'assets/data/build.json');
const FULL = join(ROOT, 'assets/data/changelog.json');

export function listModules() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) out.push(relative(ROOT, p).split('\\').join('/'));
    }
  };
  walk(join(ROOT, 'src'));
  return out;
}

const CHANGELOG_KEEP = 15;
const num = (v) => v.split('.').map(Number).reduce((a, x) => a * 10000 + x, 0);

// The next build.json: new version + module list; the changelog keeps its
// history, and `notes` (if any) replace that version's entry.
export function nextBuild(current, version, notes = [], modules = listModules()) {
  const changelog = { ...(current.changelog ?? {}) };
  if (notes.length) changelog[version] = notes;
  const kept = Object.keys(changelog).sort((a, b) => num(b) - num(a)).slice(0, CHANGELOG_KEEP);
  return { version, modules, changelog: Object.fromEntries(kept.map((v) => [v, changelog[v]])) };
}

// The full history (changelog.json): every version ever noted, newest first.
export function nextChangelog(full, version, notes = []) {
  const all = { ...(full ?? {}) };
  if (notes.length) all[version] = notes;
  return Object.fromEntries(Object.keys(all).sort((a, b) => num(b) - num(a)).map((v) => [v, all[v]]));
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const current = JSON.parse(readFileSync(FILE, 'utf8'));
  const args = process.argv.slice(2);
  const notes = [];
  for (let i = args.indexOf('--note'); i >= 0; i = args.indexOf('--note', i + 1)) notes.push(args[i + 1]);
  const version = args[0] && !args[0].startsWith('--') ? args[0] : current.version;
  if (!/^\d+\.\d{3}$/.test(version)) { console.error(`bad version: ${version} (expected e.g. 0.083)`); process.exit(1); }
  if (notes.some((n) => !n)) { console.error('--note needs a text'); process.exit(1); }
  const next = nextBuild(current, version, notes);
  writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n');
  if (notes.length) {
    const full = JSON.parse(readFileSync(FULL, 'utf8'));
    writeFileSync(FULL, JSON.stringify(nextChangelog(full, version, notes), null, 2) + '\n');
  }
  console.log(`build.json -> ${version} (${next.modules.length} modules, ${(next.changelog[version] ?? []).length} notes)`);
}

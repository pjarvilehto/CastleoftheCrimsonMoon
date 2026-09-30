#!/usr/bin/env node
// tools/bump.mjs — set the build number AND the module manifest in
// assets/data/build.json. Run for every player-facing build:
//   node tools/bump.mjs 0.083
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

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const current = JSON.parse(readFileSync(FILE, 'utf8'));
  const version = process.argv[2] ?? current.version;
  if (!/^\d+\.\d{3}$/.test(version)) { console.error(`bad version: ${version} (expected e.g. 0.083)`); process.exit(1); }
  writeFileSync(FILE, JSON.stringify({ version, modules: listModules() }, null, 2) + '\n');
  console.log(`build.json -> ${version} (${listModules().length} modules)`);
}

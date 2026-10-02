#!/usr/bin/env node
// tools/check-bump.mjs <base-ref> — CI's guard for rule 6 (0.00197): when
// this commit changes anything players load (src/, styles.css, index.html,
// analytics/, labs/, assets/data) the build number must be higher than at
// <base-ref>, or those files stay cached in players' browsers (0.127).
// tools/ship.mjs bumps on every ship, so this only catches a hand-made push.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compareVersions } from '../src/shared/version.js';

const arg = process.argv[2];
// the push's first parent (CI passes github.event.before); an unknown or all-zero ref (a branch's first push) falls back to the last commit
const known = (ref) => !!ref && !/^0+$/.test(ref) && spawnSync('git', ['cat-file', '-e', `${ref}^{commit}`]).status === 0; // (0.00210: it named a ROOT that did not exist and crashed every run on main)
const base = known(arg) ? arg : 'HEAD~1';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const changed = git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean);
const loaded = changed.filter((f) => /^(src\/|styles\.css$|index\.html$|analytics\/|labs\/|assets\/data\/)/.test(f) && !/build\.json$|changelog\.json$/.test(f));
if (!loaded.length) { console.log('check-bump: nothing players load changed'); process.exit(0); }
let before = '0.00000';
try { before = JSON.parse(git('show', `${base}:assets/data/build.json`)).version; } catch { /* no build.json at the base: anything is newer */ }
const now = JSON.parse(readFileSync('assets/data/build.json', 'utf8')).version;
if (compareVersions(now, before) > 0) { console.log(`check-bump: ${before} -> ${now}, ${loaded.length} loaded files changed`); process.exit(0); }
console.error(`check-bump: ${loaded.length} files players load changed (${loaded.slice(0, 5).join(', ')}${loaded.length > 5 ? ', ...' : ''}) but the build is still ${now} — run tools/ship.mjs (or tools/bump.mjs)`);
process.exit(1);

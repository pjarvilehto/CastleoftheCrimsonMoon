#!/usr/bin/env node
// tools/ship.mjs — the whole ship loop in one command (0.00197):
//   node tools/ship.mjs --note "Player-facing change" [--note "..."] \
//        [--trailer "Co-Authored-By: ..."] [--branch <name>] [--dry-run]
//
// What it does, in order (the loop two threads shipping at once need):
//   1. commits the working tree if it has changes (headline = the first note)
//   2. fetches origin/main and merges it; a conflict only in build.json /
//      changelog.json is resolved by taking main's (the bump below rewrites
//      them), any other conflict stops here for a human
//   3. picks the build number: the tree's own if it is already above main's,
//      else main's + 1 — and when a number this run claimed in an earlier
//      round collides and moves, rewrites that number's mentions in the
//      files this branch changed (comments, docs, tests cite the build they
//      ship in); a number that is already on main is never rewritten (it
//      names a shipped build — 0.00198's first run got this wrong)
//   4. runs tools/bump.mjs with the notes, then the smoke suite — by exit
//      code, never the last line of a pipe (0.167) — and commits the bump
//   5. fetches main once more: if it moved, back to 2 (at most 4 rounds);
//      else pushes HEAD to main and to the working branch
// It never force-pushes and never touches a conflict outside the two
// generated files. --dry-run prints the plan and stops before any change.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions } from '../src/shared/version.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const GENERATED = ['assets/data/build.json', 'assets/data/changelog.json'];
const ROUNDS = 4;

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const tryGit = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const fail = (msg) => { console.error(`ship: ${msg}`); process.exit(1); };

const args = process.argv.slice(2);
const pick = (flag) => { const out = []; for (let i = args.indexOf(flag); i >= 0; i = args.indexOf(flag, i + 1)) out.push(args[i + 1]); return out; };
const notes = pick('--note'), trailers = pick('--trailer');
const branchArg = pick('--branch')[0];
const dryRun = args.includes('--dry-run');
if (!notes.length || notes.some((n) => !n)) fail('at least one --note "player-facing text" (the changelist; the first is the commit headline)');

const branch = branchArg ?? git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch === 'main' || branch === 'HEAD') fail(`on ${branch}: ship from a working branch (--branch <name>)`);
const versionAt = (ref) => JSON.parse(ref ? git('show', `${ref}:assets/data/build.json`) : readFileSync(join(ROOT, 'assets/data/build.json'), 'utf8')).version;
const bump1 = (v) => { const [a, b] = v.split('.'); return `${a}.${String(Number(b) + 1).padStart(5, '0')}`; }; // five decimals (0.00197)
const message = (version) => [`${version}: ${notes[0]}`, ...(notes.length > 1 ? ['', ...notes.slice(1).map((n) => `- ${n}`)] : []), ...(trailers.length ? ['', ...trailers] : [])].join('\n');

// 1. the work itself
const dirty = git('status', '--porcelain');
if (dryRun) {
  git('fetch', 'origin', 'main');
  const theirs = versionAt('origin/main'), mine = versionAt(null);
  console.log(`dry run: branch ${branch}; main is at ${theirs}, this tree at ${mine}; would ship as ${compareVersions(mine, theirs) > 0 ? mine : bump1(theirs)}`);
  console.log(`${dirty ? dirty.split('\n').length + ' changed files to commit' : 'nothing to commit'}; notes: ${notes.length}; trailers: ${trailers.length}`);
  process.exit(0);
}
if (dirty) { git('add', '-A'); git('commit', '-q', '-m', message(versionAt(null))); console.log('ship: committed the working tree'); }

let version = versionAt(null);
let claimed = null; // a number this run bumped to and has not pushed: the only one safe to rewrite
for (let round = 1; round <= ROUNDS; round++) {
  // 2. main's latest
  git('fetch', 'origin', 'main');
  const merge = tryGit('merge', '--no-edit', 'origin/main');
  if (merge.status !== 0) {
    const conflicts = git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    if (!conflicts.length) fail(`the merge failed without a conflict (${(merge.stderr || merge.stdout || '').trim().split('\n')[0]}) — see git status`);
    if (conflicts.some((f) => !GENERATED.includes(f))) { tryGit('merge', '--abort'); fail(`conflicts outside the generated files: ${conflicts.join(', ')} — resolve by hand, then ship again`); }
    for (const f of conflicts) git('checkout', '--theirs', f);
    git('add', ...conflicts);
    git('commit', '-q', '--no-edit');
    console.log(`ship: merged origin/main (${conflicts.join(', ')} taken from main)`);
  }
  // 3. the number
  const theirs = versionAt('origin/main');
  const next = compareVersions(version, theirs) > 0 ? version : bump1(theirs);
  if (next !== version) {
    const changed = claimed === version ? git('diff', '--name-only', 'origin/main...HEAD').split('\n').filter((f) => f && !GENERATED.includes(f)) : [];
    const re = new RegExp(`\\b${version.replace('.', '\\.')}\\b`, 'g');
    const renumbered = [];
    for (const f of changed) {
      let text; try { text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
      if (!re.test(text)) continue;
      // only the lines this branch ADDED carry its number (0.00209: a mention main shipped meanwhile in a shared file, CLAUDE.md say, must stay)
      const added = new Set(git('diff', '-U0', 'origin/main...HEAD', '--', f).split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)));
      const lines = text.split('\n').map((l) => (added.has(l) ? l.replace(re, next) : l));
      const out = lines.join('\n');
      if (out === text) continue;
      writeFileSync(join(ROOT, f), out);
      renumbered.push(f);
    }
    if (renumbered.length) console.log(`ship: ${version} -> ${next} in ${renumbered.join(', ')}`);
    version = next;
  }
  // 4. bump, suite, commit
  execFileSync('node', ['tools/bump.mjs', version, ...notes.flatMap((n) => ['--note', n])], { cwd: ROOT, stdio: 'inherit' });
  claimed = version;
  const suite = spawnSync('node', ['tools/smoke-test.mjs'], { cwd: ROOT, encoding: 'utf8' });
  const tail = suite.stdout.trim().split('\n').slice(-1)[0];
  if (suite.status !== 0) { console.error(suite.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n')); fail(`the suite failed (${tail}); nothing pushed — the bump and the merge are in the tree`); }
  console.log(`ship: suite ${tail}`);
  git('add', '-A');
  if (git('status', '--porcelain')) git('commit', '-q', '-m', message(version));
  // 5. still on top of main?
  git('fetch', 'origin', 'main');
  if (tryGit('merge-base', '--is-ancestor', 'origin/main', 'HEAD').status === 0) {
    const push = tryGit('push', '-u', 'origin', 'HEAD:main');
    if (push.status !== 0) { console.log(`ship: main refused the push during round ${round} (${(push.stderr || '').trim().split('\n').pop()}); merging again`); continue; } // (0.00209: it used to throw here)
    git('push', '-u', 'origin', `HEAD:${branch}`);
    console.log(`ship: ${version} is on main and ${branch}`);
    process.exit(0);
  }
  console.log(`ship: main moved during round ${round}; merging again`);
}
fail(`main kept moving for ${ROUNDS} rounds; nothing pushed`);

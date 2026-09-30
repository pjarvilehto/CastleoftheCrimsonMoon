#!/usr/bin/env node
// tools/cachebust.mjs — stamp every code/data asset reference in the DEPLOY
// tree with ?v=<version> so publishes take effect immediately.
//
// Why: the platform serves index.html with `no-store` but all static assets
// (JS/CSS/JSON) with `cache-control: public, max-age=14400` behind a
// Cloudflare edge cache. After a publish, fresh HTML would pull stale cached
// modules for up to 4h. Query strings change the cache key, so ?v=0.057
// URLs are always fetched fresh.
//
// Covers:
//   1. index.html — stylesheet + entry module script tags
//   2. src/**/*.js — every relative import/export specifier ('./x.js', '../y/z.js')
//   3. src/shared/data.js — the runtime fetch() of assets/data/*.json
// NOT covered (documented residual risk): images/fonts referenced from CSS or
// built dynamically in preload.js. Practice: never replace an image in place —
// new art gets a new filename.
//
// Usage: node tools/cachebust.mjs <targetDir>
// Run ONLY against the deploy copy (output/app) after rsync — never against
// the working copy (query-string specifiers would break Node-side tooling).
// Idempotent: existing ?v= stamps are stripped before re-stamping.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/cachebust.mjs <targetDir>'); process.exit(1); }

const version = JSON.parse(readFileSync(join(dir, 'assets/data/build.json'), 'utf8')).version;
if (!/^\d+\.\d+$/.test(version)) { console.error(`bad version: ${version}`); process.exit(1); }
const stamp = `?v=${version}`;
let changes = 0;

function stampFile(path, replacers) {
  let text = readFileSync(path, 'utf8');
  const before = text;
  for (const [re, fn] of replacers) text = text.replace(re, fn);
  if (text !== before) {
    writeFileSync(path, text);
    changes++;
    console.log(`  stamped ${relative(dir, path)}`);
  }
}

// Strip any prior stamp, then append the current one.
const unstamp = /(\.\.?\/[^'"`]+?\.(?:js|css|json))\?v=[0-9.]+/g;

// 1. index.html: stylesheet + entry script
const indexPath = join(dir, 'index.html');
const indexSrc = readFileSync(indexPath, 'utf8');
// Strip existing stamps before the anchor check so re-runs stay idempotent.
const indexBare = indexSrc.replace(/\?v=[0-9.]+"/g, '"');
if (!indexBare.includes('href="styles.css"') || !indexBare.includes('src="src/main.js"')) {
  console.error('index.html is missing the expected styles.css / src/main.js references — refusing to stamp');
  process.exit(1);
}
stampFile(indexPath, [
  [/(href|src)="([^"]+?\.(?:css|js))(\?v=[0-9.]+)?"/g, (m, attr, url) => `${attr}="${url}${stamp}"`],
]);

// 2 + 3. every src/**/*.js: import specifiers and the data.js fetch template
function* walk(sub) {
  for (const name of readdirSync(join(dir, sub))) {
    const p = join(dir, sub, name);
    if (statSync(p).isDirectory()) yield* walk(join(sub, name));
    else if (name.endsWith('.js')) yield p;
  }
}

const importRe = /((?:from|import)\s*[(]?\s*['"])(\.\.?\/[^'"]+?\.js)(\?v=[0-9.]+)?(['"])/g;
const dataFetchRe = /(assets\/data\/\$\{name\}\.json)(\?v=[0-9.]+)?/g;

for (const jsPath of walk('src')) {
  stampFile(jsPath, [
    [importRe, (m, pre, spec, _old, post) => `${pre}${spec}${stamp}${post}`],
    [dataFetchRe, (m, url) => `${url}${stamp}`],
  ]);
}

// Sanity: no relative .js specifier anywhere in src/ may remain unstamped,
// and no double stamps may exist.
let bad = 0;
for (const jsPath of walk('src')) {
  const text = readFileSync(jsPath, 'utf8');
  const unstamped = text.match(/(?:from|import)\s*[(]?\s*['"]\.\.?\/[^'"]+?\.js['"]/g);
  if (unstamped) { console.error(`  UNSTAMPED in ${jsPath}: ${unstamped.join(', ')}`); bad++; }
  if (text.includes(`${stamp}${stamp}`) || /\?v=[0-9.]+\?v=/.test(text)) {
    console.error(`  DOUBLE STAMP in ${jsPath}`); bad++;
  }
}
if (bad) process.exit(1);
console.log(`cachebust: stamped ${changes} files with ${stamp}`);

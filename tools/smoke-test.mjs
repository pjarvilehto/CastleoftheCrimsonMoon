#!/usr/bin/env node
// tools/smoke-test.mjs — headless smoke suite. Run before every build:
//   node tools/smoke-test.mjs            (everything; a second or two on the virtual clock)
//   node tools/smoke-test.mjs combat     (files whose name contains "combat")
//
// The tests live in tools/test/*.test.mjs by area (0.098); the shared DOM
// shim, virtual clock and imports are in tools/test/harness.mjs. The DOM
// shim deliberately models browser constraints the easy version missed —
// `children` is getter-only (assigning to it threw on real DOM and shipped
// broken in 0.031), style lives behind setAttribute, etc.

import { counts, readdirSync } from './test/harness.mjs';

// Every tools/test/*.test.mjs, in the suite's order; layout runs LAST (it checks the phone layer's twins against
// the code the other files exercised, rule 8) — a new file is added here before it (0.00299: a file left out
// sorted to the end, after layout; classes, fx, heroes and items did).
const ORDER = ['scenes', 'combat', 'shrines', 'progression', 'content', 'backgrounds', 'audio', 'sim', 'history', 'narration', 'art', 'cards', 'classes', 'fx', 'heroes', 'items', 'layout'];
const FILES = readdirSync('tools/test').filter((f) => f.endsWith('.test.mjs')).map((f) => f.slice(0, -'.test.mjs'.length))
  .sort((a, b) => rank(a) - rank(b));
function rank(f) { const i = ORDER.indexOf(f); return i >= 0 ? i : ORDER.indexOf('layout') - 0.5; } // (a file not listed runs just before layout, never after it)
const filter = process.argv.slice(2);
if (filter.length && !FILES.some((f) => filter.some((q) => f.includes(q)))) { console.error(`no test file matches ${filter.join(', ')} (areas: ${FILES.join(', ')})`); process.exit(1); }
const t0 = process.hrtime.bigint();
for (const name of FILES.filter((f) => !filter.length || filter.some((q) => f.includes(q)))) {
  console.log(`\n── ${name} ──`);
  await import(`./test/${name}.test.mjs`);
}
const secs = Number(process.hrtime.bigint() - t0) / 1e9;
console.log(`\n${counts.passed} passed, ${counts.failed} failed (${secs.toFixed(1)}s)`);
process.exit(counts.failed ? 1 : 0);

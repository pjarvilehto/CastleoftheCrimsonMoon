#!/usr/bin/env node
// tools/smoke-test.mjs — headless smoke suite. Run before every build:
//   node tools/smoke-test.mjs            (everything; under a second on the virtual clock)
//   node tools/smoke-test.mjs combat     (files whose name contains "combat")
//
// The tests live in tools/test/*.test.mjs by area (0.098); the shared DOM
// shim, virtual clock and imports are in tools/test/harness.mjs. The DOM
// shim deliberately models browser constraints the easy version missed —
// `children` is getter-only (assigning to it threw on real DOM and shipped
// broken in 0.031), style lives behind setAttribute, etc.

import { counts, readdirSync } from './test/harness.mjs';

// Every tools/test/*.test.mjs, in the suite's order (new files join at the end).
const ORDER = ['scenes', 'combat', 'shrines', 'progression', 'content', 'backgrounds', 'audio', 'sim', 'history', 'narration', 'art', 'cards', 'layout'];
const FILES = readdirSync('tools/test').filter((f) => f.endsWith('.test.mjs')).map((f) => f.slice(0, -'.test.mjs'.length))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
const filter = process.argv.slice(2);
const t0 = process.hrtime.bigint();
for (const name of FILES.filter((f) => !filter.length || filter.some((q) => f.includes(q)))) {
  console.log(`\n── ${name} ──`);
  await import(`./test/${name}.test.mjs`);
}
const secs = Number(process.hrtime.bigint() - t0) / 1e9;
console.log(`\n${counts.passed} passed, ${counts.failed} failed (${secs.toFixed(1)}s)`);
process.exit(counts.failed ? 1 : 0);
